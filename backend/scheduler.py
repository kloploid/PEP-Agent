"""Deterministic course-schedule solver, exposed as a LangChain tool.

LLMs are unreliable at constraint-satisfaction (subset-sum + interval
scheduling). The LLM calls `find_course_schedule` with structured args
(department, group, required_codes, excluded_codes, target_ects); this
module does the actual combinatorial search and returns a verified plan.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from vectorstore import get_client, get_collection_name


@dataclass(frozen=True)
class Session:
    day: str
    start_min: int
    end_min: int
    session: str
    group: str


@dataclass(frozen=True)
class Course:
    code: str
    name: str
    department: str
    ects: int
    description: str
    sessions: tuple[Session, ...] = field(default_factory=tuple)

    def overlaps(self, other: "Course") -> bool:
        for a in self.sessions:
            for b in other.sessions:
                if a.day != b.day:
                    continue
                if a.start_min < b.end_min and b.start_min < a.end_min:
                    return True
        return False


def _to_minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _coerce_ects(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def _course_from_payload(payload: dict) -> Course | None:
    meta = payload.get("metadata") or {}
    code = meta.get("course_code")
    if not code:
        return None
    ects = _coerce_ects(meta.get("ects"))
    if ects is None:
        return None
    raw_sessions = meta.get("schedule") or []
    sessions: list[Session] = []
    for s in raw_sessions:
        try:
            sessions.append(
                Session(
                    day=s["day"],
                    start_min=_to_minutes(s["start"]),
                    end_min=_to_minutes(s["end"]),
                    session=s.get("session", ""),
                    group=s.get("group", ""),
                )
            )
        except (KeyError, ValueError):
            continue
    return Course(
        code=code,
        name=meta.get("course_name", code),
        department=meta.get("department", ""),
        ects=ects,
        description=payload.get("page_content", ""),
        sessions=tuple(sessions),
    )


def load_courses_from_qdrant() -> list[Course]:
    """Scroll the collection, dedupe by course_code (chunks repeat metadata)."""
    client = get_client()
    name = get_collection_name()
    existing = {c.name for c in client.get_collections().collections}
    if name not in existing:
        return []

    by_code: dict[str, Course] = {}
    offset = None
    while True:
        points, offset = client.scroll(
            collection_name=name,
            limit=256,
            with_payload=True,
            with_vectors=False,
            offset=offset,
        )
        for p in points:
            course = _course_from_payload(p.payload or {})
            if course and course.code not in by_code:
                by_code[course.code] = course
        if offset is None:
            break
    return list(by_code.values())


def _group_match(
    course: Course,
    group: str | None,
    group_constraints: dict[str, str] | None,
) -> bool:
    """Per-department group constraint wins over the global `group` filter.

    A course passes if every session of the course is in the required group.
    Courses with no sessions are excluded when any group filter is active.
    """
    dept_rule = None
    if group_constraints:
        # Case-insensitive dept lookup.
        for dept_key, grp in group_constraints.items():
            if dept_key.lower() == course.department.lower():
                dept_rule = grp.upper()
                break

    effective = dept_rule if dept_rule is not None else (group.upper() if group else None)
    if effective is None:
        return True
    if not course.sessions:
        return False
    return all(s.group.upper() == effective for s in course.sessions)


def _find_combination(
    required: list[Course],
    pool: list[Course],
    target_ects: int,
) -> tuple[list[Course] | None, list[Course], int]:
    """DFS for a non-overlapping subset of pool that, combined with required,
    hits target_ects. Returns (exact_match_or_None, best_close, best_close_total)."""
    base_total = sum(c.ects for c in required)
    remaining = target_ects - base_total
    if remaining < 0:
        return None, list(required), base_total
    if remaining == 0:
        return list(required), list(required), base_total

    pool = sorted(pool, key=lambda c: c.ects, reverse=True)

    best_exact: list[Course] | None = None
    best_close: list[Course] = list(required)
    best_close_total = base_total

    def dfs(idx: int, chosen: list[Course], total: int) -> None:
        nonlocal best_exact, best_close, best_close_total
        if best_exact is not None:
            return
        if total == target_ects:
            best_exact = list(chosen)
            return
        if total < target_ects and total > best_close_total:
            best_close_total = total
            best_close = list(chosen)
        if total > target_ects or idx >= len(pool):
            return

        remaining_pool = sum(c.ects for c in pool[idx:])
        if total + remaining_pool < best_close_total:
            return

        candidate = pool[idx]
        if total + candidate.ects <= target_ects and not any(
            candidate.overlaps(c) for c in chosen
        ):
            chosen.append(candidate)
            dfs(idx + 1, chosen, total + candidate.ects)
            chosen.pop()
            if best_exact is not None:
                return
        dfs(idx + 1, chosen, total)

    dfs(0, list(required), base_total)
    return best_exact, best_close, best_close_total


def find_schedule(
    courses: list[Course],
    target_ects: int,
    department: str | None = None,
    group: str | None = None,
    group_constraints: dict[str, str] | None = None,
    required_codes: list[str] | None = None,
    excluded_codes: list[str] | None = None,
    auto_relax: bool = True,
) -> dict:
    """Build a non-overlapping schedule.

    When `auto_relax=True` and the strict solve returns `closest`, the solver
    also tries progressively relaxed filter sets (drop group_constraints,
    drop group, drop department, then all three) and attaches the best
    relaxed plan as `alternative` in the result. `required_codes` and
    `excluded_codes` are never relaxed — those come from the user directly.
    """
    primary = _solve_once(
        courses, target_ects,
        department=department,
        group=group,
        group_constraints=group_constraints,
        required_codes=required_codes,
        excluded_codes=excluded_codes,
    )
    if not auto_relax or primary.get("status") != "closest":
        return primary

    # Catalog ceiling: what's the max non-overlapping total ignoring soft
    # filters (required/excluded still honored)? Lets the LLM distinguish
    # "filters are blocking you" from "catalog can't reach target".
    ceiling = _solve_once(
        courses, target_ects,
        required_codes=required_codes,
        excluded_codes=excluded_codes,
    )
    primary["absolute_max_ects"] = ceiling.get("total_ects", 0)

    relax_variants: list[tuple[str, dict]] = []
    if group_constraints:
        relax_variants.append(("dropped group_constraints", {"group_constraints": None}))
    if group:
        relax_variants.append(("dropped group", {"group": None}))
    if department:
        relax_variants.append(("dropped department", {"department": None}))
    if department or group or group_constraints:
        relax_variants.append(
            ("dropped department, group, group_constraints", {
                "department": None, "group": None, "group_constraints": None,
            })
        )

    best_alt: dict | None = None
    best_alt_relaxed: str | None = None
    for label, overrides in relax_variants:
        kwargs = {
            "department": department,
            "group": group,
            "group_constraints": group_constraints,
            "required_codes": required_codes,
            "excluded_codes": excluded_codes,
            **overrides,
        }
        candidate = _solve_once(courses, target_ects, **kwargs)
        cand_total = candidate.get("total_ects", 0)
        if cand_total <= primary["total_ects"]:
            continue
        if best_alt is None or cand_total > best_alt["total_ects"]:
            best_alt = candidate
            best_alt_relaxed = label
            if candidate.get("status") == "exact":
                break

    if best_alt is not None:
        primary["alternative"] = {
            "relaxed": best_alt_relaxed,
            **best_alt,
        }
    return primary


def _solve_once(
    courses: list[Course],
    target_ects: int,
    department: str | None = None,
    group: str | None = None,
    group_constraints: dict[str, str] | None = None,
    required_codes: list[str] | None = None,
    excluded_codes: list[str] | None = None,
) -> dict:
    """Single constraint-satisfaction solve (no fallback)."""
    required_codes = [c.upper() for c in (required_codes or [])]
    excluded_codes_set = {c.upper() for c in (excluded_codes or [])}

    by_code = {c.code.upper(): c for c in courses}
    required = [by_code[code] for code in required_codes if code in by_code]
    missing_required = [code for code in required_codes if code not in by_code]
    if missing_required:
        return {
            "status": "infeasible",
            "reason": f"Required course(s) not found in catalog: {missing_required}",
            "target_ects": target_ects,
            "total_ects": 0,
            "department": department,
            "group": group,
            "courses": [],
        }

    # Required courses must not overlap with each other.
    for i in range(len(required)):
        for j in range(i + 1, len(required)):
            if required[i].overlaps(required[j]):
                return {
                    "status": "infeasible",
                    "reason": (
                        f"Required courses {required[i].code} and "
                        f"{required[j].code} have overlapping sessions."
                    ),
                    "target_ects": target_ects,
                    "total_ects": 0,
                    "department": department,
                    "group": group,
                    "courses": [],
                }

    req_ects = sum(c.ects for c in required)
    if req_ects > target_ects:
        return {
            "status": "infeasible",
            "reason": (
                f"Required courses already sum to {req_ects} ECTS, "
                f"which exceeds target {target_ects}."
            ),
            "target_ects": target_ects,
            "total_ects": req_ects,
            "department": department,
            "group": group,
            "courses": _courses_to_dicts(required),
        }

    # Pool: everything else that matches filters and doesn't overlap required.
    required_codes_upper = {c.code.upper() for c in required}
    pool = [
        c
        for c in courses
        if c.code.upper() not in required_codes_upper
        and c.code.upper() not in excluded_codes_set
        and (not department or c.department.lower() == department.lower())
        and _group_match(c, group, group_constraints)
        and not any(c.overlaps(r) for r in required)
    ]

    exact, close, close_total = _find_combination(required, pool, target_ects)
    if exact is not None:
        return _format(exact, "exact", target_ects, department, group, group_constraints)
    return _format(
        close, "closest", target_ects, department, group, group_constraints,
        reached=close_total,
    )


def _courses_to_dicts(combo: list[Course]) -> list[dict]:
    return [
        {
            "code": c.code,
            "name": c.name,
            "department": c.department,
            "ects": c.ects,
            "sessions": [
                {
                    "day": s.day,
                    "start": f"{s.start_min // 60:02d}:{s.start_min % 60:02d}",
                    "end": f"{s.end_min // 60:02d}:{s.end_min % 60:02d}",
                    "session": s.session,
                    "group": s.group,
                }
                for s in c.sessions
            ],
        }
        for c in combo
    ]


def _format(
    combo: list[Course],
    status: str,
    target: int,
    department: str | None,
    group: str | None,
    group_constraints: dict[str, str] | None = None,
    reached: int | None = None,
) -> dict:
    total = reached if reached is not None else sum(c.ects for c in combo)
    return {
        "status": status,
        "target_ects": target,
        "total_ects": total,
        "department": department,
        "group": group,
        "group_constraints": group_constraints or {},
        "courses": _courses_to_dicts(combo),
    }


# ----------------------------- LangChain tool -----------------------------

DepartmentLit = Literal["IT", "Business", "Engineering"]
GroupLit = Literal["A", "B"]


class FindScheduleArgs(BaseModel):
    target_ects: int = Field(
        description="Total ECTS credits the student wants to reach."
    )
    department: Optional[DepartmentLit] = Field(
        default=None,
        description=(
            "Restrict courses to one department. Omit to allow courses from any "
            "department (useful when the student needs to fill ECTS with "
            "electives from outside their major)."
        ),
    )
    group: Optional[GroupLit] = Field(
        default=None,
        description=(
            "GLOBAL group filter — applies to every department. Only use if the "
            "student must attend the SAME group everywhere. If group rules "
            "differ by department (e.g. 'Group B in Business, any group "
            "elsewhere'), leave this null and use `group_constraints` instead."
        ),
    )
    group_constraints: Optional[dict[str, GroupLit]] = Field(
        default=None,
        description=(
            "Per-department group filter, e.g. {'Business': 'B'}. "
            "Departments not listed are unrestricted. Prefer this over `group` "
            "when the student's group matters only for their own department "
            "and they are flexible about others. Keys must be 'IT', 'Business', "
            "or 'Engineering'."
        ),
    )
    required_codes: list[str] = Field(
        default_factory=list,
        description=(
            "Course codes that MUST be included (e.g. ['ENG301']). Use when "
            "the user wants to keep specific courses from a previous plan "
            "while the solver searches for complements."
        ),
    )
    excluded_codes: list[str] = Field(
        default_factory=list,
        description="Course codes the user explicitly does not want.",
    )


@tool("find_course_schedule", args_schema=FindScheduleArgs)
def find_course_schedule(
    target_ects: int,
    department: Optional[str] = None,
    group: Optional[str] = None,
    group_constraints: Optional[dict[str, str]] = None,
    required_codes: list[str] | None = None,
    excluded_codes: list[str] | None = None,
) -> str:
    """Build a verified non-overlapping course schedule.

    Use this tool for EVERY scheduling-related request. Do not enumerate
    courses, pick combinations, or check for time overlaps yourself — this
    tool does all of that deterministically from the course catalog in
    Qdrant.

    Returns JSON:
      - status: "exact" (target reached), "closest" (best plan below target),
        "infeasible" (constraints conflict), or "none".
      - total_ects, target_ects
      - department, group, group_constraints (echoes filters applied)
      - courses: list of {code, name, department, ects, sessions:[...]}
      - reason (only when status="infeasible")

    When the user refines a previous plan (e.g. "add more from Business",
    "swap group", "keep ENG301 and ENG302"), call this tool again with
    updated parameters — do not edit plans by hand. CARRY FORWARD every
    constraint from earlier turns unless the user explicitly changed it.
    """
    courses = load_courses_from_qdrant()
    plan = find_schedule(
        courses,
        target_ects=target_ects,
        department=department,
        group=group,
        group_constraints=group_constraints,
        required_codes=required_codes or [],
        excluded_codes=excluded_codes or [],
    )
    return json.dumps(plan, ensure_ascii=False)
