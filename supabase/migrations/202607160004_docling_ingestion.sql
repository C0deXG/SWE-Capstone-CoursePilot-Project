alter table public.processing_jobs
  add column if not exists worker_id text,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists available_at timestamptz not null default timezone('utc', now()),
  add column if not exists parser_name text,
  add column if not exists parser_version text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.document_chunks
  add column if not exists block_type text not null default 'text',
  add column if not exists section_path text[] not null default '{}'::text[],
  add column if not exists source_anchor jsonb not null default '{}'::jsonb,
  add column if not exists search_vector tsvector generated always as (
    to_tsvector('english', coalesce(section_heading, '') || ' ' || content)
  ) stored;

create index if not exists processing_jobs_queue_idx
  on public.processing_jobs (available_at, created_at)
  where stage = 'queued';

create unique index if not exists processing_jobs_one_active_file_idx
  on public.processing_jobs (file_id)
  where stage in ('queued', 'validating', 'extracting_text', 'chunking', 'embedding', 'extracting_facts', 'creating_reviews');

create index if not exists document_chunks_search_idx
  on public.document_chunks using gin (search_vector);

create or replace function public.enqueue_course_file(p_file_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  owned_file public.course_files%rowtype;
  active_job_id uuid;
  new_job_id uuid;
begin
  select * into owned_file
  from public.course_files
  where id = p_file_id and user_id = auth.uid();

  if owned_file.id is null then
    raise exception 'Course file not found';
  end if;

  select id into active_job_id
  from public.processing_jobs
  where file_id = p_file_id
    and stage in ('queued', 'validating', 'extracting_text', 'chunking', 'embedding', 'extracting_facts', 'creating_reviews')
  order by created_at desc
  limit 1;

  if active_job_id is not null then
    return active_job_id;
  end if;

  insert into public.processing_jobs (
    user_id,
    course_id,
    file_id,
    retry_count
  ) values (
    owned_file.user_id,
    owned_file.course_id,
    owned_file.id,
    coalesce((
      select max(retry_count) + 1
      from public.processing_jobs
      where file_id = owned_file.id
    ), 0)
  )
  returning id into new_job_id;

  update public.course_files
  set status = 'queued'
  where id = owned_file.id;

  return new_job_id;
end;
$$;

revoke all on function public.enqueue_course_file(uuid) from public;
grant execute on function public.enqueue_course_file(uuid) to authenticated;

create or replace function public.claim_processing_job(p_worker_id text)
returns setof public.processing_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Worker authorization required';
  end if;

  return query
  with next_job as (
    select id
    from public.processing_jobs
    where stage = 'queued'
      and available_at <= timezone('utc', now())
    order by created_at
    for update skip locked
    limit 1
  )
  update public.processing_jobs jobs
  set
    stage = 'validating',
    progress = 5,
    worker_id = p_worker_id,
    heartbeat_at = timezone('utc', now()),
    started_at = coalesce(jobs.started_at, timezone('utc', now())),
    error_code = null,
    error_message = null
  from next_job
  where jobs.id = next_job.id
  returning jobs.*;
end;
$$;

revoke all on function public.claim_processing_job(text) from public;
grant execute on function public.claim_processing_job(text) to service_role;

create or replace function public.requeue_stale_processing_jobs(p_stale_after interval default interval '10 minutes')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Worker authorization required';
  end if;

  update public.processing_jobs
  set
    stage = 'queued',
    progress = 0,
    worker_id = null,
    heartbeat_at = null,
    available_at = timezone('utc', now()),
    error_code = 'worker_heartbeat_expired',
    error_message = 'The processing worker stopped before finishing. The file was queued again.'
  where stage in ('validating', 'extracting_text', 'chunking', 'embedding', 'extracting_facts', 'creating_reviews')
    and coalesce(heartbeat_at, updated_at) < timezone('utc', now()) - p_stale_after;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.requeue_stale_processing_jobs(interval) from public;
grant execute on function public.requeue_stale_processing_jobs(interval) to service_role;
