import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import QuoteIssueButton, { QUOTE_ISSUE_BUTTON_TITLE, QuoteIssueNoticeLines } from "./QuoteIssueButton";
// 🔴 조각 3f — 아래 뒤 두 묶음이 그리는 화면.
import QuotePrintView, { type QuotePrintData } from "./QuotePrintView";

/**
 * ============================================================================
 * 🔴 A/S 에서 가져온 시험이다 — 못 가져온 묶음 둘 (조각 PO 3c-3, 2026-09-28)
 * ============================================================================
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/components/quotes/QuoteIssueButton.test.tsx` —
 * 2026-09-28 실측 158줄). 앞의 두 묶음(**단추** · **결과 줄**)은 **한 글자도
 * 고치지 않고** 그대로 왔다.
 *
 * 🔴 **뒤의 두 묶음은 못 가져왔다** — 「인쇄 미리보기 — 앱 양식」과 「인쇄
 * 미리보기 — 엑셀 전용 갈래도 같다」. 둘 다 `QuotePrintView` 를 그려 보는데 그
 * 화면이 **이 사이트에 없다**(조각 3f — 인쇄 · 미리보기). 없는 파일을 그리는
 * 시험은 「무엇이 깨졌는지」가 아니라 「아직 안 왔다」를 말할 뿐이다. 🔴 **조각
 * 3f 가 그 둘을 여기에 더한다** — A/S 가 그대로 갖고 있다(그쪽 74~158줄, 그
 * 묶음들이 쓰는 `HEADER` · `NORMAL` · `EXCEL_ONLY` · `render` 도 함께).
 *
 * ⚠️ 위는 **그때의 기록**이다. 🔴 **조각 3f 가 왔다**(2026-09-28) — 뒤 두 묶음이
 * 이 파일 맨 아래에 **저쪽과 바이트 동일**로 들어왔다. 🔴 **이제 이 파일은 저쪽
 * 158줄을 통째로 갖고 있다** — 기다리는 묶음이 없다.
 * ============================================================================
 */

/**
 * ============================================================================
 * 수정 권한자의 [견적서 받기] 단추 (견적서 B1c)
 * ============================================================================
 * 단추는 발행 통로(POST)를 부르므로 **링크가 아니다** — 주소 한 줄로 공유폴더에 파일이 생기면
 * 안 된다. 누른 뒤의 흐름(저장하지 않은 변경 · 결과 줄)은 runQuoteIssue 를 값으로 보는
 * quote-issue-download.test.ts 에 있다.
 * ============================================================================
 */

describe("단추", () => {
  test("🔴 링크가 아니라 단추다 — 설명(title)을 달고, 받기 주소가 어디에도 없다", () => {
    const html = renderToStaticMarkup(<QuoteIssueButton quoteId="q-1" label="견적서 받기" className="btn" />);
    assert.ok(html.includes('<button type="button"'), html);
    assert.ok(html.includes(">견적서 받기</button>"), html);
    assert.ok(html.includes("data-quote-issue"), html);
    assert.ok(html.includes(`title="${QUOTE_ISSUE_BUTTON_TITLE}"`), html);
    assert.ok(!html.includes("href="), html);
    assert.ok(!html.includes("/api/quotes/"), html);
  });

  test("잠그라면 잠긴다(저장 중 · 충돌)", () => {
    const html = renderToStaticMarkup(<QuoteIssueButton quoteId="q-1" label="견적서 받기" className="btn" disabled />);
    assert.ok(html.includes('disabled=""'), html);
  });

  test("누르기 전에는 결과 줄이 없다 — 부르는 쪽이 그리면 감싸는 상자도 없다", () => {
    const beside = renderToStaticMarkup(<QuoteIssueButton quoteId="q-1" label="견적서 받기" className="btn" />);
    assert.ok(!beside.includes('role="status"'), beside);
    const parent = renderToStaticMarkup(
      <QuoteIssueButton quoteId="q-1" label="견적서 받기" className="btn" showNotice={false} />
    );
    assert.ok(parent.startsWith("<button"), parent);
  });
});

describe("결과 줄", () => {
  test("결마다 색이 다르다 — 흐림 · 주의", () => {
    const html = renderToStaticMarkup(
      <QuoteIssueNoticeLines
        lines={[
          { text: "공유폴더에 저장했습니다: 2026/견적서/a.xlsx", tone: "normal" },
          { text: "공유폴더 저장이 꺼져 있습니다", tone: "muted" },
          { text: "엑셀 칸에 올리지 못했습니다(x)", tone: "warning" },
        ]}
      />
    );
    assert.ok(html.includes('role="status"'), html);
    assert.ok(html.includes("text-zinc-400") && html.includes("공유폴더 저장이 꺼져 있습니다"), html);
    assert.ok(html.includes("text-amber-700"), html);
    assert.ok(html.includes("break-all"), "긴 경로가 줄바꿈되지 않는다");
  });

  test("🔴 흰 종이 위(onPaper)에서는 다크 모드 색을 쓰지 않는다", () => {
    const html = renderToStaticMarkup(
      <QuoteIssueNoticeLines onPaper lines={[{ text: "공유폴더 저장이 꺼져 있습니다", tone: "muted" }]} />
    );
    assert.ok(!html.includes("dark:"), html);
  });

  test("줄이 없으면 아무것도 그리지 않는다", () => {
    assert.equal(renderToStaticMarkup(<QuoteIssueNoticeLines lines={[]} />), "");
  });
});

/**
 * ============================================================================
 * 🔴 조각 3f 가 되돌려 놓은 뒤 두 묶음 (2026-09-28)
 * ============================================================================
 * 위 머리말이 「🔴 조각 3f 가 그 둘을 여기에 더한다 — A/S 가 그대로 갖고 있다
 * (그쪽 74~158줄, 그 묶음들이 쓰는 HEADER · NORMAL · EXCEL_ONLY · render 도 함께)」
 * 라고 적어 둔 그것이다. **저쪽 73~158줄을 바이트 동일로** 가져왔다.
 *
 * 🔴 이 둘이 재는 것이 이 조각에서 가장 값지다 — **미리보기의 [받기]도 발행 단추**
 * 라는 것. 보기 권한자에게는 지금까지의 링크이고, 수정 권한자에게만 공유폴더 저장 ·
 * 엑셀 칸 교체가 붙은 POST 단추다. 화면이 하나 늘었는데 그 갈림이 안 따라오면,
 * 보기 권한자가 미리보기에서 사람의 서류함을 바꾸게 된다.
 *
 * 🔴 「겹쳐 뜬 미리보기」 묶음도 여기 있다 — **돌아가기가 링크가 아니라 닫기 단추**다.
 * 이 사이트에는 수리 건 화면이 없어 사이트를 건너가는 주소를 한 줄도 만들지 않는데,
 * 그 단언이 그것을 함께 지킨다(`!html.includes("/xlsx")`).
 * ============================================================================
 */


type Props = Parameters<typeof QuotePrintView>[0];

const HEADER: Props["header"] = {
  companyName: null,
  ceoLine: null,
  address: null,
  tel: null,
  fax: null,
  email: null,
  homepage: null,
  defaultValidity: null,
  defaultDelivery: null,
  defaultPayment: null,
  bankAccount: null,
};

const NORMAL: QuotePrintData = {
  quoteNumber: "Q-2026-0001",
  quoteDate: "2026-09-01",
  customerNameText: "주성 엔지니어링",
  subject: "MBK200-JS3 수리",
  validity: null,
  delivery: null,
  payment: null,
  modelNameText: "MBK200-JS3",
  serialNumberText: "1708075",
  lotNumberText: null,
  workCost: "300000",
  items: [{ partId: null, partNameText: "커넥터 SMA", isOverhaulPart: false, quantity: 2, unitPrice: "12000" }],
};

const EXCEL_ONLY: QuotePrintData = { ...NORMAL, items: [], workCost: "0", isExcelOnly: true, manualSupplyAmount: "1500000" };

function render(overrides: Partial<Props> & { quote: QuotePrintData }): string {
  return renderToStaticMarkup(<QuotePrintView header={HEADER} quoteId="q-1" {...overrides} />);
}

describe("인쇄 미리보기 — 앱 양식", () => {
  test("🔴 수정 권한(canIssue)이면 「Excel 받기」가 발행 단추다 — 링크가 없다", () => {
    const html = render({ quote: NORMAL, canIssue: true });
    assert.ok(html.includes("data-quote-issue"), html);
    assert.ok(html.includes(">Excel 받기</button>"), html);
    assert.ok(!html.includes("/xlsx"), "보기 권한자의 링크가 함께 그려졌다");
  });

  test("🔴 권한을 안 주거나 거짓이면 지금 링크 그대로 — 보기 권한자 화면에 부작용 단추가 없다", () => {
    for (const html of [render({ quote: NORMAL }), render({ quote: NORMAL, canIssue: false })]) {
      assert.ok(html.includes('href="/api/quotes/q-1/xlsx"'), html);
      assert.ok(!html.includes("data-quote-issue"), html);
    }
    assert.equal(render({ quote: NORMAL, canIssue: false }), render({ quote: NORMAL }), "안 준 것과 거짓은 같은 화면이다");
  });

  test("저장 전(quoteId 없음)에는 수정 권한이어도 받을 수 없다고 적는다", () => {
    const html = render({ quote: NORMAL, quoteId: null, onClose: () => {}, canIssue: true });
    assert.ok(html.includes("Excel 은 저장한 뒤에 받을 수 있습니다"), html);
    assert.ok(!html.includes("data-quote-issue"), html);
  });

  test("겹쳐 뜬 미리보기(편집 폼 안)에서도 같은 단추다 — 돌아가기는 닫기 단추 그대로", () => {
    const html = render({ quote: NORMAL, onClose: () => {}, canIssue: true, hasUnsavedChanges: true });
    assert.ok(html.includes("data-quote-issue"), html);
    assert.ok(html.includes("← 편집으로 돌아가기"), html);
    assert.ok(!html.includes("/xlsx"), html);
  });
});

describe("인쇄 미리보기 — 엑셀 전용 갈래도 같다", () => {
  test("🔴 수정 권한이면 「견적서 받기」가 발행 단추다", () => {
    const html = render({ quote: EXCEL_ONLY, canIssue: true, signedPdf: null, hasExcel: true });
    assert.ok(html.includes("data-quote-issue"), html);
    assert.ok(html.includes(">견적서 받기</button>"), html);
    assert.ok(!html.includes("/api/quotes/q-1/xlsx"), html);
    // 올리기 · 지우기 단추는 여전히 없다 — 받기 단추 하나만 바뀌었다.
    for (const absent of ['type="file"', ">지우기<", ">파일 올리기<", ">바꾸기<"]) {
      assert.ok(!html.includes(absent), `미리보기에 '${absent}' 가 있다`);
    }
  });

  test("권한을 안 주면 링크 그대로", () => {
    const html = render({ quote: EXCEL_ONLY, signedPdf: null, hasExcel: true });
    assert.ok(html.includes('href="/api/quotes/q-1/xlsx"'), html);
    assert.ok(!html.includes("data-quote-issue"), html);
  });
});
