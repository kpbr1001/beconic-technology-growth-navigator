"""2차 수령 문서 형식별 파서 테스트 (텍스트 fixture, PDF 불필요)

- 특화 로드맵(스마트제조형): 핵심기술 목록표 + 기술 상세 시트, 목록표·시트 TRL 교차검증
- 2025~2027 대조본: 연차별 목표 TRL, 목차 대조, 여러 분야 묶음 문서의 구획 나누기
- 형식 판별
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "roadmap"))
from parse_2025 import parse_2025, parse_stages  # noqa: E402
from parse_roadmap import (  # noqa: E402
    code_sequence_complete, detect_kind, pair_by_name, parse_tech_table, parse_trl,
)


class TestKind(unittest.TestCase):
    def test_detect(self):
        self.assertEqual(detect_kind("260306_소부장로드맵 전략품목 정의서_최종.pdf", "소재·부품·장비 로드맵\n전략품목 정의서\n"), "sobujang")
        self.assertEqual(detect_kind("04. 바이오_01 통합보고서_250116.pdf", "중소기업 전략기술로드맵\n2025~2027\n「바이오」"), "2025-2027")
        self.assertEqual(detect_kind("260306_소부장로드맵 전략품목 정의서_최종.pdf", ""), "sobujang")  # 표지 텍스트층 손상
        self.assertEqual(detect_kind("원전 중소기업 특화 기술로드맵(2023-2027).pdf", "원전"), "nuclear")
        self.assertEqual(detect_kind("20260319_보고서_화장품 전략기술로드맵(2026~2028).pdf", "화장품 전략기술로드맵\n2026~2028"),
                         "2026-2028")

    def test_en_dash_range(self):
        self.assertEqual([parse_trl("3 –4")[k] for k in ("trl_min", "trl_max", "trl_confidence")], [3, 4, "high"])


class TestTechTable(unittest.TestCase):
    ROWS = "1\nAI 기반 자율제어\nAgent 모듈\n단계\n4\n2\n멀티에이전트 프레임워크\n단계\n5\n모달리티별 인코딩 기술\n단계\n6\n"

    def test_rows_and_missing_number(self):
        techs, warns = parse_tech_table(self.ROWS, 146)
        self.assertEqual([(t["no"], t["no_raw"], t["name"], t["trl_min"]) for t in techs],
                         [(1, 1, "AI 기반 자율제어 Agent 모듈", 4), (2, 2, "멀티에이전트 프레임워크", 5),
                          (3, None, "모달리티별 인코딩 기술", 6)])
        self.assertTrue(any("3행" in w for w in warns))  # 원문 번호 누락은 경고로 남긴다

    def test_single_line_stage(self):
        techs, _ = parse_tech_table("1\n3D 재구성 기술\n4단계\n2\n퓨샷 러닝\n5단계\n", 1)
        self.assertEqual([(t["name"], t["trl_min"]) for t in techs], [("3D 재구성 기술", 4), ("퓨샷 러닝", 5)])

    def test_pair_by_name_when_rows_shuffled(self):
        listed, _ = parse_tech_table("1\n기술 가\n단계\n6\n2\n기술 나\n단계\n5\n", 1)
        detail = [{"name": "기술 나"}, {"name": "기술 가"}]
        self.assertEqual([x["trl_min"] for x in pair_by_name(detail, listed)], [5, 6])

    def test_code_sequence(self):
        self.assertTrue(code_sequence_complete(["SMESTR-2025-B-01-01", "SMESTR-2025-B-01-02", "SMESTR-2025-B-02-01"]))
        self.assertFalse(code_sequence_complete(["SMESTR-2025-A-07-01", "SMESTR-2025-A-07-04", "SMESTR-2025-A-07-04"]))


def sheet(k, j, name, trls=("2", "3", "4")):
    s = (f"{k}-{j} {name}\n구분\n내용\n분류\n체계\n산업기술- (500107) 유전자치료제\n기술개요\n- 개요 문장\n"
         f"기술\n요구사항\n- 요구 1\n- 요구 2\n기술개발\n최종 목표\n- 최종 목표 문장\n단계별\n목표\n")
    for y, t in enumerate(trls, 1):
        s += f"{y}차년도\n- {y}차 목표" + (f" (TRL {t}단계)" if t else "") + "\n• 세부\n"
    return s


def definition(no, name):
    return (f"전략품목 정의서\n{no:02d} {name}\n구분\n내용\n개발 방향(유형)\n■ 첨단바이오\n□ 융·복합바이오\n분류\n체계\n산업기술- 의약바이오\n"
            f"주요 이슈\n- 이슈 문장\n정의 및 범위\n- (정의) 정의 문장\n개발목표\n- 개발 목표 문장\n핵심 요소기술 명칭\n기술개발 목표\n기술 A\n• 목표\n")


class Test2025(unittest.TestCase):
    COVER = "중소기업 전략기술로드맵\n2025~2027\n「바이오」\n"
    TOC = "제2 장. 전략품목 환경분석\n전략품목 #1 유전자·세포 치료제········55\n전략품목 #2 감염병 백신·치료제········103\n"

    def test_stage_trl_variants(self):
        st = parse_stages("1차년도\n- 설계 (TRL 2단계)\n2차년도- 개발(TRL7)\n3차년도\n- 실증(TRL 6~7단계)\n")
        self.assertEqual([(s["year"], s["trl_raw"], s["trl_max"]) for s in st], [(1, "2", 2), (2, "7", 7), (3, "6~7", 7)])
        self.assertEqual(parse_stages("1차년도\n- 검증(TRL 05단계)\n")[0]["trl_min"], 5)  # 앞자리 0 표기
        self.assertEqual(st[0]["target"], "설계")

    def test_document(self):
        pages = [self.COVER, "", self.TOC, definition(1, "유전자·세포 치료제"), definition(2, "감염병 백신·치료제"),
                 sheet(1, 1, "유전자 편집 기술") + sheet(1, 2, "전달 기술", ("3", None, "4")), sheet(2, 1, "qPCR 진단기기")]
        r = parse_2025(pages, {"source_file": "04. 바이오_01 통합보고서_250116.pdf", "field_no": "04"}, pages)
        self.assertEqual(r["document"]["field_name"], "바이오")
        self.assertTrue(r["validation"]["summary_match"])
        a, b = r["items"]
        self.assertEqual((a["item_uid"], a["name"], a["item_type"], a["code"]), ("R2025-04-01", "유전자·세포 치료제", "첨단바이오", None))
        t1, t2 = a["technologies"]
        self.assertEqual((t1["trl_basis"], t1["trl_raw"], t1["trl_confidence"]), ("stage_targets", "2 → 3 → 4", "high"))
        self.assertEqual(t1["requirements"], ["요구 1", "요구 2"])
        # 2차년도 TRL이 원문에 없으면 채우지 않고 partial
        self.assertEqual(([y["trl_raw"] for y in t2["trl_by_year"]], t2["trl_confidence"]), (["3", None, "4"], "partial"))
        self.assertEqual([t["name"] for t in b["technologies"]], ["qPCR 진단기기"])

    def test_bundled_document_segments(self):
        # 정의서가 앞에 모이고 기술 정의서가 뒤에 모인 묶음 문서(서비스R&D형): 번호가 되돌아갈 때마다 구획
        toc = "세부분야 #1 정보통신 서비스·········1\n세부분야 #2 헬스케어 서비스·········2\n"
        pages = ["중소기업 전략기술로드맵\n2025~2027\n서비스R&D\n", toc,
                 definition(1, "층간소음 개선 서비스") + definition(2, "키오스크 서비스"), definition(1, "건강관리 서비스"),
                 sheet(1, 1, "소음 수집") + sheet(2, 1, "다국어 대화"), sheet(1, 1, "생체신호 측정")]
        r = parse_2025(pages, {"source_file": "29 - 33. 서비스R&D_01 통합보고서_250413.pdf", "field_no": "29-33"}, pages)
        got = [(i["item_uid"], i["subfield"], [t["name"] for t in i["technologies"]]) for i in r["items"]]
        self.assertEqual(got, [("R2025-29-33-S1-01", "정보통신 서비스", ["소음 수집"]),
                               ("R2025-29-33-S1-02", "정보통신 서비스", ["다국어 대화"]),
                               ("R2025-29-33-S2-01", "헬스케어 서비스", ["생체신호 측정"])])


if __name__ == "__main__":
    unittest.main()
