<div align="center">

<img src="frontend/public/img/logo.png" alt="RÕIS logo" width="180" />

# PEP-Agent · RÕIS

**AI-ассистент для планирования учебного расписания**

LangGraph (Python) + Next.js 16 · Azure OpenAI `gpt-5.4-nano` · Qdrant + FastEmbed

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)

</div>

---

## О проекте

**RÕIS** — это чат-ассистент, который собирает для студента расписание курсов под его цели по ECTS, специализацию и занятые временные слоты. Агент использует векторный поиск по каталогу дисциплин и детерминированный планировщик — никаких «выдуманных» курсов.

<div align="center">

| Waiting | Thinking | Answering |
|:---:|:---:|:---:|
| <img src="frontend/public/img/waiting.png" width="140" /> | <img src="frontend/public/img/thinking.png" width="140" /> | <img src="frontend/public/img/answering_openMouth.png" width="140" /> |
| *ждёт вопроса* | *ищет по каталогу* | *показывает план* |

</div>

---

## Возможности

- **Чат с контекстом** — история, Markdown, GFM-таблицы, подсветка кода
- **Профиль студента** — специализация, цель по ECTS, пройденные коды, занятые слоты
- **Живое расписание** — календарь на неделю с рендером предложенного плана
- **RAG по каталогу** — Qdrant + многоязычный FastEmbed подтягивают релевантные курсы
- **Детерминированный планировщик** — инструмент `find_course_schedule` гарантирует, что пары не пересекаются
- **Маскот-индикатор состояния** — рысь реагирует на фазу диалога (waiting → thinking → answering)

---

## Архитектура

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

### Структура репозитория

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

## Быстрый старт (Docker)

```bash
cp .env .env                 # заполни AZURE_OPENAI_API_KEY
docker compose up --build
```

| Сервис   | URL                                   |
|----------|---------------------------------------|
| Frontend | http://localhost:3000                 |
| Backend  | http://localhost:8000 (`/health`)     |
| Qdrant   | http://localhost:6333/dashboard       |

Hot-reload включён у обоих сервисов через bind-mount.

### Загрузка документов в векторную БД

Положи файлы в `backend/data/` (`.docx`, `.txt`, `.md`). Сервис `ingester` запустится автоматически при `docker compose up`, заполнит Qdrant и выйдет. При повторных запусках проверяет, что коллекция уже наполнена, и пропускает реингест.

Принудительный реингест после добавления новых файлов:

```bash
FORCE_REINGEST=1 docker compose up -d --force-recreate ingester
```

Или запустить скрипт вручную:

```bash
docker compose exec backend python ingest.py
```

---

## Запуск локально (без Docker)

### Backend

```bash
cd backend
cp .env .env                 # заполни AZURE_OPENAI_API_KEY
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Endpoints**
- `GET  /health`
- `POST /chat` — тело: `{ "messages": [{"role": "user", "content": "hi"}] }`

Граф агента редактируется в `backend/graph.py` — добавляй ноды, инструменты, поля состояния.

### Frontend

```bash
cd frontend
cp .env.local.example .env.local   # BACKEND_URL=http://localhost:8000
npm run dev                        # http://localhost:3000
```

Чат-UI постит в `/api/chat` (Next.js route handler), который проксирует запрос в Python-бэкенд.

---

## Добавление зависимостей

- **Backend** — отредактируй `backend/pyproject.toml`, затем:
  ```bash
  VIRTUAL_ENV=backend/.venv uv pip install -r backend/pyproject.toml
  ```
- **Frontend** — `cd frontend && npm install <pkg>`

---

## Стек

| Слой          | Технологии                                                       |
|---------------|------------------------------------------------------------------|
| LLM           | Azure OpenAI · `gpt-5.4-nano`                                    |
| Embeddings    | FastEmbed (multilingual, локально)                               |
| Vector DB     | Qdrant (docker, persisted volume)                                |
| Agent         | LangGraph + LangChain                                            |
| API           | FastAPI · Python 3.12                                            |
| Frontend      | Next.js 16 · React · TypeScript · Tailwind CSS · react-markdown  |
| Infra         | Docker Compose · bind-mount hot reload                           |

<div align="center">

<sub>Made with 💜 by the PEP-Agent team</sub>

</div>
