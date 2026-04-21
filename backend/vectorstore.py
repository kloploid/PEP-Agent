from __future__ import annotations

import os

from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_core.embeddings import Embeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams


DEFAULT_EMBED_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


def get_embeddings() -> Embeddings:
    return FastEmbedEmbeddings(
        model_name=os.environ.get("EMBEDDING_MODEL", DEFAULT_EMBED_MODEL),
        cache_dir=os.environ.get("FASTEMBED_CACHE", "/app/.fastembed_cache"),
    )


def get_client() -> QdrantClient:
    return QdrantClient(url=os.environ.get("QDRANT_URL", "http://localhost:6333"))


def get_collection_name() -> str:
    return os.environ.get("QDRANT_COLLECTION", "pep_docs")


def ensure_collection(client: QdrantClient, name: str, dim: int) -> None:
    existing = {c.name for c in client.get_collections().collections}
    if name in existing:
        return
    client.create_collection(
        collection_name=name,
        vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
    )


def get_vectorstore_for_ingest() -> QdrantVectorStore:
    """For ingestion: probes embedding dim and creates the collection if missing."""
    embeddings = get_embeddings()
    client = get_client()
    name = get_collection_name()
    dim = len(embeddings.embed_query("dim-probe"))
    ensure_collection(client, name, dim)
    return QdrantVectorStore(client=client, collection_name=name, embedding=embeddings)


def get_vectorstore_if_ready() -> QdrantVectorStore | None:
    """For retrieval: returns None if the collection does not exist yet."""
    client = get_client()
    name = get_collection_name()
    existing = {c.name for c in client.get_collections().collections}
    if name not in existing:
        return None
    return QdrantVectorStore(
        client=client, collection_name=name, embedding=get_embeddings()
    )
