import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import QuoteArchiveExcelOpenButton, {
  ExcelNoticeLines,
  QuoteArchiveExcelOpenControl,
} from "./QuoteArchiveExcelOpenButton";
import { QUOTE_ARCHIVE_EXCEL_NOT_SAVED_TEXT, QUOTE_ARCHIVE_EXCEL_OPEN_BUTTON_TITLE } from "./quote-archive-excel-open";

/**
 * ============================================================================
 * 줄마다의 [Excel 보기] 단추 · 결과 자리 (2026-10-07 사용자 지시)
 * ============================================================================
 * 「견적서 목록에 [Excel 보기]를 넣어 폴더에 있는 해당 견적서를 바로 열 수 있게 … 저장된
 * 파일이 없다면 **저장된 파일이 없습니다.** 라고 안내가 뜨면 되는거야.」
 *
 * 누른 뒤의 흐름(어느 파일을 고르는가 · 무엇이라고 알리는가)은 값으로 도는 이웃 시험이
 * 본다(quote-archive-excel-open.test.ts). 여기서 지키는 것은 **화면 쪽 약속**이고,
 * 🔴 **A/S 의 같은 묶음**(「줄마다의 [Excel 보기]」)에서 가져왔다. 가져올 당시 그것은
 * 저쪽 `QuoteListScreen.test.ts` 의 345~419줄이었고, 🔴 **2026-10-07 에 저쪽이 바뀌었다** —
 * 그 시험 파일이 지워지고 `quote-list-screen-source.test.ts` 의
 * `describe("줄마다의 [Excel 보기]")` 가 그 자리를 잇는다.
 * 🔴 **재는 것은 하나도 빼지 않았다.** 고친 곳은 **자리 한 가지**다: 저쪽은 그때 그 단추가
 * 목록 화면 원본 **안**에 있어 그 파일의 글자로 쟀는데, 🔴 **이 사이트의 목록 화면은
 * 서브모듈(vendor/dss-core)이라 손댈 수 없어** 단추가 제 파일로 따로 섰다(2026-10-07 부터는
 * 저쪽도 같은 이름의 제 파일이다). 그래서 「자리는 [미리보기 · PDF] 바로 오른쪽」은 슬롯을
 * 거는 쪽(QuoteListSlots.tsx)에서 재고, 그 단언은 quote-list-screen-source.test.ts 에 있다.
 * ============================================================================
 */

const ROW = { id: "11111111-2222-3333-4444-555555555555", quoteNumber: "DSS 2026-078" };
const buttonSource = readFileSync(new URL("./QuoteArchiveExcelOpenButton.tsx", import.meta.url), "utf8");
const flat = (source: string) => source.replace(/\s+/g, " ");
const flatSource = flat(buttonSource);

describe("단추", () => {
  test("🔴 서버 렌더 · 첫 렌더는 감춘다 — 이 시험을 도는 Node 의 navigator 가 Windows 처럼 보여도", () => {
    assert.equal(renderToStaticMarkup(<QuoteArchiveExcelOpenButton row={ROW} />), "");
  });

  test("단추 자체 — 링크가 아니고 설명을 달았다 · 통로 주소나 도우미 주소가 화면에 없다", () => {
    const html = renderToStaticMarkup(<QuoteArchiveExcelOpenControl row={ROW} />);
    assert.ok(html.includes(">Excel 보기</button>"), html);
    assert.ok(html.includes("data-quote-archive-excel-open"), html);
    assert.ok(html.includes(`title="${QUOTE_ARCHIVE_EXCEL_OPEN_BUTTON_TITLE}"`), html);
    for (const absent of ["href=", "/api/", "dss-folder:"]) {
      assert.ok(!html.includes(absent), `단추에 '${absent}' 가 있다`);
    }
    // 🔴 누르기 전에는 결과 자리가 아예 없다 — 빈 상자가 칸을 밀지 않는다.
    assert.ok(!html.includes('role="status"'), html);
    assert.ok(!html.includes("설치 명령 복사"), html);
  });

  test("🔴 인쇄에는 안 찍힌다", () => {
    assert.ok(renderToStaticMarkup(<QuoteArchiveExcelOpenControl row={ROW} />).includes("print:hidden"));
  });
});

describe("결과 자리", () => {
  test("🔴 「저장된 파일이 없습니다.」는 주의 색으로 그 줄 옆에 — 화면 위 띠를 쓰지 않는다", () => {
    const html = renderToStaticMarkup(
      <ExcelNoticeLines lines={[{ text: QUOTE_ARCHIVE_EXCEL_NOT_SAVED_TEXT, tone: "warning" }]} />
    );
    assert.ok(html.includes(QUOTE_ARCHIVE_EXCEL_NOT_SAVED_TEXT), html);
    assert.ok(html.includes("text-amber-700"), html);
    assert.ok(!flatSource.includes("setTrashError"), "줄마다의 결과를 화면 위 띠에 적는다");
  });

  test("줄이 없으면 아무것도 그리지 않는다", () => {
    assert.equal(renderToStaticMarkup(<ExcelNoticeLines lines={[]} />), "");
  });
});

/**
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 원본 글자로만 잴 수 있는 것 — 눌린 뒤의 상태는 정적 렌더로 보이지 않는다
 * ────────────────────────────────────────────────────────────────────────────
 */
describe("🔴 원본이 지키는 약속", () => {
  test("🔴 목록을 그릴 때 공유폴더를 미리 읽지 않는다 — 누를 때 한 번 부른다", () => {
    assert.ok(!buttonSource.includes("useEffect"), "그릴 때 공유폴더를 읽는 효과가 생겼다");
    assert.ok(!buttonSource.includes("loadQuoteArchiveFolderEntries"), "단추가 목록 통로를 직접 부른다");
    assert.equal(flatSource.split("runQuoteArchiveExcelOpen(").length - 1, 1, "흐름을 부르는 곳이 하나가 아니다");
    assert.ok(
      flatSource.includes("setOutcome(await runQuoteArchiveExcelOpen({ quoteId: row.id, quoteNumber: row.quoteNumber }));"),
      flatSource
    );
  });

  test("🔴 두 번 눌러도 두 번 열리지 않는다 — 잠그고, 눌린 것이 보인다", () => {
    assert.ok(flatSource.includes("async function handleOpen() {"), flatSource);
    assert.ok(flatSource.includes("if (busy) return; setBusy(true); setOutcome(null);"), flatSource);
    assert.ok(flatSource.includes("disabled={busy}"), flatSource);
    assert.ok(flatSource.includes("aria-busy={busy}"), flatSource);
    assert.ok(flatSource.includes('{busy ? "여는 중…" : "Excel 보기"}'), flatSource);
    // 끝나면 반드시 풀린다 — 실패해도 단추가 영영 잠기지 않는다.
    assert.ok(flatSource.includes("} finally { setBusy(false); }"), flatSource);
  });

  test("🔴 결과는 그 줄 옆에 적는다", () => {
    assert.ok(flatSource.includes('<span role="status"'), flatSource);
  });

  test("🔴 [설치 명령 복사]를 끄지 않는다 — 여는 장치가 내는 값을 그대로 따른다", () => {
    assert.ok(flatSource.includes("{outcome.offerHelperInstall && ("), flatSource);
    assert.ok(flatSource.includes("setCopyLines(await runQuoteFolderHelperInstallCommandCopy());"), flatSource);
    assert.ok(flatSource.includes("설치 명령 복사"), flatSource);
  });

  test("🔴 Windows 가 아니면 그리지 않는다 — 첫 렌더는 감춘다", () => {
    assert.ok(buttonSource.includes("const hiddenOnServer = () => false;"), "서버 렌더용 스냅샷이 없다");
    assert.ok(
      buttonSource.includes("useSyncExternalStore(subscribeToNothing, isWindowsDesktopNow, hiddenOnServer)"),
      buttonSource
    );
    assert.ok(buttonSource.includes("if (!isWindows) return null;"), buttonSource);
  });

  test("🔴 누르기 전에 아는 척하지 않는다 — 줄의 다른 칸으로 가르지 않는다", () => {
    // 사람이 손으로 넣어 둔 엑셀이 그 폴더에 있을 수 있고, 공유폴더 사정은 눌러 보기 전에
    // 알 수 없다. 눌렀을 때 사실대로 말한다(저쪽과 같은 단언이다).
    assert.ok(!buttonSource.includes("canRenderQuoteDocument"), buttonSource);
    assert.ok(!buttonSource.includes("isExcelOnly"), buttonSource);
    assert.ok(!buttonSource.includes("hasExcel"), buttonSource);
  });

  test("🔴 화면이 파일을 만들거나 지우지 않는다 — 읽고 여는 것뿐이다", () => {
    for (const forbidden of ['method: "POST"', 'method: "DELETE"', "saveBlobAsDownload", ".blob(", "download="]) {
      assert.ok(!buttonSource.includes(forbidden), `[Excel 보기]가 '${forbidden}' 를 쓴다`);
    }
  });

  test("🔴 서버 사슬을 부르지 않는다 — server-only 없이 그려 볼 수 있다", () => {
    assert.ok(!buttonSource.includes("@/lib/server/"), "서버 모듈을 부른다");
    assert.ok(!buttonSource.includes('"server-only"'), "server-only 를 부른다");
    assert.equal(/import \{[^}]*\} from "@\/lib\/db\//.test(buttonSource), false, "DB 조회를 값으로 부른다");
  });
});
