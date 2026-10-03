"""중소기업 전략기술로드맵(2026~2028) 통합보고서 → 구조화 JSON 파서 (Phase 2)

원칙 (마스터 프롬프트 6장)
- 추측으로 채우지 않는다: 찾지 못한 값은 null, 해석이 모호하면 parse_confidence를 낮추고 warnings에 사유를 남긴다.
- 페이지 추적성: 모든 품목·요소기술에 PDF 물리 페이지와 인쇄 페이지를 함께 기록한다.
- 원문 보존: TRL은 원문 표기(trl_raw)를 그대로 두고, 파싱값(trl_min/max)은 별도 필드.

사용: python3 scripts/roadmap/parse_roadmap.py <pdf...> --out <dir>
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

PARSER_VERSION = "roadmap-parser-0.2"
CODE_RE = re.compile(r"SMESTR-\d{4}-[A-Z]-\d{2}-\d{2}")


# ---------------------------------------------------------------- 텍스트 정규화
def normalize(text: str) -> str:
    text = text.replace("\x01", "").replace("\u00a0", " ").translate(FULLWIDTH_DIGITS)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    return text


HANGUL = re.compile(r"[가-힣]")
FULLWIDTH_DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")


def repaired_page_text(page, gap: float = 8.0, clip=None) -> str:
    """텍스트 층이 손상된 PDF(일부 분야 보고서) 복원.

    같은 기준선(baseline)에서 수평 간격이 gap 이하인 줄 조각들을 하나의 줄로 합치고 x 좌표 순으로
    글자를 정렬한다. 쉼표·가운뎃점·영문 단어가 별도 조각으로 떨어져 나온 문제를 바로잡는다.
    숫자만 있는 조각(표의 번호 칸)은 맞닿거나 겹칠 때만 합친다. 출력 줄 순서는 원래 읽기 순서를 따른다.
    """
    segs = []
    for b in page.get_text("rawdict", clip=clip)["blocks"]:
        for ln in b.get("lines", []):
            chars = [c for s in ln["spans"] for c in s["chars"]]
            if clip is not None:  # 칸 경계에 걸친 글자는 중심점이 칸 안에 있을 때만
                chars = [c for c in chars if clip.contains(((c["bbox"][0] + c["bbox"][2]) / 2, (c["bbox"][1] + c["bbox"][3]) / 2))]
            if not chars or not "".join(c["c"] for c in chars).strip():
                continue
            base = sum(c["origin"][1] for c in chars) / len(chars)
            txt = "".join(c["c"] for c in chars)
            segs.append({"i": len(segs), "x0": ln["bbox"][0], "x1": ln["bbox"][2], "base": base, "chars": chars,
                         "digit": bool(re.fullmatch(r"\s*\d+\s*", txt)), "hangul": bool(HANGUL.search(txt))})
    parent = list(range(len(segs)))

    def find(k: int) -> int:
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    # 1) 기준선 차이 1.5pt 미만인 조각들을 한 행으로 묶고  2) 행 안에서 x 순으로 훑으며 현재 묶음의 오른쪽 끝과의 간격으로 합친다
    rows, cur = [], []
    for sg in sorted(segs, key=lambda s: s["base"]):
        if cur and sg["base"] - cur[-1]["base"] >= 1.5:
            rows.append(cur)
            cur = []
        cur.append(sg)
    if cur:
        rows.append(cur)
    for row in rows:
        grp, right, grp_hangul = None, 0.0, False
        for sg in sorted(row, key=lambda s: s["x0"]):
            txt = "".join(c["c"] for c in sg["chars"]).lstrip()
            limit = 4.0 if (sg["hangul"] and grp_hangul) else gap
            touching = grp is not None and sg["x0"] - right <= 1.0  # 맞닿거나 겹침: 문장 속 숫자('3대', '2030년')
            joinable = (grp is not None and not txt.startswith("•")  # 글머리표는 왼쪽 칸(라벨)에 붙이지 않는다
                        and ((not sg["digit"] and not grp["digit"] and sg["x0"] - right <= limit) or touching))
            if joinable:
                parent[find(sg["i"])] = find(grp["i"])
                right = max(right, sg["x1"])
                grp_hangul = grp_hangul or sg["hangul"]
            else:
                grp, right, grp_hangul = sg, sg["x1"], sg["hangul"]
    groups: dict[int, list[dict]] = {}
    for s in segs:
        groups.setdefault(find(s["i"]), []).append(s)
    lines = []
    for g in groups.values():
        chars = sorted((c for s in g for c in s["chars"]), key=lambda c: c["bbox"][0])
        lines.append((min(s["i"] for s in g), "".join(c["c"] for c in chars)))
    return "\n".join(t for _, t in sorted(lines)) + "\n"


HEADER_LINE = re.compile(r"^(｜?\s*[^\n｜]{0,12}전략기술\s*로드맵.*|수립|\(2026 ?~ ?2028\)|2026-2028)$")
FIELD_NAME_LINE = re.compile(r"^[^\n]{1,20}$")
BODY_LABEL = re.compile(r"^(품목명|품목 ?코드|구분|명칭|개요|유형|정의|핵심 요소기술|세부 전략분야.*)$")


def _is_header(lines: list[str]) -> bool:
    """고정 머리글 조각 + 분야명(짧은 줄, 본문 라벨 아님) 최대 1줄"""
    generic = [x for x in lines if not HEADER_LINE.match(x)]
    return len(generic) <= 1 and all(FIELD_NAME_LINE.match(x) and not BODY_LABEL.match(x) for x in generic)


def _header_split(text: str) -> tuple[int | None, int]:
    """(인쇄 쪽번호, 머리글 줄 수). 머리글: 분야명 또는 '｜중소기업 전략기술로드맵 … 수립' 조각 + 쪽번호"""
    lines = [l.strip() for l in text.split("\n")]
    for i, l in enumerate(lines[:6]):
        if re.fullmatch(r"\d{1,4}", l):
            if i >= 1 and _is_header(lines[:i]):
                return int(l), i + 1
            if i == 0 and len(lines) > 1 and HEADER_LINE.match(lines[1]):  # '93 / ｜화장품 전략기술로드맵…' 순서
                return int(l), 2
            return None, 0
    return None, 0


def printed_page_no(text: str) -> int | None:
    return _header_split(text)[0]


def strip_page_header(text: str) -> str:
    n = _header_split(text)[1]
    return "\n".join(text.split("\n")[n:]) if n else text


def bullets(block: str | None) -> list[str]:
    if not block:
        return []
    parts = re.split(r"\n?•\s*", block)
    out = [re.sub(r"\s*\n\s*", " ", p).strip() for p in parts]
    return [p for p in out if p]


def oneline(block: str | None) -> str | None:
    if block is None:
        return None
    s = re.sub(r"\s*\n\s*", " ", block).replace("•", "").strip()
    return s or None


# ---------------------------------------------------------------- TRL
def parse_trl(raw: str | None) -> dict:
    """원문 TRL 표기 → {trl_raw, trl_min, trl_max, trl_confidence}. 모호하면 신뢰도 low."""
    if raw is None:
        return {"trl_raw": None, "trl_min": None, "trl_max": None, "trl_confidence": "missing"}
    r = raw.strip()
    nums = [int(n) for n in re.findall(r"\d", r) if 1 <= int(n) <= 9]
    if not nums:
        return {"trl_raw": r or None, "trl_min": None, "trl_max": None, "trl_confidence": "missing"}
    if re.fullmatch(r"\d(\s*수준)?", r):
        return {"trl_raw": r, "trl_min": nums[0], "trl_max": nums[0], "trl_confidence": "high"}
    if re.fullmatch(r"\d\s*[-~–—]\s*\d", r):
        return {"trl_raw": r, "trl_min": min(nums), "trl_max": max(nums), "trl_confidence": "high"}
    # '5→7' 등: 현재→목표인지 범위인지 원문만으로 확정 불가
    return {"trl_raw": r, "trl_min": min(nums), "trl_max": max(nums), "trl_confidence": "low"}


# ---------------------------------------------------------------- 목차: 세부 전략분야
def parse_subfields(pages: list[str]) -> list[dict]:
    subs = []
    for t in pages[:12]:
        for m in re.finditer(r"세부 전략분야\s*#\s*(\d+)\s*(.+?)\s*·{3,}\s*(\d+)", t):
            subs.append({"no": int(m.group(1)), "name": m.group(2).strip(), "printed_page_start": int(m.group(3))})
    uniq = {s["no"]: s for s in subs}
    return [uniq[k] for k in sorted(uniq)]


def parse_specialized_subfields(plain: list[str], pages: list[str]) -> dict[int, str]:
    """특화 로드맵의 전략분야 번호→이름. 목차 '전략분야 #k 이름 ···· 쪽'(화장품형) 또는
    본문 제목 '<이름>(의) 기술혁신형 전략품목·기술정의서'(스마트제조형, 등장 순서 = 번호)"""
    subs: dict[int, str] = {}
    for t in plain[:12]:
        for m in re.finditer(r"(?<!세부 )전략분야\s*#\s*(\d+)\s*(.+?)\s*·{3,}\s*\d+", t):
            subs[int(m.group(1))] = m.group(2).strip()
    if subs:
        return subs
    names: list[str] = []
    for t in pages:
        for m in re.finditer(r"(?m)^(.+?)(?:의)?\s*기술혁신형\s*전략품목\s*·?\s*기술\s*정의서$", t):
            if m.group(1).strip() not in names:
                names.append(m.group(1).strip())
    return {k: n for k, n in enumerate(names, 1)}


def parse_specialized_counts(plain: list[str], subs: dict[int, str]) -> dict[str, int]:
    """'…전략품목 N개 선정'(전문위원회 확정) 문구를 전략분야 순서대로 대응. 개수가 맞지 않으면 빈 값(검증 불가)."""
    found = [int(m.group(1)) for t in plain for m in re.finditer(r"최종 검토·조정을 통한 전략품목\s*(\d+)\s*개\s*선정", t)]
    if not subs or len(found) != len(subs):
        return {}
    return {subs[k]: n for k, n in zip(sorted(subs), found)}


def code_sequence_complete(codes: list[str]) -> bool:
    """분야·세부분야별 품목 순번이 01부터 빠짐없이 이어지는지 (원문 누락·파싱 누락 탐지)"""
    groups: dict[str, list[int]] = {}
    for c in codes:
        head, _, n = c.rpartition("-")
        groups.setdefault(head, []).append(int(n))
    return all(sorted(v) == list(range(1, len(v) + 1)) for v in groups.values())


def parse_summary_counts(pages: list[str], field_name: str) -> dict[str, int]:
    """'로드맵 구성' 표에서 해당 분야의 세부분야별 품목 수 (교차검증용)"""
    text = "\n".join(pages[2:6])
    counts: dict[str, int] = {}
    m = re.search(r"\n\d{1,2}\n" + re.escape(field_name) + r"\n(.*?)(?=\n\d{1,2}\n[^\n]+\n|\Z)", text, re.S)
    if not m:
        return counts
    lines = [l.strip() for l in m.group(1).split("\n") if l.strip()]
    for i, l in enumerate(lines):
        mm = re.search(r"(\d+)개 품목$", l)
        if mm and i > 0:
            counts[lines[i - 1]] = int(mm.group(1))
    return counts


def parse_global_summary(pages: list[str]) -> dict[str, list[tuple[str, int]]]:
    """'로드맵 구성' 표 전체 → {분야명(공백 제거): [(세부분야명, 품목 수), ...]} (정상 텍스트 문서에서만 신뢰)"""
    text = "\n".join(pages[2:6])
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    out: dict[str, list[tuple[str, int]]] = {}
    field = None
    for i, l in enumerate(lines):
        if re.fullmatch(r"\d{1,2}", l) and i + 1 < len(lines) and not re.search(r"개 품목$", lines[i + 1]):
            field = re.sub(r"\s", "", lines[i + 1])
            out.setdefault(field, [])
            continue
        m = re.search(r"(\d+)개 품목$", l)
        if m and field and i > 0:
            out[field].append((lines[i - 1], int(m.group(1))))
    return {k: v for k, v in out.items() if v}


def parse_subfield_starts(pages: list[str]) -> dict[int, int]:
    """목차에서 세부 전략분야 번호별 시작 인쇄쪽 (글자 순서가 뒤섞인 문서용)"""
    starts: dict[int, int] = {}
    for t in pages[:12]:
        if "세부 전략분야" not in t:
            continue
        m = re.search(r"#\s*(\d)\b.*?…\s*(\d+)|#\s*(\d)\b.*?·{3,}\s*(\d+)", t.replace("\n", " "))
        if m:
            k = int(m.group(1) or m.group(3))
            starts.setdefault(k, int(m.group(2) or m.group(4)))
    return starts


def apply_subfields(result: dict, subfields: list[dict]) -> None:
    """세부분야를 인쇄쪽 범위로 품목에 배정하고 요약표 교차검증을 다시 계산"""
    result["subfields"] = subfields
    for it in result["items"]:
        cur = None
        for s in subfields:
            if it["printed_page_start"] is not None and s["printed_page_start"] <= it["printed_page_start"]:
                cur = s["name"]
        it["subfield"] = cur
    actual: dict[str, int] = {}
    for it in result["items"]:
        actual[it["subfield"] or "(미상)"] = actual.get(it["subfield"] or "(미상)", 0) + 1
    v = result["validation"]
    v["parsed_items_by_subfield"] = actual
    v["summary_match"] = bool(v["expected_items_by_subfield"]) and v["expected_items_by_subfield"] == actual


# ---------------------------------------------------------------- 품목 정의서
LABELS = [
    ("definition", r"\n정의\n"),
    ("scope", r"\n적용 범위 및\n주요 기능\n"),
    ("companies", r"\n국내외\n주요 기업\n\(3~5개\)\n"),
    ("need", r"\n개발 필요성\n"),
    ("dev_goals", r"\n개발 목표\n"),
    ("effects", r"\n기대 효과\n"),
    ("issues", r"\n핵심 이슈\n"),
    ("target_markets", r"\n타겟시장\n\(주요\s*활용처\)\n"),
    ("policies", r"\n연계 ?정책\n"),
    ("national_platform", r"\n국가 ?플랫폼\n"),
]
GROUP_LABELS = re.compile(r"\n(기술적\n특성|산업/\n시장성|정책\n연계/\n활용성|품목\n개요)\s*$")


def parse_item_definition(t: str) -> tuple[dict, list[str]]:
    warnings: list[str] = []
    hits = []
    for key, pat in LABELS:
        m = re.search(pat, t)
        if m:
            hits.append((m.start(), m.end(), key))
        else:
            warnings.append(f"라벨 미검출: {key}")
    hits.sort()
    raw: dict[str, str] = {}
    for i, (_, end, key) in enumerate(hits):
        stop = hits[i + 1][0] if i + 1 < len(hits) else len(t)
        raw[key] = GROUP_LABELS.sub("", t[end:stop]).strip()
    out: dict = {
        "definition": oneline(raw.get("definition")),
        "scope": bullets(raw.get("scope")),
        "need": bullets(raw.get("need")),
        "dev_goals": bullets(raw.get("dev_goals")),
        "effects": bullets(raw.get("effects")),
        "issues": bullets(raw.get("issues")),
        "target_markets": bullets(raw.get("target_markets")),
        "policies": bullets(raw.get("policies")),
        "national_platform": oneline(raw.get("national_platform")),
        "companies": None,
    }
    comp = raw.get("companies")
    if comp:
        m = re.match(r"국외\n국내\n(.*)", comp, re.S)
        lines = [l.strip() for l in (m.group(1) if m else comp).split("\n") if l.strip()]
        out["companies"] = {"overseas": lines[0] if len(lines) > 0 else None,
                            "domestic": " ".join(lines[1:]) if len(lines) > 1 else None}
        if len(lines) != 2:
            warnings.append("주요 기업 칸 줄 수가 2가 아님(국외/국내 구분 불확실)")
    tm = re.search(r"유형\n(.*?)\n정의", t, re.S)
    if tm:
        checked = []
        for x in re.findall(r"■\s*([^□■]+)", tm.group(1)):
            x = re.sub(r"^\(Type\s*[①②③④]\)\s*", "", re.sub(r"\s+", " ", x)).strip()
            known = [k for k in KNOWN_TYPES if k in x]
            checked.append(known[0] if known and x.startswith(known[0]) else x)  # 원문 □ 누락으로 다음 유형이 붙은 경우 첫 유형만
        out["item_type"] = checked[0] if len(checked) == 1 else None
        out["item_types_checked"] = checked
        if len(checked) != 1:
            warnings.append(f"유형 체크 {len(checked)}개")
    else:
        out["item_type"] = None
        warnings.append("유형 칸 미검출")
    return out, warnings


# ---------------------------------------------------------------- 핵심 요소기술
KNOWN_TYPES = ["신시장 창출형", "핵심기술 선도형", "제조혁신·전환형", "공급망·안보 대응형", "기술혁신형", "수요기업 활용형"]
TECH_SPLIT = re.compile(r"(?:^|\n)(\d{1,2})\n구분\n(?:작성 )?내용\n개발 필요 기간\n")
RESUME = "\n§품목명재개§\n"  # 기술 상세 시트 뒤에서 정의서가 다시 시작되는 지점


def parse_technologies(text: str, offset_to_page: list[tuple[int, int]]) -> tuple[list[dict], list[str]]:
    warnings: list[str] = []
    techs: list[dict] = []
    marks = list(TECH_SPLIT.finditer(text))
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        block = text[m.end():end]
        block = re.split(r"\n핵심키워드\n", block)[0]
        # '기술개발목표' 라벨: 기술/개발/목표, 기술개/발/목표, 기술·/개발/목표 등. 손상 문서는 라벨 줄에 본문 조각이
        # 붙기도 해서(예: '기술• 다양한…', '개발SLAM) 모델…') 라벨 줄의 나머지 글자를 목표 본문 앞에 되살린다.
        gm = (re.search(r"\n기술(?P<a>[^\n]*)\n(?P<b>(?:개\s*)?발[^\n]*)\n\s*목\s*표(?P<c>[^\n]*)(?:\n|$)", block)
              or re.search(r"\n기술\s*개발(?P<a>)(?P<b>)\n\s*목\s*표(?P<c>[^\n]*)(?:\n|$)", block))
        head = re.search(r"명칭\n", block)
        page = next((p for off, p in reversed(offset_to_page) if off <= m.start()), None)
        if not gm or not head or head.end() > gm.start():
            warnings.append(f"요소기술 {m.group(1)}: 명칭/개요/목표 구조 미검출")
            techs.append({"no": int(m.group(1)), "name": None, "page": page, "parse_confidence": "low"})
            continue
        pre = block[head.end():gm.start()]
        sm = re.search(r"\n개요\n", pre)
        if sm:
            name_part, summary_part = pre[: sm.start()], pre[sm.end():]
        else:  # 원문에 '개요' 라벨이 없는 경우: 첫 글머리표(•) 앞까지를 명칭으로 본다
            bm = re.search(r"\n\s*•", pre)
            name_part, summary_part = (pre[: bm.start()], pre[bm.start():]) if bm else (pre, "")
            warnings.append(f"요소기술 {m.group(1)}: 개요 라벨 없음(첫 글머리표 기준 분리)")
        ga, gb = gm.group("a"), gm.group("b").lstrip()
        if re.fullmatch(r"[\s·,./\-]*", ga):
            ga = ""
        if not gb.startswith("개"):  # '기술개 / 발 / 목표' 형태
            ga = re.sub(r"^개", "", ga)
        gb = re.sub(r"^(?:개\s*)?발", "", gb)
        gc = re.sub(r"^(?:[\s·,./]|-(?!\d))+", "", gm.group("c"))
        gb = re.sub(r"^(?:[\s·,./]|-(?!\d))+", "", gb)
        goal_part = "\n".join(x for x in (ga, gb, gc, block[gm.end():]) if x and x.strip())
        # 스마트제조형: 목표 뒤 '단기 (3Y)' / '중장기 (5Y)' 계획
        plan = re.search(r"\n단기\n\(3Y\)\n(?P<s>.*?)(?:\n중장기\n\(5Y\)\n?(?P<m>.*))?$", "\n" + goal_part, re.S)
        if plan:
            goal_part = ("\n" + goal_part)[: plan.start()]
        nm = (name_part, summary_part, goal_part)
        name_raw = re.sub(r"\s*\n\s*", " ", nm[0]).replace("▮", "").strip()
        name_raw = re.sub(r"(\))\s*[/,.·]+\s*$", r"\1", name_raw)  # 'TRL : 4) /' 처럼 떨어진 기호 제거
        # 'TRL' 표기 위치를 기준으로 앞은 명칭, 뒤에서 첫 숫자 표현만 값으로 취한다(뒤따르는 잡문자·라벨 조각 무시)
        ti = name_raw.find("TRL")
        if ti >= 0:
            name = name_raw[:ti].rstrip(" (（")
            vm = re.search(r"\d\s*(?:[~→-]\s*\d)?(?:\s*수준)?", name_raw[ti + 3:])
            trl_raw = vm.group(0) if vm else None
        else:
            name, trl_raw = name_raw, None
        trl = parse_trl(trl_raw)
        conf = "high" if trl["trl_confidence"] == "high" else "medium"
        techs.append({
            "no": int(m.group(1)),
            "name": name,
            **trl,
            "summary": oneline(nm[1]),
            "goal": oneline(nm[2]),
            "dev_period": None,  # 표의 연도 칸 음영(그래픽)은 텍스트로 추출 불가 → 미기재
            **({"plan_short_3y": oneline(plan.group("s")), "plan_mid_5y": oneline(plan.group("m"))} if plan else {}),
            "page": page,
            "parse_confidence": conf,
        })
    return techs, warnings


TECH_TABLE_RE = re.compile(r"\n핵심기술\s*\nNo\n기술명\nTRL\n(?P<rows>.*?)\[\s*핵심기술\s*리스트\s*\]", re.S)


def _key(x: str | None) -> str:
    return re.sub(r"[\s·ㆍ,./()\-–]", "", x or "")


def pair_by_name(techs: list[dict], listed: list[dict]) -> list[dict]:
    """상세 시트 순서에 맞춰 목록표 행을 기술명 유사도로 짝짓는다(목록표 행 배치가 뒤섞인 문서 대응)."""
    from difflib import SequenceMatcher
    rest, out = list(listed), []
    for t in techs:
        best = max(rest, key=lambda lt: SequenceMatcher(None, _key(t.get("name")), _key(lt["name"])).ratio())
        rest.remove(best)
        out.append(best)
    return out


def parse_tech_table(rows: str, page: int | None) -> tuple[list[dict], list[str]]:
    """스마트제조형 '핵심기술 No/기술명/TRL' 목록표. 행 = [번호] 기술명(여러 줄) '단계' TRL.
    원문 배치상 번호가 누락·이동되는 경우가 있어 번호는 순서대로 매기고 원문 번호는 no_raw로 남긴다."""
    warnings: list[str] = []
    techs: list[dict] = []
    rows = re.sub(r"(?m)^(\d(?:\s*[~→-]\s*\d)?)\s*단계$", r"단계\n\1", rows)  # 'N단계'(한 줄) 표기도 '단계 / N'으로
    for k, m in enumerate(re.finditer(r"(?P<body>.*?)\n?단계\n(?P<trl>\d(?:\s*[~→-]\s*\d)?)(?:\n|$)", rows, re.S), 1):
        lines = [x.strip() for x in m.group("body").strip("\n").split("\n") if x.strip()]
        no_raw = int(lines.pop(0)) if lines and re.fullmatch(r"\d{1,2}", lines[0]) else None
        if no_raw != k:
            warnings.append(f"핵심기술 목록표 {k}행: 원문 번호 {no_raw}")
        name = " ".join(lines)
        trl = parse_trl(m.group("trl"))
        techs.append({"no": k, "no_raw": no_raw, "name": name or None, **trl, "summary": None, "goal": None,
                      "dev_period": None, "page": page,
                      "parse_confidence": "high" if name and trl["trl_confidence"] == "high" else "low"})
    return techs, warnings


# ---------------------------------------------------------------- 문서 단위
def parse_pages(pages_raw: list[str], meta: dict, plain_raw: list[str] | None = None) -> dict:
    pages = [normalize(t) for t in pages_raw]
    plain = [normalize(t) for t in plain_raw] if plain_raw else pages
    printed = [printed_page_no(t) for t in pages]
    title = (re.search(r"「\s*(.+?)\s*」", pages[0], re.S) or re.search(r"2026\s*~\s*2028\n(.+?)\n「", pages[0])
             or re.search(r"^\s*(\S[^\n]*?)\s*전략기술\s*로드맵", pages[0]))
    field_name = title.group(1).strip() if title else meta.get("field_name")
    published = re.search(r"\n(20\d\d\.\d{1,2})\s*$", pages[0].strip())
    subfields = parse_subfields(plain)
    specialized_subs = parse_specialized_subfields(plain, pages)

    def subfield_for(pp: int | None, code: str | None = None):
        if specialized_subs and code:  # 특화 로드맵: 품목코드 가운데 번호 = 전략분야 번호
            return specialized_subs.get(int(code.split("-")[3]))
        if pp is None:
            return None
        cur = None
        for s in subfields:
            if s["printed_page_start"] <= pp:
                cur = s["name"]
        return cur

    starts = [i for i, t in enumerate(pages) if CODE_RE.search(t) and "품목 코드" in t and "품목명" in t]
    items = []
    for k, si in enumerate(starts):
        stop = starts[k + 1] if k + 1 < len(starts) else len(pages)
        # 품목 정의 이후 '전략품목 로드맵'/다음 세부분야 등 다른 절이 나오면 거기서 끊는다
        first = pages[si]
        code = CODE_RE.search(first).group(0)
        nm = re.search(r"품목명\n(.*?)\n품목\n개요", first, re.S) or re.search(r"품목명\n(.*?)\n", first)
        name = re.sub(r"\s*\n\s*", " ", nm.group(1)).strip() if nm else None
        # 이어지는 페이지: 머리글 다음이 '품목명 <같은 품목명>'으로 시작
        name_re = r"\s*".join(re.escape(tok) for tok in (name or "").split()) if name else None
        cont_re = re.compile(r"^\s*품목명\n" + (name_re + r"\s*\n" if name_re else r".*?\n"), re.S)
        mid_re = re.compile(r"\n품목명\n" + (name_re + r"\s*\n" if name_re else r"[^\n]*\n"))
        j = si + 1
        while j < stop and (cont_re.match(strip_page_header(pages[j]))
                            or TECH_SPLIT.match(strip_page_header(pages[j]).lstrip("\n"))):
            j += 1
        page_idx = list(range(si, j))
        full, offs = "", []
        for pi in page_idx:
            chunk = strip_page_header(pages[pi])
            if pi != si:
                chunk = cont_re.sub("\n", chunk, count=1) if cont_re.match(chunk) else mid_re.sub(RESUME, "\n" + chunk, count=1)
            offs.append((len(full), pi + 1))
            full += "\n" + chunk
        cut = full.find("핵심 요소기술")
        table = TECH_TABLE_RE.search(full) if cut < 0 else None
        if table:  # 스마트제조형: 정의서 안 핵심기술 목록표 + 뒤따르는 기술 상세 시트
            tpage = next((pg for off, pg in reversed(offs) if off <= table.start()), None)
            listed, w2 = parse_tech_table(table.group("rows"), tpage)
            # 상세 시트 블록: 각 'N 구분 작성 내용 …'부터 다음 시트 또는 정의서 재개 지점까지. 나머지는 정의서 본문.
            starts_ = [m.start() for m in TECH_SPLIT.finditer(full, table.end())]
            body = full[: table.start()] + "\n"
            cursor, techs = table.end(), []
            for k2, st in enumerate(starts_):
                nxt = starts_[k2 + 1] if k2 + 1 < len(starts_) else len(full)
                rs = full.find(RESUME, st, nxt)
                en = rs if rs >= 0 else nxt
                body += full[cursor:st] + "\n"
                t_, w3 = parse_technologies(full[st:en], [(max(0, off - st), pg) for off, pg in offs])
                techs += t_
                w2 += w3
                cursor = en
            body += full[cursor:]
            if techs and len(techs) == len(listed):
                for n_, t in enumerate(techs, 1):  # 순번은 시트 순서대로, 원문 시트 번호는 따로 보존
                    t["sheet_no_raw"] = t["no"]
                    if t["no"] != n_:
                        w2.append(f"요소기술 {n_}: 원문 상세 시트 번호 {t['no']}(중복·불연속) — 순서대로 {n_}번으로 정리")
                    t["no"] = n_
                for t, lt in zip(techs, pair_by_name(techs, listed)):
                    t["listed_name"], t["listed_trl_raw"] = lt["name"], lt["trl_raw"]
                    if t.get("trl_min") != lt["trl_min"]:
                        w2.append(f"요소기술 {t['no']}: 원문 불일치 — 목록표 TRL {lt['trl_raw']} ≠ 상세 시트 TRL {t.get('trl_raw')} (상세 시트 값 사용)")
                tech_format = "table+detail"
            else:
                # 원문에 상세 시트가 일부만 있는 경우: 목록표를 기준으로 하고 같은 번호의 시트 내용만 덧붙인다
                if techs:
                    w2.append(f"원문 상세 시트 {len(techs)}건 / 목록표 {len(listed)}건 → 목록표 기준")
                by_no = {t["no"]: t for t in techs}
                for lt in listed:
                    dt = by_no.get(lt["no"])
                    if dt and dt.get("name"):
                        lt.update({k: dt.get(k) for k in ("summary", "goal", "plan_short_3y", "plan_mid_5y") if dt.get(k)})
                        lt["detail_name"], lt["detail_page"] = dt["name"], dt.get("page")
                techs, tech_format = listed, "table" if not techs else "table+partial_detail"
            body = body.replace(RESUME, "\n").split("\n핵심키워드")[0]
            tech_text = full
        else:
            body = full[:cut] if cut >= 0 else full
            tech_text = full[cut + len("핵심 요소기술"):] if cut >= 0 else ""
            tech_offs = [(max(0, off - cut - len("핵심 요소기술")), pg) for off, pg in offs] if cut >= 0 else []
            techs, w2 = parse_technologies(tech_text, tech_offs)
            tech_format = "detail"
            body = body.replace(RESUME, "\n")
        defn, w1 = parse_item_definition(body)
        kw = re.findall(r"#([^,#\n]+)", tech_text.split("핵심키워드")[-1]) if "핵심키워드" in tech_text else []
        warnings = w1 + w2
        if not techs:
            warnings.append("핵심 요소기술 0건")
        low = sum(1 for t in techs if t.get("parse_confidence") == "low")
        items.append({
            "code": code,
            "name": name,
            "subfield": subfield_for(printed[si], code),
            **defn,
            "keywords": [k.strip() for k in kw],
            "technologies": techs,
            "tech_format": tech_format,
            "page_start": si + 1,
            "page_end": page_idx[-1] + 1,
            "printed_page_start": printed[si],
            "printed_page_end": printed[page_idx[-1]],
            "parse_confidence": "high" if not warnings and not low else ("medium" if len(warnings) <= 2 and not low else "low"),
            "warnings": warnings,
        })

    expected = parse_summary_counts(plain, field_name) if field_name else {}
    lm = re.search(r"-([A-Z])-(\d{2})-", items[0]["code"]) if items else None
    general = not lm or lm.group(1) == "A"
    if not general:
        expected = parse_specialized_counts(plain, specialized_subs)
    canon = {re.sub(r"\s", "", s["name"]): s["name"] for s in subfields}
    expected = {canon.get(re.sub(r"\s", "", k), k): v for k, v in expected.items()}
    actual: dict[str, int] = {}
    for it in items:
        actual[it["subfield"] or "(미상)"] = actual.get(it["subfield"] or "(미상)", 0) + 1
    fno = (lm.group(2) if general else lm.group(1)) if lm else None
    return {
        "parser_version": PARSER_VERSION,
        "document": {**meta, "field_name": field_name, "field_no": fno, "published": published.group(1) if published else None,
                     "version": "2026-2028", "roadmap_type": "general" if general else "specialized", "pages": len(pages),
                     "printed_page_by_pdf_page": {str(i + 1): n for i, n in enumerate(printed) if n is not None}},
        "subfields": subfields,
        "validation": {"expected_items_by_subfield": expected, "parsed_items_by_subfield": actual,
                       "summary_match": bool(expected) and expected == actual,
                       "code_sequence_complete": code_sequence_complete([it["code"] for it in items]),
                       "items": len(items), "technologies": sum(len(i["technologies"]) for i in items)},
        "items": items,
        "_global_summary": parse_global_summary(plain),
        "_subfield_starts": parse_subfield_starts(pages),
    }


def parse_pdf(path: Path) -> dict:
    import pymupdf  # 파서 로직 테스트는 pymupdf 없이 가능하도록 지연 import

    data = path.read_bytes()
    doc = pymupdf.open(stream=data, filetype="pdf")
    meta = {"source_file": path.name, "sha256": hashlib.sha256(data).hexdigest()}
    plain = [p.get_text() for p in doc]
    kind = detect_kind(path.name, plain[0] if plain else "")
    # 문장부호만 있는 떨어진 줄이 많으면 '텍스트 층 손상' 문서로 보고 좌표 기반 복원을 적용
    orphan = sum(len(re.findall(r"(?m)^\s*[,·.]\s*$", normalize(t))) for t in plain)
    degraded = orphan > 50 or kind == "sobujang"
    meta["text_layer"] = "repaired" if degraded else "plain"
    if kind == "sobujang":
        from parse_sobujang import parse_sobujang
        return parse_sobujang(doc, meta)
    pages = [repaired_page_text(p) for p in doc] if degraded else plain
    if kind == "2025-2027":
        from parse_2025 import parse_2025
        fm = re.match(r"^(\d+(?:\s*-\s*\d+)?)\.", path.name)
        meta["field_no"] = re.sub(r"\s", "", fm.group(1)) if fm else "00"
        return parse_2025([normalize(t) for t in pages], meta, [normalize(t) for t in plain])
    if kind == "nuclear":
        from parse_nuclear import parse_nuclear
        return parse_nuclear(doc, [normalize(t) for t in pages], meta)
    return parse_pages(pages, meta, plain)


def detect_kind(filename: str, first_page: str) -> str:
    """문서 형식: 2026~2028 일반·특화(기본) / 소부장 정의서 / 2025~2027 대조본 / 원전 특화(2023~2027)"""
    t = normalize(first_page)
    if ("소재·부품·장비" in t and "정의서" in t) or ("소부장" in filename and "정의서" in filename):
        return "sobujang"
    if re.search(r"2025\s*~\s*2027", t) or re.search(r"_\d{6}\.pdf$", filename):
        return "2025-2027"
    if "원전" in filename and "2023" in filename:
        return "nuclear"
    return "2026-2028"


def mark_duplicate_codes(items: list[dict]) -> None:
    """원문 품목코드 중복(오기)은 고치지 않고 표시만 한다. item_uid는 코드+PDF 시작쪽으로 항상 유일."""
    counts: dict[str, int] = {}
    items = [it for it in items if it.get("code")]  # 공식 코드가 없는 형식(소부장·2025~2027)은 파서가 고유키를 부여
    for it in items:
        counts[it["code"]] = counts.get(it["code"], 0) + 1
    for it in items:
        it["item_uid"] = f"{it['code']}@p{it['page_start']}"
        if counts[it["code"]] > 1:
            it["code_note"] = "원문 품목코드 중복 표기(원문 오기 가능성) — 코드 수정 없이 원문 그대로 유지"
            it["warnings"].append(it["code_note"])


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdfs", nargs="+", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    a.out.mkdir(parents=True, exist_ok=True)
    seen: dict[str, str] = {}
    results = []
    # 같은 파일이 '… (1).pdf' 사본으로 중복 수령된 경우 원래 이름을 대표로 남긴다
    ordered = sorted(a.pdfs, key=lambda x: (bool(re.search(r" \(\d+\)$", x.stem)), x.name))
    # PDF마다 별도 프로세스(대량 처리 시 PDF 라이브러리 메모리 누적 방지)
    from multiprocessing import get_context
    with get_context("spawn").Pool(processes=2, maxtasksperchild=1) as pool:
        parsed = pool.map(parse_pdf, ordered, chunksize=1)
    for p, res in zip(ordered, parsed):
        sha = res["document"]["sha256"]
        if sha in seen:
            print(f"중복(건너뜀): {p.name} = {seen[sha]}")
            continue
        seen[sha] = p.name
        results.append(res)
    # 정상 텍스트 문서의 '로드맵 구성' 표(13개 분야 전체)를 기준표로 사용
    glob_summary = next((r["_global_summary"] for r in results
                         if r["document"].get("text_layer") == "plain" and len(r.get("_global_summary", {})) >= 13), {})
    for res in results:
        key = re.sub(r"\s", "", res["document"]["field_name"] or "")
        if res["document"].get("version") == "2026-2028" and res["document"].get("roadmap_type") == "general" \
                and not res["subfields"] and key in glob_summary:
            starts = res.pop("_subfield_starts")
            names = glob_summary[key]
            if len(starts) == len(names):
                subs = [{"no": k, "name": names[k - 1][0], "printed_page_start": starts[k], "name_source": "global_summary"}
                        for k in sorted(starts)]
                res["validation"]["expected_items_by_subfield"] = {n: c for n, c in names}
                apply_subfields(res, subs)
        res.pop("_subfield_starts", None)
        res.pop("_global_summary", None)
    for res in results:
        mark_duplicate_codes(res["items"])
        v, doc = res["validation"], res["document"]
        sub = a.out / f"{doc['version']}_{doc['roadmap_type']}"
        sub.mkdir(parents=True, exist_ok=True)
        out = sub / (re.sub(r"[/\\\s]+", "_", f"{doc['field_no']}_{doc['field_name']}") + ".json")
        out.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{doc['version']} {doc['field_name']}: 품목 {v['items']} · 요소기술 {v['technologies']} → {sub.name}/{out.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
