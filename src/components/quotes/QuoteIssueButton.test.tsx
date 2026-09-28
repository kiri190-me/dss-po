import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import QuoteIssueButton, { QUOTE_ISSUE_BUTTON_TITLE, QuoteIssueNoticeLines } from "./QuoteIssueButton";

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
