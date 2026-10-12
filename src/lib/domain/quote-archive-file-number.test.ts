import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  quoteNumberFromArchiveFileName,
  quoteNumbersFromArchiveFileNames,
} from "./quote-archive-file-number";

/*
 * ============================================================================
 * 파일 이름 → 발행번호 (2026-10-06)
 * ============================================================================
 * 사내 공유폴더의 2026 연도 폴더 파일 342 개를 실측해 모양 셋(본 번호 · 가지 · 개정)과
 * 못 뽑는 셋을 그대로 가져왔다. 🔴 **고객사명 · L/N · S/N 은 가짜다**(저장소가 공개다) —
 * 번호와 확장자 모양만 실제와 같다.
 * ============================================================================
 */

describe("한 이름에서 번호 뽑기", () => {
  test("모양 셋 — 본 번호 · 가지 · 개정", () => {
    assert.equal(quoteNumberFromArchiveFileName("DSS 2026-001 가나상사 MODEL-X1 수리 견적서.xlsx"), "2026-001");
    assert.equal(quoteNumberFromArchiveFileName("DSS 2026-001-1 가나상사 MODEL-X1(OH포함).xls"), "2026-001-1");
    assert.equal(quoteNumberFromArchiveFileName("DSS 2026-004R1 가나상사 MODEL-X1 - 有印.pdf"), "2026-004R1");
  });

  test("🔴 넷째 모양 — 가지 + 개정이 함께 온다 (2026-10-12 운영에서 사용자가 찾았다)", () => {
    // 운영 공유폴더에 있는 이름의 **모양 그대로**다 — 🔴 머리말대로 고객사명 · 모델 · L/N ·
    // S/N 만 가짜로 바꿨고(저장소가 공개다), 번호와 마디 수 · 확장자는 실물과 같다.
    // 2026-10-06 실측 342 개에는 이 꼴이 하나도 없어 옛 규칙이 `null` 을 냈다.
    assert.equal(
      quoteNumberFromArchiveFileName("DSS 2026-095-1R1 가나상사 MODEL-X1 AB1234 1234567 수리 견적서.xls"),
      "2026-095-1R1"
    );
    // 옛 규칙이 깨진 자리 — `-1` 을 먹은 뒤 `R` 앞에서 공백 검사에 걸려 통째로 null 이었다.
    assert.notEqual(
      quoteNumberFromArchiveFileName("DSS 2026-095-1R1 가나상사 MODEL-X1 AB1234 1234567 수리 견적서.xls"),
      null
    );
    // 두 자리 가지 · 두 자리 개정도 같은 모양이다.
    assert.equal(quoteNumberFromArchiveFileName("DSS 2026-095-12R10 가나상사.xls"), "2026-095-12R10");
    // 소문자로 적혀도 한 번호다.
    assert.equal(quoteNumberFromArchiveFileName("dss 2026-095-1r1 가나상사.pdf"), "2026-095-1R1");
  });

  test("🔴 개정이 가지보다 앞에 오는 꼴은 받지 않는다 — 실물을 본 적이 없다", () => {
    // 지금 아는 차례는 **가지 → 개정** 하나뿐이다. 모르는 차례를 미리 받아 두면
    // 그 이름이 처음 들어오는 날 사람이 뜻한 것과 다른 번호를 지어낸다.
    assert.equal(quoteNumberFromArchiveFileName("DSS 2026-095R1-1 가나상사.xls"), null);
    // 겹이 더 붙는 꼴도 마찬가지다.
    assert.equal(quoteNumberFromArchiveFileName("DSS 2026-095-1-2 가나상사.xls"), null);
    assert.equal(quoteNumberFromArchiveFileName("DSS 2026-095R1R2 가나상사.xls"), null);
  });

  test("🔴 `DSS` 뒤가 공백이 아니어도 받는다 — 번호가 자유 입력이라 하이픈이 온다", () => {
    assert.equal(quoteNumberFromArchiveFileName("DSS-2026-099 가나상사 MODEL-X1 수리 견적서.xlsx"), "2026-099");
    assert.equal(quoteNumberFromArchiveFileName("DSS-2026-099-2 가나상사 MODEL-X1.xls"), "2026-099-2");
  });

  test("🔴 번호 뒤에 **공백**이 와야 한다 — 실측의 오타는 못 뽑는 것이 맞다", () => {
    // `DSS 2026-046- ICD …` — 번호 뒤에 공백 대신 `-` 를 찍은 이름이 실제로 있었다.
    assert.equal(quoteNumberFromArchiveFileName("DSS 2026-046- ICD MODEL-X1 수리 견적서.xlsx"), null);
    // 번호 바로 뒤가 확장자여도 못 뽑는다(사람이 적지 않은 번호를 지어내지 않는다).
    assert.equal(quoteNumberFromArchiveFileName("DSS 2026-001.xlsx"), null);
  });

  test("번호가 아닌 파일은 null", () => {
    assert.equal(quoteNumberFromArchiveFileName("단가기재 참고용.XLS"), null);
    // 🔴 머리가 번호가 아닌 이름 — 가운데 숫자 뭉치를 번호로 둔갑시키지 않는다.
    assert.equal(quoteNumberFromArchiveFileName("RFK300FH-AD1_AB1234_1234567 검사보고서.pdf"), null);
    assert.equal(quoteNumberFromArchiveFileName("Thumbs.db"), null);
    assert.equal(quoteNumberFromArchiveFileName(""), null);
    // 모양이 글자가 아니면 던지지 않고 null 이다.
    assert.equal(quoteNumberFromArchiveFileName(undefined as unknown as string), null);
  });

  test("사람이 적은 이름의 흔들림 — 공백 두 칸 · 소문자", () => {
    assert.equal(quoteNumberFromArchiveFileName("DSS  2026-007  가나상사.xlsx"), "2026-007");
    assert.equal(quoteNumberFromArchiveFileName(" DSS 2026-007 가나상사.xlsx"), "2026-007");
    // 대소문자를 접어 보고, 돌려줄 때는 대문자로 맞춘다(같은 번호가 둘로 세어지지 않게).
    assert.equal(quoteNumberFromArchiveFileName("dss 2026-004r1 가나상사.pdf"), "2026-004R1");
  });

  test("🔴 본 번호로 깎지 않는다 — 가지 번호가 있다는 사실이 사라지면 안 된다", () => {
    assert.equal(quoteNumberFromArchiveFileName("DSS 2026-001-1 가나상사.xls"), "2026-001-1");
    assert.notEqual(quoteNumberFromArchiveFileName("DSS 2026-001-1 가나상사.xls"), "2026-001");
  });
});

describe("폴더 하나의 번호들", () => {
  test("중복을 없애고 차례대로", () => {
    assert.deepEqual(
      quoteNumbersFromArchiveFileNames([
        "DSS 2026-001-1 가나상사 MODEL-X1(OH포함).xls",
        "DSS 2026-001 가나상사 MODEL-X1 - 有印.pdf",
        "DSS 2026-001 가나상사 MODEL-X1 수리 견적서.xlsx",
        "Thumbs.db",
        "단가기재 참고용.XLS",
      ]),
      ["2026-001", "2026-001-1"]
    );
  });

  test("번호가 하나도 없으면 빈 배열", () => {
    assert.deepEqual(quoteNumbersFromArchiveFileNames(["단가기재 참고용.XLS", "메모.txt"]), []);
    assert.deepEqual(quoteNumbersFromArchiveFileNames([]), []);
  });

  test("차례는 연도 · 일련번호 순이다", () => {
    assert.deepEqual(
      quoteNumbersFromArchiveFileNames([
        "DSS 2026-010 가나상사.xlsx",
        "DSS 2024-027 가나상사.xlsx",
        "DSS 2026-009 가나상사.xlsx",
        "DSS 2024-027-1 가나상사.xlsx",
      ]),
      ["2024-027", "2024-027-1", "2026-009", "2026-010"]
    );
  });

  /*
   * 🔴 **운영에서 틀리게 돌던 그 폴더 그대로다** (2026-10-12, 사용자가 A/S 의 [고객 안내
   * 현황]에서 찾음). `-1R1` 이 안 뽑혀 그 번호가 통째로 빠져 있었다 — 이 사이트에서는
   * [Excel 보기]가 그 견적서의 엑셀을 못 고르고 결재 탭의 공유폴더 거르기가 그 장의 파일을
   * 하나도 못 보여 주는 증상으로 나타났다.
   * 🔴 머리말대로 고객사명 · 모델 · L/N · S/N 만 가짜다 — 번호 · 파일 수 · 확장자는 실물과 같다.
   */
  test("🔴 운영의 그 폴더 — 여섯 파일에서 번호 셋이 나온다", () => {
    assert.deepEqual(
      quoteNumbersFromArchiveFileNames([
        "DSS 2026-095 가나상사 MODEL-X1 AB1234 1234567 수리 견적서.xls",
        "DSS 2026-095 가나상사 MODEL-X1 AB1234 1234567 수리 견적서 - 有印.pdf",
        "DSS 2026-095-1 가나상사 MODEL-X1 AB1234 1234567 수리 견적서(OH포함).xls",
        "DSS 2026-095-1 가나상사 MODEL-X1 AB1234 1234567 수리 견적서(OH포함).pdf",
        "DSS 2026-095-1R1 가나상사 MODEL-X1 AB1234 1234567 수리 견적서(OH포함).xls",
        "DSS 2026-095-1R1 가나상사 MODEL-X1 AB1234 1234567 수리 견적서(OH포함).pdf",
      ]),
      ["2026-095", "2026-095-1", "2026-095-1R1"]
    );
  });
});
