"""로드맵 파서 단위 테스트 (PDF 없이 텍스트 fixture로 실행: python3 -m unittest discover -s tests/roadmap)"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "roadmap"))
from parse_roadmap import (  # noqa: E402
    _header_split, apply_subfields, normalize, parse_global_summary, parse_pages,
    parse_subfield_starts, parse_technologies, parse_trl,
)

COVER = "중소기업 전략기술로드맵\n2026~2028\n「차세대통신」\n2025.12\n"
SUMMARY = ("로드맵 구성\n전략분야\n세부 전략분야\n전략품목\n1\nAI\n멀티모달 데이터 운영·관리\n엣지 기반 등 7개 품목\n"
           "4\n차세대통신\n유·무선 통신장비\n차세대 네트워크 중계기 등 1개 품목\n통신부품\n고효율 등 1개 품목\n"
           "5\n첨단소재\n금속 소재\n고성능 등 5개 품목\n")
TOC = ("세부 전략분야 #1 유·무선 통신 장비·······································45\n"
       "세부 전략분야 #2 통신 부품·······································111\n")


def item_pages(code, name, printed, techs):
    first = (f"차세대통신\n{printed}\n전략품목 정의서\n품목명\n{name}\n품목\n개요\n품목 코드\n{code}\n유형\n"
             "■ 신시장 창출형 □ 핵심기술 선도형 □ 제조혁신·전환형 □ 공급망·안보 대응형\n"
             "정의\n• 정의 문장\n적용 범위 및\n주요 기능\n• 범위 1\n국내외\n주요 기업\n(3~5개)\n국외\n국내\nA사, B사\nC사\n"
             "개발 필요성\n• 필요성\n기술적\n특성\n개발 목표\n• 목표 1\n• 목표 2\n기대 효과\n• 효과\n산업/\n시장성\n핵심 이슈\n• 이슈\n"
             "타겟시장\n(주요 활용처)\n• 시장\n정책\n연계/\n활용성\n연계 정책\n• 정책\n국가 플랫폼\n• 해당없음\n")
    second = f"｜중소기업 전략기술로드맵(2026 ~ 2028) 수립\n{printed + 1}\n품목명\n{name}\n핵심 요소기술\n" + techs + \
        "핵심키워드\n#키워드A, #키워드B\n"
    return [first, second]


def tech(no, name_line, goal_label="기술\n개발\n목표", with_summary=True):
    s = f"{no}\n구분\n내용\n개발 필요 기간\n’26년’27년’28년\n명칭\n{name_line}\n"
    s += "개요\n• 개요 문장\n" if with_summary else "• 개요 문장(라벨 없음)\n"
    return s + f"{goal_label}\n• 목표 문장\n"


class TestTrl(unittest.TestCase):
    def test_variants(self):
        self.assertEqual(parse_trl("4")["trl_min"], 4)
        self.assertEqual([parse_trl("4-6")[k] for k in ("trl_min", "trl_max", "trl_confidence")], [4, 6, "high"])
        self.assertEqual(parse_trl("5~6")["trl_max"], 6)
        self.assertEqual(parse_trl("7 수준")["trl_confidence"], "high")
        self.assertEqual(parse_trl("5→7")["trl_confidence"], "low")  # 현재→목표인지 범위인지 원문만으로 확정 불가
        self.assertEqual(parse_trl("")["trl_confidence"], "missing")
        self.assertIsNone(parse_trl(None)["trl_min"])


class TestHeaders(unittest.TestCase):
    def test_single_and_split_headers(self):
        self.assertEqual(_header_split("차세대통신\n87\n본문")[0], 87)
        self.assertEqual(_header_split("｜중소기업 전략기술로드맵\n수립\n(2026 ~ 2028)\n100\n품목명")[0], 100)
        self.assertEqual(_header_split("｜중소기업 전략기술 로드맵(2026 ~ 2028) 수립\n88\n품목명")[0], 88)
        self.assertEqual(_header_split("품목명\n광액세스\n1\n구분")[0], None)

    def test_normalize(self):
        self.assertEqual(normalize("연계\x01 정책  값 ５"), "연계 정책 값 5")


class TestTechnologies(unittest.TestCase):
    def parse(self, text):
        techs, warnings = parse_technologies("\n" + text, [(0, 10)])
        return techs, warnings

    def test_standard_block(self):
        t, w = self.parse(tech(1, "AI기반 광액세스망 관리 기술(TRL : 5)"))
        self.assertEqual((t[0]["name"], t[0]["trl_min"], t[0]["summary"], t[0]["goal"], t[0]["page"]),
                         ("AI기반 광액세스망 관리 기술", 5, "개요 문장", "목표 문장", 10))
        self.assertEqual(w, [])

    def test_label_variants(self):
        for label in ("기술개\n발\n목표", "기술·\n개발\n목표"):
            t, _ = self.parse(tech(1, "기술 A (TRL : 4)", goal_label=label))
            self.assertEqual(t[0]["goal"], "목표 문장", label)

    def test_label_line_with_fragment_keeps_text(self):
        t, _ = self.parse(tech(1, "기술 B (TRL : 6)", goal_label="기술SW 스택과\n개발\n목표"))
        self.assertIn("SW 스택과", t[0]["goal"])

    def test_missing_summary_label(self):
        t, w = self.parse(tech(1, "기술 C (TRL : 5)", with_summary=False))
        self.assertEqual(t[0]["name"], "기술 C")
        self.assertTrue(any("개요 라벨 없음" in x for x in w))

    def test_trl_trailing_junk_and_empty(self):
        t, _ = self.parse(tech(1, "마이크로LED 칩 리페어 기술 (TRL : 4) ㄴ") + tech(2, "빈 TRL 기술 (TRL : )"))
        self.assertEqual((t[0]["name"], t[0]["trl_raw"]), ("마이크로LED 칩 리페어 기술", "4"))
        self.assertEqual((t[1]["trl_min"], t[1]["trl_confidence"]), (None, "missing"))  # 원문에 값 없음 → 추측 금지


class TestDocument(unittest.TestCase):
    def build(self):
        techs = tech(1, "기술 1 (TRL : 4)") + tech(2, "기술 2 (TRL : 6)")
        pages = [COVER, "", SUMMARY, TOC] + ["본문"] * 2
        pages += item_pages("SMESTR-2025-A-04-01", "차세대 네트워크 중계기", 87, techs)
        pages += ["다른 절"] * 2
        pages += item_pages("SMESTR-2025-A-04-02", "고효율 전력증폭 모듈", 150, tech(1, "기술 3 (TRL 7)"))
        return parse_pages(pages, {"source_file": "t.pdf", "sha256": "x"})

    def test_items_pages_subfields_and_summary(self):
        r = self.build()
        self.assertEqual(r["document"]["field_name"], "차세대통신")
        self.assertEqual([s["name"] for s in r["subfields"]], ["유·무선 통신 장비", "통신 부품"])
        a, b = r["items"]
        self.assertEqual((a["code"], a["name"], a["subfield"], a["page_start"], a["page_end"], a["printed_page_start"]),
                         ("SMESTR-2025-A-04-01", "차세대 네트워크 중계기", "유·무선 통신 장비", 7, 8, 87))
        self.assertEqual(a["item_type"], "신시장 창출형")
        self.assertEqual(a["dev_goals"], ["목표 1", "목표 2"])
        self.assertEqual(a["keywords"], ["키워드A", "키워드B"])
        self.assertEqual([(t["name"], t["trl_min"], t["page"]) for t in a["technologies"]], [("기술 1", 4, 8), ("기술 2", 6, 8)])
        self.assertEqual(b["subfield"], "통신 부품")
        # 요약표('통신장비')와 목차('통신 장비')의 띄어쓰기 차이를 흡수해 교차검증
        self.assertTrue(r["validation"]["summary_match"])
        self.assertEqual(r["document"]["printed_page_by_pdf_page"]["7"], 87)

    def test_global_summary_and_scrambled_toc(self):
        g = parse_global_summary([COVER, "", SUMMARY, ""])
        self.assertEqual(g["차세대통신"], [("유·무선 통신장비", 1), ("통신부품", 1)])
        self.assertEqual(g["AI"], [("멀티모달 데이터 운영·관리", 7)])
        # 글자 순서가 뒤섞인 목차에서도 '#번호 … 쪽'만으로 시작쪽을 얻는다
        starts = parse_subfield_starts(["세부 전략분야\n멀티모달 데이터 운영·관리\n#1\n…55\n제절 개요"])
        self.assertEqual(starts, {1: 55})

    def test_apply_subfields(self):
        r = self.build()
        r["validation"]["expected_items_by_subfield"] = {"X": 1, "Y": 1}
        apply_subfields(r, [{"no": 1, "name": "X", "printed_page_start": 40}, {"no": 2, "name": "Y", "printed_page_start": 100}])
        self.assertEqual([i["subfield"] for i in r["items"]], ["X", "Y"])
        self.assertTrue(r["validation"]["summary_match"])


if __name__ == "__main__":
    unittest.main()
