"""중소기업 전략기술로드맵(2025~2027) 파서 — 2026~2028과의 대조(crosswalk)용.

형식: 분야 → 전략품목(#k, 분야당 3~9개) → 핵심 요소기술(k-j)
  · 전략품목 정의서: 'NN 품목명 / 구분 내용 / 개발 방향(유형) ■ / 분류 체계 / 주요 이슈 / 정의 및 범위 / 개발목표
                     / 핵심 요소기술 명칭 · 기술개발 목표'
  · 핵심 요소기술 정의서: 'k-j 기술명 / 분류 체계 / 기술개요 / 기술 요구사항 / 기술개발 최종 목표
                         / 단계별 목표 1~3차년도(각 TRL n단계)'
TRL은 '연차별 목표 TRL'이다(2026~2028의 기술별 TRL 표기와 의미가 다르므로 trl_basis로 구분).
"""
from __future__ import annotations

import re

from parse_roadmap import PARSER_VERSION, bullets, oneline, parse_trl, printed_page_no, strip_page_header


def _lab(text: str) -> str:
    """라벨 글자 사이 공백·줄바꿈 허용 정규식"""
    return r"\s*".join(re.escape(ch) for ch in text if not ch.isspace())


# 번호와 이름이 한 줄 또는 두 줄('06\nE-Fuel 생산 시스템'). 이름 자리가 숫자로 시작하면(앞 줄이 쪽번호) 제외
ITEM_HEAD = re.compile(r"(?m)^(\d{2})(?:[ \t]+|[ \t]*\n)(?!\d{2}[ \t])([^\n]+?)[ \t]*\n구분\n내용\n" + _lab("개발방향"))
SHEET_HEAD = re.compile(r"(?m)^(\d{1,2})[ \t]*-[ \t]*(\d{1,2})(?:[ \t]+|[ \t]*\n)(?!\d{1,2}[ \t]*-)([^\n]+)\n"
                        r"(?:([^\n]+)\n)?구분\n내용\n분류")
TOC_ITEM = re.compile(r"전략품목\s*#\s*(\d+)\s*(.+?)\s*·{3,}")

ITEM_LABELS = [
    ("item_type_raw", _lab("개발방향(유형)")),
    ("classification", _lab("분류") + r"\n?\s*" + _lab("체계")),
    ("issues", _lab("주요이슈")),
    ("definition", _lab("정의및범위")),
    ("dev_goals", _lab("개발목표")),
    ("tech_list", _lab("핵심요소기술명칭") + r"\n" + _lab("기술개발목표")),
]
SHEET_LABELS = [
    ("classification", _lab("분류") + r"\n?\s*" + _lab("체계")),
    ("summary", _lab("기술개요")),
    ("requirements", _lab("기술") + r"\n?\s*" + _lab("요구사항")),
    ("goal", _lab("기술개발") + r"\n?\s*" + _lab("최종목표")),
    ("stages", _lab("단계별") + r"\n?\s*" + _lab("목표")),
]
STAGE = re.compile(r"([123])\s*차\s*년도\s*-?\s*(.*?)(?=[123]\s*차\s*년도|\Z)", re.S)
STAGE_TRL = re.compile(r"TRL\s*:?\s*0?(\d(?:\s*[~\-–]\s*0?\d)?)\s*(?:단계)?")  # 'TRL 05단계' 표기 포함


def _sections(text: str, labels: list[tuple[str, str]]) -> tuple[dict[str, str], list[str]]:
    hits, warnings = [], []
    for key, pat in labels:
        m = re.search(r"(?:^|\n)" + pat + r"(?=\n|\s|■|□)", text)
        if m:
            hits.append((m.start(), m.end(), key))
        else:
            warnings.append(f"라벨 미검출: {key}")
    hits.sort()
    return {key: text[en: hits[k + 1][0] if k + 1 < len(hits) else len(text)]
            for k, (st, en, key) in enumerate(hits)}, warnings


def _dashes(block: str | None) -> list[str]:
    """'- 문장' 대항목 기준 목록(하위 '•'는 대항목에 이어 붙임)"""
    if not block:
        return []
    parts = re.split(r"\n\s*-\s+", "\n" + block)
    out = [re.sub(r"\s*\n\s*", " ", p).strip(" -") for p in parts]
    return [p for p in out if p]


def parse_stages(block: str | None) -> list[dict]:
    out = []
    for m in STAGE.finditer(block or ""):
        body = m.group(2)
        tm = STAGE_TRL.search(body)
        title = re.split(r"\n\s*•", body)[0]
        out.append({"year": int(m.group(1)), "target": oneline(re.sub(r"\(?\s*TRL\s*:?\s*\d[^)\n]{0,8}\)?", "", title)),
                    **{k: v for k, v in parse_trl(tm.group(1) if tm else None).items()}})
    return out


def parse_2025(pages_raw: list[str], meta: dict, plain: list[str]) -> dict:
    pages = pages_raw
    printed = [printed_page_no(t) for t in pages]
    title = re.search(r"「\s*(.+?)\s*」", plain[0], re.S)
    field_name = re.sub(r"\s+", " ", title.group(1)).strip() if title else None
    if not field_name:  # 표지 텍스트층이 깨진 문서: 파일명 '03. AI_01 통합보고서_250116.pdf'
        fm = re.match(r"^\d+(?:\s*-\s*\d+)?\.\s*(.+?)_01", meta.get("source_file", ""))
        field_name = fm.group(1).strip() if fm else None
    toc = {}
    for t in plain[:15]:
        for m in TOC_ITEM.finditer(t):
            toc[int(m.group(1))] = re.sub(r"\s+", " ", m.group(2)).strip()
    # 여러 분야 보고서를 한 파일로 묶은 문서(29~33 서비스R&D): 품목 정의서 '01'이 다시 나오는 쪽마다 구획을 나눈다
    seg_names: list[str] = []
    for t in plain[:15] + pages[:15]:  # 깨진 문서는 복원본 목차에만 온전히 남는 경우가 있다
        for m in re.finditer(r"세부분야\s*#\s*(\d+)\s*(.+?)\s*·{3,}", t):
            nm_ = re.sub(r"\s+", " ", m.group(2)).strip()
            if nm_ not in seg_names:
                seg_names.append(nm_)

    # 전략품목 정의서
    heads = [(i, m) for i, t in enumerate(pages) for m in ITEM_HEAD.finditer(t)]
    sheets = [(i, m) for i, t in enumerate(pages) for m in SHEET_HEAD.finditer(t)]
    # 구획: 번호가 되돌아가는 지점(품목 05 → 01, 기술 4-5 → 1-1)마다 다음 구획. 정의서와 기술 정의서가
    # 문서 안에서 따로 모여 있어도 각각의 순서로 구획을 매긴다.
    def _segments(keys: list[tuple]) -> list[int]:
        out, seg, prev = [], 0, None
        for k in keys:
            if prev is not None and k <= prev:
                seg += 1
            out.append(seg)
            prev = k
        return out

    head_seg = _segments([(int(m.group(1)),) for _, m in heads])
    seg_starts = [heads[k][0] for k in range(len(heads)) if k == 0 or head_seg[k] != head_seg[k - 1]]
    sheet_keys = [(int(m.group(1)), int(m.group(2))) for _, m in sheets]
    sheet_item = [k_ for k_, _ in sheet_keys]  # 기술 정의서가 붙을 품목 번호(기본: 원문 번호 k-j의 k)
    sheet_notes: dict[int, str] = {}
    if len(seg_starts) <= 1:
        # 단일 분야 문서에서 번호가 앞뒤와 어긋난 시트(예: 3-2 다음 '1-1', 그 다음 '4-2'): 원문 오기로 보고
        # 번호는 원문 그대로 두되, 다음 시트와 같은 품목(k)이고 순번이 바로 앞이면 그 품목에 붙이고 표시한다
        for x in range(1, len(sheet_keys)):
            (k0, j0), prev = sheet_keys[x], sheet_keys[x - 1]
            nxt_ = sheet_keys[x + 1] if x + 1 < len(sheet_keys) else None
            if (k0, j0) <= prev and nxt_ and nxt_[0] > prev[0] and nxt_[1] == j0 + 1:
                sheet_item[x] = nxt_[0]
                sheet_notes[x] = (f"원문 번호 '{k0}-{j0}'가 앞뒤 순서와 맞지 않음(원문 오기 추정) — "
                                  f"번호는 원문대로 두고 앞뒤 시트 기준 {nxt_[0]}번 품목에 연결")
        sheet_seg = [0] * len(sheets)
    else:
        sheet_seg = _segments(sheet_keys)
    multi = len(seg_starts) > 1

    if multi:
        toc = {}  # 구획별로 번호가 겹치므로 문서 단위 목차 대조는 쓰지 않는다
    item_blocks = {}
    for k, (pi, m) in enumerate(heads):
        # 정의서 본문: 머리부터 다음 품목 머리(같은 쪽이면 거기까지) 또는 2쪽 이내
        text = pages[pi][m.start():]
        nxt = heads[k + 1] if k + 1 < len(heads) else None
        if nxt and nxt[0] == pi:
            text = pages[pi][m.start(): nxt[1].start()]
        elif not re.search(_lab("핵심요소기술명칭"), text):  # 표가 다음 쪽으로 넘어간 경우 한 쪽만 더
            q = pi + 1
            if q < len(pages) and not ITEM_HEAD.search(pages[q]) and not SHEET_HEAD.search(pages[q]):
                text += "\n" + strip_page_header(pages[q])
        item_blocks.setdefault((head_seg[k], int(m.group(1))), (pi, re.sub(r"\s+", " ", m.group(2)).strip(), text))

    # 핵심 요소기술 정의서
    techs_by_item: dict[tuple[int, int], list[dict]] = {}
    for k, (pi, m) in enumerate(sheets):
        nxt = sheets[k + 1] if k + 1 < len(sheets) else None
        if nxt and nxt[0] == pi:
            text = pages[pi][m.end():nxt[1].start()]
        else:
            text = pages[pi][m.end():]
            if nxt and nxt[0] == pi + 1:
                text += "\n" + strip_page_header(pages[pi + 1])[: nxt[1].start()]
        text = "\n분류" + text
        sec, warns = _sections(text, SHEET_LABELS)
        stage_block = sec.get("stages", "")
        stage_block = re.split(r"\n\s*\[|\n핵심 요소기술 정의서|\n기술로드맵 구축", stage_block)[0]
        stages = parse_stages(stage_block)
        name = re.sub(r"\s+", " ", m.group(3) + (" " + m.group(4) if m.group(4) else "")).strip()
        trls = [s for s in stages if s["trl_min"] is not None]
        if k in sheet_notes:
            warns = warns + [sheet_notes[k]]
        techs_by_item.setdefault((sheet_seg[k], sheet_item[k]), []).append({
            "no": int(m.group(2)),
            "sheet_no": f"{m.group(1)}-{m.group(2)}",
            **({"sheet_no_note": sheet_notes[k]} if k in sheet_notes else {}),
            "name": name,
            "trl_basis": "stage_targets",
            "trl_by_year": [{"year": s["year"], "trl_raw": s["trl_raw"], "trl_min": s["trl_min"], "trl_max": s["trl_max"]}
                            for s in stages],
            "trl_raw": " → ".join(s["trl_raw"] for s in trls) if trls else None,
            "trl_min": min(s["trl_min"] for s in trls) if trls else None,
            "trl_max": max(s["trl_max"] for s in trls) if trls else None,
            # high: 1~3차년도 목표 TRL 모두 표기 / partial: 일부 연차만 원문에 표기 / missing: 표기 없음
            "trl_confidence": "high" if len(trls) == 3 else ("partial" if trls else "missing"),
            "classification": oneline(sec.get("classification")),
            "summary": oneline(sec.get("summary")),
            "requirements": _dashes(sec.get("requirements")),
            "goal": oneline(sec.get("goal")),
            "stages": [{"year": s["year"], "target": s["target"]} for s in stages],
            "page": pi + 1,
            "printed_page": printed[pi],
            "parse_confidence": "high" if not warns and len(trls) == 3 else "medium",
            "warnings": warns,
        })

    item_keys = sorted(set(item_blocks) | set(techs_by_item) | {(0, n) for n in toc})
    items = []
    for key in item_keys:
        seg, no = key
        pi, name, text = item_blocks.get(key, (None, None, ""))
        sec, warns = _sections(text, ITEM_LABELS) if text else ({}, ["전략품목 정의서 미검출"])
        itype = re.findall(r"■\s*([^□■\n]+)", sec.get("item_type_raw", ""))
        techs = sorted(techs_by_item.get(key, []), key=lambda t: t["no"])
        seq_ok = [t["no"] for t in techs] == list(range(1, len(techs) + 1))
        if not seq_ok:
            warns.append("핵심 요소기술 번호 불연속: " + ",".join(t["sheet_no"] for t in techs))
        if not techs:
            warns.append("핵심 요소기술 정의서 0건")
        pages_t = [t["page"] for t in techs]
        items.append({
            "code": None,
            "item_no": f"{no:02d}",
            "item_uid": f"R2025-{meta.get('field_no', '00')}-" + (f"S{seg + 1}-" if multi else "") + f"{no:02d}",
            "name": name or toc.get(no),
            "name_source": "definition_sheet" if name else ("toc" if no in toc else None),
            "toc_name": toc.get(no),
            "subfield": (seg_names[seg] if seg < len(seg_names) else f"구획 {seg + 1}") if multi else None,
            "item_type": itype[0].strip() if len(itype) == 1 else None,
            "item_types_checked": [x.strip() for x in itype],
            "classification": oneline(sec.get("classification")),
            "issues": _dashes(sec.get("issues")),
            "definition": oneline(sec.get("definition")),
            "dev_goals": _dashes(sec.get("dev_goals")),
            "keywords": [],
            "technologies": techs,
            "tech_format": "sheet",
            "page_start": (pi + 1) if pi is not None else (min(pages_t) if pages_t else None),
            "page_end": max(pages_t) if pages_t else ((pi + 1) if pi is not None else None),
            "printed_page_start": printed[pi] if pi is not None else None,
            "printed_page_end": None,
            "parse_confidence": "high" if not warns else ("medium" if len(warns) <= 2 else "low"),
            "warnings": warns,
        })
    for it in items:
        if it["page_end"]:
            it["printed_page_end"] = printed[it["page_end"] - 1]
    expected = len(toc) if toc else None
    return {
        "parser_version": PARSER_VERSION,
        "document": {**meta, "field_name": field_name, "published": None, "version": "2025-2027",
                     "roadmap_type": "general", "role": "crosswalk", "pages": len(pages),
                     "printed_page_by_pdf_page": {str(i + 1): n for i, n in enumerate(printed) if n is not None}},
        "subfields": [{"no": k + 1, "name": n, "pdf_page_start": seg_starts[k] + 1 if k < len(seg_starts) else None}
                      for k, n in enumerate(seg_names)] if multi else [],
        # 목차 품목 수와 대조. 목차가 없거나 깨진 문서는 '품목 정의서 번호 = 기술 정의서 품목 번호' 일치로 대신한다
        "validation": {"toc_items": expected, "parsed_items": len(items),
                       "definition_vs_sheet_items_match": bool(item_blocks) and set(item_blocks) == set(techs_by_item),
                       "segments": {"definition": (head_seg[-1] + 1) if head_seg else 0,
                                    "sheets": (sheet_seg[-1] + 1) if sheet_seg else 0, "toc": len(seg_names)},
                       "summary_match": (expected == len(items) if expected is not None
                                         else bool(item_blocks) and set(item_blocks) == set(techs_by_item))
                       and all(it["name"] and it["technologies"] for it in items),
                       "tech_sequence_complete": all("번호 불연속" not in " ".join(it["warnings"]) for it in items),
                       "items": len(items), "technologies": sum(len(i["technologies"]) for i in items)},
        "items": items,
    }
