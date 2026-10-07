import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * ============================================================================
 * 🔴 견적서를 브라우저로 내려받는 길이 화면에 하나도 없다 (2026-10-07)
 * ============================================================================
 * 2026-09-15(견적서 B1c)에는 세 화면(목록 · 편집 · 인쇄 미리보기)이 수정 권한자에게 발행
 * 단추(POST /api/quotes/{id}/issue — 공유폴더 저장 · 엑셀 칸 교체 · 내려주기)를 그리고,
 * 보기 권한자에게는 받기 링크(GET …/xlsx)를 주었다. 사용자가 받는 곳을 **사내 공유폴더
 * 하나로 모으기로** 했고(A/S 가 2026-10-06 에 먼저 했다), **네 자리에서 받기를 모두
 * 걷어냈다** — 목록 줄(앞 조각), 편집 화면 머리, 인쇄 미리보기 두 갈래(앱 양식 · 엑셀 전용).
 * 견적서 엑셀은 [저장]이 공유폴더에 넣고(server/actions/quotes.ts 의
 * archiveQuoteDocumentOnSave), 그 폴더로 가는 길은 목록 줄의 [Excel 보기] · 수정 화면
 * 머리의 [폴더 열기] 둘이다(quote-list-screen-source.test.ts 가 그 둘을 못 박는다).
 *
 * 불변식 넷:
 *  (a) 🔴 **어느 화면에도 발행 단추(QuoteIssueButton)가 없다.**
 *  (b) 🔴 **어느 화면에도 받기 주소(`/xlsx`)가 없다** — 슬그머니 되살아나면 여기서 깨진다.
 *  (c) 못 하는 일은 말없이 감추지 않는다 — 같은 문장 하나로 까닭을 적는다.
 *  (d) 통로 · 조각 · 결과 줄은 살아 있다 — 결재 PDF 올리기가 같은 문장 함수를 쓴다.
 *
 * ── ⚠️ 아래는 **그때의 기록**이다 ────────────────────────────────────────
 * 결재 PDF 올리기 · [견적서 받기] 뒤 — 화면이 결과를 제자리에서 보이는가 (조각 3c-3b)
 * ============================================================================
 * 🔴 A/S 관리 시스템의 **같은 이름 · 같은 경로** 시험
 * (`RF_Service_System/src/components/quotes/quote-issue-screens.test.ts` — 2026-09-28
 * 실측 200줄)에서 **두 묶음만** 가져왔다. 아래 단언은 저쪽 글자 그대로다.
 *
 * ── 🔴 왜 이 시험이 있어야 하나 — 이 조각이 고친 「조용한 고장」 ─────────────
 * 결재 PDF 를 올리면 서버가 그 파일을 사내 공유폴더에도 복사한다(3c-3b 가 이은 자리 —
 * api/quotes/[id]/attachments/route.ts 머리말). 🔴 **그 복사가 실패해도 올리기는
 * 성공이다** — 응답은 201 이고 칸에도 붙는다. 그래서 **화면이 말해 주지 않으면 그
 * 실패는 아무 데도 안 남는다.** 결과 줄(`archiveNotice`)이 그 유일한 자리다.
 *
 * ── 🔴 안 가져온 묶음과 까닭 ────────────────────────────────────────────
 * 저쪽 파일의 나머지 셋은 이 사이트에 **없는 화면**을 읽는다:
 *   · 「목록 — 표와 카드 두 곳 모두」 · 「(a) 보기 권한자 화면」의 목록 갈래 —
 *     이 저장소에 `QuoteListScreen.tsx` 가 없다(목록 화면은 서브모듈
 *     `vendor/dss-core` 의 것이다). 그 자리는 quote-list-screen-source.test.ts 가
 *     이어받았다.
 *   · 「겹쳐 뜬 미리보기」 갈래 — `QuotePrintView.tsx` 는 **조각 3f** 의 것이다.
 *   · 「단추 · 조각」 — 조각 3c-3 이 QuoteIssueButton.test.tsx 로 가져왔다.
 * 🔴 **3f 가 오는 날 이 파일에 저쪽의 남은 묶음을 되돌려 놓는다.** 조각 3c-3 이
 * QuoteIssueButton.test.tsx 에 적어 둔 것과 같은 약속이다.
 *
 * ── ⚠️ 위는 그때의 기록이다 — 🔴 **조각 3f 가 왔다**(2026-09-28) ─────────
 * 이 파일 맨 아래에 **둘을 되돌려 놓았다**(그 자리의 머리말에 무엇을 왜 했는지 적었다).
 * 🔴 그러면서 **위 셋째 줄이 틀렸다는 것도 드러났다** — 「단추 · 조각」은 조각 3c-3 이
 * 가져가지 않았고 이 사이트 어디에도 없었다. 이제 여기 있다.
 * 🔴 **남은 하나(「목록」)는 3f 와 무관하다** — 목록 화면이 이 저장소의 파일이 아니라
 * 서브모듈(vendor/dss-core)의 것이고, 그 자리는 `quote-list-screen-source.test.ts` 가
 * 이어받았다. 🔴 **2026-10-07 부터 저쪽도 같다** — A/S 도 제 복사본을 지우고 같은
 * 서브모듈 화면을 쓰며, 저쪽의 그 묶음이 읽는 것은 이제 저쪽 `QuoteListSlots.tsx` 다.
 *
 * 화면을 그려 볼 수 없는 자리다 — QuoteEditForm · QuoteAttachmentsSection 은 서버 액션을
 * 부르는 클라이언트 컴포넌트라(`server-only` 사슬) 이 시험 환경에서 렌더되지 않는다.
 * 그래서 이웃 시험들과 같은 방법으로 **원본을 글자로 읽는다**. 결과 줄의 **문장 자체**는
 * quote-issue-messages.test.ts 가, 그리는 모양은 QuoteIssueButton.test.tsx 가 값으로 본다.
 * ============================================================================
 */

const repoUrl = new URL("../../../", import.meta.url);
const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, repoUrl), "utf8").replace(/\r\n/g, "\n");
const flat = (source: string) => source.replace(/\s+/g, " ");
const sliceBetween = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `원본에서 '${startMarker}' 를 찾지 못했다`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `원본에서 '${endMarker}' 를 찾지 못했다`);
  return source.slice(start, end);
};
/**
 * 주석을 뺀 원본 — 「무엇을 그리는가」를 볼 때 쓴다(quote-folder-open-screens.test.ts 와 같은
 * 도구). 머리말은 **없앤 길을 일부러 설명하므로**(「받기 링크는 2026-10-07 에 없앴다 —
 * GET …/xlsx」) 글자만 찾으면 헛걸린다.
 */
const withoutComments = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const form = flat(read("src/components/quotes/QuoteEditForm.tsx"));
const section = flat(read("src/components/quotes/QuoteAttachmentsSection.tsx"));

const bareForm = flat(withoutComments(read("src/components/quotes/QuoteEditForm.tsx")));
const barePrintView = flat(withoutComments(read("src/components/quotes/QuotePrintView.tsx")));

/**
 * 받기가 있던 네 자리를 담은 화면 원본들 — 주석을 뺀 것.
 *
 * 🔴 목록은 `QuoteListSlots.tsx` 다 — 이 사이트의 목록 화면 자체는 서브모듈(vendor/dss-core)
 * 이고, 줄에 무엇을 꽂을지는 그 슬롯 파일이 정한다. 앞 조각이 거기서 받기를 뗐다.
 */
const SCREENS_WITHOUT_COMMENTS = [
  ["목록", flat(withoutComments(read("src/components/quotes/QuoteListSlots.tsx")))],
  ["편집 화면", bareForm],
  ["인쇄 미리보기", barePrintView],
  ["인쇄 미리보기 페이지", flat(withoutComments(read("src/app/(app)/quotes/[id]/print/page.tsx")))],
] as const;

/**
 * ============================================================================
 * 🔴 **뒤집어 적었다** — 「받기 뒤에 무엇을 하는가」에서 「받기가 없다」로 (2026-10-07)
 * ============================================================================
 * 여기 있던 묶음의 이름은 「편집 폼 — [견적서 받기] 뒤」였고, 발행이 엑셀 칸을 바꿨을 때
 * 폼이 칸을 다시 그려 오는지(`shouldReloadSlotsAfterIssue`)와 결과 줄을 머리 아래에
 * 그리는지(`<QuoteIssueNoticeLines lines={issueNotice}`)를 쟀다. 🔴 **그 단추를 없앴으므로
 * 둘 다 없다.** 단언을 지우지 않고 **없음**을 재도록 뒤집는다 — 되살아나면 깨진다.
 *
 * 🔴 **칸을 다시 그려 오는 길 자체는 살아 있다**(`reloadAfterIssue`) — 결재 PDF 올리기가
 * 그대로 쓴다. 아래 「결재 PDF 올리기」 묶음이 그것을 잰다.
 * ============================================================================
 */
describe("🔴 세 화면 어디에도 발행 단추가 없다", () => {
  test("목록 · 편집 · 인쇄 미리보기가 QuoteIssueButton 을 그리지 않는다", () => {
    for (const [name, source] of [
      ["목록", flat(read("src/components/quotes/QuoteListSlots.tsx"))],
      ["편집 화면", form],
      ["인쇄 미리보기", flat(read("src/components/quotes/QuotePrintView.tsx"))],
    ] as const) {
      assert.ok(!source.includes("<QuoteIssueButton"), `${name} 에 발행 단추가 남았다`);
      // 발행 통로를 부르는 길은 이 조각 하나다(quote-issue-download.ts) — 들여오지 않으면 못 부른다.
      assert.ok(!source.includes('from "@/components/quotes/quote-issue-download"'), `${name} 이 발행 흐름을 들여온다`);
    }
  });

  test("🔴 어느 화면도 발행 통로의 결과를 다루지 않는다 — 딸린 상태 · 핸들러가 남지 않았다", () => {
    for (const [name, source] of [
      ["목록", flat(read("src/components/quotes/QuoteListSlots.tsx"))],
      ["편집 화면", form],
      ["인쇄 미리보기", flat(read("src/components/quotes/QuotePrintView.tsx"))],
    ] as const) {
      for (const dead of [
        "issueNotice",
        "onIssueOutcome",
        "shouldReloadSlotsAfterIssue",
        "hasUnsavedChanges",
        "canIssue",
      ]) {
        assert.ok(!source.includes(dead), `${name} 에 '${dead}' 가 남았다`);
      }
    }
  });
});

describe("🔴 네 화면 어디에도 받기 주소가 없다 — 되살아나면 여기서 깨진다", () => {
  test("목록 · 편집 화면 · 인쇄 미리보기(화면 · 페이지)에 '/xlsx' 가 없다", () => {
    for (const [name, source] of SCREENS_WITHOUT_COMMENTS) {
      assert.ok(!source.includes("/xlsx"), `${name} 에 받기 주소가 들어왔다`);
    }
  });

  test("🔴 받기라고 읽히는 글자도 없다 — [견적서 받기] · [Excel 받기]", () => {
    for (const [name, source] of SCREENS_WITHOUT_COMMENTS) {
      assert.ok(!source.includes("견적서 받기<"), `${name} 에 [견적서 받기]가 남았다`);
      assert.ok(!source.includes("Excel 받기"), `${name} 에 [Excel 받기]가 남았다`);
      // 받기가 없으니 저장 전후로 갈릴 일도 없다 — 그 곁말도 함께 걷어냈다.
      assert.ok(!source.includes("Excel 은 저장한 뒤에 받을 수 있습니다"), `${name} 에 옛 곁말이 남았다`);
    }
  });
});

describe("편집 화면 — 🔴 받기가 있던 자리", () => {
  test("머리에 받기가 없다 — [미리보기 · PDF] 다음은 곧바로 [폴더 열기]다", () => {
    // 🔴 주석을 뺀 원본으로 본다 — 머리말이 **없앤 길을 일부러** 설명한다(파일 맨 위 참조).
    const header = sliceBetween(bareForm, "<h1", "{!canGetDocument && (");
    assert.ok(!header.includes("savedQuote.id}/xlsx"), header);
    assert.ok(!header.includes("견적서 받기"), header);
    // 🔴 [미리보기 · PDF]는 그대로다 — 다른 기능이고 남는다(2026-09-16 케이블 ③의 판정도 그대로).
    assert.ok(header.includes('{canGetDocument && ( <button type="button" onClick={() => setShowPreview(true)}'), header);
    assert.ok(header.includes("<QuoteFolderOpenButton"), header);
  });

  test("🔴 못 하는 일은 여전히 말한다 — 서버와 같은 문장 하나", () => {
    assert.ok(form.includes("{!canGetDocument && ( <p"), "안내가 사라졌다");
    assert.ok(form.includes("{QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE} </p>"), "화면이 문장을 따로 적는다");
  });

  test("🔴 저장하지 않은 변경을 가리던 장치가 남아 있지 않다 — 그 단추만을 위한 것이었다", () => {
    for (const dead of ["savedFieldsSnapshot", "hasUnsavedChanges"]) {
      assert.ok(!form.includes(dead), `'${dead}' 가 남았다`);
    }
    // [저장]이 보내는 값을 접어 두던 자리가 사라졌으니, 저장은 그 값을 보내기만 한다.
    const submit = sliceBetween(form, "async function handleSubmit(", "const disabled = isSubmitting || isConflict;");
    assert.ok(submit.includes("const fields = collectFields();"));
  });

  test("🔴 겹쳐 뜬 미리보기에도 발행 값이 넘어가지 않는다", () => {
    const preview = sliceBetween(form, "<QuotePrintView", "quoteNumber,");
    assert.ok(!preview.includes("canIssue"), preview);
    assert.ok(!preview.includes("onIssueOutcome"), preview);
  });

  test("「수기 견적서 엑셀」 칸을 다시 그려 오는 길은 살아 있다 — 결재 PDF 올리기가 쓴다", () => {
    assert.ok(
      section.includes("function reloadAfterIssue() { setStatusText(null); setArchiveNotice([]); refreshServerSlots(); }")
    );
  });
});

describe("결재 PDF 올리기 — 공유폴더 결과를 같은 문장 함수로", () => {
  test("올린 뒤 결과 줄을 싣고, 칸 구역이 그린다", () => {
    assert.ok(section.includes("setArchiveNotice(quoteUploadArchiveNoticeLines(category, result.archive));"));
    assert.ok(section.includes("statusDetails={<QuoteIssueNoticeLines lines={controller.archiveNotice}"));
  });

  /**
   * 🔴 저쪽에 없는 단언 하나 — 이 사이트에만 필요하다.
   *
   * 결과 줄은 **방금 한 일**의 줄이다. 앞서 올린 결재 PDF 의 공유폴더 결과가 그대로
   * 남아 있으면, 그 뒤에 수기 엑셀을 올리거나 파일을 지운 사람에게 **지난 일이 지금 일로
   * 보인다.** 저쪽은 그것을 「화면을 눈으로 본 결과」로 두었는데, 이 사이트에는 그 화면을
   * 그려 보는 시험이 아직 없다(3f 전). 그래서 걷는 자리를 글자로 잰다.
   *
   * ⚠️ 그때의 기록이다 — 🔴 **조각 3f 가 왔다**(2026-09-28). 🔴 **그래도 이 단언은
   * 그대로 둔다**: 3f 가 가져온 화면 시험들이 그리는 것은 `QuotePrintView` 이고,
   * 결과 줄을 걷는 자리는 `QuoteAttachmentsSection` 이라 여전히 아무도 안 그린다
   * (서버 액션 사슬이라 이 환경에서 렌더되지 않는다 — 위 머리말).
   */
  test("🔴 지난 결과 줄은 걷는다 — 다시 올릴 때 · 지운 뒤 · 발행 뒤", () => {
    // 올리기를 시작할 때 먼저 비운다(성공하면 그 아래에서 다시 채운다).
    const uploadNow = section.slice(section.indexOf("async function uploadNow("), section.indexOf("function pickFile("));
    const cleared = uploadNow.indexOf("setArchiveNotice([]);");
    const filled = uploadNow.indexOf("setArchiveNotice(quoteUploadArchiveNoticeLines(");
    assert.ok(cleared >= 0, "다시 올릴 때 지난 결과 줄을 걷지 않는다");
    assert.ok(filled > cleared, "걷기와 채우기의 차례가 뒤집혔다");
    // 지운 뒤 · 발행 뒤에도 걷는다.
    const deleted = section.slice(section.indexOf("async function runDelete("), section.indexOf("async function uploadQueuedAfterCreate("));
    assert.ok(deleted.includes("setArchiveNotice([]);"), "지운 뒤 지난 결과 줄이 남는다");
    assert.ok(section.includes("function reloadAfterIssue() { setStatusText(null); setArchiveNotice([]);"));
  });
});

/**
 * ============================================================================
 * 🔴 조각 3f 가 되돌려 놓은 묶음들 (2026-09-28)
 * ============================================================================
 * 위 머리말의 「안 가져온 묶음 셋」 가운데 **둘**이 왔다:
 *   · 「인쇄 미리보기 — 보기 권한자도 들어오는 화면」 — 🔴 **3f 의 것이었다.**
 *   · 「단추 · 조각」 — 🔴 **이 사이트 어디에도 없었다.** 머리말은 조각 3c-3 이
 *     `QuoteIssueButton.test.tsx` 로 가져갔다고 적었는데, **실측하니 그쪽은 화면을
 *     그려 보는 시험이고 이 소스 단언들은 오지 않았다**(2026-09-28 확인). 그래서
 *     여기 세운다 — 위 머리말의 그 줄은 그때의 기록이다.
 *
 * 🔴 **남은 하나는 여전히 안 온다** — 「목록 — 표와 카드 두 곳 모두」. 목록 화면이
 * 이 저장소의 파일이 아니라 서브모듈(vendor/dss-core)의 것이고, 그 자리는
 * `quote-list-screen-source.test.ts` 가 이어받았다. **3f 와 무관한 사실**이다.
 * 🔴 2026-10-07 부터 **저쪽도 같은 서브모듈 화면을 쓴다** — 저쪽의 그 묶음이 읽는
 * 것은 이제 저쪽 `QuoteListSlots.tsx` 다.
 *
 * 🔴 「단추 · 조각」의 셋째 시험(「검사·수리 보고서는 공용 이름 모듈을 부른다」)도
 * 못 가져왔다 — `components/repair-cases/report/service-report/ServiceReportForm.tsx`
 * 가 이 사이트에 없다(수리 건은 A/S 의 것이다). 앞의 둘만 가져왔다.
 * ============================================================================
 */

const printPage = flat(read("src/app/(app)/quotes/[id]/print/page.tsx"));
const printView = flat(read("src/components/quotes/QuotePrintView.tsx"));
const button = flat(read("src/components/quotes/QuoteIssueButton.tsx"));

const indexOrFail = (source: string, marker: string) => {
  const at = source.indexOf(marker);
  assert.ok(at >= 0, `없다: ${marker}`);
  return at;
};

describe("인쇄 미리보기 — 🔴 보기 권한자도 들어오는 화면", () => {
  /**
   * ⚠️ 여기 있던 단언 둘은 **그때의 기록**이다 — 「page 가 quotes WRITE 로 계산해 넘긴다」와
   * 「미리보기는 canIssue 일 때만 발행 단추, 기본은 링크」. 🔴 **2026-10-07 에 뒤집었다**:
   * 받기를 화면에서 모두 걷어냈으므로 이 화면은 **권한 값을 읽지 않는다.**
   *
   * 🔴 **문턱은 한 글자도 느슨해지지 않았다** — 화면 문턱은 그대로 읽기 권한이고(구역 문),
   * 통로들은 저마다 세션 · 권한을 스스로 다시 본다. 없어진 것은 「그릴지 말지를 가르던
   * 계산」뿐이다.
   */
  test("page 는 받기 때문에 권한을 읽지 않는다 — 화면 문턱은 그대로 읽기 권한", () => {
    assert.ok(!printPage.includes("canIssue"), "옛 권한 계산이 남았다");
    assert.ok(!printPage.includes("hasPermission("), "미리보기 화면이 권한을 다시 계산한다");
    assert.ok(printPage.includes('await requireAreaAccessForCurrentUser("quotes");'));
    // 구역 문이 주소를 읽기도 전에 선다 — 보기 권한자도 미리보기는 열지만, 아무나는 아니다.
    assert.ok(indexOrFail(printPage, "requireAreaAccessForCurrentUser") < indexOrFail(printPage, "await params"));
  });

  test("🔴 앱 양식 · 엑셀 전용 두 갈래 모두 받기가 없다 — 남은 것은 인쇄뿐", () => {
    assert.equal(printView.split("<QuoteIssueButton").length - 1, 0, "발행 단추가 남았다");
    assert.equal(printView.split("href={`/api/quotes/${quoteId}/xlsx`}").length - 1, 0, "받기 링크가 남았다");
    // 저장 여부로 갈리던 곁말도 함께 걷어냈다 — 가리킬 받기가 없다.
    assert.equal(printView.split("Excel 은 저장한 뒤에 받을 수 있습니다").length - 1, 0);
    // [인쇄 · PDF로 저장]은 두 갈래 모두 그대로다 — 이번 일과 무관하다.
    assert.equal(barePrintView.split("인쇄 · PDF로 저장").length - 1, 2);
  });

  /**
   * 🔴 저쪽에 없는 단언 하나 — **이 사이트에만 필요하다**(2026-09-28 원칙 —
   * 「돌아가기는 시스템을 건너가지 않는다」).
   *
   * 저쪽 인쇄 화면은 `returnHrefForQuotePrint` 로 「수리 건에서 왔으면 그리로」를
   * 가른다. 이 사이트에는 그 함수도 `/repair-cases/{id}/quotes` 화면도 없어서
   * **언제나 그 견적서로** 돌아간다. 🔴 누가 저쪽 코드를 다시 베껴 오면 사람이
   * 404 로 떨어지므로, 그 한 줄을 글자로 못 박는다.
   */
  test("🔴 돌아갈 곳은 언제나 그 견적서다 — 사이트를 건너가는 주소가 없다", () => {
    assert.ok(printPage.includes("const backHref = `/quotes/${quote.id}`;"), "돌아갈 곳이 그 견적서가 아니다");
    // 🔴 주석은 뺀다 — 이 화면의 머리말이 **안 가져온 것을 이름으로** 적어 두었다
    //    (「저쪽의 returnHrefForQuotePrint 는 이 사이트에 없다」). 이 저장소의
    //    다른 걷기들과 같은 규칙이다(quote-attachment-files.test.ts 의 ㉡).
    const code = flat(
      read("src/app/(app)/quotes/[id]/print/page.tsx")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^[ \t]*\/\/.*$/gm, " ")
    );
    for (const forbidden of ["returnHrefForQuotePrint", "repairCaseId", "/repair-cases", "searchParams"]) {
      assert.equal(code.includes(forbidden), false, `인쇄 화면이 ${forbidden} 을 쓴다`);
    }
  });
});

describe("단추 · 조각", () => {
  test("🔴 단추는 저장하지 않은 변경을 runQuoteIssue 에 넘긴다 — 통로를 직접 부르지 않는다", () => {
    assert.ok(button.includes("await runQuoteIssue({ quoteId, hasUnsavedChanges });"));
    assert.ok(!button.includes("fetch("), "단추가 통로를 직접 부른다");
  });

  test("시험할 수 있는 조각은 서버 사슬을 부르지 않는다", () => {
    for (const path of [
      "src/components/quotes/QuoteIssueButton.tsx",
      "src/components/quotes/quote-issue-download.ts",
      "src/components/quotes/quote-issue-messages.ts",
      "src/lib/domain/content-disposition-file-name.ts",
      // 🔴 조각 3f 가 더한 둘 — 미리보기 화면과 그 격자 조각. 클라이언트에서 도는
      //    것들이라 같은 규율을 지켜야 한다(`quote-excel-preview.ts` 는 서버의 것이라
      //    여기 없다 — 그 파일은 `import "server-only"` 로 시작한다).
      "src/components/quotes/QuotePrintView.tsx",
      "src/components/print-grid/SheetPrintGridView.tsx",
      "src/components/common/print-fit-frame.tsx",
    ]) {
      const source = read(path);
      assert.ok(!source.includes("@/lib/server/"), `${path} 가 서버 액션을 부른다`);
      assert.ok(!source.includes('"server-only"'), `${path} 가 server-only 를 부른다`);
      assert.ok(!/import \{[^}]*\} from "@\/lib\/db\//.test(source), `${path} 가 DB 조회를 값으로 부른다`);
    }
  });

  /**
   * 🔴 `quote-print-excel-preview.ts` 만 위 목록에서 **따로 뺐다** — 그 파일은
   * `@/lib/server/services/quote-excel-preview` 를 **`import type` 으로** 문다(격자의
   * 모양 하나). 타입은 컴파일할 때 지워지므로 `server-only` 사슬이 실제로 실리지
   * 않는다 — 이 저장소가 `quote-attachment-files.test.ts` 머리말에 적어 둔 그 사정과
   * 같다.
   *
   * 🔴 **그래서 느슨하게 두지 않고 더 좁게 잰다**: 그 이름이 나오는 자리가
   * **`import type` 한 줄뿐**임을 본다. 값으로 바꾸는 날 이 단언이 그 자리에서 터진다
   * — 값이 되면 `import "server-only"` 가 클라이언트 묶음으로 끌려 들어와 미리보기
   * 화면이 통째로 안 뜬다.
   */
  test("🔴 미리보기 클라이언트는 서버 사슬을 **타입으로만** 문다", () => {
    const source = read("src/components/quotes/quote-print-excel-preview.ts");
    assert.ok(!source.includes('"server-only"'));
    const lines = source.split("\n").filter((line) => line.includes("@/lib/server/"));
    assert.deepEqual(lines, [
      'import type { QuoteExcelPreviewGrid } from "@/lib/server/services/quote-excel-preview";',
    ]);
    // 그 파일을 무는 화면 쪽도 값으로 끌어오지 않는다 — 타입은 재수출뿐이다.
    assert.ok(!read("src/components/quotes/QuotePrintView.tsx").includes("@/lib/server/"));
  });
});
