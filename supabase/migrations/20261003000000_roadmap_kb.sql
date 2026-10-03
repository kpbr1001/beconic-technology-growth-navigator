-- BECONIC Roadmap KB (Phase 3 Hybrid RAG)
-- 공식 로드맵 원문 문단(contextual chunk) + 키워드(부분일치·IDF) 검색 + 의미(pgvector) 검색.
-- ⚠️ 원문 문장을 담으므로 브라우저(anon)에서 직접 읽지 않는다: RLS 사용, 검색 함수는 service_role(서버 함수)만 실행.

create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists public.roadmap_chunks (
  chunk_id            text primary key,            -- 예: SMESTR-2025-B-03-08@p279#tech1
  chunk_type          text not null check (chunk_type in ('item', 'technology')),
  kb_version          text not null,
  is_active           boolean not null default true,
  source_file         text not null,
  sha256              text not null,
  roadmap_version     text not null,               -- 2026-2028 | 2025-2027 | 2023-2027 | 2026
  roadmap_type        text not null,               -- general | specialized | sobujang_definition
  roadmap_role        text not null default 'primary',  -- primary | crosswalk(이전 판)
  strategic_field     text not null,
  field_no            text,
  subfield            text,
  item_uid            text not null,
  item_code           text,                        -- 공식 품목코드(2026~2028 판만), 없으면 null
  item_no             text,                        -- 원문 순번(코드 없는 형식)
  item_name           text not null,
  technology_no       int,
  technology_name     text,
  trl_raw             text,                        -- 원문 표기 그대로(생성 금지)
  trl_min             int,
  trl_max             int,
  trl_basis           text,                        -- stated | stage_targets(연차별 목표) | not_provided
  page_start          int,                         -- PDF 쪽
  page_end            int,
  printed_page_start  int,                         -- 인쇄 쪽(보고서 인용용)
  printed_page_end    int,
  parse_confidence    text,
  contextual_prefix   text not null,
  content             text not null,
  -- 검색용 본문: 문맥 머리말 + 내용
  search_text         text generated always as (contextual_prefix || E'\n' || content) stored,
  -- 제목성 텍스트(품목명·기술명): 일치 시 가중
  title_text          text generated always as (item_name || ' ' || coalesce(technology_name, '')) stored,
  embedding           vector(1024),                -- EMBEDDING_DIMENSIONS=1024 (voyage-4). 키 없으면 null
  embedding_model     text,
  updated_at          timestamptz not null default now()
);

create index if not exists roadmap_chunks_filter_idx on public.roadmap_chunks (is_active, roadmap_version, strategic_field);
create index if not exists roadmap_chunks_item_idx on public.roadmap_chunks (item_uid);
create index if not exists roadmap_chunks_trgm_idx on public.roadmap_chunks using gin (search_text gin_trgm_ops);
create index if not exists roadmap_chunks_embedding_idx on public.roadmap_chunks using hnsw (embedding vector_cosine_ops);

alter table public.roadmap_chunks enable row level security;
-- 정책을 만들지 않는다 = anon/authenticated는 행을 읽을 수 없음(service_role은 RLS 우회)

-- 공통 필터: null이면 조건 없음
create or replace function public._roadmap_filter(
  c public.roadmap_chunks, p_versions text[], p_fields text[], p_types text[], p_item_uids text[], p_active_only boolean
) returns boolean language sql immutable as $$
  select (not p_active_only or c.is_active)
     and (p_versions is null or c.roadmap_version = any(p_versions))
     and (p_fields is null or c.strategic_field = any(p_fields))
     and (p_types is null or c.roadmap_type = any(p_types))
     and (p_item_uids is null or c.item_uid = any(p_item_uids))
$$;

-- 키워드 검색: 한국어는 형태소 분석기 없이 부분일치. 검색어별 희소성(IDF) 가중 — 희소성은 품목 한정(p_item_uids)
-- 전의 범위(버전·분야·유형)에서 계산해, 품목 안에서는 흔해도 KB 전체에서 드문 말이 살아 있게 한다.
-- 그 범위의 35% 이상에 나오는 흔한 단어는 0점. 품목명·기술명 일치는 2배. 반환: 점수·일치어.
create or replace function public.search_roadmap_keyword(
  p_terms text[],
  p_versions text[] default null,
  p_fields text[] default null,
  p_types text[] default null,
  p_item_uids text[] default null,
  p_active_only boolean default true,
  p_match_count int default 30
) returns table (
  chunk_id text, score double precision, matched_terms text[], chunk_type text, item_uid text, item_code text,
  item_no text, item_name text, technology_name text, trl_raw text, trl_basis text, source_file text,
  roadmap_version text, roadmap_type text, strategic_field text, subfield text, page_start int,
  printed_page_start int, contextual_prefix text, content text
) language sql stable as $$
  with corpus as (
    select c.chunk_id, c.search_text from public.roadmap_chunks c
    where public._roadmap_filter(c, p_versions, p_fields, p_types, null, p_active_only)
  ),
  base as (
    select c.* from public.roadmap_chunks c
    where public._roadmap_filter(c, p_versions, p_fields, p_types, p_item_uids, p_active_only)
  ),
  tot as (select greatest(count(*), 1)::float8 as n from corpus),
  q as (select distinct lower(t) as t from unnest(p_terms) as t where length(t) >= 2),
  df as (
    select q.t, count(b.chunk_id)::float8 as n
    from q join corpus b on b.search_text ilike '%' || q.t || '%'
    group by q.t
  ),
  w as (select df.t, ln((tot.n + 1) / df.n) as idf from df, tot where df.n / tot.n <= 0.35)
  select b.chunk_id,
         sum(w.idf * case when b.title_text ilike '%' || w.t || '%' then 2 else 1 end) as score,
         array_agg(w.t order by w.idf desc) as matched_terms,
         b.chunk_type, b.item_uid, b.item_code, b.item_no, b.item_name, b.technology_name, b.trl_raw, b.trl_basis,
         b.source_file, b.roadmap_version, b.roadmap_type, b.strategic_field, b.subfield, b.page_start,
         b.printed_page_start, b.contextual_prefix, b.content
  from base b join w on b.search_text ilike '%' || w.t || '%'
  group by b.chunk_id, b.chunk_type, b.item_uid, b.item_code, b.item_no, b.item_name, b.technology_name, b.trl_raw,
           b.trl_basis, b.source_file, b.roadmap_version, b.roadmap_type, b.strategic_field, b.subfield,
           b.page_start, b.printed_page_start, b.contextual_prefix, b.content
  order by score desc, b.chunk_id
  limit p_match_count
$$;

-- 의미 검색: 코사인 유사도. 임베딩이 없는 행은 제외.
create or replace function public.search_roadmap_semantic(
  p_embedding vector(1024),
  p_versions text[] default null,
  p_fields text[] default null,
  p_types text[] default null,
  p_item_uids text[] default null,
  p_active_only boolean default true,
  p_match_count int default 30
) returns table (
  chunk_id text, score double precision, matched_terms text[], chunk_type text, item_uid text, item_code text,
  item_no text, item_name text, technology_name text, trl_raw text, trl_basis text, source_file text,
  roadmap_version text, roadmap_type text, strategic_field text, subfield text, page_start int,
  printed_page_start int, contextual_prefix text, content text
) language sql stable as $$
  select c.chunk_id, 1 - (c.embedding <=> p_embedding) as score, null::text[] as matched_terms,
         c.chunk_type, c.item_uid, c.item_code, c.item_no, c.item_name, c.technology_name, c.trl_raw, c.trl_basis,
         c.source_file, c.roadmap_version, c.roadmap_type, c.strategic_field, c.subfield, c.page_start,
         c.printed_page_start, c.contextual_prefix, c.content
  from public.roadmap_chunks c
  where c.embedding is not null
    and public._roadmap_filter(c, p_versions, p_fields, p_types, p_item_uids, p_active_only)
  order by c.embedding <=> p_embedding
  limit p_match_count
$$;

-- 실행 권한: 서버(service_role)만. Supabase 밖(로컬 검증 DB)에서는 역할이 없을 수 있어 조건부로 처리.
revoke all on function public.search_roadmap_keyword(text[], text[], text[], text[], text[], boolean, int) from public;
revoke all on function public.search_roadmap_semantic(vector, text[], text[], text[], text[], boolean, int) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.roadmap_chunks from anon, authenticated';
    execute 'revoke all on function public.search_roadmap_keyword(text[], text[], text[], text[], text[], boolean, int) from anon, authenticated';
    execute 'revoke all on function public.search_roadmap_semantic(vector, text[], text[], text[], text[], boolean, int) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.roadmap_chunks to service_role';
    execute 'grant execute on function public.search_roadmap_keyword(text[], text[], text[], text[], text[], boolean, int) to service_role';
    execute 'grant execute on function public.search_roadmap_semantic(vector, text[], text[], text[], text[], boolean, int) to service_role';
  end if;
end $$;
