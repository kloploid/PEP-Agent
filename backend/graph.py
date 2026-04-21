from __future__ import annotations

import os
from typing import Annotated, TypedDict

from langchain_core.documents import Document
from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage
from langchain_openai import AzureChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from vectorstore import get_vectorstore_if_ready


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    context: list[Document]


SYSTEM_PROMPT = (
    "You are a helpful AI assistant for the PEP-Agent project. "
    "Answer the user's question using the provided CONTEXT when it is relevant. "
    "If the context does not contain the answer, say so briefly and answer from general knowledge. "
    "Cite source filenames in parentheses when you use the context."
)


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


def _format_context(docs: list[Document]) -> str:
    if not docs:
        return "(no context retrieved)"
    blocks = []
    for i, d in enumerate(docs, 1):
        src = d.metadata.get("source", "unknown")
        blocks.append(f"[{i}] source={src}\n{d.page_content}")
    return "\n\n".join(blocks)


def build_graph():
    llm = _build_llm()

    def retrieve(state: AgentState) -> AgentState:
        query = _last_user_text(state["messages"])
        store = get_vectorstore_if_ready()
        if store is None or not query:
            return {"context": []}
        docs = store.as_retriever(search_kwargs={"k": 4}).invoke(query)
        return {"context": docs}

    def generate(state: AgentState) -> AgentState:
        context = _format_context(state.get("context") or [])
        system = SystemMessage(content=f"{SYSTEM_PROMPT}\n\nCONTEXT:\n{context}")
        response = llm.invoke([system, *state["messages"]])
        return {"messages": [response]}

    workflow = StateGraph(AgentState)
    workflow.add_node("retrieve", retrieve)
    workflow.add_node("generate", generate)
    workflow.add_edge(START, "retrieve")
    workflow.add_edge("retrieve", "generate")
    workflow.add_edge("generate", END)
    return workflow.compile()


graph = build_graph()
