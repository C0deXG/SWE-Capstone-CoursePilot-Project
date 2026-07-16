from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_secret_key: str
    anthropic_api_key: str
    anthropic_model: str
    openai_api_key: str
    embedding_model: str
    embedding_dimensions: int
    worker_id: str
    poll_seconds: float

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
        values = {
            "supabase_url": os.getenv("SUPABASE_URL", ""),
            "supabase_secret_key": os.getenv("SUPABASE_SECRET_KEY", ""),
            "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY", ""),
            "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
        }
        missing = [name for name, value in values.items() if not value]
        if missing:
            raise RuntimeError(f"Missing worker configuration: {', '.join(missing)}")
        dimensions = int(os.getenv("OPENAI_EMBEDDING_DIMENSIONS", "1536"))
        if dimensions != 1536:
            raise RuntimeError("OPENAI_EMBEDDING_DIMENSIONS must match the database vector size of 1536")
        return cls(
            **values,
            anthropic_model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5"),
            embedding_model=os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-large"),
            embedding_dimensions=dimensions,
            worker_id=os.getenv("COURSEPILOT_WORKER_ID", "coursepilot-local-worker"),
            poll_seconds=float(os.getenv("COURSEPILOT_POLL_SECONDS", "2")),
        )
