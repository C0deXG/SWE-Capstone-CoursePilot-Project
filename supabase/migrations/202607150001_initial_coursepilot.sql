create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;
create schema if not exists private;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  preferred_name text not null default '',
  avatar_path text,
  university text not null default '',
  program text not null default '',
  graduation_month text not null default '',
  graduation_year integer check (graduation_year is null or graduation_year between 2000 and 2200),
  current_term text not null default '',
  timezone text not null default 'America/Chicago',
  onboarding_step smallint not null default 1 check (onboarding_step between 1 and 4),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_notifications boolean not null default true,
  browser_notifications boolean not null default true,
  daily_digest boolean not null default true,
  reminder_two_days time not null default '09:00',
  reminder_one_day time not null default '09:00',
  reminder_due_date time not null default '09:00',
  week_starts_on text not null default 'Monday' check (week_starts_on in ('Monday', 'Sunday')),
  calendar_view text not null default 'Week' check (calendar_view in ('Week', 'List')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  short_name text not null,
  title text not null,
  instructor text not null default '',
  term text not null,
  meeting_time text not null default '',
  room text not null default '',
  accent text not null default '#2f6b4f',
  progress smallint not null default 0 check (progress between 0 and 100),
  setup_step smallint not null default 1 check (setup_step between 1 and 5),
  setup_status text not null default 'draft' check (setup_status in ('draft', 'processing', 'review', 'ready')),
  setup_completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, code, term)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'owner', 'viewer')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, course_id)
);

create table public.course_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  storage_bucket text not null default 'course-files',
  storage_path text not null unique,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 16777216),
  checksum text,
  version integer not null default 1 check (version > 0),
  page_count integer check (page_count is null or page_count >= 0),
  status text not null default 'queued' check (status in ('queued', 'processing', 'accepted', 'needs_review', 'failed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  file_id uuid not null references public.course_files(id) on delete cascade,
  stage text not null default 'queued' check (stage in ('queued', 'validating', 'extracting_text', 'chunking', 'embedding', 'extracting_facts', 'creating_reviews', 'completed', 'needs_review', 'failed')),
  progress smallint not null default 0 check (progress between 0 and 100),
  error_code text,
  error_message text,
  retry_count smallint not null default 0 check (retry_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  file_id uuid not null references public.course_files(id) on delete cascade,
  file_version integer not null,
  chunk_index integer not null check (chunk_index >= 0),
  page_number integer,
  section_heading text,
  content text not null,
  token_count integer,
  checksum text,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (file_id, file_version, chunk_index)
);

create table public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  file_id uuid not null references public.course_files(id) on delete cascade,
  provider text not null,
  model text not null,
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  input_characters integer,
  candidate_count integer not null default 0,
  error_code text,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create table public.candidate_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  file_id uuid not null references public.course_files(id) on delete cascade,
  extraction_run_id uuid references public.extraction_runs(id) on delete set null,
  item_type text not null check (item_type in ('assignment', 'exam', 'quiz', 'meeting', 'policy', 'material', 'contact', 'office_hour', 'milestone')),
  proposed_value jsonb not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  source_page integer,
  source_heading text,
  source_quote text,
  resolution text not null default 'pending' check (resolution in ('pending', 'accepted', 'edited', 'rejected', 'deferred')),
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  candidate_id uuid references public.candidate_items(id) on delete set null,
  source_file_id uuid references public.course_files(id) on delete set null,
  title text not null,
  description text not null default '',
  due_at timestamptz,
  points numeric(10,2) check (points is null or points >= 0),
  status text not null default 'Not started' check (status in ('Not started', 'In progress', 'Completed', 'Submitted', 'Needs review')),
  confidence text not null default 'High' check (confidence in ('High', 'Medium', 'Low')),
  source_location text,
  created_by text not null default 'student' check (created_by in ('student', 'extracted')),
  confirmed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  file_id uuid references public.course_files(id) on delete cascade,
  candidate_id uuid references public.candidate_items(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete set null,
  field_name text not null,
  question text not null,
  extracted_value text not null,
  confidence text not null check (confidence in ('High', 'Medium', 'Low')),
  source_reference text not null,
  required_for_setup boolean not null default false,
  status text not null default 'Needs review' check (status in ('Needs review', 'Accepted', 'Edited', 'Rejected', 'Deferred')),
  edited_value text,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.course_meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  candidate_id uuid references public.candidate_items(id) on delete set null,
  title text not null,
  day_of_week smallint check (day_of_week between 0 and 6),
  start_time time,
  end_time time,
  location text,
  source_file_id uuid references public.course_files(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.course_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  candidate_id uuid references public.candidate_items(id) on delete set null,
  category text not null,
  title text not null,
  policy_text text not null,
  source_file_id uuid references public.course_files(id) on delete set null,
  source_location text,
  confirmed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  remind_at timestamptz not null,
  channel text not null check (channel in ('email', 'browser', 'in_app')),
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'cancelled', 'failed')),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null default 'New conversation',
  scope text not null default 'course' check (scope in ('course', 'all_courses')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  status text not null default 'completed' check (status in ('pending', 'streaming', 'completed', 'failed')),
  provider text,
  model text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.message_citations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.assistant_messages(id) on delete cascade,
  chunk_id uuid not null references public.document_chunks(id) on delete cascade,
  citation_order smallint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  unique (message_id, chunk_id)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index courses_owner_idx on public.courses(owner_id, archived_at);
create index assignments_user_due_idx on public.assignments(user_id, due_at);
create index assignments_course_due_idx on public.assignments(course_id, due_at);
create index course_files_course_idx on public.course_files(course_id, created_at desc);
create index processing_jobs_file_idx on public.processing_jobs(file_id, created_at desc);
create index review_items_user_status_idx on public.review_items(user_id, status);
create index document_chunks_owner_idx on public.document_chunks(user_id, course_id, file_id);
create index document_chunks_embedding_idx on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index assistant_messages_conversation_idx on public.assistant_messages(conversation_id, created_at);

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger preferences_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();
create trigger courses_updated_at before update on public.courses for each row execute function public.set_updated_at();
create trigger files_updated_at before update on public.course_files for each row execute function public.set_updated_at();
create trigger jobs_updated_at before update on public.processing_jobs for each row execute function public.set_updated_at();
create trigger assignments_updated_at before update on public.assignments for each row execute function public.set_updated_at();
create trigger reviews_updated_at before update on public.review_items for each row execute function public.set_updated_at();
create trigger conversations_updated_at before update on public.assistant_conversations for each row execute function public.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, preferred_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'preferred_name', ''));

  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function public.match_course_chunks(
  query_embedding extensions.vector(1536),
  requested_course_id uuid default null,
  match_count integer default 8,
  minimum_similarity double precision default 0.2
)
returns table (
  id uuid,
  course_id uuid,
  file_id uuid,
  filename text,
  page_number integer,
  section_heading text,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    chunks.id,
    chunks.course_id,
    chunks.file_id,
    files.filename,
    chunks.page_number,
    chunks.section_heading,
    chunks.content,
    1 - (chunks.embedding <=> query_embedding) as similarity
  from public.document_chunks chunks
  join public.course_files files on files.id = chunks.file_id
  where chunks.user_id = auth.uid()
    and (requested_course_id is null or chunks.course_id = requested_course_id)
    and 1 - (chunks.embedding <=> query_embedding) >= minimum_similarity
  order by chunks.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

grant execute on function public.match_course_chunks(extensions.vector, uuid, integer, double precision) to authenticated;

create unique index assignments_candidate_unique_idx on public.assignments(candidate_id) where candidate_id is not null;

create or replace function public.resolve_review_item(
  requested_review_id uuid,
  requested_status text,
  requested_value text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  review_record public.review_items%rowtype;
  candidate_record public.candidate_items%rowtype;
  candidate_resolution text;
  assignment_due_at timestamptz;
  assignment_points numeric(10,2);
begin
  if requested_status not in ('Accepted', 'Edited', 'Rejected', 'Deferred') then
    raise exception 'Unsupported review status';
  end if;

  select * into review_record
  from public.review_items
  where id = requested_review_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Review item not found';
  end if;

  update public.review_items
  set
    status = requested_status,
    edited_value = case when requested_status = 'Edited' then nullif(trim(requested_value), '') else null end,
    resolved_at = case when requested_status in ('Accepted', 'Edited', 'Rejected') then timezone('utc', now()) else null end
  where id = review_record.id;

  if review_record.candidate_id is null then
    return;
  end if;

  candidate_resolution := case requested_status
    when 'Accepted' then 'accepted'
    when 'Edited' then 'edited'
    when 'Rejected' then 'rejected'
    else 'deferred'
  end;

  update public.candidate_items
  set
    resolution = candidate_resolution,
    resolved_at = case when requested_status = 'Deferred' then null else timezone('utc', now()) end
  where id = review_record.candidate_id and user_id = auth.uid()
  returning * into candidate_record;

  if requested_status not in ('Accepted', 'Edited')
    or candidate_record.item_type not in ('assignment', 'exam', 'quiz', 'milestone') then
    return;
  end if;

  assignment_due_at := case
    when pg_input_is_valid(candidate_record.proposed_value ->> 'due_at', 'timestamp with time zone')
      then (candidate_record.proposed_value ->> 'due_at')::timestamptz
    else null
  end;
  assignment_points := case
    when coalesce(candidate_record.proposed_value ->> 'points', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (candidate_record.proposed_value ->> 'points')::numeric(10,2)
    else null
  end;

  insert into public.assignments (
    user_id,
    course_id,
    candidate_id,
    source_file_id,
    title,
    description,
    due_at,
    points,
    status,
    confidence,
    source_location,
    created_by,
    confirmed_at
  ) values (
    auth.uid(),
    candidate_record.course_id,
    candidate_record.id,
    candidate_record.file_id,
    coalesce(nullif(candidate_record.proposed_value ->> 'title', ''), 'Course item'),
    coalesce(candidate_record.proposed_value ->> 'description', ''),
    assignment_due_at,
    assignment_points,
    'Not started',
    initcap(candidate_record.confidence),
    case when candidate_record.source_page is not null then 'page ' || candidate_record.source_page else null end,
    'extracted',
    timezone('utc', now())
  )
  on conflict (candidate_id) where candidate_id is not null do update set
    title = excluded.title,
    description = excluded.description,
    due_at = excluded.due_at,
    points = excluded.points,
    confidence = excluded.confidence,
    confirmed_at = excluded.confirmed_at;
end;
$$;

revoke all on function public.resolve_review_item(uuid, text, text) from public;
grant execute on function public.resolve_review_item(uuid, text, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.courses enable row level security;
alter table public.enrollments enable row level security;
alter table public.course_files enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.document_chunks enable row level security;
alter table public.extraction_runs enable row level security;
alter table public.candidate_items enable row level security;
alter table public.assignments enable row level security;
alter table public.review_items enable row level security;
alter table public.course_meetings enable row level security;
alter table public.course_policies enable row level security;
alter table public.reminders enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.message_citations enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_own on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy preferences_own on public.user_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy courses_own on public.courses for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy enrollments_own on public.enrollments for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy files_own on public.course_files for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy jobs_own on public.processing_jobs for select using (user_id = auth.uid());
create policy chunks_own on public.document_chunks for select using (user_id = auth.uid());
create policy extractions_own on public.extraction_runs for select using (user_id = auth.uid());
create policy candidates_own on public.candidate_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy assignments_own on public.assignments for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reviews_own on public.review_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy meetings_own on public.course_meetings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy policies_own on public.course_policies for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reminders_own on public.reminders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy conversations_own on public.assistant_conversations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy messages_own on public.assistant_messages for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy citations_own on public.message_citations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy audit_own_select on public.audit_events for select using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-files',
  'course-files',
  false,
  16777216,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy course_files_select on storage.objects
for select to authenticated
using (bucket_id = 'course-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy course_files_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'course-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy course_files_update on storage.objects
for update to authenticated
using (bucket_id = 'course-files' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'course-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy course_files_delete on storage.objects
for delete to authenticated
using (bucket_id = 'course-files' and (storage.foldername(name))[1] = auth.uid()::text);

alter publication supabase_realtime add table public.processing_jobs;
