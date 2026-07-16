alter table public.course_files
  add column document_type text not null default 'unclassified'
    check (document_type in ('unclassified', 'syllabus', 'course_schedule', 'assignment_brief', 'rubric', 'lecture_notes', 'slides', 'reading', 'reference', 'other')),
  add column classification_confidence text
    check (classification_confidence is null or classification_confidence in ('high', 'medium', 'low')),
  add column authority_level text not null default 'search_only'
    check (authority_level in ('authoritative', 'supporting', 'search_only')),
  add column classified_at timestamptz;

alter table public.extraction_runs
  add column document_type text
    check (document_type is null or document_type in ('unclassified', 'syllabus', 'course_schedule', 'assignment_brief', 'rubric', 'lecture_notes', 'slides', 'reading', 'reference', 'other'));

create index course_files_course_document_type_idx
  on public.course_files(course_id, document_type, created_at desc);
