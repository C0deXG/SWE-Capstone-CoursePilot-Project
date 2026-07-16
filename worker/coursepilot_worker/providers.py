from __future__ import annotations

import re
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from typing import TypeVar

from anthropic import Anthropic
from openai import OpenAI
from pydantic import BaseModel

from .config import Settings
from .models import CourseFact, DocumentClassification, FactBatch, ParsedChunk

T = TypeVar("T", bound=BaseModel)

EXTRACTION_TERMS = re.compile(
    r"\b(due|deadline|assignment|exam|quiz|sprint|project|paper|survey|presentation|"
    r"schedule|meeting|instructor|professor|office hour|attendance|late|submission|"
    r"grading|grade|points?|materials?|textbook|contact|email|policy)\b",
    re.IGNORECASE,
)


def _tool_result(response: object, model: type[T], tool_name: str) -> T:
    for block in getattr(response, "content", []):
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == tool_name:
            payload = getattr(block, "input", {})
            if model is FactBatch and isinstance(payload, dict):
                facts: list[CourseFact] = []
                for value in payload.get("items", [])[:60]:
                    if not isinstance(value, dict):
                        continue
                    normalized = dict(value)
                    for field, limit in {
                        "title": 240,
                        "description": 500,
                        "location": 300,
                        "category": 100,
                        "source_quote": 400,
                        "clarification_question": 300,
                    }.items():
                        if normalized.get(field) is not None:
                            normalized[field] = str(normalized[field])[:limit]
                    if normalized.get("confidence") not in {"high", "medium", "low"}:
                        normalized["confidence"] = "low"
                    try:
                        facts.append(CourseFact.model_validate(normalized))
                    except ValueError:
                        continue
                return FactBatch(items=facts)  # type: ignore[return-value]
            return model.model_validate(payload)
    raise ValueError(f"Claude did not return the required {tool_name} tool result")


def _chunk_label(chunk: ParsedChunk) -> str:
    labels = [f"Chunk {chunk.index}"]
    if chunk.page_number:
        labels.append(f"page or slide {chunk.page_number}")
    if chunk.heading:
        labels.append(f"heading: {chunk.heading}")
    return " | ".join(labels)


def _windows(chunks: list[ParsedChunk], max_characters: int = 10500) -> list[str]:
    windows: list[str] = []
    current = ""
    recent_sections: list[str] = []
    for chunk in chunks:
        section = f"\n[{_chunk_label(chunk)}]\n{chunk.text}\n"
        if current and len(current) + len(section) > max_characters:
            windows.append(current)
            overlap = "".join(recent_sections[-2:])
            current = overlap + section
        else:
            current += section
        recent_sections.append(section)
    if current:
        windows.append(current)
    return windows


def _relevant_chunks(chunks: list[ParsedChunk], document_type: str) -> list[ParsedChunk]:
    if document_type in {"course_schedule", "assignment_brief", "rubric"}:
        return chunks
    selected: set[int] = set()
    for position, chunk in enumerate(chunks):
        searchable = " ".join([chunk.heading or "", *chunk.section_path, chunk.text])
        if EXTRACTION_TERMS.search(searchable):
            selected.update(range(max(0, position - 1), min(len(chunks), position + 2)))
    return [chunk for position, chunk in enumerate(chunks) if position in selected] or chunks


class ModelServices:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.anthropic = Anthropic(
            api_key=settings.anthropic_api_key,
            timeout=75,
            max_retries=2,
        )
        self.openai = OpenAI(api_key=settings.openai_api_key, timeout=45, max_retries=2)

    def classify(
        self,
        chunks: list[ParsedChunk],
        filename: str,
        course_code: str,
        course_title: str,
    ) -> DocumentClassification:
        source = "\n".join(
            f"[{_chunk_label(chunk)}]\n{chunk.text}" for chunk in chunks
        )[:14000]
        response = self.anthropic.messages.create(
            model=self.settings.anthropic_model,
            max_tokens=300,
            tools=[
                {
                    "name": "classify_course_document",
                    "description": "Classify the uploaded university course document.",
                    "input_schema": DocumentClassification.model_json_schema(),
                }
            ],
            tool_choice={"type": "tool", "name": "classify_course_document"},
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Classify this file as syllabus, course_schedule, assignment_brief, rubric, "
                        "lecture_notes, slides, reading, reference, or other. A syllabus covers several "
                        "course-wide areas. A schedule lists course dates. Use the file content, not only "
                        "the filename.\n\n"
                        f"Filename: {filename}\nCourse: {course_code} {course_title}\n\n{source}"
                    ),
                }
            ],
        )
        return _tool_result(response, DocumentClassification, "classify_course_document")

    def extract_facts(
        self,
        chunks: list[ParsedChunk],
        document_type: str,
        course_code: str,
        course_title: str,
        term: str,
        timezone: str,
    ) -> list[CourseFact]:
        if document_type not in {"syllabus", "course_schedule", "assignment_brief", "rubric"}:
            return []
        windows = _windows(_relevant_chunks(chunks, document_type))

        def extract(window: str) -> FactBatch:
            response = self.anthropic.messages.create(
                model=self.settings.anthropic_model,
                max_tokens=2800,
                tools=[
                    {
                        "name": "record_course_facts",
                        "description": "Record course facts explicitly supported by the supplied sections.",
                        "input_schema": FactBatch.model_json_schema(),
                    }
                ],
                tool_choice={"type": "tool", "name": "record_course_facts"},
                messages=[
                    {
                        "role": "user",
                        "content": (
                        "Extract only explicitly supported course facts. Include assignments, exams, quizzes, "
                        "milestones, meetings, policies, materials, contacts, and office hours. Never convert "
                            "example dates into deadlines. Keep descriptions concise. Use the supplied chunk number "
                            "as source_chunk. Use ISO 8601 for due_at when the source gives enough date and time "
                            "information. In a course schedule table, combine the row's month/day with the stated "
                            "course term year, and apply a course-wide due time stated immediately before the table. "
                            "Treat each named deliverable in the assignment, project, paper, or survey columns as its "
                            "own fact. Lower confidence and ask a clarification question only when the available "
                            "course context still leaves the year, time, timezone, recurrence, or point value ambiguous.\n\n"
                        "For an assignment brief, do not turn headings, required artifacts, checklist bullets, "
                        "presentation topics, or acceptance criteria into separate assignment facts unless that "
                        "specific item has its own explicit due date. Do not emit policy, material, contact, meeting, "
                        "or office-hour facts from an assignment brief. Technical terms, data definitions, examples, "
                        "and implementation guidance remain available through document search and are not course "
                        "facts or review questions.\n\n"
                            f"Document type: {document_type}\n"
                            f"Course: {course_code} {course_title}\nTerm: {term}\nTimezone: {timezone}\n\n"
                            f"{window}"
                        ),
                    }
                ],
            )
            return _tool_result(response, FactBatch, "record_course_facts")

        batches: list[FactBatch] = []
        with ThreadPoolExecutor(max_workers=min(2, len(windows) or 1)) as executor:
            batches.extend(executor.map(extract, windows))
        facts = [fact for batch in batches for fact in batch.items]
        deduplicated: dict[tuple[str, str, str], CourseFact] = {}
        for fact in facts:
            key = (
                fact.type,
                re.sub(r"\W+", "", fact.title.lower()),
                fact.due_at or "",
            )
            existing = deduplicated.get(key)
            if not existing or (existing.confidence != "high" and fact.confidence == "high"):
                deduplicated[key] = fact
        return list(deduplicated.values())

    def embed(self, inputs: Iterable[str]) -> list[list[float]]:
        values = list(inputs)
        embeddings: list[list[float]] = []
        for offset in range(0, len(values), 64):
            response = self.openai.embeddings.create(
                model=self.settings.embedding_model,
                dimensions=self.settings.embedding_dimensions,
                input=values[offset : offset + 64],
                encoding_format="float",
            )
            embeddings.extend(
                item.embedding for item in sorted(response.data, key=lambda item: item.index)
            )
        if len(embeddings) != len(values):
            raise ValueError("Embedding provider returned an unexpected number of vectors")
        return embeddings
