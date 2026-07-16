# CoursePilot

CoursePilot is a private academic workspace for organizing university courses, source files, assignments, review questions, and source-backed course answers.

The full product specification and implementation checklist live in [REQUIREMENTS.md](./REQUIREMENTS.md).

## Stack

- Vite, React, and TypeScript
- Tailwind CSS and daisyUI 5
- Supabase Auth, Postgres, Storage, Realtime, Edge Functions, and pgvector
- Python worker with the open-source Docling parser
- Claude Sonnet for structured extraction and course answers
- OpenAI `text-embedding-3-large` with 1536 dimensions for retrieval

## Local Setup

Requirements:

- Node.js 20 or newer
- npm
- Python 3.11 or newer
- A Supabase project for real accounts and persisted data

Install and start the frontend:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

The application requires Supabase frontend values. It opens with real account and empty states and does not create placeholder course records.

Set up and run the document worker in a second terminal:

```bash
npm run worker:setup
cp worker/.env.example worker/.env
npm run worker
```

The worker uses Docling for PDF, DOCX, PPTX, image, and text parsing. Upload requests create database jobs immediately, and the worker processes those jobs asynchronously while the frontend receives Realtime progress.

## Environment

Create a local `.env` from `.env.example`. Never commit `.env`.

Frontend values:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Server-only values belong in Supabase Edge Function secrets, not in Vite:

```text
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_MODEL=
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
OPENAI_EMBEDDING_DIMENSIONS=1536
```

The same provider values plus `SUPABASE_SECRET_KEY` belong in `worker/.env`. Never expose the Supabase secret key through a Vite variable.

## Supabase

Versioned migrations in `supabase/migrations` create the account and course schema, private storage policies, asynchronous processing queue, document classification fields, hybrid-ready search metadata, pgvector retrieval, and assignment reminder schedules. All user-owned records use Row Level Security.

With the Supabase CLI installed and linked to the intended project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase secrets set --env-file supabase/.env.functions
supabase functions deploy process-course-file
supabase functions deploy ask-course
supabase functions deploy delete-account
```

Do not put the service role key or provider API keys in any browser environment variable.

## Verification

```bash
npm run lint
npm test
npm run build
```

The hosted acceptance path has been exercised with a real 119 KB DOCX syllabus: private upload, queued processing, Docling parsing, table-aware schedule extraction, Claude policy extraction, 61 source chunks, OpenAI embeddings, structured assignments, and review questions. PDF and PPTX parsing were also verified through the same worker.

## Sprint 2 Boundary

Sprint 2 establishes the working architectural baseline. The selected vertical flow is functional from authentication through source-backed retrieval. Production Vercel and worker deployment, automatic email/browser/digest delivery, expanded citation navigation, and a broader automated integration suite remain Sprint 3/MVP work.

The production frontend target is Vercel. Configure the production and preview Supabase Auth redirect URLs before testing sign up, email confirmation, and password recovery.
