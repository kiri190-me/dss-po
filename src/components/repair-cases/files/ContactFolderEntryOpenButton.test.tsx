import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ContactFolderEntryOpenButton, {
  CONTACT_FOLDER_ENTRY_OPEN_BUTTON_TITLE,
  ContactFolderEntryOpenControl,
  ContactFolderEntryOpenOutcomeNotice,
} from "./ContactFolderEntryOpenButton";
import {
  CONTACT_FOLDER_FILE_HELPER_MISSING_TEXT,
  CONTACT_FOLDER_FILE_HELPER_REINSTALL_TEXT,
  CONTACT_FOLDER_FILE_UNOPENABLE_TEXT,
  type ContactFolderFileOpenOutcome,
} from "./contact-folder-file-open";

/**
 * ============================================================================
 * 공유폴더 한 줄의 [열기] 단추 — 무엇이 그려지는가 (조각 PO 4h)
 * ============================================================================
 * 🔴 누른 뒤의 흐름은 **이미 있던 모듈**이 한다(contact-folder-file-open.test.ts 가 값으로
 * 본다). 여기서는 **그려지는 것**만: 서버 렌더에서는 감춘다 · 단추 모양 · 결과 줄 ·
 * [설치 명령 복사]가 언제 나오는가.
 *
 * 🔴 A/S 의 같은 이름 단추에는 [그만 보기]가 하나 더 있다 — 저쪽 흐름 모듈이 **도우미
 * 세대별 표시**를 들고 있어서다. 🔴 **이 사이트의 흐름 모듈에는 그 기능이 없고**, 그래서
 * 그 단추도 없다(단추 파일 머리말). 아래 마지막 묶음이 그 사실을 못 박는다 — 모듈이
 * 올라오는 날 이 시험이 먼저 깨져 알려 준다.
 * ============================================================================
 */

const buttonSource = readFileSync(new URL("./ContactFolderEntryOpenButton.tsx", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n"
);
const flowSource = readFileSync(new URL("./contact-folder-file-open.ts", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n"
);
/**
 * 주석을 뺀 코드 — 「무엇을 **부르는가**」를 볼 때 쓴다. 머리말은 **없는 것을 일부러
 * 설명하므로**(「저쪽에는 [그만 보기]가 있다」 · 「`server-only` 사슬 없이 그려 볼 수
 * 있다」) 낱말로 찾으면 헛걸린다. 이웃 시험(quote-folder-open-screens.test.ts)이 같은 까닭으로
 * 같은 잣대를 쓴다.
 */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const buttonCode = code(buttonSource);

const FOLDER = "21. 2026 내자견적서/DSS 2026-089 가나상사 MODEL-X1 수리 견적서";
const FILE = "DSS 2026-089 가나상사 MODEL-X1 수리 견적서.xlsx";

const controlMarkup = () =>
  renderToStaticMarkup(createElement(ContactFolderEntryOpenControl, { folderName: FOLDER, fileName: FILE }));

const noticeMarkup = (outcome: ContactFolderFileOpenOutcome) =>
  renderToStaticMarkup(
    createElement(ContactFolderEntryOpenOutcomeNotice, {
      outcome,
      copyLines: [],
      copyBusy: false,
      onCopy: () => {},
    })
  );

describe("🔴 Windows PC 에서만 그린다 — 서버 렌더는 감춘 채", () => {
  test("기본 내보내기는 서버 렌더에서 아무것도 그리지 않는다", () => {
    assert.equal(
      renderToStaticMarkup(createElement(ContactFolderEntryOpenButton, { folderName: FOLDER, fileName: FILE })),
      ""
    );
  });

  test("판단은 useSyncExternalStore — 서버 스냅샷은 「아니다」", () => {
    assert.ok(buttonSource.includes("const hiddenOnServer = () => false;"), buttonSource);
    assert.ok(buttonSource.includes("useSyncExternalStore(subscribeToNothing, isWindowsDesktopNow, hiddenOnServer)"));
    assert.ok(buttonSource.includes("if (!isWindows) return null;"));
  });
});

describe("단추 — [열기] 하나 · 인쇄에 안 찍힌다", () => {
  test("글자와 표시와 설명", () => {
    const html = controlMarkup();
    assert.ok(html.includes(">열기</button>"), html);
    assert.ok(html.includes("data-contact-folder-entry-open"), html);
    assert.ok(html.includes(CONTACT_FOLDER_ENTRY_OPEN_BUTTON_TITLE), html);
    assert.ok(html.includes("print:hidden"), html);
  });

  test("🔴 누르기 전에는 결과 줄이 없다 — 「없습니다」 같은 말을 미리 하지 않는다", () => {
    const html = controlMarkup();
    assert.equal(html.includes("설치 명령 복사"), false, html);
    assert.equal(html.includes(CONTACT_FOLDER_FILE_HELPER_REINSTALL_TEXT), false, html);
  });

  test("🔴 두 번 눌려도 두 번 열리지 않는다 — 여는 동안 잠근다", () => {
    assert.ok(buttonSource.includes("if (busy) return;"), buttonSource);
    assert.ok(buttonSource.includes("disabled={busy}"), buttonSource);
    assert.ok(buttonSource.includes('{busy ? "여는 중…" : "열기"}'), buttonSource);
  });
});

describe("결과 줄 — 흐름이 준 것을 그대로 낸다", () => {
  test("🔴 열렸어도 「다시 설치해 주세요」 줄과 [설치 명령 복사]가 함께 난다", () => {
    const html = noticeMarkup({
      kind: "OPENED",
      lines: [
        { text: `파일을 엽니다: ${FILE}`, tone: "normal" },
        { text: CONTACT_FOLDER_FILE_HELPER_REINSTALL_TEXT, tone: "muted" },
      ],
      offerHelperInstall: true,
    });
    assert.ok(html.includes(CONTACT_FOLDER_FILE_HELPER_REINSTALL_TEXT), html);
    assert.ok(html.includes(">설치 명령 복사</button>"), html);
    assert.ok(html.includes("data-contact-folder-entry-helper-install-command"), html);
    assert.equal(html.includes("href="), false, "링크다 — 화면을 떠난다");
  });

  test("도우미가 없어 보이는 결과도 같은 단추로 이끈다", () => {
    const html = noticeMarkup({
      kind: "NO_RESPONSE",
      lines: [{ text: CONTACT_FOLDER_FILE_HELPER_MISSING_TEXT, tone: "warning" }],
      offerHelperInstall: true,
    });
    assert.ok(html.includes(CONTACT_FOLDER_FILE_HELPER_MISSING_TEXT), html);
    assert.ok(html.includes(">설치 명령 복사</button>"), html);
  });

  test("🔴 열 수 없는 파일에는 **단추가 없다** — 다시 깔아도 안 열린다", () => {
    const html = noticeMarkup({
      kind: "FAILED",
      lines: [{ text: CONTACT_FOLDER_FILE_UNOPENABLE_TEXT, tone: "warning" }],
      offerHelperInstall: false,
    });
    assert.ok(html.includes(CONTACT_FOLDER_FILE_UNOPENABLE_TEXT), html);
    assert.equal(html.includes("<button"), false, html);
  });
});

describe("🔴 베끼지 않았다 — 흐름도 복사도 이미 있는 한 벌을 쓴다", () => {
  test("여는 흐름은 그 모듈을 그대로 부른다", () => {
    assert.ok(buttonSource.includes('from "./contact-folder-file-open"'), buttonSource);
    for (const forbidden of ["dss-folder://", "iframe", "localStorage", "buildQuoteFolderFileLink"]) {
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

  test("🔴 [그만 보기]가 **없는 까닭** — 흐름 모듈에 그 기능이 아직 없다", () => {
    for (const notHereYet of [
      "CONTACT_FOLDER_FILE_HELPER_DISMISS_TEXT",
      "contactFolderFileOutcomeWithoutHelperOffer",
      "rememberContactFolderFileHelper",
    ]) {
      assert.equal(
        code(flowSource).includes(notHereYet),
        false,
        `흐름 모듈이 올라왔다 — 단추에 [그만 보기]를 되살릴 때가 됐다: ${notHereYet}`
      );
    }
    assert.equal(buttonCode.includes("그만 보기"), false, "흐름에 없는 기능을 단추가 부른다");
  });

  test("서버 사슬을 부르지 않는다 — 그려 보는 시험이 그냥 돈다", () => {
    assert.equal(buttonCode.includes("@/lib/server/"), false);
    assert.equal(buttonCode.includes("server-only"), false);
  });
});
