-- 원문 검색 함수의 search_path 고정(Supabase 보안 점검 0011 대응).
-- 함수 본문은 public.* 로 한정 참조하고, vector·pg_trgm 연산자는 public 스키마에 있다.
alter function public._roadmap_filter(public.roadmap_chunks, text[], text[], text[], text[], boolean) set search_path = public, pg_temp;
alter function public.search_roadmap_keyword(text[], text[], text[], text[], text[], boolean, int) set search_path = public, pg_temp;
alter function public.search_roadmap_semantic(vector, text[], text[], text[], text[], boolean, int) set search_path = public, pg_temp;
