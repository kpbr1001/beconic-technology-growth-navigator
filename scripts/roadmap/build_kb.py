"""파싱 결과(JSON) → RAG용 문맥 청크(JSONL) + 공개 색인(JSON) (Phase 2)

- chunks.jsonl (비공개 KB 저장소용): 원문 문장을 담은 검색 단위. 각 청크 앞에 상위 문맥(문서·분야·세부분야·품목·기술·페이지)을
  붙인다(contextual chunking, 마스터 프롬프트 6.3). 품목 1개 = 품목 청크 1 + 요소기술 청크 N.
- index JSON (서비스 저장소용): 분야→세부분야→전략품목→핵심 요소기술의 이름·코드·TRL·쪽 번호만 담은 색인.

사용: python3 scripts/roadmap/build_kb.py <parsed_dir> --chunks <out.jsonl> --index <out.json>
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

KB_VERSION = "kb-2026-2028-general-v1"


def page_label(doc: dict, pdf_from: int, pdf_to: int) -> str:
    pm = doc.get("printed_page_by_pdf_page", {})
    a, b = pm.get(str(pdf_from)), pm.get(str(pdf_to))
    printed = f"인쇄 {a}" + (f"–{b}" if b and b != a else "") if a else "인쇄 쪽 미확인"
    return f"{printed} (PDF {pdf_from}" + (f"–{pdf_to}" if pdf_to != pdf_from else "") + ")"


def prefix(doc: dict, item: dict, page: str, tech: dict | None = None) -> str:
    lines = [
        f"[문서] 중소기업 전략기술로드맵({doc['version'].replace('-', '~')}) 「{doc['field_name']}」",
        f"[전략분야] {doc['field_name']}",
        f"[세부 전략분야] {item.get('subfield') or '미상'}",
        f"[전략품목] {item['name']} ({item['code']})",
    ]
    if tech:
        trl = tech.get("trl_raw")
        lines.append(f"[핵심 요소기술] {tech['name']}" + (f" (TRL {trl})" if trl else " (TRL 원문 미기재)"))
    lines.append(f"[페이지] {page}")
    return "\n".join(lines)


def join(label: str, xs) -> str | None:
    if not xs:
        return None
    if isinstance(xs, str):
        return f"{label}: {xs}"
    return f"{label}:\n" + "\n".join(f"- {x}" for x in xs)


def build(parsed_dir: Path):
    chunks, index = [], {"kb_version": KB_VERSION, "fields": []}
    for f in sorted(parsed_dir.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        doc = d["document"]
        meta_doc = {"source_file": doc["source_file"], "sha256": doc["sha256"], "roadmap_version": doc["version"],
                    "roadmap_type": doc["roadmap_type"], "strategic_field": doc["field_name"], "field_no": doc["field_no"],
                    "text_layer": doc.get("text_layer"), "kb_version": KB_VERSION}
        fentry = {"field_no": doc["field_no"], "field": doc["field_name"], "source_file": doc["source_file"],
                  "sha256": doc["sha256"], "subfields": []}
        by_sub: dict[str, list] = {}
        for it in d["items"]:
            page = page_label(doc, it["page_start"], it["page_end"])
            body = "\n".join(x for x in [
                join("정의", it.get("definition")), join("적용 범위 및 주요 기능", it.get("scope")),
                join("개발 필요성", it.get("need")), join("개발 목표", it.get("dev_goals")),
                join("기대 효과", it.get("effects")), join("핵심 이슈", it.get("issues")),
                join("타겟시장", it.get("target_markets")), join("핵심키워드", ", ".join(it.get("keywords") or []) or None),
            ] if x)
            base = {**meta_doc, "subfield": it.get("subfield"), "item_code": it["code"], "item_uid": it["item_uid"], "item_name": it["name"],
                    "item_type": it.get("item_type"), "parse_confidence": it["parse_confidence"]}
            chunks.append({"chunk_id": f"{it['item_uid']}#item", "chunk_type": "item", **base,
                           "page_start": it["page_start"], "page_end": it["page_end"],
                           "printed_page_start": it.get("printed_page_start"), "printed_page_end": it.get("printed_page_end"),
                           "contextual_prefix": prefix(doc, it, page), "content": body})
            techs_idx = []
            for t in it["technologies"]:
                if not t.get("name"):
                    continue
                tp = page_label(doc, t["page"], t["page"]) if t.get("page") else page
                content = "\n".join(x for x in [join("개요", t.get("summary")), join("기술개발 목표", t.get("goal"))] if x)
                chunks.append({"chunk_id": f"{it['item_uid']}#tech{t['no']}", "chunk_type": "technology", **base,
                               "technology_no": t["no"], "technology_name": t["name"], "trl_raw": t.get("trl_raw"),
                               "trl_min": t.get("trl_min"), "trl_max": t.get("trl_max"), "trl_confidence": t.get("trl_confidence"),
                               "page_start": t.get("page"), "page_end": t.get("page"),
                               "printed_page_start": doc.get("printed_page_by_pdf_page", {}).get(str(t.get("page"))),
                               "contextual_prefix": prefix(doc, it, tp, t), "content": content,
                               "parse_confidence": t.get("parse_confidence")})
                techs_idx.append({"no": t["no"], "name": t["name"], "trl_raw": t.get("trl_raw"), "trl_min": t.get("trl_min"),
                                  "trl_max": t.get("trl_max"), "pdf_page": t.get("page"),
                                  "printed_page": doc.get("printed_page_by_pdf_page", {}).get(str(t.get("page")))})
            by_sub.setdefault(it.get("subfield") or "미상", []).append({
                "code": it["code"], "item_uid": it["item_uid"], **({"code_note": it["code_note"]} if it.get("code_note") else {}), "name": it["name"], "item_type": it.get("item_type"),
                "pdf_page_start": it["page_start"], "printed_page_start": it.get("printed_page_start"),
                "technologies": techs_idx})
        for s in d["subfields"]:
            fentry["subfields"].append({"name": s["name"], "printed_page_start": s["printed_page_start"],
                                        "items": by_sub.get(s["name"], [])})
        index["fields"].append(fentry)
    index["fields"].sort(key=lambda x: x["field_no"] or "")
    return chunks, index


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("parsed_dir", type=Path)
    ap.add_argument("--chunks", type=Path, required=True)
    ap.add_argument("--index", type=Path, required=True)
    a = ap.parse_args(argv)
    chunks, index = build(a.parsed_dir)
    a.chunks.parent.mkdir(parents=True, exist_ok=True)
    a.index.parent.mkdir(parents=True, exist_ok=True)
    with a.chunks.open("w", encoding="utf-8") as fh:
        for c in chunks:
            fh.write(json.dumps(c, ensure_ascii=False) + "\n")
    a.index.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    n_items = sum(1 for c in chunks if c["chunk_type"] == "item")
    print(f"청크 {len(chunks)}개 (품목 {n_items} · 요소기술 {len(chunks) - n_items}) → {a.chunks}")
    print(f"색인 → {a.index}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
