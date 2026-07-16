alter table public.course_files
  add column if not exists processing_order integer not null default 1000
  check (processing_order >= 0);

alter table public.processing_jobs
  add column if not exists processing_order integer not null default 1000
  check (processing_order >= 0);

drop index if exists public.processing_jobs_queue_idx;
create index processing_jobs_queue_idx
  on public.processing_jobs (processing_order, available_at, created_at)
  where stage = 'queued';

create or replace function public.enqueue_course_file(p_file_id uuid)
returns uuid
language plpgsql
security invoker
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
    retry_count,
    processing_order
  ) values (
    owned_file.user_id,
    owned_file.course_id,
    owned_file.id,
    coalesce((
      select max(retry_count) + 1
      from public.processing_jobs
      where file_id = owned_file.id
    ), 0),
    owned_file.processing_order
  )
  returning id into new_job_id;

  update public.course_files
  set status = 'queued'
  where id = owned_file.id;

  return new_job_id;
end;
$$;

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
    order by processing_order, created_at
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

revoke execute on function public.enqueue_course_file(uuid) from anon;
grant execute on function public.enqueue_course_file(uuid) to authenticated;

revoke execute on function public.claim_processing_job(text) from anon, authenticated;
grant execute on function public.claim_processing_job(text) to service_role;
