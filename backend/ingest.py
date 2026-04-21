"""Load documents from backend/data/ and upsert them into Qdrant.

Usage (inside the backend container):
    docker compose exec backend python ingest.py

Or locally:
    cd backend && source .venv/bin/activate && python ingest.py
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Callable

from dotenv import load_dotenv
from langchain_community.document_loaders import (
    CSVLoader,
    Docx2txtLoader,
    TextLoader,
)
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

load_dotenv()

from vectorstore import (  # noqa: E402
    get_client,
    get_collection_name,
    get_vectorstore_for_ingest,
)


DATA_DIR = Path(__file__).parent / "data"

COURSE_FIELDS = ("course_code", "course_name", "department", "ects", "description")

SCHEDULE_LINE_RE = re.compile(
    r"^(?P<day>\w+)\s+"
    r"(?P<start>\d{1,2}:\d{2})\s*-\s*(?P<end>\d{1,2}:\d{2})\s+"
    r"\((?P<session>[^)]+)\)\s+"
    r"for\s+Group\s+(?P<group>\w+)\s*$",
    re.IGNORECASE,
)


def _load_docx(path: Path) -> list[Document]:
    return Docx2txtLoader(str(path)).load()


def _load_plain_text(path: Path) -> list[Document]:
    return TextLoader(str(path)).load()


def _load_csv(path: Path) -> list[Document]:
    return CSVLoader(str(path), encoding="utf-8", autodetect_encoding=True).load()


def _parse_course_file(text: str) -> tuple[dict[str, str], list[dict[str, str]]]:
    """Split a course .txt into flat fields and a structured schedule list."""
    fields: dict[str, str] = {}
    schedule: list[dict[str, str]] = []
    in_schedule = False

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            continue
        if not in_schedule and line.upper().startswith("SCHEDULE:"):
            in_schedule = True
            continue
        if in_schedule:
            entry = line.lstrip()
            if entry.startswith("-"):
                entry = entry[1:].strip()
            m = SCHEDULE_LINE_RE.match(entry)
            if m:
                schedule.append(
                    {
                        "day": m["day"].title(),
                        "start": m["start"],
                        "end": m["end"],
                        "session": m["session"].strip(),
                        "group": m["group"].upper(),
                    }
                )
            continue
        if ":" in line:
            key, _, value = line.partition(":")
            fields[key.strip().lower()] = value.strip()

    return fields, schedule


def _format_schedule_for_content(schedule: list[dict[str, str]]) -> str:
    if not schedule:
        return "Schedule: (not specified)"
    parts = [
        f"{s['day']} {s['start']}-{s['end']} ({s['session']}, Group {s['group']})"
        for s in schedule
    ]
    return "Schedule: " + "; ".join(parts)


def _load_txt(path: Path) -> list[Document]:
    """Parse COURSE_* key-value .txt files into structured Documents.

    Falls back to plain TextLoader if the file doesn't match the course schema.
    """
    text = path.read_text(encoding="utf-8")
    fields, schedule = _parse_course_file(text)
    if not all(k in fields for k in COURSE_FIELDS):
        return _load_plain_text(path)

    ects_raw = fields["ects"]
    ects: int | str = int(ects_raw) if ects_raw.isdigit() else ects_raw

    content = (
        f"{fields['course_name']} ({fields['course_code']}, "
        f"{fields['department']}, {ects} ECTS)\n"
        f"{fields['description']}\n"
        f"{_format_schedule_for_content(schedule)}"
    )
    metadata = {
        "source": str(path),
        "course_code": fields["course_code"],
        "course_name": fields["course_name"],
        "department": fields["department"],
        "ects": ects,
        "schedule": schedule,
        "schedule_days": sorted({s["day"] for s in schedule}),
        "schedule_groups": sorted({s["group"] for s in schedule}),
    }
    return [Document(page_content=content, metadata=metadata)]


LOADERS: dict[str, Callable[[Path], list[Document]]] = {
    ".docx": _load_docx,
    ".txt": _load_txt,
    ".md": _load_plain_text,
    ".csv": _load_csv,
}


def load_all() -> list[Document]:
    docs: list[Document] = []
    for path in sorted(DATA_DIR.rglob("*")):
        handler = LOADERS.get(path.suffix.lower())
        if not handler:
            continue
        print(f"  loading {path.relative_to(DATA_DIR)}")
        docs.extend(handler(path))
    return docs


def _collection_is_populated() -> bool:
    client = get_client()
    name = get_collection_name()
    if name not in {c.name for c in client.get_collections().collections}:
        return False
    return client.count(collection_name=name, exact=False).count > 0


def main() -> int:
    force = os.getenv("FORCE_REINGEST", "").lower() in ("1", "true", "yes")
    if not force and _collection_is_populated():
        print("Collection already populated — skipping. Set FORCE_REINGEST=1 to override.")
        return 0

    if not DATA_DIR.exists():
        print(f"No data dir at {DATA_DIR}", file=sys.stderr)
        return 1

    if force:
        client = get_client()
        name = get_collection_name()
        if name in {c.name for c in client.get_collections().collections}:
            client.delete_collection(name)
            print(f"Dropped existing collection '{name}'.")

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
