from __future__ import annotations

import json
import os
from typing import Any, Literal, Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from pydantic import BaseModel

load_dotenv()

from graph import graph  # noqa: E402
from scheduler import load_courses_from_qdrant  # noqa: E402

app = FastAPI(title="PEP-Agent Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class BusySlot(BaseModel):
    day: Literal["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    start: str
    end: str
    label: str = ""


class StudentProfile(BaseModel):
    specialization: Optional[Literal["IT", "Business", "Engineering"]] = None
    completed_codes: list[str] = []
    goal_ects: Optional[int] = None
    busy_slots: list[BusySlot] = []


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    student: Optional[StudentProfile] = None


class ChatResponse(BaseModel):
    reply: str
    plan: Optional[dict[str, Any]] = None


class CourseInfo(BaseModel):
    code: str
    name: str
    department: str
    ects: int


def _extract_latest_plan(messages: list[Any]) -> Optional[dict[str, Any]]:
    """Pick the last find_course_schedule tool result from the turn."""
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage) and msg.name == "find_course_schedule":
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                return None
    return None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/courses", response_model=list[CourseInfo])
def courses() -> list[CourseInfo]:
    catalog = load_courses_from_qdrant()
    return [
        CourseInfo(code=c.code, name=c.name, department=c.department, ects=c.ects)
        for c in sorted(catalog, key=lambda c: (c.department, c.code))
    ]


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    lc_messages = [
        HumanMessage(content=m.content) if m.role == "user" else AIMessage(content=m.content)
        for m in req.messages
    ]
    state: dict[str, Any] = {"messages": lc_messages}
    if req.student:
        state["student"] = req.student.model_dump()
    result = graph.invoke(state)
    msgs = result["messages"]
    last = msgs[-1]
    reply = last.content if isinstance(last.content, str) else str(last.content)
    return ChatResponse(reply=reply, plan=_extract_latest_plan(msgs))
