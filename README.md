<div align="center">

<img src="frontend/public/img/logo.png" alt="RÕIS logo" width="180" />

# PEP-Agent · RÕIS

**AI-assistent õppetunniplaani koostamiseks**

LangGraph (Python) + Next.js 16 · Azure OpenAI `gpt-5.4-nano` · Qdrant + FastEmbed

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-PolyForm%20Strict%201.0-red)

</div>

---

## Projektist

**RÕIS** on vestlusassistent, mis koostab üliõpilasele aineplaani vastavalt tema ECTS-eesmärkidele, erialale ja hõivatud ajavõitudele. Agent kasutab vektorilist otsingut ainete kataloogist ja deterministlikku planeerijat — ühtegi väljamõeldud ainet ei pakuta.

---

## Võimalused

- **Kontekstuaalne vestlus** — ajalugu, Markdown, GFM-tabelid, koodisüntaks
- **Üliõpilase profiil** — eriala, ECTS-eesmärk, läbitud ainekoodid, hõivatud ajad
- **Reaalajas tunniplaan** — nädalakalender pakutud plaani kuvamiseks
- **RAG kataloogi järgi** — Qdrant + mitmekeelne FastEmbed toob relevantse konteksti
- **Deterministlik planeerija** — tööriist `find_course_schedule` tagab, et tunnid ei kattu
- **Maskot-olekuindikaator** — ilves reageerib vestluse faasile (ootab → mõtleb → vastab)

---

## Arhitektuur

```
┌─────────────────┐    POST /api/chat     ┌──────────────────┐    tool call     ┌───────────────┐
│  Next.js UI     │ ────────────────────▶ │  FastAPI +       │ ───────────────▶ │  Scheduler    │
│  (chat +        │                       │  LangGraph agent │                  │  (Python)     │
│   calendar)     │ ◀──────────────────── │  gpt-5.4-nano    │ ◀─── plan ────── │               │
└─────────────────┘       reply + plan    └──────────────────┘                  └───────────────┘
                                                   │
                                                   │ retrieve chunks
                                                   ▼
                                          ┌──────────────────┐
                                          │  Qdrant + Fast-  │
                                          │  Embed (multi-   │
                                          │  lingual)        │
                                          └──────────────────┘
```

### Repositooriumi struktuur

```
backend/          FastAPI + LangGraph agent (Python 3.12, venv at backend/.venv)
  ├── main.py         /chat, /health endpoints
  ├── graph.py        LangGraph state machine + system prompt
  ├── scheduler.py    find_course_schedule tool
  ├── vectorstore.py  Qdrant + FastEmbed wiring
  ├── ingest.py       one-shot ingest script
  └── data/           source documents (.docx, .txt, .md)
frontend/         Next.js 16 app (TypeScript, Tailwind, App Router)
  └── src/app/        page.tsx, Calendar.tsx, ProfileForm.tsx, api/
qdrant            vector DB (docker service, persisted to qdrant_data volume)
```

---

## Kiire alustamine (Docker)

```bash
cp .env .env                 # täida AZURE_OPENAI_API_KEY
docker compose up --build
```

| Teenus   | URL                                   |
|----------|---------------------------------------|
| Frontend | http://localhost:3000                 |
| Backend  | http://localhost:8000 (`/health`)     |
| Qdrant   | http://localhost:6333/dashboard       |

Mõlemal teenusel on hot-reload lubatud bind-mount kaudu.

### Dokumentide laadimine vektorandmebaasi

Aseta failid kausta `backend/data/` (`.docx`, `.txt`, `.md`). Teenus `ingester` käivitub automaatselt käsu `docker compose up` ajal, täidab Qdrant-i ja väljub. Korduvatel käivitamistel kontrollib, kas kollektsioon on juba täidetud, ja jätab reingestimise vahele.

Sunnitud reingest pärast uute failide lisamist:

```bash
FORCE_REINGEST=1 docker compose up -d --force-recreate ingester
```

Või käivita skript käsitsi:

```bash
docker compose exec backend python ingest.py
```

---

## Kohalik käivitamine (ilma Dockerita)

### Backend

```bash
cd backend
cp .env .env                 # täida AZURE_OPENAI_API_KEY
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Endpointid**
- `GET  /health`
- `POST /chat` — keha: `{ "messages": [{"role": "user", "content": "hi"}] }`

Agendi graafi saab muuta failis `backend/graph.py` — lisa noode, tööriistu ja olekuvälju.

### Frontend

```bash
cd frontend
cp .env.local.example .env.local   # BACKEND_URL=http://localhost:8000
npm run dev                        # http://localhost:3000
```

Vestluse UI postitab `/api/chat`-i (Next.js route handler), mis proksiib päringu Python-backendi.

---

## Sõltuvuste lisamine

- **Backend** — muuda `backend/pyproject.toml`, seejärel:
  ```bash
  VIRTUAL_ENV=backend/.venv uv pip install -r backend/pyproject.toml
  ```
- **Frontend** — `cd frontend && npm install <pkg>`

---

## Stack

| Kiht          | Tehnoloogiad                                                     |
|---------------|------------------------------------------------------------------|
| LLM           | Azure OpenAI · `gpt-5.4-nano`                                    |
| Embeddings    | FastEmbed (multilingual, lokaalselt)                             |
| Vector DB     | Qdrant (docker, persisted volume)                                |
| Agent         | LangGraph + LangChain                                            |
| API           | FastAPI · Python 3.12                                            |
| Frontend      | Next.js 16 · React · TypeScript · Tailwind CSS · react-markdown  |
| Infra         | Docker Compose · bind-mount hot reload                           |

<div align="center">

<sub>Made with 💜 by the PEP-Agent team</sub>

<sub>© 2026 PEP-Agent team · [PolyForm Strict License 1.0](LICENSE)</sub>

</div>
