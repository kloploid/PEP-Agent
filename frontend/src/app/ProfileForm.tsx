"use client";

import { useEffect, useMemo, useState } from "react";

export type CourseInfo = {
  code: string;
  name: string;
  department: string;
  ects: number;
};

export type Specialization = "IT" | "Business" | "Engineering";

export type StudentProfile = {
  specialization: Specialization | null;
  completed_codes: string[];
  goal_ects: number | null;
};

export const EMPTY_PROFILE: StudentProfile = {
  specialization: null,
  completed_codes: [],
  goal_ects: null,
};

const DEPARTMENTS: Specialization[] = ["IT", "Business", "Engineering"];

const INPUT_CLASS =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring-2";

export function ProfileForm({
  value,
  onChange,
}: {
  value: StudentProfile;
  onChange: (next: StudentProfile) => void;
}) {
  const [catalog, setCatalog] = useState<CourseInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coursesOpen, setCoursesOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/courses");
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Failed to load courses");
        if (!cancelled) setCatalog(data as CourseInfo[]);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groupedCatalog = useMemo(() => {
    const by: Record<string, CourseInfo[]> = {};
    for (const c of catalog) {
      (by[c.department] ||= []).push(c);
    }
    for (const dept of Object.keys(by)) {
      by[dept].sort((a, b) => a.code.localeCompare(b.code));
    }
    return by;
  }, [catalog]);

  const completedSet = useMemo(
    () => new Set(value.completed_codes),
    [value.completed_codes],
  );

  function toggleCompleted(code: string) {
    const next = new Set(completedSet);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange({ ...value, completed_codes: Array.from(next).sort() });
  }

  function clearCompleted() {
    onChange({ ...value, completed_codes: [] });
  }

  const completedEcts = useMemo(() => {
    const lookup = new Map(catalog.map((c) => [c.code, c.ects]));
    return value.completed_codes.reduce(
      (sum, code) => sum + (lookup.get(code) ?? 0),
      0,
    );
  }, [catalog, value.completed_codes]);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-700">Specialization</span>
          <select
            className={INPUT_CLASS}
            value={value.specialization ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                specialization: (e.target.value || null) as Specialization | null,
              })
            }
          >
            <option value="">— not set —</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-700">ECTS Goal</span>
          <input
            type="number"
            min={1}
            max={120}
            className={INPUT_CLASS}
            placeholder="24"
            value={value.goal_ects ?? ""}
            onChange={(e) => {
              const n = e.target.value ? Number(e.target.value) : null;
              onChange({ ...value, goal_ects: Number.isFinite(n) ? n : null });
            }}
          />
        </label>

        <div className="space-y-1 lg:col-span-2">
          <span className="text-xs font-medium text-slate-700">
            Completed Courses
          </span>
          <button
            type="button"
            onClick={() => setCoursesOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition hover:bg-slate-50"
          >
            <span className="truncate">
              {value.completed_codes.length === 0
                ? "e.g. Programming Basics, Linear Algebra"
                : value.completed_codes.join(", ")}
            </span>
            <span className="ml-3 flex items-center gap-2 text-xs text-slate-500">
              {value.completed_codes.length > 0 && (
                <span className="rounded-lg bg-[#d3f4ff] px-2 py-0.5 font-semibold text-[#61aad5]">
                  {completedEcts} ECTS
                </span>
              )}
              <span className="text-slate-400">{coursesOpen ? "▲" : "▼"}</span>
            </span>
          </button>
        </div>
      </div>

      {coursesOpen && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
          {loading && <div className="text-sm text-slate-500">Loading catalog…</div>}
          {error && <div className="text-sm text-rose-600">Error: {error}</div>}
          {!loading && !error && (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-600">
                  Check every course you&apos;ve already passed — the agent will
                  exclude them from any new schedule.
                </span>
                {value.completed_codes.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCompleted}
                    className="text-xs font-medium text-[#6e5192] underline underline-offset-2 hover:text-[#8b5cf6]"
                  >
                    clear selection
                  </button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {Object.entries(groupedCatalog).map(([dept, items]) => (
                  <div key={dept} className="min-w-0">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {dept}
                    </h3>
                    <ul className="space-y-1.5">
                      {items.map((c) => {
                        const checked = completedSet.has(c.code);
                        return (
                          <li key={c.code}>
                            <label
                              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition ${
                                checked
                                  ? "border-[#6e5192]/40 bg-[#f1ebfa] text-slate-800"
                                  : "border-transparent hover:bg-slate-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCompleted(c.code)}
                                className="h-3.5 w-3.5 accent-[#6e5192]"
                              />
                              <span className="font-semibold text-slate-800">
                                {c.code}
                              </span>
                              <span className="truncate text-slate-600">
                                {c.name}
                              </span>
                              <span className="ml-auto rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                {c.ects}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
