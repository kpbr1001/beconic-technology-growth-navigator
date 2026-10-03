"""서비스 저장소에 커밋된 로드맵 색인의 무결성 검사 (원문 PDF 없이 실행)"""
import json
import re
import unittest
from pathlib import Path

INDEX_DIR = Path(__file__).resolve().parents[2] / "data/roadmaps/index"
# 묶음별 기대 건수(분야, 품목, 핵심기술) — 원문 요약표·목차·목록표와 교차검증을 통과한 값
EXPECTED = {
    "2026-2028_general": (13, 272, 1103),
    "2026-2028_specialized": (2, 88, 304),
    "2026_sobujang_definition": (1, 137, 442),
    "2025-2027_general": (35, 218, 736),
    "2023-2027_specialized": (1, 40, 180),
}
ALLOWED_TECH_KEYS = {"no", "name", "trl_raw", "trl_min", "trl_max", "pdf_page", "printed_page",
                     "trl_basis", "trl_by_year", "dev_period"}
SOURCE_TEXT_KEYS = ('"definition"', '"goal"', '"summary"', '"need"', '"scope"', '"issues"', '"requirements"')


def load(coll):
    path = INDEX_DIR / f"{coll}.json"
    idx = json.loads(path.read_text(encoding="utf-8"))
    items = [it for f in idx["fields"] for s in f["subfields"] for it in s["items"]]
    return path, idx, items, [t for it in items for t in it["technologies"]]


class TestPublicIndex(unittest.TestCase):
    def test_counts_match_validated_totals(self):
        for coll, (nf, ni, nt) in EXPECTED.items():
            _, idx, items, techs = load(coll)
            self.assertEqual((len(idx["fields"]), len(items), len(techs)), (nf, ni, nt), coll)

    def test_every_item_traceable_to_source_page(self):
        for coll in EXPECTED:
            _, idx, items, techs = load(coll)
            uids = [it["item_uid"] for it in items]
            self.assertEqual(len(uids), len(set(uids)), f"{coll}: item_uid 중복")
            for f in idx["fields"]:
                self.assertRegex(f["sha256"], r"^[0-9a-f]{64}$")
            for it in items:
                self.assertIsInstance(it["pdf_page_start"], int, it["item_uid"])
                if it["code"] is not None:  # 공식 품목코드는 원문 그대로(형식 확인만)
                    self.assertRegex(it["code"], r"^SMESTR-\d{4}-[A-Z]-\d{2}-\d{2}$")
                else:  # 코드가 없는 형식은 원문 순번을 남긴다
                    self.assertRegex(it.get("item_no", ""), r"^\d{2}$", it["item_uid"])
            for t in techs:
                self.assertTrue(t["name"])
                self.assertIsInstance(t["pdf_page"], int)

    def test_duplicate_codes_flagged_not_fixed(self):
        _, _, items, _ = load("2026-2028_general")
        codes = [it["code"] for it in items]
        dup = {c for c in codes if codes.count(c) > 1}
        # 원문 오기(로봇 07-04 두 번 표기)는 고치지 않고 code_note로 표시
        for it in items:
            self.assertEqual(it["code"] in dup, bool(it.get("code_note")), it["code"])

    def test_trl_never_invented(self):
        for coll in EXPECTED:
            _, _, _, techs = load(coll)
            for t in techs:
                if t.get("trl_basis") == "stage_targets":  # 2025~2027: 연차별 목표 TRL, 원문에 없는 연차는 null
                    vals = [v for v in t["trl_by_year"] if v]
                    self.assertEqual(t["trl_min"] is None, not vals, t["name"])
                    continue
                if t["trl_min"] is None:
                    self.assertFalse((t.get("trl_raw") or "").strip(), f"{coll}: TRL 원문이 있는데 값이 비어 있음")
                else:
                    self.assertTrue(1 <= t["trl_min"] <= t["trl_max"] <= 9)
                    self.assertIn(str(t["trl_min"]), t["trl_raw"])
        # 원전 특화 로드맵은 원문에 TRL이 없다 → 전부 null
        _, _, _, techs = load("2023-2027_specialized")
        self.assertTrue(all(t["trl_min"] is None for t in techs))

    def test_no_source_body_text_in_public_index(self):
        # 정의·개요·개발목표 등 원문 문장은 비공개 KB 저장소에만 둔다
        for coll in EXPECTED:
            path, _, _, techs = load(coll)
            for t in techs:
                self.assertLessEqual(set(t), ALLOWED_TECH_KEYS, coll)
                if t.get("dev_period"):
                    self.assertRegex(t["dev_period"], r"^[\d.\s\-–~년]+$")
            raw = path.read_text(encoding="utf-8")
            for k in SOURCE_TEXT_KEYS:
                self.assertNotIn(k, raw, f"{coll}: {k}")

    def test_no_stray_index_files(self):
        names = {p.stem for p in INDEX_DIR.glob("*.json")}
        self.assertEqual(names, set(EXPECTED))
        for p in INDEX_DIR.glob("*.json"):
            self.assertLess(p.stat().st_size, 2_000_000)
            self.assertFalse(re.search(r"\.pdf\"\s*:", p.read_text(encoding="utf-8")))


if __name__ == "__main__":
    unittest.main()
