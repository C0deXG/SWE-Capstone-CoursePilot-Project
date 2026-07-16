# CoursePilot Ingestion Worker

This worker keeps heavy document parsing and model extraction outside the browser and Supabase Edge Function request path.

## Run locally

```bash
python3 -m venv worker/.venv
worker/.venv/bin/python -m pip install -r worker/requirements.txt
cp worker/.env.example worker/.env
worker/.venv/bin/python worker/main.py
```

The worker:

1. Claims one queued `processing_jobs` record.
2. Downloads the private source file from Supabase Storage.
3. Parses it with Docling.
4. Stores bounded, source-anchored chunks and OpenAI embeddings.
5. Classifies the document and sends relevant sections to Claude through forced tool calls.
6. Stores assignments, meetings, policies, contacts, materials, and review questions.
7. Updates the Realtime processing stage used by the Vite interface.

Use `worker/.venv/bin/python worker/main.py --once` for one queued job.
