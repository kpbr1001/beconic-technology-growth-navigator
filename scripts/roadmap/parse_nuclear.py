"""원전 중소기업 특화 기술로드맵(2023~2027) 파서.

형식(표 기반): 4개 분야(설계·제작건설·운영유지보수·해체) → 중점지원품목 40개 → 핵심기술 180개
  · '[ … 분야 품목 정의 및 범위 ]' 표: 번호 | 품목 | 주요 내용 (플래그십 프로젝트 표시)
  · '[ … 분야 품목별 핵심기술 ]' 표: 품목 | 핵심기술 (품목 칸은 병합 → 다음 행은 비어 있음)
  · 로드맵 표: 중점지원품목 | 핵심기술 및 연차별 개발목표('23~'27, 막대그래프) | 최종목표
  · '핵심기술 정의' 표: 번호 | 핵심기술 | 주요 내용 (플래그십 제외 143개)
원문에 TRL 표기가 없다(trl_basis='not_provided'). 연차 막대는 그래픽이라 기간은 추출하지 않는다.
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher

from parse_roadmap import PARSER_VERSION, normalize

FIELDS = ["원전 설계", "원전 제작·건설", "원전 운영·유지보수", "원전 해체"]
FLAG = re.compile(r"\s*플래그십\s*프로젝트\s*")
PAGE_NO = re.compile(r"(?m)^-\s*(\d{1,3})\s*-$")


def _c(x: str | None) -> str:
    return re.sub(r"\s+", " ", normalize(x or "").replace("\x01", " ")).strip()


def _key(x: str) -> str:
    return re.sub(r"[\s·ㆍ,./()\-–]", "", x)


def _sim(a: str, b: str) -> float:
    return SequenceMatcher(None, _key(a), _key(b)).ratio()


def _defs_by_coords(page, cols, pdf_page: int) -> list[tuple[int, str, str, int]]:
    """표 테두리가 없어 표로 잡히지 않는 이어지는 쪽: 직전 표의 열 x범위로 번호·기술명·주요 내용을 자른다."""
    if not cols or len(cols) != 3:
        return []
    words = page.get_text("words")
    body = [w for w in words if cols[1][0] - 2 <= w[0] < cols[2][1]]
    nums = sorted(((w[1] + w[3]) / 2, int(w[4])) for w in words
                  if re.fullmatch(r"\d{1,2}", w[4]) and cols[0][0] - 2 <= w[0] <= cols[0][1])
    if not nums or not body:
        return []
    out = []
    top = min(w[1] for w in body)
    for k, (yc, n) in enumerate(nums):
        bottom = 2 * yc - top + 1  # 번호는 행의 세로 가운데 → 행 하단 = 2×중심 − 상단
        if k + 1 == len(nums):
            bottom = page.rect.y1

        def cell(c, t0=top, t1=bottom):
            ws = sorted((w for w in words if c[0] - 2 <= w[0] < c[1] and t0 - 1 <= (w[1] + w[3]) / 2 < t1),
                        key=lambda w: (round(w[1]), w[0]))
            return _c(" ".join(w[4] for w in ws))

        out.append((n, cell(cols[1]), cell(cols[2]), pdf_page))
        top = bottom
    return out


def parse_nuclear(doc, pages: list[str], meta: dict) -> dict:
    printed = [int(m.group(1)) if (m := PAGE_NO.search(t)) else None for t in pages]
    items: list[dict] = []          # 품목 정의 및 범위 표 순서 = 분야 순서
    lists: list[tuple[str, list[str], bool]] = []   # 품목별 핵심기술 표
    defs: list[tuple[int, str, str, int]] = []      # 핵심기술 정의 (번호, 이름, 주요 내용, PDF 쪽)
    goals: list[tuple[str, str]] = []               # 로드맵 표 (핵심기술, 최종목표)
    field_idx = -1
    def_cols = None  # 직전 '핵심기술 정의' 표의 열 x범위 — 테두리 없는 이어지는 쪽을 좌표로 읽을 때 사용
    for pno in range(len(doc)):
        text = pages[pno]
        tables = doc[pno].find_tables().tables
        # 표로 잡히지 않은 쪽이 직전 쪽의 '핵심기술 정의' 표에 이어지는 경우
        if not tables and def_cols and defs and defs[-1][3] == pno and re.search(r"(?m)^\d{1,2}$", text):
            defs += _defs_by_coords(doc[pno], def_cols, pno + 1)
            continue
        for tb in tables:
            rows = [[_c(c) for c in r] for r in tb.extract()]
            head = "|".join(re.sub(r"\s", "", c) for c in rows[0])
            if tb.col_count == 3 and head.startswith("품목||주요내용"):
                cap = re.search(r"\[\s*(원전\s*[^\]]*?)\s*분야\s*품목 정의", text)
                if cap:
                    field_idx = next((k for k, f in enumerate(FIELDS) if _key(f) == _key(cap.group(1))), field_idx + 1)
                for r in rows[1:]:
                    if re.fullmatch(r"\d{1,2}", r[0]) and r[1]:
                        items.append({"no": int(r[0]), "name": FLAG.sub(" ", r[1]).strip(), "flagship": bool(FLAG.search(r[1])),
                                      "field": FIELDS[max(field_idx, 0)], "summary": r[2].lstrip("▪ ").strip(), "page": pno + 1})
            elif tb.col_count == 2 and head.startswith("품목|핵심기술"):
                cur = None
                for r in rows[1:]:
                    if r[0]:
                        cur = (FLAG.sub(" ", r[0]).strip(), [], bool(FLAG.search(r[0])))
                        lists.append(cur)
                    if cur is not None and r[1]:
                        cur[1].append(r[1])
            elif tb.col_count == 7 and head.startswith("중점지원품목|핵심기술"):
                pending = None
                for r in rows[2:]:
                    if r[6]:
                        pending = r[6]
                    name = next((c for c in r[1:6] if c), None)
                    if name and pending:
                        goals.append((name, pending))
                        pending = None
            elif tb.col_count == 3 and (head.startswith("|핵심기술|주요내용") or re.match(r"\d{1,2}\|", head)):
                if head.startswith("|핵심기술"):
                    def_cols = [(c[0], c[2]) for c in tb.rows[0].cells if c is not None]
                for r in (rows[1:] if head.startswith("|핵심기술") else rows):
                    if re.fullmatch(r"\d{1,2}", r[0]) and r[1]:
                        defs.append((int(r[0]), r[1], r[2], pno + 1))

    warnings_doc: list[str] = []
    # 품목별 핵심기술 목록을 품목(이름 유사도)에 연결
    for it in items:
        best = max(lists, key=lambda lst: _sim(lst[0], it["name"])) if lists else None
        it["tech_names"] = best[1] if best and _sim(best[0], it["name"]) > 0.8 else []
        if not it["tech_names"]:
            warnings_doc.append(f"품목 '{it['name']}': 핵심기술 목록 미연결")
    # 핵심기술 정의(번호 1부터 다시 시작 = 다음 품목)를 플래그십이 아닌 품목 순서대로 연결
    groups: list[list[tuple]] = []
    for d_ in defs:
        if d_[0] == 1 or not groups:
            groups.append([])
        groups[-1].append(d_)
    targets = [it for it in items if not it["flagship"]]
    gi = 0
    for it in targets:
        # 이름 대조로 순서 어긋남을 방지: 정의 그룹 첫 기술명이 목록 첫 기술명과 같아야 한다
        while gi < len(groups) and it["tech_names"] and _sim(groups[gi][0][1], it["tech_names"][0]) < 0.6 \
                and any(_sim(g[0][1], it["tech_names"][0]) >= 0.6 for g in groups[gi + 1:]):
            gi += 1
        it["defs"] = groups[gi] if gi < len(groups) else []
        gi += 1

    out_items = []
    for k, it in enumerate(items, 1):
        warns = []
        names = it["tech_names"]
        defs_by_name = {}
        for d_ in it.get("defs", []):
            m = max(names, key=lambda n: _sim(n, d_[1])) if names else None
            if m and _sim(m, d_[1]) > 0.75:
                defs_by_name[m] = d_
        techs = []
        for j, n in enumerate(names, 1):
            d_ = defs_by_name.get(n)
            g = max(goals, key=lambda x: _sim(x[0], n)) if goals else None
            techs.append({
                "no": j, "name": n,
                "trl_raw": None, "trl_min": None, "trl_max": None, "trl_confidence": "missing", "trl_basis": "not_provided",
                "summary": d_[2] if d_ else None,
                "goal": g[1] if g and _sim(g[0], n) > 0.8 else None,
                "dev_period": None,
                "page": d_[3] if d_ else it["page"],
                "parse_confidence": "high" if d_ or it["flagship"] else "medium",
            })
        if not it["flagship"] and len(defs_by_name) != len(names):
            warns.append(f"핵심기술 정의 {len(defs_by_name)}/{len(names)}건 연결")
        if it["flagship"]:
            warns.append("플래그십 프로젝트: 원문에 세부과제 정의 없음(별도 RFP 기획)")
        out_items.append({
            "code": None, "item_no": f"{it['no']:02d}",
            "item_uid": f"NUCLEAR-2023-{FIELDS.index(it['field']) + 1}-{it['no']:02d}",
            "name": it["name"], "subfield": it["field"], "flagship": it["flagship"],
            "definition": it["summary"], "item_type": "플래그십 프로젝트" if it["flagship"] else None,
            "keywords": [], "technologies": techs, "tech_format": "table",
            "page_start": it["page"], "page_end": max([t["page"] for t in techs] + [it["page"]]),
            "printed_page_start": printed[it["page"] - 1], "printed_page_end": None,
            "parse_confidence": "high" if not [w for w in warns if not w.startswith("플래그십")] else "medium",
            "warnings": warns,
        })
    for it in out_items:
        it["printed_page_end"] = printed[it["page_end"] - 1]
    n_tech = sum(len(i["technologies"]) for i in out_items)
    n_def = sum(1 for i in out_items for t in i["technologies"] if t["summary"])
    summary = re.search(r"(\d+)\s*개\s*분야,?\s*(\d+)\s*개\s*품목,?\s*(\d+)\s*개\s*핵심기술", "\n".join(pages[:30]).replace(" ", " "))
    exp = tuple(int(x) for x in summary.groups()) if summary else None
    return {
        "parser_version": PARSER_VERSION,
        "document": {**meta, "field_name": "원전", "field_no": "NUC", "published": None, "version": "2023-2027",
                     "roadmap_type": "specialized", "pages": len(pages),
                     "printed_page_by_pdf_page": {str(i + 1): n for i, n in enumerate(printed) if n is not None}},
        "subfields": [{"no": k + 1, "name": f, "printed_page_start": None} for k, f in enumerate(FIELDS)],
        "validation": {"stated_fields_items_technologies": exp,
                       "parsed_fields_items_technologies": (len({i["subfield"] for i in out_items}), len(out_items), n_tech),
                       "summary_match": exp == (len({i["subfield"] for i in out_items}), len(out_items), n_tech),
                       "definitions_linked": n_def, "definitions_found": len(defs), "final_goals_linked":
                           sum(1 for i in out_items for t in i["technologies"] if t["goal"]),
                       "items": len(out_items), "technologies": n_tech, "warnings": warnings_doc},
        "items": out_items,
    }
