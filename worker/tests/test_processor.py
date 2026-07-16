import unittest

from coursepilot_worker.models import CourseFact
from coursepilot_worker.processor import (
    calendar_facts_for_document,
    is_transient_provider_error,
    normalize_due_at,
    transient_retry_delay,
)
from coursepilot_worker.schedule import merge_facts


class ProcessorTests(unittest.TestCase):
    def test_normalize_due_at_applies_course_timezone(self) -> None:
        self.assertEqual(
            "2026-07-16T23:00:00+00:00",
            normalize_due_at("2026-07-16T18:00:00", "America/Chicago"),
        )

    def test_assignment_brief_requirements_do_not_become_calendar_items(self) -> None:
        facts = [
            CourseFact(
                type="assignment",
                title="Feature Files",
                description="Include one feature file per top-row feature.",
                confidence="high",
                source_chunk=0,
            ),
            CourseFact(
                type="assignment",
                title="Sprint 2",
                due_at="2026-07-16T18:00:00-05:00",
                confidence="high",
                source_chunk=0,
            ),
            CourseFact(
                type="material",
                title="Transfer Transaction data definition",
                confidence="high",
                source_chunk=0,
            ),
            CourseFact(
                type="policy",
                title="Background clause rules",
                confidence="high",
                source_chunk=0,
            ),
        ]

        filtered = calendar_facts_for_document(facts, "assignment_brief")

        self.assertEqual(["Sprint 2"], [fact.title for fact in filtered])

    def test_provider_overload_is_retried_with_bounded_backoff(self) -> None:
        overloaded = type("OverloadedError", (Exception,), {"status_code": 529})()

        self.assertTrue(is_transient_provider_error(overloaded))
        self.assertEqual([15, 30, 60, 120, 240], [transient_retry_delay(value) for value in range(1, 6)])

    def test_schedule_and_model_versions_of_same_work_are_merged(self) -> None:
        model_fact = CourseFact(
            type="assignment",
            title="Sprint 0",
            due_at="2026-05-28T18:00:00-05:00",
            confidence="high",
            source_chunk=0,
        )
        schedule_fact = CourseFact(
            type="milestone",
            title="Sprint 0",
            due_at="2026-05-28T18:00:00-05:00",
            confidence="high",
            source_chunk=0,
        )

        self.assertEqual([schedule_fact], merge_facts([schedule_fact], [model_fact]))


if __name__ == "__main__":
    unittest.main()
