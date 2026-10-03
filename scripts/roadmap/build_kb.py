"""파싱 결과(JSON) → RAG용 문맥 청크(JSONL) + 공개 색인(JSON) (Phase 2)

- chunks.jsonl (비공개 KB 저장소용): 원문 문장을 담은 검색 단위. 각 청크 앞에 상위 문맥(문서·분야·세부분야·품목·기술·페이지)을
  붙인다(contextual chunking, 마스터 프롬프트 6.3). 품목 1개 = 품목 청크 1 + 요소기술 청크 N.
- 색인 JSON (서비스 저장소용): 묶음(버전_유형)별로 분야→세부분야→전략품목→핵심 요소기술의 이름·코드·TRL·쪽 번호만 담는다.
  묶음: 2026-2028_general / 2026-2028_specialized / 2026_sobujang_definition / 2025-2027_general / 2023-2027_specialized

사용: python3 scripts/roadmap/build_kb.py <parsed_dir> --chunks <out.jsonl> --index-dir <dir>
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

KB_VERSION = "kb-v2"


def page_label(doc: dict, pdf_from: int | None, pdf_to: int | None) -> str:
    if not pdf_from:
        return "쪽 미확인"
    pdf_to = pdf_to or pdf_from
    pm = doc.get("printed_page_by_pdf_page", {})
    a, b = pm.get(str(pdf_from)), pm.get(str(pdf_to))
    printed = f"인쇄 {a}" + (f"–{b}" if b and b != a else "") if a else "인쇄 쪽 미확인"
    return f"{printed} (PDF {pdf_from}" + (f"–{pdf_to}" if pdf_to != pdf_from else "") + ")"


def doc_title(doc: dict) -> str:
    v, ty, name = doc["version"].replace("-", "~"), doc["roadmap_type"], doc["field_name"]
    if ty == "sobujang_definition":
        return "소재·부품·장비 로드맵 전략품목 정의서(2026.03)"
    if doc["version"] == "2023-2027":
        return f"{name} 중소기업 특화 기술로드맵({v})"
    if ty == "specialized":
        return f"{name} 전략기술로드맵({v})"
    title = f"중소기업 전략기술로드맵({v}) 「{name}」"
    return title + (" — 이전 판(대조용)" if doc.get("role") == "crosswalk" else "")


def trl_text(t: dict) -> str:
    if t.get("trl_basis") == "stage_targets":
        ys = [y["trl_raw"] or "?" for y in t.get("trl_by_year", [])]
        return f" (연차별 목표 TRL {' → '.join(ys)})" if any(y != "?" for y in ys) else " (TRL 원문 미기재)"
    trl = t.get("trl_raw")
    return f" (TRL {trl})" if trl else " (TRL 원문 미기재)"


def item_label(it: dict) -> str:
    if it.get("code"):
        return f"{it['name']} ({it['code']})"
    return f"{it['name']} (원문 순번 {it['item_no']})" if it.get("item_no") else it["name"]


def prefix(doc: dict, item: dict, page: str, tech: dict | None = None) -> str:
    lines = [
        f"[문서] {doc_title(doc)}",
        f"[전략분야] {doc['field_name']}",
        f"[세부 전략분야] {item.get('subfield') or '해당 없음'}",
        f"[전략품목] {item_label(item)}",
    ]
    if tech:
        lines.append(f"[핵심 요소기술] {tech['name']}{trl_text(tech)}")
    lines.append(f"[페이지] {page}")
    return "\n".join(lines)


def join(label: str, xs) -> str | None:
    if not xs:
        return None
    if isinstance(xs, dict):
        return f"{label}:\n" + "\n".join(f"- ({k}) {v}" for k, v in xs.items() if v)
    if isinstance(xs, str):
        return f"{label}: {xs}"
    return f"{label}:\n" + "\n".join(f"- {x}" for x in xs)


ITEM_FIELDS = [("정의", "definition"), ("적용 범위 및 주요 기능", "scope"), ("분류 체계", "classification"),
               ("개발 필요성", "need"), ("주요 이슈", "issues"), ("개발 목표", "dev_goals"), ("기대 효과", "effects"),
               ("타겟시장", "target_markets"), ("연계 정책", "policies"), ("정책 플랫폼", "policy_platform"),
               ("국가 플랫폼", "national_platform")]
TECH_FIELDS = [("기능적 역할", "role"), ("분류 체계", "classification"), ("개요", "summary"),
               ("기술 요구사항", "requirements"), ("기술개발 목표", "goal"), ("단기(3년) 계획", "plan_short_3y"),
               ("중장기(5년) 계획", "plan_mid_5y"), ("소요 기간(원문)", "dev_period")]


def collection_of(doc: dict) -> str:
    return f"{doc['version']}_{doc['roadmap_type']}"


def build(parsed_dir: Path):
    chunks: list[dict] = []
    indexes: dict[str, dict] = {}
    for f in sorted(parsed_dir.rglob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        doc = d["document"]
        coll = collection_of(doc)
        meta_doc = {"source_file": doc["source_file"], "sha256": doc["sha256"], "roadmap_version": doc["version"],
                    "roadmap_type": doc["roadmap_type"], "roadmap_role": doc.get("role", "primary"),
                    "strategic_field": doc["field_name"], "field_no": doc["field_no"],
                    "text_layer": doc.get("text_layer"), "kb_version": KB_VERSION}
        fentry = {"field_no": doc["field_no"], "field": doc["field_name"], "source_file": doc["source_file"],
                  "sha256": doc["sha256"], "subfields": []}
        by_sub: dict[str, list] = {}
        for it in d["items"]:
            page = page_label(doc, it["page_start"], it["page_end"])
            body = "\n".join(x for x in [join(lb, it.get(k)) for lb, k in ITEM_FIELDS]
                             + [join("핵심키워드", ", ".join(it.get("keywords") or []) or None)] if x)
            base = {**meta_doc, "subfield": it.get("subfield"), "item_code": it.get("code"), "item_no": it.get("item_no"),
                    "item_uid": it["item_uid"], "item_name": it["name"], "item_type": it.get("item_type"),
                    "parse_confidence": it["parse_confidence"]}
            chunks.append({"chunk_id": f"{it['item_uid']}#item", "chunk_type": "item", **base,
                           "page_start": it["page_start"], "page_end": it["page_end"],
                           "printed_page_start": it.get("printed_page_start"), "printed_page_end": it.get("printed_page_end"),
                           "contextual_prefix": prefix(doc, it, page), "content": body})
            techs_idx = []
            for t in it["technologies"]:
                if not t.get("name"):
                    continue
                tp = page_label(doc, t["page"], t["page"]) if t.get("page") else page
                stages = "\n".join(f"- {s['year']}차년도: {s['target']}" for s in t.get("stages") or [] if s.get("target"))
                content = "\n".join(x for x in [join(lb, t.get(k)) for lb, k in TECH_FIELDS]
                                    + [f"단계별 목표:\n{stages}" if stages else None] if x)
                printed = t.get("printed_page") or doc.get("printed_page_by_pdf_page", {}).get(str(t.get("page")))
                chunks.append({"chunk_id": f"{it['item_uid']}#tech{t['no']}", "chunk_type": "technology", **base,
                               "technology_no": t["no"], "technology_name": t["name"], "trl_raw": t.get("trl_raw"),
                               "trl_min": t.get("trl_min"), "trl_max": t.get("trl_max"),
                               "trl_confidence": t.get("trl_confidence"), "trl_basis": t.get("trl_basis", "stated"),
                               "trl_by_year": t.get("trl_by_year"),
                               "page_start": t.get("page"), "page_end": t.get("page"), "printed_page_start": printed,
                               "contextual_prefix": prefix(doc, it, tp, t), "content": content,
                               "parse_confidence": t.get("parse_confidence")})
                entry = {"no": t["no"], "name": t["name"], "trl_raw": t.get("trl_raw"), "trl_min": t.get("trl_min"),
                         "trl_max": t.get("trl_max"), "pdf_page": t.get("page"), "printed_page": printed}
                if t.get("trl_basis") == "stage_targets":
                    entry["trl_basis"] = "stage_targets"
                    entry["trl_by_year"] = [y["trl_raw"] for y in t.get("trl_by_year", [])]
                if t.get("dev_period"):
                    entry["dev_period"] = t["dev_period"]
                techs_idx.append(entry)
            by_sub.setdefault(it.get("subfield") or "(세부분야 구분 없음)", []).append({
                "code": it.get("code"), "item_uid": it["item_uid"],
                **({"item_no": it["item_no"]} if it.get("item_no") else {}),
                **({"code_note": it["code_note"]} if it.get("code_note") else {}),
                "name": it["name"], "item_type": it.get("item_type"),
                "pdf_page_start": it["page_start"], "printed_page_start": it.get("printed_page_start"),
                "technologies": techs_idx})
        seen = set()
        for s in d.get("subfields") or []:
            seen.add(s["name"])
            fentry["subfields"].append({"name": s["name"], "printed_page_start": s.get("printed_page_start"),
                                        "items": by_sub.get(s["name"], [])})
        for name, its in by_sub.items():  # 목차에 없는 구분(세부분야가 없는 문서 등)
            if name not in seen:
                fentry["subfields"].append({"name": name, "printed_page_start": None, "items": its})
        indexes.setdefault(coll, {"kb_version": KB_VERSION, "collection": coll, "roadmap_version": doc["version"],
                                  "roadmap_type": doc["roadmap_type"], "fields": []})["fields"].append(fentry)
    for ix in indexes.values():
        ix["fields"].sort(key=lambda x: (len(str(x["field_no"] or "")), str(x["field_no"] or "")))
    return chunks, indexes


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("parsed_dir", type=Path)
    ap.add_argument("--chunks", type=Path, required=True)
    ap.add_argument("--index-dir", type=Path, required=True)
    a = ap.parse_args(argv)
    chunks, indexes = build(a.parsed_dir)
    a.chunks.parent.mkdir(parents=True, exist_ok=True)
    a.index_dir.mkdir(parents=True, exist_ok=True)
    with a.chunks.open("w", encoding="utf-8") as fh:
        for c in chunks:
            fh.write(json.dumps(c, ensure_ascii=False) + "\n")
    for coll, ix in indexes.items():
        (a.index_dir / f"{coll}.json").write_text(json.dumps(ix, ensure_ascii=False, indent=1), encoding="utf-8")
    n_items = sum(1 for c in chunks if c["chunk_type"] == "item")
    print(f"청크 {len(chunks)}개 (품목 {n_items} · 요소기술 {len(chunks) - n_items}) → {a.chunks}")
    for coll, ix in sorted(indexes.items()):
        its = [i for f in ix["fields"] for s in f["subfields"] for i in s["items"]]
        print(f"색인 {coll}: 분야 {len(ix['fields'])} · 품목 {len(its)} · 요소기술 {sum(len(i['technologies']) for i in its)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
