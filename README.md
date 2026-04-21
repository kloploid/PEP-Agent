# PEP-Agent

LangGraph (Python) backend + Next.js frontend. LLM: **Azure OpenAI `gpt-5.4-nano`** only.

## Layout

```
backend/    FastAPI + LangGraph agent (Python 3.12, venv at backend/.venv)
frontend/   Next.js 16 app (TypeScript, Tailwind, App Router)
```

## Quick start (Docker)

```bash
cp .env.example .env     # fill in AZURE_OPENAI_API_KEY
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend:  http://localhost:8000 (health at `/health`)

Hot reload is enabled for both services via bind mounts.

## Local (without Docker)

### Backend

```bash
cd backend
cp .env.example .env            # fill in AZURE_OPENAI_API_KEY
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

Endpoints:
- `GET /health`
- `POST /chat` — body: `{ "messages": [{"role": "user", "content": "hi"}] }`

Edit the agent in `backend/graph.py` (add nodes, tools, state fields).

### Frontend

```bash
cd frontend
cp .env.local.example .env.local   # BACKEND_URL=http://localhost:8000
npm run dev                        # http://localhost:3000
```

The chat UI posts to `/api/chat` (Next.js route handler), which proxies to the Python backend.

## Adding deps

- Backend: edit `backend/pyproject.toml`, then `VIRTUAL_ENV=backend/.venv uv pip install -r backend/pyproject.toml`
- Frontend: `cd frontend && npm install <pkg>`
