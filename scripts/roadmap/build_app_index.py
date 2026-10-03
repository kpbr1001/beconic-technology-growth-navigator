"""공개 색인(data/roadmaps/index/*.json) → 앱용 경량 색인(src/roadmap/kb-app-index.json)

앱의 '기술로드맵 기준 분야' 선택지마다 원문 전략품목·핵심기술 이름과 원문 쪽 번호만 담는다(원문 문장 없음).
진단 화면의 로드맵 후보(D4)가 이 파일을 쓴다. 공개 색인을 다시 만들면 이 스크립트도 다시 실행한다.

사용: python3 scripts/roadmap/build_app_index.py   (검사만: --check)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INDEX_DIR = ROOT / "data/roadmaps/index"
OUT = ROOT / "src/roadmap/kb-app-index.json"
TAXONOMY = ROOT / "src/roadmap/static-taxonomy.json"  # 색인 로딩 전·실패 시 쓰는 세부분야 목록(원문 기준으로 동기화)

# 앱 선택지(저장된 진단 데이터와 호환되도록 기존 표기 유지) → (색인 묶음, 분야명)
FIELD_MAP = {
    "AI": ("2026-2028_general", "AI"),
    "바이오·의료": ("2026-2028_general", "바이오·의료"),
    "반도체·디스플레이": ("2026-2028_general", "반도체·디스플레이"),
    "차세대통신": ("2026-2028_general", "차세대통신"),
    "첨단소재": ("2026-2028_general", "첨단소재"),
    "첨단제조": ("2026-2028_general", "첨단제조"),
    "로봇": ("2026-2028_general", "로봇"),
    "첨단 모빌리티": ("2026-2028_general", "첨단모빌리티"),
    "기후·에너지": ("2026-2028_general", "기후·에너지"),
    "이차전지": ("2026-2028_general", "이차전지"),
    "사이버보안": ("2026-2028_general", "사이버보안"),
    "양자": ("2026-2028_general", "양자"),
    "우주": ("2026-2028_general", "우주"),
    "스마트제조(특화)": ("2026-2028_specialized", "스마트제조"),
    "화장품(특화)": ("2026-2028_specialized", "화장품"),
    "원전(특화)": ("2023-2027_specialized", "원전"),
    "소재·부품·장비(특화)": ("2026_sobujang_definition", "소재·부품·장비"),
    "서비스R&D(특화)": ("2025-2027_general", "서비스R&D"),
}
DOC_TITLE = {
    "2026-2028_general": "중소기업 전략기술로드맵(2026~2028)",
    "2026-2028_specialized": "{f} 전략기술로드맵(2026~2028)",
    "2023-2027_specialized": "{f} 중소기업 특화 기술로드맵(2023~2027)",
    "2026_sobujang_definition": "소재·부품·장비 로드맵 전략품목 정의서(2026.03)",
    "2025-2027_general": "중소기업 전략기술로드맵(2025~2027)",
}


def _k(s: str) -> str:
    return re.sub(r"\s", "", s)


def build() -> dict:
    cache: dict[str, dict] = {}
    fields = {}
    for label, (coll, fname) in FIELD_MAP.items():
        ix = cache.setdefault(coll, json.loads((INDEX_DIR / f"{coll}.json").read_text(encoding="utf-8")))
        f = next(x for x in ix["fields"] if _k(x["field"]) == _k(fname))
        items = []
        for s in f["subfields"]:
            for it in s["items"]:
                items.append({
                    "uid": it["item_uid"],
                    "code": it.get("code"),
                    "no": it.get("item_no"),
                    "name": it["name"],
                    "sub": None if s["name"].startswith("(") else s["name"],
                    "pp": it.get("printed_page_start"),
                    "pdf": it["pdf_page_start"],
                    "techs": [[t["name"], t.get("trl_raw"), t.get("printed_page"), t.get("pdf_page")]
                              + (["stage_targets"] if t.get("trl_basis") == "stage_targets" else [])
                              for t in it["technologies"]],
                })
        fields[label] = {
            "collection": coll,
            "edition": ix["roadmap_version"],
            "doc": DOC_TITLE[coll].format(f=f["field"]) + ("" if coll != "2026-2028_general" else f" 「{f['field']}」"),
            "source_file": f["source_file"],
            "trl_note": {"2025-2027_general": "연차별 목표 TRL", "2023-2027_specialized": "원문에 TRL 없음"}.get(coll),
            "subfields": [s["name"] for s in f["subfields"] if not s["name"].startswith("(")],
            "items": items,
        }
    return {"kb_version": cache["2026-2028_general"]["kb_version"], "fields": fields}


def taxonomy(built: dict) -> str:
    tx = json.loads(TAXONOMY.read_text(encoding="utf-8"))
    old = tx["ROADMAP_DETAIL"]  # 색인에 없는 선택지('기타/미정')는 그대로 둔다
    tx["ROADMAP_DETAIL"] = {k: (built["fields"][k]["subfields"] or ["세부분야 구분 없음"]) if k in built["fields"] else v
                            for k, v in old.items()}
    return json.dumps(tx, ensure_ascii=False, indent=1) + "\n"


def main(argv: list[str]) -> int:
    built = build()
    data = json.dumps(built, ensure_ascii=False, separators=(",", ":")) + "\n"
    tx = taxonomy(built)
    if "--check" in argv:
        ok = OUT.exists() and OUT.read_text(encoding="utf-8") == data and TAXONOMY.read_text(encoding="utf-8") == tx
        print("앱 색인 최신" if ok else "앱 색인이 공개 색인과 다름 → build_app_index.py 재실행 필요")
        return 0 if ok else 1
    OUT.write_text(data, encoding="utf-8")
    TAXONOMY.write_text(tx, encoding="utf-8")
    d = json.loads(data)["fields"]
    print(f"앱 색인 → {OUT.relative_to(ROOT)} ({len(data.encode()) // 1024}KB) 분야 {len(d)} · "
          f"품목 {sum(len(f['items']) for f in d.values())} · 핵심기술 {sum(len(i['techs']) for f in d.values() for i in f['items'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
