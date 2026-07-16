from __future__ import annotations

from collections.abc import Iterable
from importlib.metadata import version
from pathlib import Path

from docling.chunking import HierarchicalChunker
from docling.document_converter import DocumentConverter

from .models import ParsedChunk, ParsedDocument


def _page_number(meta: dict[str, object]) -> int | None:
    for item in meta.get("doc_items", []):
        if not isinstance(item, dict):
            continue
        for provenance in item.get("prov", []):
            if isinstance(provenance, dict) and isinstance(provenance.get("page_no"), int):
                return provenance["page_no"]
    return None


def _block_type(meta: dict[str, object]) -> str:
    items = meta.get("doc_items", [])
    if items and isinstance(items[0], dict):
        return str(items[0].get("label") or "text")
    return "text"


def _source_refs(meta: dict[str, object]) -> list[str]:
    refs: list[str] = []
    for item in meta.get("doc_items", []):
        if isinstance(item, dict) and item.get("self_ref"):
            refs.append(str(item["self_ref"]))
    return refs


def _combine_chunks(chunks: Iterable[ParsedChunk], target_characters: int = 2400) -> list[ParsedChunk]:
    combined: list[ParsedChunk] = []
    for chunk in chunks:
        previous = combined[-1] if combined else None
        same_context = (
            previous
            and previous.heading == chunk.heading
            and previous.page_number == chunk.page_number
            and previous.block_type == chunk.block_type
            and len(previous.text) + len(chunk.text) + 2 <= target_characters
        )
        if same_context:
            previous.text = f"{previous.text}\n\n{chunk.text}"
            refs = list(previous.source_anchor.get("docling_refs", []))
            refs.extend(chunk.source_anchor.get("docling_refs", []))
            previous.source_anchor["docling_refs"] = refs
            continue
        combined.append(chunk)
    for index, chunk in enumerate(combined):
        chunk.index = index
    return combined


class DoclingParser:
    def __init__(self) -> None:
        self.converter = DocumentConverter()
        self.chunker = HierarchicalChunker()

    @property
    def version(self) -> str:
        return version("docling")

    def parse(self, path: Path) -> ParsedDocument:
        result = self.converter.convert(path)
        document = result.document
        table_markdown = {
            table.self_ref: table.export_to_markdown(doc=document).strip()
            for table in document.tables
        }
        raw_chunks: list[ParsedChunk] = []
        for index, chunk in enumerate(self.chunker.chunk(document)):
            meta = chunk.meta.model_dump(mode="json")
            headings = [str(value).strip() for value in meta.get("headings") or [] if str(value).strip()]
            block_type = _block_type(meta)
            refs = _source_refs(meta)
            text = chunk.text.strip()
            if block_type == "table":
                structured_table = next(
                    (table_markdown[ref] for ref in refs if ref in table_markdown),
                    "",
                )
                if structured_table:
                    text = structured_table
            if not text:
                continue
            raw_chunks.append(
                ParsedChunk(
                    index=index,
                    text=text,
                    heading=headings[-1] if headings else None,
                    page_number=_page_number(meta),
                    block_type=block_type,
                    section_path=headings,
                    source_anchor={"docling_refs": refs},
                )
            )
        chunks = _combine_chunks(raw_chunks)
        markdown = document.export_to_markdown()
        if not chunks and markdown.strip():
            chunks = [
                ParsedChunk(
                    index=0,
                    text=markdown.strip(),
                    heading=None,
                    page_number=1,
                    block_type="text",
                )
            ]
        if not chunks:
            raise ValueError("Docling did not find readable document content")
        detected_pages = [chunk.page_number for chunk in chunks if chunk.page_number]
        page_count = max(len(document.pages), max(detected_pages, default=0), 1)
        return ParsedDocument(chunks=chunks, page_count=page_count, markdown=markdown)
