import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
 * ── 🔴 ㉡ 묶음이 **둘만** 들어왔다 (조각 3c-2) ──────────────────────────
 * A/S 의 같은 시험은 둘을 본다:
 *  ㉠ **판정 자체** — 양식이 있는 종류만 지나가고, 목록에 없는 종류는 막힌다.
 *  ㉡ **막는 자리가 실제로 그 판정을 부르는가** — 저쪽은 다섯 곳(GET 받기 통로 ·
 *     발행 통로 · 미리보기 화면 · 목록 · 편집 화면)의 **원본을 글자로 읽는다.**
 *
 * 조각 3b-1 때는 그 다섯이 이 저장소에 **하나도 없어** ㉡ 을 통째로 뺐다. 2026-09-22
 * (조각 3c-2)에 **둘이 생겼다** — 받기 통로(`api/quotes/[id]/xlsx/route.ts`)와 목록의
 * 받기 링크(`components/quotes/QuoteListSlots.tsx`). 그 둘에 해당하는 단언만 저쪽에서
 * 가져왔다(아래 ㉡).
 *
 * 🔴 **나머지 셋은 가져오지 않았다** — 없는 파일을 읽는 시험은 「무엇이 깨졌는지」가
 * 아니라 「아직 안 왔다」를 말할 뿐이다:
 *   · 미리보기 화면(`quotes/[id]/print/page.tsx`) — **조각 3f**.
 *   · 발행 통로(POST issue · `services/quote-issue.ts`) — **조각 3c-3**(3d 뒤로 미뤘다).
 *   · 편집 화면의 두 단추(`canGetDocument`) — 그 단추가 **발행과 한 벌**이라 3c-3 과
 *     함께 온다(QuoteEditForm 의 머리 단추 자리 주석).
 * 그 셋이 오는 조각이 여기에 한 묶음씩 더한다. A/S 가 그대로 갖고 있다.
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

/**
 * ============================================================================
 * ㉡ 막는 자리 — 🔴 **이 저장소의 두 곳이 같은 판정 하나를 부른다** (조각 3c-2)
 * ============================================================================
 * 위 머리말의 그 둘이다. 원본을 글자로 읽는 것은 이 저장소에서 라우트를 직접 부를 수
 * 없기 때문이다(세션 · DB · 양식 파일이 필요하다) — 이웃 시험들과 같은 장치다
 * (components/quotes/quote-list-screen-source.test.ts 머리말).
 * ============================================================================
 */
const repoUrl = new URL("../../../", import.meta.url);
const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, repoUrl), "utf8").replace(/\r\n/g, "\n");
const flat = (source: string) => source.replace(/\s+/g, " ");

describe("㉡ 막는 자리 — 받기 통로와 목록이 같은 판정을 부른다", () => {
  const xlsxRoute = flat(read("src/app/api/quotes/[id]/xlsx/route.ts"));
  const listSlots = flat(read("src/components/quotes/QuoteListSlots.tsx"));

  test("🔴 GET 받기 통로 — 견적서를 읽은 **직후**, 채우기보다 앞에서 거절한다", () => {
    const at = xlsxRoute.indexOf(
      'if (!canRenderQuoteDocument(quote)) { return fail(501, "KIND_NOT_SUPPORTED", QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE); }'
    );
    assert.ok(at >= 0, "GET 통로가 거절하지 않는다");
    const render = xlsxRoute.indexOf("await renderQuoteWorkbook(quote)");
    assert.ok(render > at, "채우기가 거절보다 앞이다 — 그 사이에 문서가 만들어진다");
    // 감사(EXCEL_EXPORT)도 남지 않아야 한다 — 나가지 않은 문서다.
    assert.ok(xlsxRoute.indexOf("recordQuoteExport({") > at, "감사가 거절보다 앞이다");
  });

  test("🔴 GET 받기 통로 — 엑셀 전용은 **별개의 조건**으로 갈라진다(이 판정 뒤)", () => {
    /**
     * 🔴 이 판정은 **엑셀 전용이면 언제나 참**이다(위 ㉠ 의 그 단언) — 그 장의 문서가
     * 붙인 엑셀이라 앱 양식으로 잘못 나갈 일이 없기 때문이다. 그래서 **그 함수를 고치지
     * 않고** 받기 통로가 그 뒤에서 갈래를 하나 더 둔다(조각 3d-2 — 붙인 엑셀을 그대로).
     * 2026-09-22 ~ 2026-09-23 사이 그 자리는 501 거절이었다(domain/
     * quote-excel-only-download.ts — 3d-2 가 지웠다).
     */
    const kindAt = xlsxRoute.indexOf('fail(501, "KIND_NOT_SUPPORTED"');
    const excelAt = xlsxRoute.indexOf(
      "if (quote.isExcelOnly) return sendAttachedExcel(quote, actingUser.id);"
    );
    assert.ok(excelAt >= 0, "엑셀 전용 갈래가 없다 — 품목 없는 빈 견적서가 나간다");
    assert.ok(excelAt > kindAt, "두 조건이 한 덩이가 되었다 — 판정 함수를 고친 것이 아닌지 볼 것");
    assert.ok(xlsxRoute.indexOf("await renderQuoteWorkbook(quote)") > excelAt, "채우기가 갈래보다 앞이다");
    // 🔴 앱 양식 길의 감사는 그 갈래 **뒤**다 — 엑셀 전용 장이 양식 길의 기록을 남기지
    //    않는다. 붙인 엑셀 쪽 감사는 sendAttachedExcel 안에 따로 있고, 그 자리가 전송보다
    //    앞인지는 api/quotes/xlsx-route-source.test.ts 가 본다.
    assert.ok(xlsxRoute.indexOf("recordQuoteExport({") > excelAt, "감사가 갈래보다 앞이다");
  });

  test("🔴 목록의 받기 링크 — 그 줄에는 받기를 내밀지 않는다", () => {
    // 🔴 링크 대신 **꺼진 단추**를 세운다(2026-09-22 눈 확인 — 단추 칸이 모든 줄에서
    //    같아야 한다). 문장은 이 판정이 돌려주는 그 하나다.
    assert.ok(
      listSlots.includes(
        "if (!canRenderQuoteDocument(row)) { return <UnavailableDownload reason={QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE} />; }"
      ),
      "목록의 받기가 그 판정을 부르지 않는다"
    );
    // 링크보다 앞이다 — 뒤에 있으면 링크가 이미 그려진다.
    const at = listSlots.indexOf("if (!canRenderQuoteDocument(row))");
    assert.ok(listSlots.indexOf("href={`/api/quotes/${row.id}/xlsx`}") > at, "링크가 판정보다 앞이다");
    // 표와 카드 두 곳이 **같은 조각**을 쓴다 — 슬롯이 하나라 화면이 그 값을 둘에 건다
    // (그것을 보는 것은 quote-list-screen-source.test.ts 의 「표와 카드가 같은 슬롯을
    // 받는다」다). 여기서는 이 사이트가 그 슬롯에 넣은 것이 하나임을 본다.
    assert.equal(listSlots.split("<QuoteDownloadLink row={row} />").length - 1, 1);
  });

  test("🔴 두 곳 어디에도 종류를 손으로 적은 갈림이 없다 — 판정은 한 곳이다", () => {
    for (const [name, source] of [
      ["GET 받기 통로", xlsxRoute],
      ["목록의 받기 링크", listSlots],
    ] as const) {
      assert.ok(!source.includes('=== "CABLE"'), `${name} 가 종류를 손으로 가른다`);
      assert.ok(!source.includes('!== "CABLE"'), `${name} 가 종류를 손으로 가른다`);
      // 🔴 종류 이름을 담은 목록을 제 손으로 적은 자리도 없어야 한다(그 목록은
      //    판정 안에만 있다 — 두 곳이 되면 한쪽만 고쳐지는 날이 온다).
      assert.ok(!/\["DOMESTIC"|"OVERHAUL",/.test(source), `${name} 가 양식 목록을 제 손으로 적었다`);
    }
  });
});
