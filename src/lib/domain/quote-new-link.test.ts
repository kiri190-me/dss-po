import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  newQuoteHrefWithStart,
  parseNewQuoteStart,
  type SearchParamsInput,
} from "./quote-new-link";

/**
 * ============================================================================
 * [새 견적서] 팝업이 고른 두 값을 주소로 나르기 (조각 3e-3)
 * ============================================================================
 * 원본은 A/S 의 같은 이름 시험(`src/lib/domain/quote-new-link.test.ts`, 358줄 —
 * 2026-09-28 실측)이고, 여기 온 것은 그 파일의 **뒤 절반**(「[새 견적서] 팝업 → 새
 * 견적서」)이다. 앞 절반이 재는 수리 건 ↔ 견적서 오가기는 **이 사이트에 오지
 * 않았다** — 그쪽 함수들이 만드는 주소가 `/repair-cases/{id}/quotes` 인데 이
 * 사이트에는 그 경로가 없다(quote-new-link.ts 머리말의 「안 가져온 것」).
 *
 * 🔴 그래서 저쪽이 「수리 건 주소에 덧붙여도 인수번호 · 건 id 가 떨어지지 않는다」로
 * 재던 불변식은 여기서 **이름 없는 쿼리**로 잰다 — 지키려는 것은 같다: 덧붙이기가
 * `baseHref` 에 이미 실린 이름을 건드리지 않는다.
 *
 * 🔴 맨 아래 한 묶음은 **Ⓐ(수리 건 몫)의 이름이 이 파일에 하나도 없음**을 글자로
 * 못 박는다 — 그것이 「없는 수리 건 화면으로 보내지 않는다」를 지킨다. 저장소 전체를
 * 훑는 같은 단언은 components/quotes/quote-list-screen-source.test.ts 에 있다.
 * ============================================================================
 */

/** 주소를 만든 뒤 팝업의 두 값을 되읽는다 — 브라우저가 그 주소로 들어오는 것 그대로. */
function startRoundTrip(href: string) {
  const query = new URL(href, "https://example.invalid").searchParams;
  return parseNewQuoteStart(Object.fromEntries(query.entries()));
}

test("🔴 덧붙이기 — 맨 `/quotes/new` 에 종류를 싣고, 엑셀 전용은 켰을 때만 `1` 로 싣는다", () => {
  assert.equal(newQuoteHrefWithStart("/quotes/new", { kind: "DOMESTIC", excelOnly: false }), "/quotes/new?kind=DOMESTIC");
  assert.equal(newQuoteHrefWithStart("/quotes/new", { kind: "OVERHAUL", excelOnly: false }), "/quotes/new?kind=OVERHAUL");
  assert.equal(
    newQuoteHrefWithStart("/quotes/new", { kind: "OVERHAUL", excelOnly: true }),
    "/quotes/new?kind=OVERHAUL&excelOnly=1"
  );
  assert.equal(newQuoteHrefWithStart("/quotes/new", { kind: "CABLE", excelOnly: false }), "/quotes/new?kind=CABLE");
  assert.deepEqual(startRoundTrip(newQuoteHrefWithStart("/quotes/new", { kind: "DOMESTIC", excelOnly: true })), {
    kind: "DOMESTIC",
    excelOnly: true,
  });
});

test("🔴 덧붙이기 — 이미 실려 있던 이름은 한 글자도 떨어지지 않는다", () => {
  // 🔴 `baseHref` 는 **주소를 짓는 쪽이 만든 글자**다(팝업을 부르는 곳). 그러니 여기서도
  //    URLSearchParams 로 짓는다 — 손으로 적으면 같은 값이라도 인코딩 모양이 달라
  //    (`%20` ↔ `+`) 「앞부분이 그대로다」가 거짓이 된다.
  for (const value of ["abc", "D26/07 06&x=1"]) {
    const base = `/quotes/new?${new URLSearchParams({ ref: value }).toString()}`;
    for (const choice of [
      { kind: "DOMESTIC", excelOnly: false },
      { kind: "OVERHAUL", excelOnly: true },
    ] as const) {
      const href = newQuoteHrefWithStart(base, choice);
      // 기존 주소 뒤에 덧붙을 뿐이다 — 앞부분은 그대로다.
      assert.ok(href.startsWith(`${base}&`), href);
      // 되읽은 기존 값이 덧붙이기 전과 같다.
      const before = new URL(base, "https://example.invalid").searchParams.get("ref");
      const after = new URL(href, "https://example.invalid").searchParams.get("ref");
      assert.equal(after, before, href);
      assert.deepEqual(startRoundTrip(href), choice);
    }
  }
});

test("덧붙이기는 두 이름을 정한다 — 이미 있으면 바꾸고, 엑셀 전용이 아니면 그 이름을 뺀다", () => {
  // 같은 이름이 둘이 되면 되읽기가 없는 것으로 친다 — 두 번 덧붙여도 하나다.
  const twice = newQuoteHrefWithStart(
    newQuoteHrefWithStart("/quotes/new", { kind: "OVERHAUL", excelOnly: true }),
    { kind: "DOMESTIC", excelOnly: false }
  );
  assert.equal(twice, "/quotes/new?kind=DOMESTIC");
  assert.deepEqual(startRoundTrip(twice), { kind: "DOMESTIC", excelOnly: false });
});

test("덧붙이기는 조각(#)을 맨 뒤에 둔다 — 쿼리가 조각의 글자가 되지 않게", () => {
  assert.equal(
    newQuoteHrefWithStart("/quotes/new?ref=D1#top", { kind: "OVERHAUL", excelOnly: true }),
    "/quotes/new?ref=D1&kind=OVERHAUL&excelOnly=1#top"
  );
});

test("🔴 되읽기 — 두 값이 없으면 지금과 같다(내자 · 엑셀 전용 아님)", () => {
  for (const searchParams of [undefined, {}, { ref: "abc" }] as (SearchParamsInput | undefined)[]) {
    assert.deepEqual(parseNewQuoteStart(searchParams), { kind: null, excelOnly: false });
  }
});

test("되읽기 — 정해진 값은 그대로 받는다", () => {
  assert.deepEqual(parseNewQuoteStart({ kind: "DOMESTIC" }), { kind: "DOMESTIC", excelOnly: false });
  assert.deepEqual(parseNewQuoteStart({ kind: "OVERHAUL" }), { kind: "OVERHAUL", excelOnly: false });
  assert.deepEqual(parseNewQuoteStart({ kind: "CABLE" }), { kind: "CABLE", excelOnly: false });
  assert.deepEqual(parseNewQuoteStart({ kind: "OVERHAUL", excelOnly: "1" }), { kind: "OVERHAUL", excelOnly: true });
  // 종류 없이 엑셀 전용만 와도 그것만 받는다 — 폼은 내자 · 엑셀 전용으로 연다.
  assert.deepEqual(parseNewQuoteStart({ excelOnly: "1" }), { kind: null, excelOnly: true });
});

test("🔴 되읽기 — 정해지지 않은 종류 · 빈 값 · 배열은 없는 것으로 친다", () => {
  for (const odd of ["overhaul", "Overhaul", "OH", " OVERHAUL", "OVERHAUL ", "", "DOMESTIC,OVERHAUL", "__proto__", "toString"]) {
    assert.equal(parseNewQuoteStart({ kind: odd }).kind, null, `${JSON.stringify(odd)} 가 통과했다`);
  }
  for (const array of [["OVERHAUL"], ["OVERHAUL", "DOMESTIC"], ["DOMESTIC", "DOMESTIC"], []]) {
    assert.equal(parseNewQuoteStart({ kind: array }).kind, null, `배열 ${JSON.stringify(array)} 가 통과했다`);
  }
});

test("🔴 되읽기 — 엑셀 전용은 `1` 하나만 참이다", () => {
  for (const odd of ["true", "TRUE", "0", "", " 1", "1 ", "01", "yes", "on"]) {
    assert.equal(parseNewQuoteStart({ excelOnly: odd }).excelOnly, false, `${JSON.stringify(odd)} 가 통과했다`);
  }
  for (const array of [["1"], ["1", "1"], []]) {
    assert.equal(parseNewQuoteStart({ excelOnly: array }).excelOnly, false, `배열 ${JSON.stringify(array)} 가 통과했다`);
  }
});

test("🔴 수리 건 몫(Ⓐ)의 이름이 이 파일에 하나도 없다 — 없는 화면으로 보내는 주소를 짓지 않는다", () => {
  const source = readFileSync(new URL("./quote-new-link.ts", import.meta.url), "utf8");
  // 🔴 **주석을 뺀 코드만** 본다 — 이 파일의 머리말이 「안 가져왔다」고 그 이름들을 그대로
  //    적어 두고 있어, 원본을 통째로 훑으면 그 설명이 걸린다(시험이 설명을 지우라고
  //    요구하게 된다 — quote-list-screen-source.test.ts 의 `codeOf` 와 같은 판단).
  const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  for (const name of [
    "newQuoteHrefForRepairCase",
    "parseNewQuoteLink",
    "returnHrefForNewQuote",
    "quoteEditHref",
    "trustedLinkedRepairCaseId",
    "returnHrefForEditQuote",
    "quotePrintHref",
    "returnHrefForQuotePrint",
    "repair-case-detail-tabs",
    "/repair-cases",
    "QUOTE_NEW_INTAKE_NUMBER_PARAM",
    "QUOTE_NEW_REPAIR_CASE_PARAM",
  ]) {
    assert.equal(code.includes(name), false, `${name} 이 코드에 살아 있다`);
  }
  // 이 파일이 내보내는 것은 팝업의 두 값 몫뿐이다.
  assert.equal(code.includes("export function newQuoteHrefWithStart("), true);
  assert.equal(code.includes("export function parseNewQuoteStart("), true);
  assert.equal(code.split("export function ").length - 1, 2, "내보내는 함수가 둘이 아니다");
});
