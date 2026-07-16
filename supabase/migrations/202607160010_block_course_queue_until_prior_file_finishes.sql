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
    select jobs.id
    from public.processing_jobs jobs
    where jobs.stage = 'queued'
      and jobs.available_at <= timezone('utc', now())
      and not exists (
        select 1
        from public.course_files earlier
        where earlier.course_id = jobs.course_id
          and earlier.processing_order < jobs.processing_order
          and earlier.status not in ('accepted', 'needs_review')
      )
    order by jobs.processing_order, jobs.created_at
    for update of jobs skip locked
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

revoke execute on function public.claim_processing_job(text) from anon, authenticated;
grant execute on function public.claim_processing_job(text) to service_role;
