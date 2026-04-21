"""Load documents from backend/data/ and upsert them into Qdrant.

Usage (inside the backend container):
    docker compose exec backend python ingest.py

Or locally:
    cd backend && source .venv/bin/activate && python ingest.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from langchain_community.document_loaders import (
    CSVLoader,
    Docx2txtLoader,
    TextLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter

load_dotenv()

from vectorstore import (  # noqa: E402
    get_client,
    get_collection_name,
    get_vectorstore_for_ingest,
)


DATA_DIR = Path(__file__).parent / "data"
LOADERS = {
    ".docx": Docx2txtLoader,
    ".txt": TextLoader,
    ".md": TextLoader,
    ".csv": lambda path: CSVLoader(path, encoding="utf-8", autodetect_encoding=True),
}


def load_all() -> list:
    docs = []
    for path in sorted(DATA_DIR.rglob("*")):
        loader_cls = LOADERS.get(path.suffix.lower())
        if not loader_cls:
            continue
        print(f"  loading {path.relative_to(DATA_DIR)}")
        loader = loader_cls(str(path))
        docs.extend(loader.load())
    return docs


def _collection_is_populated() -> bool:
    client = get_client()
    name = get_collection_name()
    if name not in {c.name for c in client.get_collections().collections}:
        return False
    return client.count(collection_name=name, exact=False).count > 0


def main() -> int:
    if os.getenv("FORCE_REINGEST", "").lower() not in ("1", "true", "yes"):
        if _collection_is_populated():
            print("Collection already populated — skipping. Set FORCE_REINGEST=1 to override.")
            return 0

    if not DATA_DIR.exists():
        print(f"No data dir at {DATA_DIR}", file=sys.stderr)
        return 1

    print(f"Reading {DATA_DIR}")
    raw_docs = load_all()
    if not raw_docs:
        print("No supported files (.docx/.txt/.md/.csv) found.", file=sys.stderr)
        return 1

    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=120)
    chunks = splitter.split_documents(raw_docs)
    print(f"Split into {len(chunks)} chunks")

    store = get_vectorstore_for_ingest()
    ids = store.add_documents(chunks)
    print(f"Upserted {len(ids)} chunks into Qdrant collection.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
