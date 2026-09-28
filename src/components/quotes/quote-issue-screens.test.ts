import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * ============================================================================
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
 *     `QuoteListScreen.tsx` 가 없다(이 사이트의 목록은 서버 컴포넌트다. 그 자리는
 *     quote-list-screen-source.test.ts 가 이어받았다).
 *   · 「겹쳐 뜬 미리보기」 갈래 — `QuotePrintView.tsx` 는 **조각 3f** 의 것이다.
 *   · 「단추 · 조각」 — 조각 3c-3 이 QuoteIssueButton.test.tsx 로 가져왔다.
 * 🔴 **3f 가 오는 날 이 파일에 저쪽의 남은 묶음을 되돌려 놓는다.** 조각 3c-3 이
 * QuoteIssueButton.test.tsx 에 적어 둔 것과 같은 약속이다.
 *
 * ── ⚠️ 위는 그때의 기록이다 — 🔴 **조각 3f 가 왔다**(2026-09-28) ─────────
 * 이 파일 맨 아래에 **둘을 되돌려 놓았다**(그 자리의 머리말에 무엇을 왜 했는지 적었다).
 * 🔴 그러면서 **위 셋째 줄이 틀렸다는 것도 드러났다** — 「단추 · 조각」은 조각 3c-3 이
 * 가져가지 않았고 이 사이트 어디에도 없었다. 이제 여기 있다.
 * 🔴 **남은 하나(「목록」)는 3f 와 무관하다** — 저쪽 `QuoteListScreen.tsx` 자체가
 * 이 사이트에 없고, 그 자리는 `quote-list-screen-source.test.ts` 가 이어받았다.
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

const form = flat(read("src/components/quotes/QuoteEditForm.tsx"));
const section = flat(read("src/components/quotes/QuoteAttachmentsSection.tsx"));

describe("편집 폼 — [견적서 받기] 뒤", () => {
  test("발행이 엑셀 칸을 바꾸면 서버 칸을 다시 그려 온다 — 결과 줄은 머리 아래", () => {
    assert.ok(form.includes("if (shouldReloadSlotsAfterIssue(outcome)) attachments.reloadAfterIssue();"));
    assert.ok(
      section.includes("function reloadAfterIssue() { setStatusText(null); setArchiveNotice([]); refreshServerSlots(); }")
    );
    assert.ok(form.includes("<QuoteIssueNoticeLines lines={issueNotice}"));
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
 * 🔴 **남은 하나는 여전히 안 온다** — 「목록 — 표와 카드 두 곳 모두」. 저쪽의
 * `QuoteListScreen.tsx` 는 이 사이트에 없고(목록이 서버 컴포넌트다) 그 자리는
 * `quote-list-screen-source.test.ts` 가 이어받았다. **3f 와 무관한 사실**이다.
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
   * 🔴 저쪽 단언 둘을 **이 사이트의 문지기 한 걸음**에 맞췄다(그 페이지 머리말의 ①):
   * 저쪽은 `readSession()` → `resolveActingUserForSession()` 으로 사람을 따로 구해
   * `canIssue` 를 재는데, 이 사이트는 `requireAreaAccessForCurrentUser("quotes")` 가
   * **사람까지 돌려준다.** 🔴 **재는 것은 그대로다**: 화면 문턱은 읽기 권한이고,
   * 받기 단추만 WRITE 로 갈리며, 그 계산이 **견적서를 읽은 뒤**다.
   */
  test("page 가 quotes WRITE 로 계산해 넘긴다 — 견적서를 읽은 뒤에, 살아 있는 계정으로", () => {
    assert.ok(
      printPage.includes('const canIssue = await hasPermission(user, "quotes", "WRITE");'),
      "인쇄 화면의 받기 권한이 quotes WRITE 가 아니다"
    );
    assert.ok(printPage.includes('const user = await requireAreaAccessForCurrentUser("quotes");'));
    assert.ok(printPage.includes("canIssue={canIssue}"), "미리보기에 권한이 넘어가지 않는다");
    assert.ok(indexOrFail(printPage, "if (!quote) notFound();") < indexOrFail(printPage, "const canIssue ="));
    // 화면 문턱은 그대로 읽기 권한이다 — 보기 권한자도 미리보기는 연다.
    assert.ok(indexOrFail(printPage, "requireAreaAccessForCurrentUser") < indexOrFail(printPage, "await params"));
  });

  test("미리보기는 canIssue 일 때만 발행 단추 — 앱 양식 · 엑셀 전용 두 갈래 모두, 기본은 링크", () => {
    assert.equal(printView.split("<QuoteIssueButton").length - 1, 2, "받기 단추가 두 갈래가 아니다");
    assert.equal(printView.split(") : canIssue ? (").length - 1, 2, "단추가 권한 갈래 밖에 있다");
    assert.equal(printView.split("href={`/api/quotes/${quoteId}/xlsx`}").length - 1, 2, "보기 권한자의 링크가 사라졌다");
    assert.ok(printView.includes("canIssue = false,"), "안 주면 링크여야 한다");
    assert.ok(printView.includes("canIssue={canIssue} hasUnsavedChanges={hasUnsavedChanges} onIssueOutcome={onIssueOutcome}"));
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
