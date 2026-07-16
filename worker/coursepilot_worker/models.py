from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field

DocumentType = Literal[
    "syllabus",
    "course_schedule",
    "assignment_brief",
    "rubric",
    "lecture_notes",
    "slides",
    "reading",
    "reference",
    "other",
]
Confidence = Literal["high", "medium", "low"]
FactType = Literal[
    "assignment",
    "exam",
    "quiz",
    "meeting",
    "policy",
    "material",
    "contact",
    "office_hour",
    "milestone",
]


class DocumentClassification(BaseModel):
    document_type: DocumentType
    confidence: Confidence


class CourseFact(BaseModel):
    type: FactType
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(default="", max_length=500)
    due_at: str | None = None
    points: float | None = Field(default=None, ge=0)
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    start_time: str | None = None
    end_time: str | None = None
    location: str | None = Field(default=None, max_length=300)
    category: str | None = Field(default=None, max_length=100)
    confidence: Confidence
    source_chunk: int = Field(ge=0)
    source_quote: str = Field(default="", max_length=400)
    clarification_question: str | None = Field(default=None, max_length=300)


class FactBatch(BaseModel):
    items: list[CourseFact] = Field(default_factory=list, max_length=60)


@dataclass
class ParsedChunk:
    index: int
    text: str
    heading: str | None
    page_number: int | None
    block_type: str
    section_path: list[str] = field(default_factory=list)
    source_anchor: dict[str, object] = field(default_factory=dict)


@dataclass
class ParsedDocument:
    chunks: list[ParsedChunk]
    page_count: int
    markdown: str
    parser_name: str = "docling"
