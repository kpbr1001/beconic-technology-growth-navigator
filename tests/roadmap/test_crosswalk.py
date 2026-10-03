"""2025→2026 품목 대조표: 색인과 동기화·구조·원칙(공식 대응표로 표기 금지, 색인에 없는 품목 생성 금지)"""
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CW = ROOT / "data/roadmaps/crosswalk/2025-2027_to_2026-2028.json"


def uids(coll):
    ix = json.loads((ROOT / f"data/roadmaps/index/{coll}.json").read_text(encoding="utf-8"))
    return {it["item_uid"]: it for f in ix["fields"] for s in f["subfields"] for it in s["items"]}


class TestCrosswalk(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = json.loads(CW.read_text(encoding="utf-8"))

    def test_in_sync_with_index(self):
        r = subprocess.run([sys.executable, str(ROOT / "scripts/roadmap/build_crosswalk.py"), "--check"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_every_old_item_once_and_candidates_exist_in_index(self):
        old, new = uids("2025-2027_general"), {**uids("2026-2028_general"), **uids("2026-2028_specialized")}
        self.assertEqual(sorted(r["from"]["uid"] for r in self.d["rows"]), sorted(old))
        for r in self.d["rows"]:
            self.assertLessEqual(len(r["candidates"]), 3)
            for c in r["candidates"]:
                self.assertIn(c["uid"], new)
                self.assertEqual(c["name"], new[c["uid"]]["name"])
                self.assertEqual(c["code"], new[c["uid"]]["code"])
                self.assertTrue(c["common_terms"], "공통 핵심어 없는 후보 금지")
            scores = [c["score"] for c in r["candidates"]]
            self.assertEqual(scores, sorted(scores, reverse=True))
            self.assertEqual(bool(r["candidates"]), not r["relation"].startswith("대응 품목 없음"))

    def test_labelled_as_automatic_not_official(self):
        self.assertIn("공식 대응표 아님", self.d["label"])
        s = self.d["summary"]
        self.assertEqual(s["strong"] + s["related"] + s["no_match"], s["from_items"])

    def test_known_successors(self):
        # 원문 이름이 거의 같은 품목은 1순위로 이어져야 한다(회귀 방지)
        by_name = {r["from"]["name"]: r for r in self.d["rows"]}
        for old, new in [("감염병 백신·치료제", "감염병 백신 치료제"), ("열관리 시스템", "통합 열관리 시스템"),
                         ("자율 협력 주행 솔루션", "자율 협력 주행 솔루션")]:
            r = by_name[old]
            self.assertEqual(r["candidates"][0]["name"], new)
            self.assertEqual(r["relation"], "이어짐 가능성 높음")


if __name__ == "__main__":
    unittest.main()
