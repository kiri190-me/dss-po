import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  putNewQuoteExcelHandoff,
  takeNewQuoteExcelHandoff,
  type NewQuoteExcelHandoff,
} from "./new-quote-excel-handoff";

/**
 * ============================================================================
 * 「새 견적서」 팝업 → 작성 화면의 인계 상자 (견적서 ⑤b)
 * ============================================================================
 * 🔴 **A/S 에는 이 시험이 없다** — 조각 3d-6a 에서 새로 적었다. 상자는 모듈 하나에 값
 * 하나를 두는 아주 작은 것이지만, 그 하나가 **틀리면 엉뚱한 고객의 견적서 파일이 말없이
 * 붙는다.** 그래서 「꺼내면 비운다」와 「담을 것이 없을 때도 비운다」 둘을 값으로 잰다.
 *
 * ── 🔴 줄 차례가 곧 시험 차례다 ──────────────────────────────────────────
 * 상자는 **모듈 수준의 변수 하나**다(파일마다 새로 만들어지지 않는다). 그래서 첫 시험은
 * 「아무도 담지 않은 처음」을 재고, 나머지는 저마다 담는 것부터 시작한다. node --test 는
 * 한 파일 안의 top-level 시험을 적힌 차례대로 하나씩 돌린다.
 * ============================================================================
 */

function excelFile(name = "수기견적서.xlsx"): File {
  // .xlsx 의 첫 네 바이트(PK\x03\x04) — 상자는 속을 보지 않지만 진짜 파일 모양으로 둔다.
  return new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], name);
}

describe("인계 상자 — 팝업이 고른 수기 견적서 엑셀 하나를 작성 화면으로 나른다", () => {
  test("🔴 아무도 담지 않았으면 비어 있다 — 새로고침 · 주소 직접 입력 · 북마크의 보통 상태", () => {
    assert.equal(takeNewQuoteExcelHandoff(), null);
  });

  test("담고 꺼내면 **같은 것**이 나온다 — 파일은 사본이 아니라 고른 그 객체 그대로다", () => {
    const file = excelFile();
    const handoff: NewQuoteExcelHandoff = { file, sheetIndex: 1 };
    putNewQuoteExcelHandoff(handoff);

    const taken = takeNewQuoteExcelHandoff();
    assert.notEqual(taken, null);
    assert.equal(taken?.file, file, "폼이 받는 것이 사람이 고른 그 파일이 아니다");
    assert.equal(taken?.sheetIndex, 1);
  });

  test("🔴 한 번 꺼내면 비운다 — 두 번째는 null(뒤로가기로 돌아와도 엉뚱한 파일이 안 붙는다)", () => {
    putNewQuoteExcelHandoff({ file: excelFile(), sheetIndex: 0 });

    assert.notEqual(takeNewQuoteExcelHandoff(), null);
    assert.equal(takeNewQuoteExcelHandoff(), null, "꺼낸 뒤에도 상자에 파일이 남아 있다");
  });

  test("🔴 `put(null)` 이 비운다 — [만들기]가 파일 없이 갈 때 앞서 고르다 만 것이 안 따라간다", () => {
    putNewQuoteExcelHandoff({ file: excelFile("앞서 고르다 만 것.xlsx"), sheetIndex: 2 });
    putNewQuoteExcelHandoff(null);

    assert.equal(takeNewQuoteExcelHandoff(), null, "비웠는데도 앞서 담은 것이 남아 있다");
  });

  test("자리는 하나 — 뒤에 담은 것이 앞의 것을 덮는다(팝업은 한 번에 하나만 열린다)", () => {
    const first = excelFile("먼저.xlsx");
    const second = excelFile("나중.xlsx");
    putNewQuoteExcelHandoff({ file: first, sheetIndex: 0 });
    putNewQuoteExcelHandoff({ file: second, sheetIndex: 3 });

    const taken = takeNewQuoteExcelHandoff();
    assert.equal(taken?.file, second, "앞서 담은 파일이 뒤의 것을 이겼다");
    assert.equal(taken?.sheetIndex, 3);
    assert.equal(takeNewQuoteExcelHandoff(), null, "덮인 앞의 것이 따로 남아 있다");
  });

  test("시트를 못 고른 것(sheetIndex null)도 그대로 나른다 — 통로가 혼자 고르게 둔다", () => {
    putNewQuoteExcelHandoff({ file: excelFile(), sheetIndex: null });

    const taken = takeNewQuoteExcelHandoff();
    assert.notEqual(taken, null);
    assert.equal(taken?.sheetIndex, null, "지정하지 않은 시트 차례가 숫자로 바뀌었다");
  });

  test("비운 뒤에도 상자는 다시 쓸 수 있다 — 팝업을 닫았다 다시 열어도 된다", () => {
    putNewQuoteExcelHandoff({ file: excelFile("첫 번째.xlsx"), sheetIndex: 0 });
    takeNewQuoteExcelHandoff();

    const again = excelFile("두 번째.xlsx");
    putNewQuoteExcelHandoff({ file: again, sheetIndex: 1 });
    assert.equal(takeNewQuoteExcelHandoff()?.file, again);
  });
});
