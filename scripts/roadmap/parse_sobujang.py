"""소재·부품·장비(소부장) 로드맵 전략품목 정의서(2026.03) 파서.

형식: 분야(9개)별 '전략품목 목록'(순번·명칭·정의) → 품목별 정의서 2쪽
      (정의·적용 범위·개발 필요성·핵심 기술 표[기능적 역할|핵심 기술명|개요|TRL|소요 기간]
       ·개발 목표 및 기대성과·핵심 이슈[정책/산업/시장]·타겟시장·연계 정책·정책 플랫폼)
원문에 공식 품목코드가 없으므로 code는 비워 두고, 원문 순번(item_no)과 내부 고유키(item_uid)만 쓴다.
"""
from __future__ import annotations

import re

from parse_roadmap import PARSER_VERSION, bullets, normalize, oneline, parse_trl, repaired_page_text

LABELS = [
    ("definition", r"\n정의\n"),
    ("scope", r"\n적용 범위 및\n주요 기능\n"),
    ("need", r"\n개발 필요성\n"),
    ("dev_goals", r"\n개발 목표\n및 기대성과\n"),
    ("issues", r"\n핵심\n이슈\n"),
    ("target_markets", r"\n타겟시장\n\(활용처\)\n"),
    ("policies", r"\n연계 ?정책\n"),
    ("policy_platform", r"\n정책 ?플랫폼\n"),
]
NOISE = re.compile(r"\n(품목\n개요|기술적\n특성|핵심 기술|산업·\n시장성|정책\n연계·\n활용성)\s*$")
PAGE_NO = re.compile(r"^\s*-\s*(\d{1,3})\s*-\s*\n")
FIELD_LIST = re.compile(r"^\s*(?:-\s*\d+\s*-\s*\n)?(\d{2})\n([^\n]+)\n전략품목 목록\n")
ITEM_HEAD = re.compile(r"\n?품목명\n(\d{2})\.\s*(.+?)\n품목\n개요\n", re.S)


def _labels(text: str) -> tuple[dict, list[str]]:
    hits, warnings = [], []
    for key, pat in LABELS:
        m = re.search(pat, text)
        if m:
            hits.append((m.start(), m.end(), key))
        else:
            warnings.append(f"라벨 미검출: {key}")
    hits.sort()
    out: dict = {}
    for k, (st, en, key) in enumerate(hits):
        seg = text[en: hits[k + 1][0] if k + 1 < len(hits) else len(text)]
        seg = re.split(r"\n기술적\n특성\n|\n핵심 기술\n기능적", seg)[0]  # 핵심 기술 표는 별도 추출
        seg = re.sub(r"\n<[^>]*>", "\n", seg)  # 그림 캡션
        seg = NOISE.sub("", seg)
        out[key] = seg
    res = {k: (oneline(v) if k == "definition" else bullets(v)) for k, v in out.items()}
    if "issues" in out:  # 정책/산업/시장 소제목별
        parts = re.split(r"(?m)^(정책|산업|시장)$", out["issues"])
        res["issues"] = {parts[i]: oneline(parts[i + 1]) for i in range(1, len(parts) - 1, 2)} or bullets(out["issues"])
    return res, warnings


HEAD_KEYS = ["기능적역할", "핵심기술명", "개요", "TRL", "소요기간"]


def _tech_rows(page, fitz_rect) -> list[dict]:
    """핵심 기술 표: 머리행(기능적 역할|핵심 기술명|개요|TRL|소요 기간)의 열 x범위 × 아래 각 행의 y범위로
    칸을 잘라 좌표 복원 텍스트를 읽는다. 쪽 전체가 한 표로 잡힌 경우에도 머리행 위치로 찾는다."""
    rows = []
    for tb in page.find_tables().tables:
        cells = tb.extract()
        for hi, (vals, row) in enumerate(zip(cells, tb.rows)):
            keyed = {}
            for v, c in zip(vals, row.cells):
                k = re.sub(r"\s", "", v or "")
                if k in HEAD_KEYS and c is not None:
                    keyed[k] = c  # 같은 머리글이 병합칸에 중복되면 오른쪽(마지막) 칸
            if len(keyed) == len(HEAD_KEYS):
                break
        else:
            continue
        cols = [keyed[k] for k in HEAD_KEYS]
        for r in tb.rows[hi + 1:]:
            y0, y1 = r.bbox[1], r.bbox[3]
            vals = []
            for c in cols:
                clip = fitz_rect(c[0], y0, c[2], y1)
                vals.append(re.sub(r"\s*\n\s*", " ", normalize(repaired_page_text(page, clip=clip))).strip())
            role, name, summary, trl_raw, period = vals
            if not name and not summary:
                continue
            if not re.fullmatch(r"\d(?:\s*[-~–—]\s*\d)?", trl_raw or ""):
                break  # 쪽 전체가 한 표인 경우: TRL 칸이 값이 아니면 핵심 기술 표가 끝난 것
            rows.append({"role": role or None, "name": name or None, "summary": summary.lstrip("• ").strip() or None,
                         **parse_trl(trl_raw or None), "dev_period": period or None})
    return rows


def parse_sobujang(doc, meta: dict) -> dict:
    import pymupdf

    pages = [normalize(repaired_page_text(p)) for p in doc]
    printed = [int(m.group(1)) if (m := PAGE_NO.match(t)) else None for t in pages]
    # 분야 경계와 목록표 품목 수(교차검증용)
    fields = []
    for i, t in enumerate(pages):
        fm = FIELD_LIST.match(t)
        if fm:
            fields.append({"no": fm.group(1), "name": fm.group(2).strip(), "list_page": i + 1, "listed": set()})
    starts = [(i, m) for i, t in enumerate(pages) if (m := ITEM_HEAD.search(t))]
    for f in fields:  # 목록 쪽: 분야 첫 쪽부터 첫 정의서 직전까지, '순번' 칸(두 자리 숫자 줄 다음이 본문)
        first_item = next((i for i, _ in starts if i >= f["list_page"] - 1), len(pages))
        for pi in range(f["list_page"] - 1, first_item):
            body = PAGE_NO.sub("", pages[pi], count=1)
            body = re.sub(r"^\s*\d{2}\n[^\n]+\n전략품목 목록\n", "", body)  # 분야 번호 줄 제외
            f["listed"] |= {int(x) for x in re.findall(r"(?m)^(\d{1,2})\n(?!\d+\n)", body)}
    field_at = lambda i: next((f for f in reversed(fields) if f["list_page"] <= i + 1), None)  # noqa: E731
    items = []
    for k, (si, m) in enumerate(starts):
        stop = starts[k + 1][0] if k + 1 < len(starts) else len(pages)
        f = field_at(si)
        nxt_field = next((fl["list_page"] - 1 for fl in fields if fl["list_page"] - 1 > si), len(pages))
        stop = min(stop, nxt_field)
        name = re.sub(r"\s*\n\s*", " ", m.group(2)).strip()
        text = ""
        for pi in range(si, stop):
            t = PAGE_NO.sub("", pages[pi], count=1)
            t = re.sub(r"^\s*(?:전략품목별 정의서\n)?품목명\n\d{2}\.[^\n]*(?:\n[^\n]*?)??\n(?=품목\n개요|<|개발 목표|산업)", "\n", t)
            text += "\n" + t
        defn, warnings = _labels(text)
        techs = []
        for pi in range(si, stop):
            techs += _tech_rows(doc[pi], pymupdf.Rect)
        for n, t in enumerate(techs, 1):
            t.update({"no": n, "goal": None, "parse_confidence": "high" if t["name"] and t["trl_confidence"] == "high" else "medium"})
        if not techs:
            warnings.append("핵심 기술 표 0건")
        fno = f["no"] if f else "00"
        items.append({
            "code": None,
            "item_no": m.group(1),
            "item_uid": f"SOBUJANG-2026-{fno}-{m.group(1)}@p{si + 1}",
            "name": name,
            "subfield": f["name"] if f else None,
            **defn,
            "item_type": None,
            "keywords": [],
            "technologies": techs,
            "tech_format": "table",
            "page_start": si + 1,
            "page_end": stop,
            "printed_page_start": printed[si],
            "printed_page_end": printed[stop - 1],
            "parse_confidence": "high" if not warnings else ("medium" if len(warnings) <= 2 else "low"),
            "warnings": warnings,
        })
    expected = {f["name"]: len(f["listed"]) for f in fields}
    actual: dict[str, int] = {}
    for it in items:
        actual[it["subfield"] or "(미상)"] = actual.get(it["subfield"] or "(미상)", 0) + 1
    for it in items:  # 기술별 쪽: 표가 있는 첫 쪽
        for t in it["technologies"]:
            t["page"] = it["page_start"]
    return {
        "parser_version": PARSER_VERSION,
        "document": {**meta, "field_name": "소재·부품·장비", "field_no": "SBJ", "published": "2026.03.06",
                     "version": "2026", "roadmap_type": "sobujang_definition", "pages": len(pages),
                     "printed_page_by_pdf_page": {str(i + 1): n for i, n in enumerate(printed) if n is not None}},
        "subfields": [{"no": int(f["no"]), "name": f["name"], "pdf_page_start": f["list_page"]} for f in fields],
        "validation": {"expected_items_by_subfield": expected, "parsed_items_by_subfield": actual,
                       "summary_match": bool(expected) and expected == actual,
                       "items": len(items), "technologies": sum(len(i["technologies"]) for i in items)},
        "items": items,
    }
