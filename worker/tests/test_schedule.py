import unittest

from coursepilot_worker.models import ParsedChunk
from coursepilot_worker.schedule import extract_schedule_facts


class ScheduleExtractionTests(unittest.TestCase):
    def test_extracts_dated_deliverables_from_markdown_table(self) -> None:
        chunks = [
            ParsedChunk(
                index=0,
                text="All assignments are due by 6:00 PM on the assigned due date.",
                heading="Schedule of Topics and Due Dates",
                page_number=1,
                block_type="text",
            ),
            ParsedChunk(
                index=1,
                text=(
                    "| Wk. | Date | Group Project | Individual Assignment |\n"
                    "| --- | --- | --- | --- |\n"
                    "| 9 | 7/16 | Sprint 2 - 200 pts. | |\n"
                    "| 10 | 7/23 | | Testing Assignment 50 pts. |\n"
                    "| 11 | 7/30 | Sprint 3 - 100 pts. | SE Exploration Assignment 50 pts. |"
                ),
                heading="Schedule of Topics and Due Dates",
                page_number=1,
                block_type="table",
            ),
        ]

        facts = extract_schedule_facts(chunks, "Summer 2026", "America/Chicago")
        by_title = {fact.title: fact for fact in facts}

        self.assertEqual(4, len(facts))
        self.assertEqual(200, by_title["Sprint 2"].points)
        self.assertEqual("2026-07-16T18:00:00-05:00", by_title["Sprint 2"].due_at)
        self.assertEqual(50, by_title["Testing Assignment"].points)
        self.assertEqual("2026-07-23T18:00:00-05:00", by_title["Testing Assignment"].due_at)
        self.assertEqual(100, by_title["Sprint 3"].points)

    def test_requires_a_term_year(self) -> None:
        facts = extract_schedule_facts([], "Summer", "America/Chicago")
        self.assertEqual([], facts)


if __name__ == "__main__":
    unittest.main()
