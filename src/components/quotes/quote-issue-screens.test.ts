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
