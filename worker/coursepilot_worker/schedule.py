from __future__ import annotations

import re
from datetime import datetime
from zoneinfo import ZoneInfo

from .models import CourseFact, ParsedChunk

POINT_ITEM = re.compile(
    r"(?P<title>.+?)\s*(?:[-–]\s*)?(?P<points>\d+(?:\.\d+)?)\s*(?:pts?\.?|points?)",
    re.IGNORECASE,
)
TIME = re.compile(r"\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b", re.IGNORECASE)
YEAR = re.compile(r"\b(20\d{2})\b")


def _cells(line: str) -> list[str]:
    return [re.sub(r"\s+", " ", value).strip() for value in line.strip().strip("|").split("|")]


def _rows(markdown: str) -> list[dict[str, str]]:
    lines = [line for line in markdown.splitlines() if line.lstrip().startswith("|")]
    if len(lines) < 3:
        return []
    headers = _cells(lines[0])
    if not all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in _cells(lines[1])):
        return []
    rows: list[dict[str, str]] = []
    for line in lines[2:]:
        values = _cells(line)
        if len(values) != len(headers):
            continue
        rows.append(dict(zip(headers, values, strict=True)))
    return rows


def _items(cell: str) -> list[tuple[str, float]]:
    items: list[tuple[str, float]] = []
    for match in POINT_ITEM.finditer(cell):
        title = re.sub(r"^[\s.;,:-]+|[\s.;,:-]+$", "", match.group("title"))
        if title:
            items.append((title, float(match.group("points"))))
    return items


def _due_time(chunks: list[ParsedChunk]) -> str:
    for chunk in chunks:
        if "due" not in chunk.text.lower():
            continue
        match = TIME.search(chunk.text)
        if match:
            return match.group(1).upper().replace("  ", " ")
    return "11:59 PM"


def extract_schedule_facts(
    chunks: list[ParsedChunk],
    term: str,
    timezone_name: str,
) -> list[CourseFact]:
    year_match = YEAR.search(term)
    if not year_match:
        return []
    year = int(year_match.group(1))
    due_time = _due_time(chunks)
    facts: list[CourseFact] = []
    for chunk in chunks:
        if chunk.block_type != "table":
            continue
        rows = _rows(chunk.text)
        if not rows:
            continue
        headers = {header.lower(): header for header in rows[0]}
        date_header = next((original for name, original in headers.items() if name == "date"), None)
        deliverable_headers = [
            original
            for name, original in headers.items()
            if any(term in name for term in ("group project", "individual assignment", "term paper", "survey"))
        ]
        if not date_header or not deliverable_headers:
            continue
        for row in rows:
            date_value = row.get(date_header, "").strip()
            try:
                local_due = datetime.strptime(
                    f"{date_value}/{year} {due_time}",
                    "%m/%d/%Y %I:%M %p",
                ).replace(tzinfo=ZoneInfo(timezone_name))
            except ValueError:
                continue
            for header in deliverable_headers:
                for title, points in _items(row.get(header, "")):
                    fact_type = "milestone" if "project" in header.lower() or title.lower().startswith("sprint") else "assignment"
                    facts.append(
                        CourseFact(
                            type=fact_type,
                            title=title,
                            description=f"{header} listed in the course schedule.",
                            due_at=local_due.isoformat(),
                            points=points,
                            confidence="high",
                            source_chunk=chunk.index,
                            source_quote=f"{date_value}: {title} {points:g} points",
                        )
                    )
    return facts


def merge_facts(primary: list[CourseFact], secondary: list[CourseFact]) -> list[CourseFact]:
    merged: dict[tuple[str, str], CourseFact] = {}
    for fact in [*secondary, *primary]:
        key = (
            re.sub(r"\W+", "", fact.title.lower()),
            fact.due_at or "",
        )
        merged[key] = fact
    return list(merged.values())
