-- Supabase 마이그레이션 검증 (가짜 문단 — 원문 미포함). 사용: psql -v ON_ERROR_STOP=1 -f 이 파일
-- 전제: supabase/migrations/*_roadmap_kb.sql 적용 완료, anon·service_role 역할 존재(CI에서 생성)
truncate public.roadmap_chunks;
insert into public.roadmap_chunks (chunk_id, chunk_type, kb_version, source_file, sha256, roadmap_version, roadmap_type,
  strategic_field, item_uid, item_code, item_name, technology_name, trl_raw, trl_basis, page_start, printed_page_start,
  contextual_prefix, content, embedding)
select 'T-' || g || '#tech1', 'technology', 'kb-test', 'test.pdf', repeat('0', 64), '2026-2028', 'specialized', '스마트제조',
       'T-' || g, 'SMESTR-0000-B-01-' || lpad(g::text, 2, '0'),
       case when g = 1 then '설비 예지보전 솔루션' else '공정 품질 관리 ' || g end,
       case when g = 1 then '고장 예측 알고리즘' else '공정 데이터 분석 ' || g end,
       '5', 'stated', 100 + g, 90 + g,
       '[문서] 테스트 로드맵', case when g = 1 then '개요: 설비 고장 예측과 예지보전' else '개요: 공정 데이터 분석 ' || g end,
       ('[' || array_to_string(array_fill(case when g = 1 then 1.0 else 0.0 end, array[1023]) || array[1.0], ',') || ']')::vector
from generate_series(1, 10) g;
insert into public.roadmap_chunks (chunk_id, chunk_type, kb_version, is_active, source_file, sha256, roadmap_version,
  roadmap_type, strategic_field, item_uid, item_name, contextual_prefix, content)
values ('OLD#item', 'item', 'kb-old', false, 'old.pdf', repeat('0', 64), '2025-2027', 'general', '스마트제조', 'OLD',
        '설비 예지보전 구버전', '[문서] 구버전', '예지보전 고장');

do $$
declare r record; n int;
begin
  -- 키워드: 희소 단어로 1순위, 흔한 단어('공정'은 90%)는 0점, 비활성 행 제외
  select * into r from public.search_roadmap_keyword(array['예지보전','고장','공정']) limit 1;
  if r.chunk_id <> 'T-1#tech1' then raise exception '키워드 1순위 오류: %', r.chunk_id; end if;
  if 'OLD#item' in (select chunk_id from public.search_roadmap_keyword(array['예지보전'])) then raise exception '비활성 행 노출'; end if;
  if not ('공정' <> all(r.matched_terms)) then raise exception '흔한 단어 가중 오류: %', r.matched_terms; end if;
  -- 품목 한정 시에도 희소성은 전체 기준(품목 안에서 흔한 '고장'이 0점이 되지 않음)
  select count(*) into n from public.search_roadmap_keyword(array['고장'], p_item_uids => array['T-1']);
  if n <> 1 then raise exception '품목 한정 검색 오류: %', n; end if;
  -- 의미 검색: 같은 방향 벡터가 1순위
  select * into r from public.search_roadmap_semantic(
    ('[' || array_to_string(array_fill(1.0, array[1024]), ',') || ']')::vector) limit 1;
  if r.chunk_id <> 'T-1#tech1' then raise exception '의미 검색 1순위 오류: %', r.chunk_id; end if;
  raise notice 'roadmap_kb 검색 함수 검증 통과';
end $$;

-- 접근 통제: anon은 표·함수 모두 거부
set role anon;
do $$ begin
  begin perform 1 from public.roadmap_chunks limit 1; raise exception 'anon이 원문 표를 읽음';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.search_roadmap_keyword(array['예지보전']); raise exception 'anon이 검색 함수를 실행함';
  exception when insufficient_privilege then null; end;
  raise notice 'anon 접근 차단 확인';
end $$;
reset role;
set role service_role;
do $$ begin
  if (select count(*) from public.search_roadmap_keyword(array['예지보전'])) < 1 then raise exception 'service_role 검색 실패'; end if;
  raise notice 'service_role 검색 확인';
end $$;
reset role;
