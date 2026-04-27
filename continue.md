# Next-Bridge Project Context

## Entry Point

/admin → maintenance dashboard

## Data Flow

/admin → API route → service layer → PostgreSQL → response → UI

## Key Business Logic

- IMP is currently used in results transformation
- Goal: replace IMP with VP in results fetch layer

## Debug Rules

- Always start tracing from /admin
- Follow: UI → API → service → DB
- Do not assume logic exists in frontend unless proven

## Stack

- Next.js (App Router)
- PostgreSQL
- Continue AI (VS Code)
- Ollama (local models)
