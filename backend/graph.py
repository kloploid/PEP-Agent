from __future__ import annotations

import os
from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]


SYSTEM_PROMPT = "You are a helpful AI assistant for the PEP-Agent project."


def _build_llm():
    provider = os.getenv("LLM_PROVIDER", "anthropic").lower()
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
            temperature=0,
        )
    if provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            temperature=0,
        )
    raise ValueError(f"Unknown LLM_PROVIDER: {provider}")


def build_graph():
    llm = _build_llm()

    def call_model(state: AgentState) -> AgentState:
        response = llm.invoke([SystemMessage(content=SYSTEM_PROMPT), *state["messages"]])
        return {"messages": [response]}

    workflow = StateGraph(AgentState)
    workflow.add_node("model", call_model)
    workflow.add_edge(START, "model")
    workflow.add_edge("model", END)
    return workflow.compile()


graph = build_graph()
