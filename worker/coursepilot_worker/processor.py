from __future__ import annotations

import re
import tempfile
import traceback
from datetime import UTC
from pathlib import Path
from zoneinfo import ZoneInfo

from dateutil.parser import isoparse

from .config import Settings
from .models import CourseFact, ParsedChunk
from .parser import DoclingParser
from .providers import ModelServices
from .repository import Repository, utc_now
from .schedule import extract_schedule_facts, merge_facts

AUTHORITATIVE_TYPES = {"syllabus", "course_schedule"}
SUPPORTING_TYPES = {"assignment_brief", "rubric"}
ASSIGNMENT_TYPES = {"assignment", "exam", "quiz", "milestone"}
MAX_TRANSIENT_ATTEMPTS = 5


def authority_for(document_type: str) -> str:
    if document_type in AUTHORITATIVE_TYPES:
        return "authoritative"
    if document_type in SUPPORTING_TYPES:
        return "supporting"
    return "search_only"


def normalize_due_at(value: str | None, timezone_name: str) -> str | None:
    if not value:
        return None
    try:
        parsed = isoparse(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo(timezone_name))
    return parsed.astimezone(UTC).isoformat()


def normalized_time(value: str | None) -> str | None:
    if not value:
        return None
    match = re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", value)
    return value if match else None


def source_location(chunk: ParsedChunk | None) -> str | None:
    if not chunk:
        return None
    if chunk.page_number:
        return f"page or slide {chunk.page_number}"
    return chunk.heading


def contact_name(fact: CourseFact) -> str:
    if not re.fullmatch(r"(instructor|professor|teacher|course contact|contact)", fact.title, re.I):
        return fact.title.strip()
    return re.split(r"[\n|,]", fact.description, maxsplit=1)[0].strip() or fact.title.strip()


def calendar_facts_for_document(
    facts: list[CourseFact],
    document_type: str,
) -> list[CourseFact]:
    if document_type != "assignment_brief":
        return facts
    return [
        fact
        for fact in facts
        if fact.type in ASSIGNMENT_TYPES and fact.due_at
    ]


def is_transient_provider_error(error: Exception) -> bool:
    status_code = getattr(error, "status_code", None)
    return status_code in {408, 409, 429, 500, 502, 503, 504, 529} or type(error).__name__ in {
        "APIConnectionError",
        "APITimeoutError",
        "InternalServerError",
        "OverloadedError",
        "RateLimitError",
    }


def transient_retry_delay(attempt: int) -> int:
    return min(15 * (2 ** max(0, attempt - 1)), 240)


class Processor:
    def __init__(
        self,
        settings: Settings,
        repository: Repository,
        parser: DoclingParser,
        models: ModelServices,
    ) -> None:
        self.settings = settings
        self.repository = repository
        self.parser = parser
        self.models = models

    def process(self, job: dict[str, object]) -> None:
        job_id = str(job["id"])
        file_id = str(job["file_id"])
        extraction_run_id: str | None = None
        try:
            file_record, course, profile = self.repository.load_context(job)
            course_was_ready = course["setup_status"] == "ready"
            self.repository.set_file(file_id, status="processing")
            if not course_was_ready:
                self.repository.set_course(course["id"], setup_status="processing", setup_step=3)

            self.repository.update_job(job_id, "validating", 10)
            self.repository.cleanup_file_outputs(file_id)
            suffix = Path(file_record["filename"]).suffix or ".bin"
            with tempfile.TemporaryDirectory(prefix="coursepilot-") as directory:
                input_path = Path(directory) / f"source{suffix}"
                self.repository.download_file(file_record, input_path)

                self.repository.update_job(job_id, "extracting_text", 22)
                parsed = self.parser.parse(input_path)

            self.repository.update_job(
                job_id,
                "chunking",
                38,
                parser_name=parsed.parser_name,
                parser_version=self.parser.version,
                metadata={"chunk_count": len(parsed.chunks)},
            )
            self.repository.update_job(job_id, "embedding", 52)
            embeddings = self.models.embed(chunk.text for chunk in parsed.chunks)
            self.repository.store_chunks(job, file_record, parsed.chunks, embeddings)

            self.repository.update_job(job_id, "extracting_facts", 70)
            classification = self.models.classify(
                parsed.chunks,
                file_record["filename"],
                course["code"],
                course["title"],
            )
            authority = authority_for(classification.document_type)
            self.repository.set_file(
                file_id,
                document_type=classification.document_type,
                classification_confidence=classification.confidence,
                authority_level=authority,
                classified_at=utc_now(),
            )
            facts = self.models.extract_facts(
                parsed.chunks,
                classification.document_type,
                course["code"],
                course["title"],
                course["term"],
                profile.get("timezone") or "America/Chicago",
            )
            facts = calendar_facts_for_document(facts, classification.document_type)
            schedule_facts = extract_schedule_facts(
                parsed.chunks,
                course["term"],
                profile.get("timezone") or "America/Chicago",
            )
            if schedule_facts:
                facts = [
                    fact
                    for fact in facts
                    if fact.type not in ASSIGNMENT_TYPES or fact.due_at
                ]
            facts = merge_facts(schedule_facts, facts)
            extraction_run_id = self.repository.create_extraction_run(
                job,
                self.settings.anthropic_model,
                sum(len(chunk.text) for chunk in parsed.chunks),
                classification.document_type,
            )

            self.repository.update_job(job_id, "creating_reviews", 86)
            review_count, _ = self._store_facts(
                job=job,
                course=course,
                file_record=file_record,
                chunks=parsed.chunks,
                facts=facts,
                extraction_run_id=extraction_run_id,
                document_type=classification.document_type,
                authority=authority,
                course_was_ready=course_was_ready,
                timezone_name=profile.get("timezone") or "America/Chicago",
            )
            self.repository.finish_extraction_run(
                extraction_run_id,
                "completed",
                len(facts),
            )
            final_stage = "needs_review" if review_count else "completed"
            self.repository.update_job(
                job_id,
                final_stage,
                100,
                completed_at=utc_now(),
                metadata={
                    "chunk_count": len(parsed.chunks),
                    "candidate_count": len(facts),
                    "review_count": review_count,
                },
            )
            self.repository.set_file(
                file_id,
                status="needs_review" if review_count else "accepted",
                page_count=parsed.page_count,
            )
            if not course_was_ready:
                pending_required = self.repository.count_pending_required_reviews(course["id"])
                self.repository.set_course(
                    course["id"],
                    setup_status="review" if pending_required else "ready",
                    setup_step=4 if pending_required else 5,
                )
            print(
                f"Completed {file_record['filename']}: {len(parsed.chunks)} chunks, "
                f"{len(facts)} facts, {review_count} reviews",
                flush=True,
            )
        except Exception as error:
            metadata = dict(job.get("metadata") or {})
            transient_attempt = int(metadata.get("transient_attempts") or 0) + 1
            if is_transient_provider_error(error) and transient_attempt <= MAX_TRANSIENT_ATTEMPTS:
                delay = transient_retry_delay(transient_attempt)
                self.repository.defer_job(job, delay, transient_attempt)
                self.repository.set_file(file_id, status="queued")
                print(
                    f"Provider busy for file {file_id}; retry {transient_attempt}/{MAX_TRANSIENT_ATTEMPTS} "
                    f"in {delay} seconds",
                    flush=True,
                )
                return
            error_code = re.sub(r"[^a-z0-9]+", "_", type(error).__name__.lower()).strip("_")
            message = (
                "The document service stayed unavailable after several attempts. Try this file again shortly."
                if is_transient_provider_error(error)
                else "This file could not be organized. Try it again or upload a different copy."
            )
            try:
                self.repository.update_job(
                    job_id,
                    "failed",
                    int(job.get("progress") or 0),
                    error_code=error_code,
                    error_message=message,
                    completed_at=utc_now(),
                )
                self.repository.set_file(file_id, status="failed")
                if extraction_run_id:
                    self.repository.finish_extraction_run(
                        extraction_run_id,
                        "failed",
                        0,
                        error_code,
                    )
            finally:
                traceback.print_exc()

    def _store_facts(
        self,
        *,
        job: dict[str, object],
        course: dict[str, object],
        file_record: dict[str, object],
        chunks: list[ParsedChunk],
        facts: list[CourseFact],
        extraction_run_id: str,
        document_type: str,
        authority: str,
        course_was_ready: bool,
        timezone_name: str,
    ) -> tuple[int, int]:
        chunk_by_index = {chunk.index: chunk for chunk in chunks}
        review_count = 0
        required_review_count = 0
        for fact in facts:
            chunk = chunk_by_index.get(fact.source_chunk)
            due_at = normalize_due_at(fact.due_at, timezone_name)
            if (
                fact.type in ASSIGNMENT_TYPES
                and not due_at
                and chunk
                and chunk.heading == "Assignments and Grading"
            ):
                continue
            if fact.type == "milestone" and re.fullmatch(r"Course (Start|End) Date", fact.title, re.I):
                continue
            confidence = fact.confidence
            clarification = fact.clarification_question
            if fact.due_at and not due_at:
                confidence = "low"
                clarification = clarification or f"What is the exact date and time for {fact.title}?"
            proposed = fact.model_dump(mode="json")
            proposed["due_at"] = due_at
            proposed["confidence"] = confidence
            fact_heading = (
                "Schedule of Topics and Due Dates"
                if chunk and chunk.block_type == "table" and due_at
                else chunk.heading if chunk else None
            )
            fact_location = (
                f"page or slide {chunk.page_number}"
                if chunk and chunk.page_number
                else fact_heading
            )
            supported_fact = (
                document_type in {"syllabus", "course_schedule"}
                or (
                    document_type == "assignment_brief"
                    and fact.type in ASSIGNMENT_TYPES
                    and due_at is not None
                )
                or (
                    document_type == "rubric"
                    and (
                        fact.type == "policy"
                        or (fact.type in ASSIGNMENT_TYPES and due_at is not None)
                    )
                )
            )
            if not supported_fact:
                continue
            candidate = self.repository.insert(
                "candidate_items",
                {
                    "user_id": job["user_id"],
                    "course_id": job["course_id"],
                    "file_id": job["file_id"],
                    "extraction_run_id": extraction_run_id,
                    "item_type": fact.type,
                    "proposed_value": proposed,
                    "confidence": confidence,
                    "source_page": chunk.page_number if chunk else None,
                    "source_heading": fact_heading,
                    "source_quote": fact.source_quote or None,
                },
            )

            can_accept_assignment = (
                fact.type in ASSIGNMENT_TYPES
                and confidence == "high"
                and document_type in {"syllabus", "course_schedule", "assignment_brief"}
                and due_at is not None
            )
            can_accept_meeting = fact.type == "meeting" and confidence == "high" and authority == "authoritative"
            can_accept_course_info = (
                fact.type in {"policy", "material", "contact", "office_hour"}
                and confidence == "high"
                and (
                    document_type == "syllabus"
                    or (document_type == "rubric" and fact.type == "policy")
                )
            )
            if can_accept_assignment:
                self.repository.insert(
                    "assignments",
                    {
                        "user_id": job["user_id"],
                        "course_id": job["course_id"],
                        "candidate_id": candidate["id"],
                        "source_file_id": job["file_id"],
                        "title": fact.title,
                        "description": fact.description,
                        "due_at": due_at,
                        "points": fact.points,
                        "status": "Not started",
                        "confidence": "High",
                        "source_location": fact_location,
                        "created_by": "extracted",
                        "confirmed_at": utc_now(),
                    },
                )
                self.repository.update("candidate_items", candidate["id"], resolution="accepted", resolved_at=utc_now())
            elif can_accept_meeting:
                self.repository.insert(
                    "course_meetings",
                    {
                        "user_id": job["user_id"],
                        "course_id": job["course_id"],
                        "candidate_id": candidate["id"],
                        "title": fact.title,
                        "day_of_week": fact.day_of_week,
                        "start_time": normalized_time(fact.start_time),
                        "end_time": normalized_time(fact.end_time),
                        "location": fact.location,
                        "source_file_id": job["file_id"],
                        "confirmed_at": utc_now(),
                    },
                )
                updates: dict[str, object] = {}
                if not course.get("meeting_time") and fact.day_of_week is not None:
                    day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][fact.day_of_week]
                    times = " to ".join(filter(None, [normalized_time(fact.start_time), normalized_time(fact.end_time)]))
                    updates["meeting_time"] = ", ".join(filter(None, [day, times]))
                if not course.get("room") and fact.location:
                    updates["room"] = fact.location
                if updates:
                    self.repository.set_course(str(course["id"]), **updates)
                self.repository.update("candidate_items", candidate["id"], resolution="accepted", resolved_at=utc_now())
            elif can_accept_course_info:
                category = (
                    "office_hours"
                    if fact.type == "office_hour"
                    else "contact"
                    if fact.type == "contact"
                    else "materials"
                    if fact.type == "material"
                    else fact.category or "course_policy"
                )
                self.repository.insert(
                    "course_policies",
                    {
                        "user_id": job["user_id"],
                        "course_id": job["course_id"],
                        "candidate_id": candidate["id"],
                        "category": category,
                        "title": fact.title,
                        "policy_text": fact.description or fact.source_quote or fact.title,
                        "source_file_id": job["file_id"],
                        "source_location": fact_location,
                        "confirmed_at": utc_now(),
                    },
                )
                if fact.type == "contact" and not course.get("instructor"):
                    self.repository.set_course(str(course["id"]), instructor=contact_name(fact))
                self.repository.update("candidate_items", candidate["id"], resolution="accepted", resolved_at=utc_now())
            else:
                review_count += 1
                required_for_setup = not course_was_ready and authority != "search_only"
                required_review_count += int(required_for_setup)
                self.repository.insert(
                    "review_items",
                    {
                        "user_id": job["user_id"],
                        "course_id": job["course_id"],
                        "file_id": job["file_id"],
                        "candidate_id": candidate["id"],
                        "field_name": fact.type.replace("_", " "),
                        "question": clarification or f"Confirm the extracted {fact.type} details for {fact.title}.",
                        "extracted_value": " | ".join(
                            value
                            for value in [
                                fact.title,
                                due_at,
                                f"{fact.points:g} points" if fact.points is not None else None,
                            ]
                            if value
                        ),
                        "confidence": confidence.title(),
                        "source_reference": f"{file_record['filename']}"
                        + (f", {fact_location}" if fact_location else ""),
                        "required_for_setup": required_for_setup,
                    },
                )
        return review_count, required_review_count
