"""서비스 저장소에 커밋된 로드맵 색인의 무결성 검사 (원문 PDF 없이 실행)"""
import json
import unittest
from pathlib import Path

INDEX = Path(__file__).resolve().parents[2] / "data/roadmaps/index/2026-2028_general.json"
ALLOWED_TECH_KEYS = {"no", "name", "trl_raw", "trl_min", "trl_max", "pdf_page", "printed_page"}


class TestPublicIndex(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.idx = json.loads(INDEX.read_text(encoding="utf-8"))
        cls.items = [it for f in cls.idx["fields"] for s in f["subfields"] for it in s["items"]]
        cls.techs = [t for it in cls.items for t in it["technologies"]]

    def test_counts_match_parsed_totals(self):
        self.assertEqual(len(self.idx["fields"]), 13)
        self.assertEqual(len(self.items), 272)
        self.assertEqual(len(self.techs), 1103)

    def test_every_item_traceable_to_source_page(self):
        uids = [it["item_uid"] for it in self.items]
        self.assertEqual(len(uids), len(set(uids)), "item_uid 중복")
        codes = [it["code"] for it in self.items]
        dup = {c for c in codes if codes.count(c) > 1}
        # 원문 오기(로봇 07-04 두 번 표기)는 고치지 않고 code_note로 표시
        for it in self.items:
            self.assertEqual(it["code"] in dup, bool(it.get("code_note")), it["code"])
        for f in self.idx["fields"]:
            self.assertRegex(f["sha256"], r"^[0-9a-f]{64}$")
        for it in self.items:
            self.assertRegex(it["code"], r"^SMESTR-\d{4}-[A-Z]-\d{2}-\d{2}$")
            self.assertIsInstance(it["pdf_page_start"], int)
            self.assertIsInstance(it["printed_page_start"], int)
        for t in self.techs:
            self.assertTrue(t["name"])
            self.assertIsInstance(t["pdf_page"], int)

    def test_trl_never_invented(self):
        for t in self.techs:
            if t["trl_min"] is None:
                self.assertFalse((t.get("trl_raw") or "").strip(), "TRL 원문이 있는데 값이 비어 있음")
            else:
                self.assertTrue(1 <= t["trl_min"] <= t["trl_max"] <= 9)
                self.assertIn(str(t["trl_min"]), t["trl_raw"])

    def test_no_source_body_text_in_public_index(self):
        # 정의·개발목표 등 원문 문장은 비공개 KB 저장소에만 둔다
        for t in self.techs:
            self.assertLessEqual(set(t), ALLOWED_TECH_KEYS)
        self.assertNotIn('"definition"', INDEX.read_text(encoding="utf-8"))
        self.assertNotIn('"goal"', INDEX.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
