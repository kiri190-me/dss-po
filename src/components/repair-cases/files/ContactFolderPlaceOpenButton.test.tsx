import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { QuoteFolderOpenOutcome } from "@/components/quotes/quote-folder-open";
import ContactFolderPlaceOpenButton, {
  CONTACT_FOLDER_PLACE_OPEN_BUTTON_TEXT,
  CONTACT_FOLDER_PLACE_OPEN_BUTTON_TITLE,
  ContactFolderPlaceOpenControl,
  ContactFolderPlaceOpenNotice,
} from "./ContactFolderPlaceOpenButton";

/**
 * ============================================================================
 * 공유폴더 구역 맨 아래의 [폴더 열기] 단추 — 무엇이 그려지는가 (조각 PO 4h)
 * ============================================================================
 * 누른 뒤의 흐름은 contact-folder-place-open.test.ts 가 값으로 본다. 여기서는 **그려지는
 * 것**만: 서버 렌더에서는 감춘다 · 단추 모양 · 결과 줄 · [설치 명령 복사]가 언제 나오는가.
 *
 * 🔴 **[위치 복사]는 없다** — 이 흐름은 서버에 묻지 않아 전체 주소(UNC)를 모른다. 편집
 * 화면 머리의 결과 줄과 갈리는 자리가 그것 하나다.
 * ============================================================================
 */

const buttonSource = readFileSync(new URL("./ContactFolderPlaceOpenButton.tsx", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n"
);
/**
 * 주석을 뺀 코드 — 「무엇을 **부르는가**」를 볼 때 쓴다. 머리말이 **없는 길을 일부러**
 * 설명하므로(「`server-only` 사슬 없이 그려 볼 수 있다」) 낱말로 찾으면 헛걸린다.
 */
const buttonCode = buttonSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const RELATIVE_PATH = "21. 2026 내자견적서/DSS 2026-089 가나상사 MODEL-X1 수리 견적서";

const controlMarkup = () =>
  renderToStaticMarkup(createElement(ContactFolderPlaceOpenControl, { relativePath: RELATIVE_PATH }));

const noticeMarkup = (outcome: QuoteFolderOpenOutcome) =>
  renderToStaticMarkup(
    createElement(ContactFolderPlaceOpenNotice, { outcome, copyLines: [], copyBusy: false, onCopy: () => {} })
  );

describe("🔴 Windows PC 에서만 그린다 — 서버 렌더는 감춘 채", () => {
  test("기본 내보내기는 서버 렌더에서 아무것도 그리지 않는다", () => {
    assert.equal(renderToStaticMarkup(createElement(ContactFolderPlaceOpenButton, { relativePath: RELATIVE_PATH })), "");
  });

  test("판단은 useSyncExternalStore — 서버 스냅샷은 「아니다」", () => {
    assert.ok(buttonSource.includes("const hiddenOnServer = () => false;"), buttonSource);
    assert.ok(buttonSource.includes("useSyncExternalStore(subscribeToNothing, isWindowsDesktopNow, hiddenOnServer)"));
    assert.ok(buttonSource.includes("if (!isWindows) return null;"));
  });
});

describe("단추 — [폴더 열기] 하나 · 인쇄에 안 찍힌다", () => {
  test("글자와 표시와 설명", () => {
    const html = controlMarkup();
    assert.ok(html.includes(`>${CONTACT_FOLDER_PLACE_OPEN_BUTTON_TEXT}</button>`), html);
    assert.ok(html.includes("data-contact-folder-place-open"), html);
    assert.ok(html.includes(CONTACT_FOLDER_PLACE_OPEN_BUTTON_TITLE), html);
    assert.ok(html.includes("print:hidden"), html);
  });

  test("🔴 누르기 전에 전체 주소도 결과 줄도 없다", () => {
    const html = controlMarkup();
    assert.equal(html.includes(RELATIVE_PATH), false, "누르기 전에 경로가 화면에 있다");
    assert.equal(html.includes("설치 명령 복사"), false, html);
  });

  test("🔴 두 번 눌려도 두 번 열리지 않는다 — 여는 동안 잠근다", () => {
    assert.ok(buttonSource.includes("if (busy) return;"), buttonSource);
    assert.ok(buttonSource.includes("disabled={busy}"), buttonSource);
    assert.ok(buttonSource.includes('{busy ? "여는 중…" : CONTACT_FOLDER_PLACE_OPEN_BUTTON_TEXT}'), buttonSource);
  });
});

describe("결과 줄 — 흐름이 준 것을 그대로 낸다", () => {
  test("열렸으면 그 줄과 [설치 명령 복사]", () => {
    const html = noticeMarkup({
      kind: "OPENED",
      lines: [{ text: "탐색기로 폴더를 엽니다: DSS 2026-089 가나상사 MODEL-X1 수리 견적서", tone: "normal" }],
      offerHelperInstall: true,
    });
    assert.ok(html.includes("탐색기로 폴더를 엽니다"), html);
    assert.ok(html.includes(">설치 명령 복사</button>"), html);
    assert.ok(html.includes("data-contact-folder-place-helper-install-command"), html);
    assert.equal(html.includes("href="), false, "링크다 — 화면을 떠난다");
  });

  test("🔴 [위치 복사]는 없다 — 이 흐름은 전체 주소를 모른다", () => {
    const html = noticeMarkup({
      kind: "NO_RESPONSE",
      lines: [{ text: "이 PC 에 폴더 열기 도우미가 없는 것 같습니다 — …", tone: "warning" }],
      offerHelperInstall: true,
    });
    assert.equal(html.includes("위치 복사"), false, html);
    assert.equal(html.includes("data-quote-folder-unc-path"), false, html);
    assert.ok(html.includes(">설치 명령 복사</button>"), html);
  });

  test("🔴 주소를 못 만든 결과에는 아무 단추도 없다 — 다시 깔아도 안 열린다", () => {
    const html = noticeMarkup({
      kind: "FAILED",
      lines: [{ text: "폴더를 열지 못했습니다 — 이 폴더 이름은 도우미 주소로 만들 수 없습니다…", tone: "warning" }],
      offerHelperInstall: false,
    });
    assert.equal(html.includes("<button"), false, html);
  });

  test("🔴 화면은 설치 **파일**을 주지 않는다 — PowerShell 에 붙여넣는 길 하나뿐이다", () => {
    const html = noticeMarkup({
      kind: "OPENED",
      lines: [{ text: "탐색기로 폴더를 엽니다: x", tone: "normal" }],
      offerHelperInstall: true,
    });
    for (const gone of ["설치 파일", "다시 받기", "차단 해제", "quote-folder-helper/installer"]) {
      assert.equal(html.includes(gone), false, gone);
    }
  });
});

describe("🔴 베끼지 않았다 — 흐름도 복사도 한 벌을 쓴다", () => {
  test("여는 흐름은 그 모듈을 그대로 부른다", () => {
    assert.ok(buttonSource.includes('from "./contact-folder-place-open"'), buttonSource);
    for (const forbidden of ["dss-folder://", "iframe", "localStorage", "buildQuoteFolderLink"]) {
      assert.equal(buttonSource.includes(forbidden), false, `여는 장치를 베꼈다: ${forbidden}`);
    }
  });

  test("복사는 공용 모듈 하나 — 제 복사 구현을 두지 않는다", () => {
    assert.ok(buttonSource.includes("runQuoteFolderHelperInstallCommandCopy"), buttonSource);
    assert.equal(/navigator\.clipboard\.writeText/.test(buttonSource), false, "복사 구현이 또 있다");
    assert.equal(buttonSource.includes("execCommand"), false, "복사 구현이 또 있다");
    // 🔴 설치 명령 본문에는 사내 공유폴더 주소가 들어 있다 — 콘솔에 찍지 않는다.
    assert.equal(buttonSource.includes("console."), false, "콘솔에 찍는 곳이 있다");
  });

  test("🔴 편집 화면 머리 단추의 울타리를 건드리지 않는다 — 그 이름을 부르지 않는다", () => {
    for (const bad of ["QuoteFolderOpenButton", "QuoteFolderOpenControl", "runQuoteFolderOpen("]) {
      assert.equal(buttonSource.includes(bad), false, bad);
    }
  });

  test("서버 사슬을 부르지 않는다 — 그려 보는 시험이 그냥 돈다", () => {
    assert.equal(buttonCode.includes("@/lib/server/"), false);
    assert.equal(buttonCode.includes("server-only"), false);
  });
});
