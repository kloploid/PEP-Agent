from __future__ import annotations

import os
from typing import Annotated, TypedDict

from langchain_core.documents import Document
from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage
from langchain_openai import AzureChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from scheduler import find_course_schedule
from vectorstore import get_vectorstore_if_ready


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    context: list[Document]
    student: dict | None


SYSTEM_PROMPT = (
    "You are a scheduling assistant for the PEP-Agent project. The course "
    "catalog is in the CONTEXT section below.\n\n"
    "TOOLS:\n"
    "- `find_course_schedule(target_ects, department?, group?, "
    "group_constraints?, required_codes?, excluded_codes?)` — returns a "
    "verified non-overlapping schedule from the catalog.\n\n"
    "RULES:\n"
    "1. For ANY request about ECTS totals, schedules, course plans, or "
    "combining courses, you MUST call `find_course_schedule`. Never "
    "enumerate courses, pick combinations, or check time overlaps yourself.\n"
    "2. CRITICAL — distinguish PROFILE from HARD FILTER:\n"
    "   A filter is only HARD if the user says they MUST stay in it. If "
    "the user mentions a department/group AND gives permissive language "
    "such as:\n"
    "     'you can also take from other', 'I'm okay with other',\n"
    "     'flexible about', 'or other', 'doesn't have to be',\n"
    "     'if needed from other', 'also from any group'\n"
    "   then that department/group is the user's PROFILE (informational "
    "only) and MUST NOT be passed to the tool as a filter.\n"
    "   Examples (read carefully):\n"
    "   • 'I'm Engineering group B, you can take from other groups and "
    "departments too' → `department=None, group=None, "
    "group_constraints=None`. Their profile is noted for preference, but "
    "nothing is hard-filtered. Target ECTS is the only strict requirement.\n"
    "   • 'I'm Business group B, flexible with other departments' → "
    "`group_constraints={\"Business\":\"B\"}` (Business must be B, but "
    "other depts are unrestricted; no global `group`).\n"
    "   • 'I only want Business courses, group B' → `department=\"Business\", "
    "group=\"B\"`. Both hard.\n"
    "   • 'All my classes must be group A' → `group=\"A\"`.\n"
    "3. ON EVERY TURN, re-read the ENTIRE conversation and extract the "
    "user's standing profile and explicit filters. Carry every EXPLICIT "
    "filter into the new tool call unless the user changed it. If a "
    "follow-up only changes `target_ects`, keep the rest.\n"
    "4. Other arg mapping:\n"
    "   - 'keep ENG301 and ENG302' → `required_codes=[\"ENG301\",\"ENG302\"]`.\n"
    "   - 'not IT209' or 'avoid IT209' → `excluded_codes=[\"IT209\"]`.\n"
    "5. Result handling:\n"
    "   - status='exact': present the plan cleanly.\n"
    "   - status='closest': compare `total_ects` with `absolute_max_ects`.\n"
    "     • If `total_ects == absolute_max_ects`, the catalog itself cannot "
    "reach the target — say so plainly ('the non-overlapping catalog caps "
    "at X ECTS'); do NOT suggest relaxing filters, they wouldn't help.\n"
    "     • If `total_ects < absolute_max_ects`, the user's filters are "
    "blocking — show the primary, then explain that relaxing filters can "
    "reach up to `absolute_max_ects` ECTS, and if an `alternative` plan is "
    "present show it too.\n"
    "   - status='infeasible': quote the `reason` and ask what to relax.\n"
    "6. Present plans as a markdown list — `**CODE — Name (N ECTS)**`, "
    "then indented sessions `Day HH:MM-HH:MM, session, Group X`.\n"
    "7. For non-scheduling questions, answer from CONTEXT and cite course "
    "codes in parentheses."
)

DEFAULT_K = 30  # corpus size — return everything by default for this dataset


def _build_llm() -> AzureChatOpenAI:
    return AzureChatOpenAI(
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        azure_deployment=os.environ["AZURE_OPENAI_DEPLOYMENT"],
        api_version=os.environ["AZURE_OPENAI_API_VERSION"],
        api_key=os.environ["AZURE_OPENAI_API_KEY"],
        temperature=0,
    )


def _last_user_text(messages: list[AnyMessage]) -> str:
    for m in reversed(messages):
        if isinstance(m, HumanMessage):
            return m.content if isinstance(m.content, str) else str(m.content)
    return ""


def _format_profile(student: dict | None) -> str:
    if not student:
        return ""
    lines = ["STUDENT PROFILE (from the form above the chat):"]
    if spec := student.get("specialization"):
        lines.append(f"- specialization: {spec}")
    if codes := student.get("completed_codes"):
        lines.append(
            f"- already completed: {', '.join(codes)} "
            "(MUST NOT appear in any schedule — pass as `excluded_codes`)"
        )
    if goal := student.get("goal_ects"):
        lines.append(f"- goal this term: {goal} ECTS")
    lines.append(
        "Defaults for `find_course_schedule`:\n"
        "- `target_ects` = goal.\n"
        "- `excluded_codes` = every completed course (never put them in a plan).\n"
        "- `department` = specialization ALWAYS on the first call of a turn. "
        "The student overwhelmingly wants their major. The tool will "
        "auto-attach an `alternative` plan (with filters relaxed) if the "
        "major-only plan can't reach the target — so you do not need to "
        "drop `department` yourself. Just pass it and let the tool decide.\n"
        "- Drop `department` only if the user EXPLICITLY rejects their "
        "specialization this turn (e.g. 'I don't want any IT courses', "
        "'only Business please')."
    )
    return "\n".join(lines)


def _format_context(docs: list[Document]) -> str:
    if not docs:
        return "(no context retrieved)"
    blocks = []
    for i, d in enumerate(docs, 1):
        meta = d.metadata
        header_parts = [f"source={meta.get('source', 'unknown')}"]
        if code := meta.get("course_code"):
            header_parts.insert(0, f"course={code}")
        if dept := meta.get("department"):
            header_parts.insert(1, f"department={dept}")
        if (ects := meta.get("ects")) is not None:
            header_parts.append(f"ects={ects}")
        blocks.append(f"[{i}] {' '.join(header_parts)}\n{d.page_content}")
    return "\n\n".join(blocks)


TOOLS = [find_course_schedule]


def build_graph():
    llm = _build_llm().bind_tools(TOOLS)
    tool_node = ToolNode(TOOLS)

    def retrieve(state: AgentState) -> AgentState:
        # Retrieve once per turn; tool-call loop reuses the same context.
        if state.get("context"):
            return {}
        query = _last_user_text(state["messages"])
        store = get_vectorstore_if_ready()
        if store is None or not query:
            return {"context": []}
        docs = store.as_retriever(search_kwargs={"k": DEFAULT_K}).invoke(query)
        return {"context": docs}

    def agent(state: AgentState) -> AgentState:
        context = _format_context(state.get("context") or [])
        profile = _format_profile(state.get("student"))
        parts = [SYSTEM_PROMPT, f"CONTEXT:\n{context}"]
        if profile:
            parts.append(profile)
        system = SystemMessage(content="\n\n".join(parts))
        response = llm.invoke([system, *state["messages"]])
        return {"messages": [response]}

    workflow = StateGraph(AgentState)
    workflow.add_node("retrieve", retrieve)
    workflow.add_node("agent", agent)
    workflow.add_node("tools", tool_node)
    workflow.add_edge(START, "retrieve")
    workflow.add_edge("retrieve", "agent")
    workflow.add_conditional_edges("agent", tools_condition)
    workflow.add_edge("tools", "agent")
    return workflow.compile()


graph = build_graph()
