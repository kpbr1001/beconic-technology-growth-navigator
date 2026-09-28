"""A4 PDF 페이지별 검수 (마스터 프롬프트 13.4 PDF Red Team QA 중 자동 검사 가능 항목)

사용: python3 tests/e2e/pdf_qa.py [pdf ...]   (기본: tests/e2e/out/pdf/*.pdf, 필요: pip install pymupdf)
검사 항목
  - 물리 페이지 수 vs 보고서 섹션 수(13) → 넘침으로 생긴 추가 페이지
  - 빈 페이지
  - 머리글(BECONIC TECHNOLOGY GROWTH REPORT)·바닥글(Confidential · n / 13) 존재
  - 바닥글 쪽번호가 실제 물리 페이지 번호와 일치하는지
  - 본문이 바닥글 영역을 침범하거나 A4 하단 여백 밖으로 나가는지
  - 한글이 한 글자씩 세로로 쪼개진 줄(1글자 줄 연속) / 숫자·TRL·점수 단독 조각 줄
"""
import glob
import json
import re
import sys

import pymupdf

A4_H = 841.89
HANGUL = re.compile(r"^[가-힣]$")
NUM_FRAG = re.compile(r"^(\d{1,3}|/100|TRL|\d+%|P[012])$")


def lines_of(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            t = "".join(s["text"] for s in l["spans"]).strip()
            if t:
                out.append((t, l["bbox"]))
    return out


def analyze(path):
    doc = pymupdf.open(path)
    pages = []
    for i, page in enumerate(doc):
        ls = lines_of(page)
        text = " ".join(t for t, _ in ls)
        footer = [(t, bb) for t, bb in ls if re.search(r"\d+ / 13$", t)]
        footer_y = min((bb[1] for _, bb in footer), default=None)
        foot_no = int(re.search(r"(\d+) / 13$", footer[0][0]).group(1)) if footer else None
        body = [(t, bb) for t, bb in ls if (t, bb) not in footer and "Confidential" not in t]
        intrude = [t for t, bb in body if footer_y is not None and bb[3] > footer_y - 1]
        off_page = [t for t, bb in ls if bb[3] > A4_H - 5]
        singles = [t for t, bb in body if HANGUL.match(t)]
        frags = [t for t, bb in body if NUM_FRAG.match(t)]
        pages.append({
            "page": i + 1,
            "chars": len(text),
            "header": "BECONIC TECHNOLOGY GROWTH REPORT" in text,
            "cover": i == 0 and "Technology Growth Diagnostic Report".upper() in text.upper(),
            "footer_no": foot_no,
            "footer_intrusion": intrude[:3],
            "off_page": off_page[:3],
            "single_hangul_lines": len(singles),
            "number_fragment_lines": frags[:6],
        })
    return pages


def summarize(path, pages):
    issues = []
    n = len(pages)
    if n != 13:
        issues.append(f"물리 {n}쪽 ≠ 섹션 13 (넘침 페이지 {n - 13:+d})")
    for p in pages:
        tag = f"p{p['page']}"
        if p["chars"] < 30:
            issues.append(f"{tag}: 빈 페이지")
        if p["page"] > 1 and not p["header"]:
            issues.append(f"{tag}: 머리글 없음")
        if p["page"] > 1 and p["footer_no"] is None:
            issues.append(f"{tag}: 바닥글·쪽번호 없음")
        if p["footer_no"] is not None and p["footer_no"] != p["page"]:
            issues.append(f"{tag}: 쪽번호 표기 {p['footer_no']} ≠ 실제 {p['page']}")
        if p["footer_intrusion"]:
            issues.append(f"{tag}: 본문이 바닥글 침범 {p['footer_intrusion']}")
        if p["off_page"]:
            issues.append(f"{tag}: 하단 여백 밖 텍스트 {p['off_page']}")
        if p["single_hangul_lines"] >= 3:
            issues.append(f"{tag}: 한글 1글자 줄 {p['single_hangul_lines']}개(세로 쪼개짐 의심)")
    return issues


if __name__ == "__main__":
    paths = sys.argv[1:] or sorted(glob.glob("tests/e2e/out/pdf/*.pdf"))
    result = {}
    for path in paths:
        pages = analyze(path)
        issues = summarize(path, pages)
        result[path] = {"pages": len(pages), "issues": issues, "detail": pages}
        print(f"\n■ {path} — {len(pages)}쪽, 이슈 {len(issues)}건")
        for x in issues:
            print("   -", x)
    with open("tests/e2e/out/pdf/pdf-qa.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    # v0.9 원본(v09-*)은 비교 기준선이므로 실패 판정에서 제외, 신규 PDF에 이슈가 있으면 실패
    failed = {p: r["issues"] for p, r in result.items() if "/v09-" not in p and r["issues"]}
    if not paths or failed:
        print("\n❌ PDF 검수 실패" if failed else "\n❌ 검수할 PDF 없음")
        sys.exit(1)
    print(f"\n✅ PDF 검수 통과 ({len(result)}개 PDF)")
