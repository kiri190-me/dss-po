import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE,
  canRenderQuoteDocument,
} from "./quote-document-support";
import { STORED_QUOTE_KINDS, quoteKindLabels } from "@/lib/validation/quote-input";

/**
 * ============================================================================
 * 잘못된 문서가 나가는 길이 막혀 있는가 (2026-09-16 케이블 ③)
 * ============================================================================
 * 케이블 견적서를 만들 수 있게 된 순간, 그 장을 **내자 양식으로 그리고 채우는 길**이
 * 함께 열렸다 — 미리보기 화면 · GET 받기 통로 · 발행 통로(POST issue) 셋이 전부 종류를
 * 보지 않고 앱 양식을 쓴다. 화면에서 단추를 감추는 것으로는 주소를 직접 여는 길이 남는다.
 *
 * 2026-09-17(케이블 ④)에 케이블 양식과 그 미리보기가 붙어 **그 종류의 문은 열렸다.**
 * 판정과 다섯 자리는 그대로 남는다 — 다음 종류를 막아 주는 장치가 이것이다.
 *
 * ── 🔴 옮겨 오면서 ㉡ 묶음을 뺐다 (조각 3b-1) ───────────────────────────
 * A/S 의 같은 시험은 둘을 본다:
 *  ㉠ **판정 자체** — 양식이 있는 종류만 지나가고, 목록에 없는 종류는 막힌다.
 *  ㉡ **막는 자리가 실제로 그 판정을 부르는가** — 다섯 곳(GET 받기 통로 · 발행 통로 ·
 *     미리보기 화면 · 목록 · 편집 화면)의 **원본을 글자로 읽는다.**
 *
 * 🔴 **그 다섯 자리가 이 저장소에 하나도 없다.** 받기 통로 둘과 미리보기 화면은 조각
 * 3c·3f 의 것이고, 목록의 받기 · 미리보기 링크는 목록 화면의 `renderRowActions`
 * 슬롯(3c·3f)이며, 편집 화면의 두 단추도 그때 온다(QuoteEditForm 머리말 ②③).
 * 없는 파일을 읽는 시험은 「무엇이 깨졌는지」가 아니라 「아직 안 왔다」를 말할 뿐이라,
 * **그 묶음은 그 자리들이 생기는 조각에서 함께 온다.** A/S 가 그대로 갖고 있다.
 *
 * 남긴 ㉠ 은 **순수 함수 하나**를 본다 — 부르는 자리가 없어도 규칙은 지금 여기 있고
 * (quote-document-support.ts 머리말), 그 규칙이 「할 수 있는 쪽을 적는다」로 남아
 * 있는지가 다음 종류를 지켜 준다.
 * ============================================================================
 */

describe("㉠ 판정 — 앱 양식이 있는 종류만 지나간다", () => {
  test("🔴 내자 · OH 는 지금 그대로 지나간다", () => {
    assert.equal(canRenderQuoteDocument({ kind: "DOMESTIC", isExcelOnly: false }), true);
    assert.equal(canRenderQuoteDocument({ kind: "OVERHAUL", isExcelOnly: false }), true);
  });

  test("🔴 케이블도 지나간다 — 제 양식과 제 미리보기가 붙었다(2026-09-17 케이블 ④)", () => {
    assert.equal(canRenderQuoteDocument({ kind: "CABLE", isExcelOnly: false }), true);
  });

  test("🔴 엑셀 전용이면 종류를 보지 않는다 — 그 장의 문서는 손으로 만든 엑셀이다", () => {
    for (const kind of STORED_QUOTE_KINDS) {
      assert.equal(
        canRenderQuoteDocument({ kind, isExcelOnly: true }),
        true,
        `${kind} 엑셀 전용 장이 막혔다 — 앱 양식을 쓰지 않는 장이다`
      );
    }
  });

  test("🔴 새 종류는 일단 막힌다 — 할 수 있는 쪽을 적어 두었다", () => {
    /**
     * 지금은 DB 가 내줄 수 있는 셋이 다 열려 있다. 🔴 그래도 **적는 방식이 남아 있는지**를
     * 본다 — 「할 수 있는 쪽을 적는다」를 「막을 쪽을 적는다」로 뒤집으면 이 단언은 그대로
     * 지나가면서, 넷째 종류가 생기는 날 그 종류가 조용히 뚫린다. 그래서 목록에 없는 이름을
     * 하나 넣어 **거절하는지**까지 함께 본다.
     */
    const allowed = STORED_QUOTE_KINDS.filter((kind) => canRenderQuoteDocument({ kind, isExcelOnly: false }));
    assert.deepEqual([...allowed], [...STORED_QUOTE_KINDS]);
    assert.equal(
      canRenderQuoteDocument({ kind: "SOMETHING_NEW" as never, isExcelOnly: false }),
      false,
      "아직 양식이 없는 종류가 지나간다 — 남의 양식으로 문서가 나간다"
    );
  });

  test("거절 문장은 「오류」가 아니라 아직 안 되는 일이라고 말한다", () => {
    assert.match(QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE, /미리보기 · 견적서 받기/);
    assert.match(QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE, /다음 차례/);
    // 지금 할 수 있는 일도 말한다 — 사람이 적어 둔 것이 사라진 줄 알면 안 된다.
    assert.match(QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE, /저장/);
    /**
     * 🔴 **종류 이름을 적지 않는다.** 예전에는 「케이블 견적서는 아직 …」이었고, 케이블
     * 양식이 붙은 날 그 문장은 틀린 말이 되었다(2026-09-17 케이블 ④). 다섯 자리가 이 한
     * 문장을 그대로 보여 주므로, 이름이 박혀 있으면 다음 종류가 열릴 때마다 사람에게
     * 엉뚱한 종류를 말하게 된다.
     */
    for (const label of Object.values(quoteKindLabels)) {
      assert.ok(
        !QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE.includes(label),
        `거절 문장이 「${label}」 를 이름으로 박아 두었다`
      );
    }
  });
});
