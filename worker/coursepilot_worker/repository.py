from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from supabase import Client, create_client

from .config import Settings
from .models import ParsedChunk


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class Repository:
    def __init__(self, settings: Settings) -> None:
        self.client: Client = create_client(settings.supabase_url, settings.supabase_secret_key)

    def requeue_stale_jobs(self) -> int:
        result = self.client.rpc(
            "requeue_stale_processing_jobs",
            {"p_stale_after": "10 minutes"},
        ).execute()
        return int(result.data or 0)

    def claim_job(self, worker_id: str) -> dict[str, Any] | None:
        result = self.client.rpc(
            "claim_processing_job",
            {"p_worker_id": worker_id},
        ).execute()
        return result.data[0] if result.data else None

    def update_job(self, job_id: str, stage: str, progress: int, **values: Any) -> None:
        payload = {
            "stage": stage,
            "progress": progress,
            "heartbeat_at": utc_now(),
            **values,
        }
        self.client.table("processing_jobs").update(payload).eq("id", job_id).execute()

    def defer_job(self, job: dict[str, Any], delay_seconds: int, attempt: int) -> None:
        metadata = dict(job.get("metadata") or {})
        metadata["transient_attempts"] = attempt
        self.client.table("processing_jobs").update(
            {
                "stage": "queued",
                "progress": 0,
                "available_at": (datetime.now(UTC) + timedelta(seconds=delay_seconds)).isoformat(),
                "worker_id": None,
                "heartbeat_at": None,
                "completed_at": None,
                "error_code": "provider_busy",
                "error_message": f"The AI service is busy. Retrying automatically in about {delay_seconds} seconds.",
                "metadata": metadata,
            }
        ).eq("id", job["id"]).execute()

    def load_context(self, job: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
        file_record = (
            self.client.table("course_files")
            .select("*")
            .eq("id", job["file_id"])
            .single()
            .execute()
            .data
        )
        course = (
            self.client.table("courses")
            .select("*")
            .eq("id", job["course_id"])
            .single()
            .execute()
            .data
        )
        profile = (
            self.client.table("profiles")
            .select("timezone")
            .eq("id", job["user_id"])
            .single()
            .execute()
            .data
        )
        return file_record, course, profile

    def download_file(self, file_record: dict[str, Any], destination: Path) -> None:
        content = self.client.storage.from_(file_record["storage_bucket"]).download(
            file_record["storage_path"]
        )
        destination.write_bytes(content)

    def set_file(self, file_id: str, **values: Any) -> None:
        self.client.table("course_files").update(values).eq("id", file_id).execute()

    def set_course(self, course_id: str, **values: Any) -> None:
        self.client.table("courses").update(values).eq("id", course_id).execute()

    def count_pending_required_reviews(self, course_id: str) -> int:
        result = (
            self.client.table("review_items")
            .select("id", count="exact")
            .eq("course_id", course_id)
            .eq("required_for_setup", True)
            .in_("status", ["Needs review", "Deferred"])
            .execute()
        )
        return int(result.count or 0)

    def cleanup_file_outputs(self, file_id: str) -> None:
        for table, extra in [
            ("assignments", {"created_by": "extracted"}),
            ("review_items", {}),
            ("course_meetings", {}),
            ("course_policies", {}),
            ("candidate_items", {}),
            ("extraction_runs", {}),
            ("document_chunks", {}),
        ]:
            query = self.client.table(table).delete()
            field = "source_file_id" if table in {"assignments", "course_meetings", "course_policies"} else "file_id"
            query = query.eq(field, file_id)
            for key, value in extra.items():
                query = query.eq(key, value)
            query.execute()

    def store_chunks(
        self,
        job: dict[str, Any],
        file_record: dict[str, Any],
        chunks: list[ParsedChunk],
        embeddings: list[list[float]],
    ) -> None:
        rows = []
        for chunk, embedding in zip(chunks, embeddings, strict=True):
            rows.append(
                {
                    "user_id": job["user_id"],
                    "course_id": job["course_id"],
                    "file_id": job["file_id"],
                    "file_version": file_record["version"],
                    "chunk_index": chunk.index,
                    "page_number": chunk.page_number,
                    "section_heading": chunk.heading,
                    "content": chunk.text,
                    "token_count": max(1, len(chunk.text) // 4),
                    "embedding": embedding,
                    "block_type": chunk.block_type,
                    "section_path": chunk.section_path,
                    "source_anchor": chunk.source_anchor,
                }
            )
        for offset in range(0, len(rows), 20):
            self.client.table("document_chunks").insert(rows[offset : offset + 20]).execute()

    def create_extraction_run(
        self,
        job: dict[str, Any],
        model: str,
        input_characters: int,
        document_type: str,
    ) -> str:
        result = (
            self.client.table("extraction_runs")
            .insert(
                {
                    "user_id": job["user_id"],
                    "course_id": job["course_id"],
                    "file_id": job["file_id"],
                    "provider": "anthropic",
                    "model": model,
                    "input_characters": input_characters,
                    "document_type": document_type,
                }
            )
            .execute()
        )
        return result.data[0]["id"]

    def finish_extraction_run(
        self,
        extraction_run_id: str,
        status: str,
        candidate_count: int,
        error_code: str | None = None,
    ) -> None:
        self.client.table("extraction_runs").update(
            {
                "status": status,
                "candidate_count": candidate_count,
                "error_code": error_code,
                "completed_at": utc_now(),
            }
        ).eq("id", extraction_run_id).execute()

    def insert(self, table: str, values: dict[str, Any]) -> dict[str, Any]:
        result = self.client.table(table).insert(values).execute()
        return result.data[0]

    def update(self, table: str, record_id: str, **values: Any) -> None:
        self.client.table(table).update(values).eq("id", record_id).execute()
