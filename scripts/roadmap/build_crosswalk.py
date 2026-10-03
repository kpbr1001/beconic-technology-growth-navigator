"""2025~2027 → 2026~2028 전략품목 대조표(자동 후보) — 공개 색인만 사용(원문 문장 없음)

이전 판 품목마다 새 판(2026~2028 일반 13개 분야 + 특화 스마트제조·화장품) 품목 중 이어지는 후보를 최대 3개 제시한다.
근거: 품목명·핵심기술명의 공통 핵심어(새 판 전체 기준 희소어 가중) + 글자 2-gram 유사도 + 분야 대응(가산점).
공식 대응표가 아니다 → '자동 대조 후보 · 전문가 검토 전'. 새 판에서 어느 이전 품목과도 이어지지 않는 품목은 '신규 추정'.

사용: python3 scripts/roadmap/build_crosswalk.py   (검사만: --check)
출력: data/roadmaps/crosswalk/2025-2027_to_2026-2028.json, .csv
"""
from __future__ import annotations

import csv
import io
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IDX = ROOT / "data/roadmaps/index"
OUT_DIR = ROOT / "data/roadmaps/crosswalk"
OUT_JSON = OUT_DIR / "2025-2027_to_2026-2028.json"
OUT_CSV = OUT_DIR / "2025-2027_to_2026-2028.csv"
VERSION = "crosswalk-v1"

# src/roadmap/terms.ts 와 같은 규칙
STOP = {'기술', '개발', '기반', '위한', '통한', '관련', '제품', '서비스', '고객', '기업', '중소', '사용', '활용', '적용', '제공', '있는',
        '하는', '합니다', '입니다', '시스템', '솔루션', '플랫폼', '주요', '분야', '현장', '담당자', '등의', '및'}
JOSA = re.compile(r"(으로|에서|에게|까지|부터|처럼|이며|이고|하고|과|와|을|를|이|가|은|는|의|에|로|도|만)$")


def terms(text: str) -> list[str]:
    out: list[str] = []
    for w in re.split(r"[^0-9a-z가-힣]+", text.lower()):
        if re.search(r"[가-힣]", w) and len(w) > 2:
            w = JOSA.sub("", w)
        if len(w) >= 2 and w not in STOP and not w.isdigit() and w not in out:
            out.append(w)
    return out


# 대조 전용 제외어: 품목·기술명에 두루 붙는 수식어(공통 핵심어로 세면 엉뚱한 품목이 이어진다)
CROSS_STOP = {'구축', '활용한', '이용한', '고효율', '고성능', '고정밀', '다중', '통합', '개선', '향상', '최적화', '실시간', '지능형',
              '스마트', '차세대', '첨단', '신규', '기능', '모듈', '장치', '장비', '부품', '소재', '제조', '생산', '공정', '설계',
              '평가', '분석', '관리', '제어', '운영', '데이터', 'ai', '기법', '방법', '구현', '고도화', '국산화', '응용'}


def bigrams(text: str) -> set[str]:
    s = re.sub(r"[^0-9a-z가-힣]", "", text.lower())
    return {s[i:i + 2] for i in range(len(s) - 1)}


# 이전 판 분야 → 새 판 분야(가산점). 공식 매핑이 아니라 분야 성격이 겹치는 곳
FIELD_PRIOR = {
    "우주(위성체·발사체)": ["우주"], "첨단항공": ["첨단모빌리티", "우주"], "AI": ["AI"], "바이오": ["바이오·의료"],
    "시스템반도체": ["반도체·디스플레이"], "차세대이동통신": ["차세대통신"], "자율주행차": ["첨단모빌리티"],
    "지능형로봇": ["로봇"], "미래형선박": ["첨단모빌리티"], "청정연료": ["기후·에너지"], "신재생에너지": ["기후·에너지"],
    "이차전지": ["이차전지"], "친환경자동차": ["첨단모빌리티", "이차전지"], "친환경 공정전환": ["기후·에너지", "첨단제조"],
    "자원재활용": ["기후·에너지", "이차전지"], "에너지재활용": ["기후·에너지"], "CCUS": ["기후·에너지"],
    "반도체장비": ["반도체·디스플레이"], "디스플레이장비": ["반도체·디스플레이"], "전기전자부품": ["반도체·디스플레이", "차세대통신"],
    "산업용기계": ["첨단제조", "로봇"], "금속소재 및 성형가공": ["첨단소재", "첨단제조"], "의료기기": ["바이오·의료"],
    "섬유": ["첨단소재"], "유기/복합소재": ["첨단소재"], "기능성식품": ["바이오·의료"], "세라믹": ["첨단소재"],
    "재난안전": ["AI", "사이버보안"], "스마트홈": ["AI", "차세대통신"], "스마트제조": ["스마트제조", "첨단제조"],
    "스마트시티": ["AI", "차세대통신"], "디지털콘텐츠": ["AI"], "사이버보안": ["사이버보안"], "서비스플랫폼": ["AI"],
    "서비스R&D": ["AI", "바이오·의료"],
}
PRIOR_BONUS = 0.15
MIN_SCORE = 0.30      # 이 점수 미만은 후보로 보지 않음
STRONG = 0.60         # 이 이상 + 공통 핵심어 2개 이상 = '이어짐 가능성 높음'


def load(coll: str) -> dict:
    return json.loads((IDX / f"{coll}.json").read_text(encoding="utf-8"))


def items_of(ix: dict) -> list[dict]:
    out = []
    for f in ix["fields"]:
        for s in f["subfields"]:
            for it in s["items"]:
                name_t = it["name"]
                tech_t = " ".join(t["name"] for t in it["technologies"])
                out.append({"field": f["field"], "subfield": None if s["name"].startswith("(") else s["name"],
                            "uid": it["item_uid"], "code": it.get("code"), "no": it.get("item_no"), "name": it["name"],
                            "page": it.get("printed_page_start"), "pdf": it["pdf_page_start"],
                            "name_terms": [t for t in terms(name_t) if t not in CROSS_STOP],
                            "terms": [t for t in terms(name_t + " " + tech_t) if t not in CROSS_STOP],
                            "bi": bigrams(name_t + " " + tech_t), "name_bi": bigrams(name_t)})
    return out


def build() -> dict:
    old = items_of(load("2025-2027_general"))
    new = items_of(load("2026-2028_general")) + items_of(load("2026-2028_specialized"))
    n = len(new)
    df: dict[str, int] = {}
    for it in new:
        for t in it["terms"]:
            df[t] = df.get(t, 0) + 1
    idf = lambda t: math.log((n + 1) / df[t]) if t in df and df[t] / n <= 0.2 else 0.0  # noqa: E731

    def vec(it):
        v = {t: idf(t) * (1.5 if t in it["name_terms"] else 1.0) for t in it["terms"]}
        return {k: w for k, w in v.items() if w > 0}

    nvec = [vec(it) for it in new]
    rows = []
    used: set[str] = set()
    for o in old:
        ov = vec(o)
        on = math.sqrt(sum(w * w for w in ov.values())) or 1
        cands = []
        for it, v in zip(new, nvec):
            common = set(ov) & set(v)
            cos = sum(ov[t] * v[t] for t in common) / (on * (math.sqrt(sum(w * w for w in v.values())) or 1))
            jac = len(o["name_bi"] & it["name_bi"]) / (len(o["name_bi"] | it["name_bi"]) or 1)
            prior = PRIOR_BONUS if it["field"] in FIELD_PRIOR.get(o["field"], []) else 0.0
            score = 0.75 * cos + 0.25 * jac + prior
            if score >= MIN_SCORE and common:
                cands.append({"score": round(score, 3), "common": sorted(common, key=lambda t: (-ov[t], t))[:5], "item": it,
                              "same_field": bool(prior)})
        cands.sort(key=lambda c: (-c["score"], c["item"]["uid"]))
        top = cands[:3]
        rel = "대응 품목 없음(자동 대조 기준)"
        if top:
            rel = "이어짐 가능성 높음" if top[0]["score"] >= STRONG and len(top[0]["common"]) >= 2 else "관련 후보"
        for c in top:
            used.add(c["item"]["uid"])
        rows.append({
            "from": {k: o[k] for k in ("field", "uid", "no", "name", "page", "pdf")},
            "relation": rel,
            "candidates": [{"score": c["score"], "common_terms": c["common"], "same_field_prior": c["same_field"],
                            **{k: c["item"][k] for k in ("field", "subfield", "uid", "code", "name", "page", "pdf")}}
                           for c in top],
        })
    new_only = [{k: it[k] for k in ("field", "subfield", "uid", "code", "name", "page", "pdf")} for it in new if it["uid"] not in used]
    summary = {
        "from_items": len(old), "to_items": len(new),
        "strong": sum(r["relation"] == "이어짐 가능성 높음" for r in rows),
        "related": sum(r["relation"] == "관련 후보" for r in rows),
        "no_match": sum(r["relation"].startswith("대응 품목 없음") for r in rows),
        "to_items_without_predecessor": len(new_only),
    }
    return {
        "version": VERSION,
        "label": "자동 대조 후보 · 전문가 검토 전 (공식 대응표 아님)",
        "method": "품목명·핵심기술명 공통 핵심어(새 판 기준 희소어 가중 코사인 0.75) + 품목명 글자 2-gram 유사도(0.25) "
                  f"+ 분야 대응 가산 {PRIOR_BONUS}; 후보 최소 {MIN_SCORE}, '이어짐 가능성 높음' ≥ {STRONG} & 공통 핵심어 2개 이상",
        "from": "2025-2027_general", "to": ["2026-2028_general", "2026-2028_specialized"],
        "summary": summary, "rows": rows, "to_items_without_predecessor": new_only,
    }


def to_csv(d: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(["이전판 분야", "이전판 품목", "이전판 순번", "이전판 인쇄쪽", "판정(자동)", "순위", "새판 분야", "새판 세부분야",
                "새판 품목", "새판 품목코드", "새판 인쇄쪽", "점수", "공통 핵심어", "분야 대응"])
    for r in d["rows"]:
        f = r["from"]
        base = [f["field"], f["name"], f["no"], f["page"], r["relation"]]
        if not r["candidates"]:
            w.writerow(base + [""] * 9)
        for k, c in enumerate(r["candidates"], 1):
            w.writerow(base + [k, c["field"], c["subfield"] or "", c["name"], c["code"], c["page"], c["score"],
                               " · ".join(c["common_terms"]), "O" if c["same_field_prior"] else ""])
    return "﻿" + buf.getvalue()  # 엑셀 한글 깨짐 방지(BOM)


def main(argv: list[str]) -> int:
    d = build()
    js = json.dumps(d, ensure_ascii=False, indent=1) + "\n"
    cs = to_csv(d)
    if "--check" in argv:
        # CSV는 엑셀용 CRLF라 텍스트 모드로 읽으면 줄바꿈이 바뀐다 → 바이트로 비교
        ok = OUT_JSON.exists() and OUT_JSON.read_text(encoding="utf-8") == js and OUT_CSV.read_bytes() == cs.encode("utf-8")
        print("대조표 최신" if ok else "대조표가 색인과 다름 → build_crosswalk.py 재실행 필요")
        return 0 if ok else 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(js, encoding="utf-8")
    OUT_CSV.write_bytes(cs.encode("utf-8"))
    print(json.dumps(d["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
