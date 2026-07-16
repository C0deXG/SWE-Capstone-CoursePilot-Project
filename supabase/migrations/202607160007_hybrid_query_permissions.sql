create or replace function public.coursepilot_or_tsquery(query_text text)
returns tsquery
language sql
immutable
set search_path = public
as $$
  select to_tsquery(
    'english',
    coalesce(
      (
        select string_agg(quote_literal(term) || ':*', ' | ')
        from unnest(tsvector_to_array(to_tsvector('english', query_text))) as term
      ),
      ''
    )
  );
$$;

revoke all on function public.coursepilot_or_tsquery(text) from public;
grant execute on function public.coursepilot_or_tsquery(text) to authenticated;

create or replace function public.match_course_chunks_hybrid(
  query_embedding extensions.vector(1536),
  query_text text,
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
  with query as (
    select public.coursepilot_or_tsquery(query_text) as text_query
  ),
  ranked as (
    select
      chunks.id,
      chunks.course_id,
      chunks.file_id,
      files.filename,
      chunks.page_number,
      chunks.section_heading,
      chunks.content,
      1 - (chunks.embedding <=> query_embedding) as vector_similarity,
      ts_rank_cd(chunks.search_vector, query.text_query) as text_rank
    from public.document_chunks chunks
    join public.course_files files on files.id = chunks.file_id
    cross join query
    where chunks.user_id = auth.uid()
      and (requested_course_id is null or chunks.course_id = requested_course_id)
  )
  select
    ranked.id,
    ranked.course_id,
    ranked.file_id,
    ranked.filename,
    ranked.page_number,
    ranked.section_heading,
    ranked.content,
    (
      ranked.vector_similarity * 0.6
      + (ranked.text_rank / (ranked.text_rank + 1)) * 0.4
    )::double precision as similarity
  from ranked
  where ranked.vector_similarity >= minimum_similarity
    or ranked.text_rank > 0
  order by similarity desc
  limit least(greatest(match_count, 1), 20);
$$;

drop function if exists private.coursepilot_or_tsquery(text);
