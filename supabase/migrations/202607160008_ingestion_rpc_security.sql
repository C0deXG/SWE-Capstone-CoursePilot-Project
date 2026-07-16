create policy jobs_own_insert
on public.processing_jobs
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.course_files files
    where files.id = file_id
      and files.user_id = auth.uid()
      and files.course_id = course_id
  )
);

alter function public.enqueue_course_file(uuid) security invoker;

revoke execute on function public.enqueue_course_file(uuid) from anon;
grant execute on function public.enqueue_course_file(uuid) to authenticated;

revoke execute on function public.claim_processing_job(text) from anon, authenticated;
grant execute on function public.claim_processing_job(text) to service_role;

revoke execute on function public.requeue_stale_processing_jobs(interval) from anon, authenticated;
grant execute on function public.requeue_stale_processing_jobs(interval) to service_role;
