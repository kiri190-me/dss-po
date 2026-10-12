import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CONTACT_FOLDER_FILE_HELPER_REINSTALL_TEXT } from "@/components/repair-cases/files/contact-folder-file-open";
import { buildQuoteFolderFileLink, parseQuoteFolderFileLink } from "@/lib/domain/quote-folder-file-link";
import {
  SHARE_FOLDER_ENTRY_ACTIONS_CLASS,
  SHARE_FOLDER_ENTRY_META_MODIFIED_CLASS,
  SHARE_FOLDER_ENTRY_META_SIZE_CLASS,
} from "@/lib/domain/share-folder-entry-meta";
import QuoteArchiveFolderSection, {
  QUOTE_ARCHIVE_FOLDER_SECTION_NO_MATCH_TEXT,
  QuoteArchiveFolderSectionView,
  canOpenQuoteArchiveFolderEntry,
  quoteArchiveFolderEntryMeta,
  quoteArchiveFolderHiddenByNumberText,
  quoteArchiveFolderOpenPath,
  quoteArchiveFolderTruncatedText,
} from "./QuoteArchiveFolderSection";
import {
  QUOTE_ARCHIVE_FOLDER_SECTION_EMPTY_TEXT,
  QUOTE_ARCHIVE_FOLDER_SECTION_FAILED_TEXT,
  QUOTE_ARCHIVE_FOLDER_SECTION_LOADING_TEXT,
  QUOTE_ARCHIVE_FOLDER_SECTION_MULTIPLE_TEXT,
  QUOTE_ARCHIVE_FOLDER_SECTION_NOT_FOUND_TEXT,
  quoteArchiveFolderEntriesUrl,
  type QuoteArchiveFolderSectionState,
} from "./quote-archive-folder-entries";
import QuoteEditTabs from "./QuoteEditTabs";

/**
 * ============================================================================
 * 결재 탭의 공유폴더 구역 — 상태 여섯 · 표 네 칸 · 번호 거르기 · 자리 (조각 PO 4h)
 * ============================================================================
 * 🔴 **A/S 의 같은 이름 시험에서 가져왔다.** 뺀 것은 **저쪽에만 있는 화면** 몫이다 —
 * 수리 건 「견적서」 탭(이 사이트에 수리 건이 없다)과 머리에 본 번호를 적는 칸(`label`,
 * 한 화면에 구역이 하나뿐이라 그 칸 자체를 안 가져왔다). 🔴 **그 밖의 단언은 그대로**다.
 *
 * 🔴 통로를 부르는 길(주소 · 응답 읽기 · 던지지 않음)은 이 사이트에서 **다른 파일**에
 * 있고(quote-archive-folder-entries.ts) 그쪽 시험이 이미 본다 — 여기서 또 재지 않는다.
 *
 * 🔴 네트워크를 쓰지 않는다 — 상태를 **직접 넣어** 그려 본다. 공급처 · 모델 · L/N · S/N 은
 * 가짜다(저장소가 공개다).
 * ============================================================================
 */

const sectionSource = readFileSync(new URL("./QuoteArchiveFolderSection.tsx", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n"
);
const editFormSource = readFileSync(new URL("./QuoteEditForm.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
/** 주석을 뺀 코드 — 머리말이 까닭을 설명하느라 적은 낱말(iframe · 번호 뽑기 …)에 걸리지 않게. */
const sectionCode = sectionSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const srcDir = fileURLToPath(new URL("../../", import.meta.url));
/** 견적서 상세(`/quotes/[id]`) — 결재 탭의 「견적서 승인」 위에 세운 자리. */
const quoteDetailPage = readFileSync(
  path.join(srcDir, "app", "(app)", "quotes", "[id]", "page.tsx"),
  "utf8"
).replace(/\r\n/g, "\n");
/**
 * 🔴 상세 화면의 **주석을 뺀 코드.** 「공유폴더를 서버에서 읽는가」는 이것으로 잰다 —
 * 🔴 **저쪽은 원본 그대로 재지만** 이 저장소의 상세 화면 머리말은 케이블 양식 상수를
 * 설명하느라 `node:fs` 를 **말로** 적는다(「그 파일은 node:fs · node:zlib 를 끌고 와…」).
 * 낱말로 찾으면 헛걸린다 — 이웃 시험(quote-folder-open-screens.test.ts)이 **이미 같은
 * 까닭으로** 같은 잣대를 쓴다.
 */
const quoteDetailPageCode = quoteDetailPage.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/** 승인 패널 — 🔴 그 상자 **안**에 구역을 끼워 넣지 않았는지만 글자로 본다. */
const approvalPanelSource = readFileSync(new URL("./QuoteApprovalPanel.tsx", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n"
);

/** 🔴 가짜 이름이다 — 모양만 실제와 같다. */
const RELATIVE_PATH = "21. 2026 내자견적서/DSS 2026-089 가나상사 MODEL-X1 L123 S456 수리 견적서";

function markup(state: QuoteArchiveFolderSectionState): string {
  return renderToStaticMarkup(createElement(QuoteArchiveFolderSectionView, { state }));
}

const foundState = (
  overrides: Partial<Extract<QuoteArchiveFolderSectionState, { kind: "found" }>> = {}
): QuoteArchiveFolderSectionState =>
  ({
    kind: "found",
    relativePath: RELATIVE_PATH,
    entries: [],
    totalCount: 0,
    truncated: false,
    ...overrides,
  }) satisfies QuoteArchiveFolderSectionState;

const entry = (name: string, isDirectory = false) => ({ name, isDirectory, sizeBytes: 1024 });

/** 수정시각 한 자리 — 꾸민 글자는 돌리는 PC 의 시간대를 따르므로 **같은 식으로 계산해** 견준다. */
const ISO = "2026-09-08T02:00:00.000Z";
const LOCAL_TIME = new Date(ISO).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });

/**
 * 🔴 그려진 결과에서 **그 칸에 실제로 들어 있는 글자**를 줄 차례대로 뽑는다. 글자 매칭이
 * 아니라 「칸이 섰는가 · 그 안이 비었는가」를 재려고 칸을 열쇠로 쓴다 — 빈 칸은 `""` 로
 * 잡힌다(칸이 아예 없으면 배열 길이가 줄어 바로 드러난다).
 */
function metaCells(html: string, className: string): string[] {
  const pattern = new RegExp(`<span class="${className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}">([^<]*)</span>`, "g");
  return [...html.matchAll(pattern)].map((match) => match[1] ?? "");
}

/** 그려진 줄들의 **틀**(li 의 class). 줄마다 다르면 열이 어긋난다. */
function liClasses(html: string): string[] {
  return [...html.matchAll(/<li[^>]*\sclass="([^"]*)"/g)].map((match) => match[1] ?? "");
}

/** 그 칸이 **몇 번** 그려졌는가 — 비어 있어도 센다(동작 칸이 줄마다 서는지 본다). */
function cellCount(html: string, className: string): number {
  return html.split(`class="${className}"`).length - 1;
}

describe("상태 여섯 — 무엇을 보이는가", () => {
  test("🔴 disabled 면 구역을 **아예 안 그린다** — 설정이 없는 환경에서 빈 상자가 늘지 않게", () => {
    assert.equal(markup({ kind: "disabled" }), "");
  });

  test("불러오는 중 — 「불러오는 중…」", () => {
    const html = markup({ kind: "loading" });
    assert.ok(html.includes(QUOTE_ARCHIVE_FOLDER_SECTION_LOADING_TEXT), html);
    assert.ok(html.includes("공유폴더"), html);
  });

  test("폴더가 아직 없으면 — 「아직 … 폴더가 없습니다」", () => {
    const html = markup({ kind: "not-found" });
    assert.ok(html.includes(QUOTE_ARCHIVE_FOLDER_SECTION_NOT_FOUND_TEXT), html);
    // 🔴 가리키는 단추는 [저장]이다 — 폴더를 세우는 일은 저장이 한다.
    assert.ok(QUOTE_ARCHIVE_FOLDER_SECTION_NOT_FOUND_TEXT.includes("[저장]"), QUOTE_ARCHIVE_FOLDER_SECTION_NOT_FOUND_TEXT);
    // 🔴 목록 자리가 서지 않는다.
    assert.equal(html.includes("<ul"), false, html);
  });

  test("🔴 맞는 폴더가 여럿이면 — **목록도 폴더 이름도 내지 않는다**", () => {
    const html = markup({ kind: "multiple" });
    assert.ok(html.includes(QUOTE_ARCHIVE_FOLDER_SECTION_MULTIPLE_TEXT), html);
    assert.equal(html.includes("<ul"), false, html);
    // 어느 폴더인지 모르는 채로 내용을 보이면 남의 견적서 서류를 보일 수 있다.
    assert.equal(html.includes("DSS 2026-089"), false, html);
  });

  test("읽지 못했으면 — 「공유폴더를 읽지 못했습니다」와 서버가 준 짧은 사유", () => {
    const html = markup({ kind: "failed", reason: "공유폴더에 연결할 수 없습니다(네트워크 · NAS 상태를 확인하세요)." });
    assert.ok(html.includes(QUOTE_ARCHIVE_FOLDER_SECTION_FAILED_TEXT), html);
    assert.ok(html.includes("공유폴더에 연결할 수 없습니다"), html);
    assert.equal(html.includes("<ul"), false, html);
  });

  test("빈 폴더 — 「폴더가 비어 있습니다」", () => {
    const html = markup(foundState());
    assert.ok(html.includes(QUOTE_ARCHIVE_FOLDER_SECTION_EMPTY_TEXT), html);
    assert.equal(html.includes("<ul"), false, html);
  });

  test("목록 — 줄마다 이름 · 크기 · 수정시각, 폴더는 폴더 표시", () => {
    const html = markup(
      foundState({
        entries: [
          { name: "사진", isDirectory: true, sizeBytes: 0 },
          { name: "견적서.pdf", isDirectory: false, sizeBytes: 2048, modifiedAt: "2026-09-15T01:02:03.000Z" },
        ],
        totalCount: 2,
      })
    );
    assert.ok(html.includes("사진"), html);
    assert.ok(html.includes("견적서.pdf"), html);
    assert.ok(html.includes("폴더"), html);
    assert.ok(html.includes("2.0 KB"), html);
    // 머리 오른쪽에 **루트 기준 상대 경로**가 보인다(절대 경로가 아니다).
    assert.ok(html.includes("21. 2026 내자견적서"), html);
  });

  test("🔴 잘렸으면 「더 있습니다」를 세운다", () => {
    const html = markup(foundState({ entries: [entry("1.pdf"), entry("2.pdf")], totalCount: 120, truncated: true }));
    assert.ok(html.includes("더 있습니다"), html);
    assert.ok(html.includes(quoteArchiveFolderTruncatedText(2, 120)), html);
  });

  test("그려지는 모든 상태에 print:hidden 이 있다", () => {
    assert.ok(sectionSource.includes("print:hidden"), "print:hidden 이 없다");
    const states: QuoteArchiveFolderSectionState[] = [
      { kind: "loading" },
      { kind: "not-found" },
      { kind: "multiple" },
      { kind: "failed", reason: "x" },
      foundState(),
      foundState({ entries: [entry("견적서.pdf")], totalCount: 1 }),
    ];
    for (const state of states) {
      assert.ok(markup(state).includes("print:hidden"), state.kind);
    }
  });

  test("머리는 늘 「공유폴더」다 — 한 화면에 구역이 하나뿐이라 가를 이름이 없다", () => {
    const html = markup({ kind: "loading" });
    assert.ok(html.includes(">공유폴더<"), html);
    assert.equal(html.includes("—"), false, html);
    // 🔴 머리에 id 를 박지 않는다 — 접근성 이름은 aria-label 이다.
    assert.equal(html.includes('id="'), false, html);
    assert.equal(html.includes("aria-labelledby"), false, html);
    assert.ok(html.includes('aria-label="공유폴더"'), html);
  });
});

/*
 * ============================================================================
 * 🔴 **보고 있는 그 견적서 번호의 파일만** (사용자 요구 2026-10-12)
 * ============================================================================
 * 공유폴더의 폴더를 가르는 것은 **본 번호**라 `DSS 2026-089` 와 `DSS 2026-089-1` 이 한 폴더를
 * 쓴다. 그래서 결재 탭에서 가지 번호 견적서를 열면 **다른 장의 파일까지** 보인다.
 * 거르는 규칙 자체는 quote-archive-folder-number-filter.test.ts 가 본다. 여기서는 **화면이
 * 무엇을 내는가**다: 무엇이 사라지고 · 무엇이 남고 · 숨겼다는 말이 서는가.
 * ============================================================================
 */

const BASE_NUMBER = "DSS 2026-089";
const BRANCH_NUMBER = "DSS 2026-089-1";
const BASE_XLS = `${BASE_NUMBER} 가나상사 MODEL-X1 L123 S456 전원 불량.xls`;
/** 결재본 — 같은 줄기에 ` - 有印.pdf` 만 붙은 것이라 **같은 번호로 시작**한다. */
const BASE_SIGNED_PDF = `${BASE_NUMBER} 가나상사 MODEL-X1 L123 S456 전원 불량 - 有印.pdf`;
const BRANCH_XLS = `${BRANCH_NUMBER} 가나상사 MODEL-X1 L123 S456 전원 불량(OH포함).xls`;
/** 사람이 손으로 넣은 것 — 번호로 시작하지 않는다. */
const HAND_PUT_PDF = "참고자료.pdf";

const FOLDER_ENTRIES = [entry(BASE_XLS), entry(BASE_SIGNED_PDF), entry(BRANCH_XLS), entry(HAND_PUT_PDF)];

/** 번호를 주고 그린다. */
function withNumber(state: QuoteArchiveFolderSectionState, quoteNumber: string): string {
  return renderToStaticMarkup(createElement(QuoteArchiveFolderSectionView, { state, quoteNumber }));
}

describe("🔴 그 견적서 번호의 파일만 — 폴더는 본 번호 단위라 다른 장이 섞여 있다", () => {
  test("🔴 본 번호를 보고 있으면 **가지 번호 파일이 숨는다** · 결재본 PDF 는 보인다", () => {
    const html = withNumber(foundState({ entries: FOLDER_ENTRIES, totalCount: 4 }), BASE_NUMBER);
    assert.ok(html.includes(BASE_XLS), html);
    // 🔴 `- 有印.pdf` 는 같은 번호로 시작하므로 **보여야 한다**.
    assert.ok(html.includes(BASE_SIGNED_PDF), html);
    assert.equal(html.includes(BRANCH_XLS), false, "가지 번호 파일이 그대로 보인다");
    assert.equal(html.includes(HAND_PUT_PDF), false, "번호로 시작하지 않는 파일이 그대로 보인다");
  });

  test("🔴 가지 번호를 보고 있으면 **본 번호 파일이 숨는다**", () => {
    const html = withNumber(foundState({ entries: FOLDER_ENTRIES, totalCount: 4 }), BRANCH_NUMBER);
    assert.ok(html.includes(BRANCH_XLS), html);
    assert.equal(html.includes(BASE_XLS), false, "본 번호 파일이 그대로 보인다");
    assert.equal(html.includes(BASE_SIGNED_PDF), false, "본 번호 결재본이 그대로 보인다");
  });

  test("🔴 숨긴 줄이 있으면 **그 개수를 한 줄로** 알린다 — 「파일이 없어졌다」고 여기지 않게", () => {
    const html = withNumber(foundState({ entries: FOLDER_ENTRIES, totalCount: 4 }), BASE_NUMBER);
    // 가지 번호 한 장 + 손으로 넣은 한 장.
    assert.ok(html.includes(quoteArchiveFolderHiddenByNumberText(2)), html);
    // 🔴 [전부 보기] 토글은 만들지 않는다(사용자 결정) — 맨 아래 [폴더 열기]가 그 자리다.
    assert.ok(quoteArchiveFolderHiddenByNumberText(2).includes("[폴더 열기]"));
    assert.equal(sectionCode.includes("전부 보기"), false, "[전부 보기] 토글이 생겼다");
  });

  test("🔴 거르고 나니 **0 줄**이면 — 빈 폴더와 **다른 글자**다(폴더에 파일은 있다)", () => {
    const html = withNumber(foundState({ entries: FOLDER_ENTRIES, totalCount: 4 }), "DSS 2026-099");
    assert.ok(html.includes(QUOTE_ARCHIVE_FOLDER_SECTION_NO_MATCH_TEXT), html);
    assert.equal(html.includes(QUOTE_ARCHIVE_FOLDER_SECTION_EMPTY_TEXT), false, "빈 폴더와 같은 말을 한다");
    assert.notEqual(QUOTE_ARCHIVE_FOLDER_SECTION_NO_MATCH_TEXT, QUOTE_ARCHIVE_FOLDER_SECTION_EMPTY_TEXT);
    // 숨긴 개수도 함께 — 네 줄 전부 숨었다.
    assert.ok(html.includes(quoteArchiveFolderHiddenByNumberText(4)), html);
    // 목록 자리가 서지 않는다.
    assert.equal(html.includes("<ul"), false, html);
    // 🔴 폴더는 찾았으니 맨 아래 [폴더 열기]가 설 자리는 그대로다.
    assert.equal(quoteArchiveFolderOpenPath(foundState({ entries: FOLDER_ENTRIES })), RELATIVE_PATH);
  });

  test("정말 빈 폴더는 **예전 그대로** — 「폴더가 비어 있습니다」, 숨겼다는 말이 없다", () => {
    const html = withNumber(foundState({ entries: [], totalCount: 0 }), BASE_NUMBER);
    assert.ok(html.includes(QUOTE_ARCHIVE_FOLDER_SECTION_EMPTY_TEXT), html);
    assert.equal(html.includes("숨겼습니다"), false, html);
    assert.equal(html.includes(QUOTE_ARCHIVE_FOLDER_SECTION_NO_MATCH_TEXT), false, html);
  });

  test("🔴 번호가 **빈 글자**면 거르지 않는다 — 파일이 통째로 사라지면 안 된다", () => {
    const html = withNumber(foundState({ entries: FOLDER_ENTRIES, totalCount: 4 }), "");
    for (const name of [BASE_XLS, BASE_SIGNED_PDF, BRANCH_XLS, HAND_PUT_PDF]) {
      assert.ok(html.includes(name), name);
    }
    assert.equal(html.includes("숨겼습니다"), false, html);
  });

  test("🔴 번호에서 **키를 못 뽑으면** 전부 보인다 — 개발 DB 에 실제로 있는 모양들이다", () => {
    for (const odd of ["Q-7", "QT-2024-115", "DSS2026-089", "견적서"]) {
      const html = withNumber(foundState({ entries: FOLDER_ENTRIES, totalCount: 4 }), odd);
      for (const name of [BASE_XLS, BASE_SIGNED_PDF, BRANCH_XLS, HAND_PUT_PDF]) {
        assert.ok(html.includes(name), `${odd}: ${name} 이 사라졌다`);
      }
      assert.equal(html.includes("숨겼습니다"), false, odd);
    }
  });

  test("🔴 칸을 **주지 않으면** 전부 보인다", () => {
    const html = markup(foundState({ entries: FOLDER_ENTRIES, totalCount: 4 }));
    for (const name of [BASE_XLS, BASE_SIGNED_PDF, BRANCH_XLS, HAND_PUT_PDF]) {
      assert.ok(html.includes(name), name);
    }
    assert.equal(html.includes("숨겼습니다"), false, html);
  });

  test("숨긴 줄의 [열기] 자리도 함께 사라진다 — 남은 줄에만 단추가 선다", () => {
    const html = withNumber(
      foundState({ entries: [entry(BASE_XLS), entry(BRANCH_XLS), entry(HAND_PUT_PDF)], totalCount: 3 }),
      BASE_NUMBER
    );
    assert.equal(html.match(/data-quote-archive-folder-entry-openable/g)?.length, 1, html);
  });

  test("거를 때도 잘림 곁말은 그대로 선다 — **서버가 읽은 몫**을 말하는 줄이다", () => {
    const html = withNumber(foundState({ entries: FOLDER_ENTRIES, totalCount: 120, truncated: true }), BASE_NUMBER);
    assert.ok(html.includes(quoteArchiveFolderTruncatedText(4, 120)), html);
    assert.ok(html.includes(quoteArchiveFolderHiddenByNumberText(2)), html);
  });

  test("🔴 거르는 규칙을 **베끼지 않았다** — 순수 함수 한 벌을 그대로 쓴다", () => {
    assert.ok(
      sectionSource.includes(
        'import { filterQuoteArchiveEntriesByQuoteNumber } from "./quote-archive-folder-number-filter";'
      ),
      "거르는 함수를 가져다 쓰지 않는다"
    );
    // 🔴 본 번호로 깎으면 가지 번호 견적서에서 전부 다시 보인다.
    assert.equal(sectionCode.includes("quoteArchiveBaseNumber"), false, "구역이 본 번호로 깎는다");
    // 견주기를 이 파일이 다시 짜지 않는다 — 번호 규칙을 두 벌로 두면 갈라진다.
    for (const forbidden of ["matchesShareFolderPrefix", "quoteNumberFromArchiveFileName", "quoteArchiveNumberKey"]) {
      assert.equal(sectionCode.includes(forbidden), false, `구역이 견주기를 제 손으로 한다: ${forbidden}`);
    }
    // 기본 내보내기가 받은 번호를 그대로 내려보낸다.
    assert.ok(sectionCode.includes("quoteNumber={quoteNumber}"), sectionCode);
  });

  test("🔴 **거르기는 화면에서만** 한다 — 서버 통로를 부르는 길은 하나 그대로다", () => {
    // 통로 주소에 번호를 실어 보내는 칸이 생기지 않았다(그 통로는 [Excel 보기]도 쓴다).
    assert.equal(quoteArchiveFolderEntriesUrl("q-1"), "/api/quotes/q-1/archive-folder/entries");
    assert.equal(sectionCode.includes("?quoteNumber="), false, "통로에 번호를 실어 보낸다");
    assert.equal(/quoteArchiveFolderEntriesUrl\([^)]*,/.test(sectionCode), false, "통로 주소에 칸이 늘었다");
    assert.equal(sectionCode.includes("?path="), false, "하위 폴더로 내려가는 칸이 생겼다");
  });
});

/*
 * ============================================================================
 * 🔴 줄의 [열기] — **허용 목록 확장자의 파일 줄에만** 생긴다
 * ============================================================================
 * 서버 렌더에서는 단추 자체가 안 그려지므로(도우미는 Windows PC 에만 설치된다) **어느 줄이
 * 단추 자리를 갖는가**를 `data-quote-archive-folder-entry-openable` 표시로 본다.
 * ============================================================================
 */

describe("줄의 [열기] — 누를 수 있는 줄에만", () => {
  test("🔴 폴더 줄 · 확장자 없는 이름 · 허용 목록 밖 확장자에는 단추 자리가 **없다**", () => {
    for (const bad of [
      { name: "사진", isDirectory: true, sizeBytes: 0 },
      { name: "메모", isDirectory: false, sizeBytes: 10 },
      { name: "설치.exe", isDirectory: false, sizeBytes: 10 },
      { name: "바로가기.lnk", isDirectory: false, sizeBytes: 10 },
      { name: "견적서.pdf.", isDirectory: false, sizeBytes: 10 },
    ]) {
      assert.equal(canOpenQuoteArchiveFolderEntry(bad), false, bad.name);
      const html = markup(foundState({ entries: [bad], totalCount: 1 }));
      assert.equal(html.includes("data-quote-archive-folder-entry-openable"), false, bad.name);
    }
  });

  test("🔴 허용 목록 확장자의 파일 줄에만 단추 자리가 선다", () => {
    for (const good of ["견적서.xlsx", "견적서.xls", "연락서.xlsm", "결재.PDF", "사진.jpg", "자료.zip"]) {
      assert.equal(canOpenQuoteArchiveFolderEntry(entry(good)), true, good);
    }
    const html = markup(
      foundState({
        entries: [
          { name: "사진", isDirectory: true, sizeBytes: 0 },
          entry("견적서.xlsx"),
          entry("설치.exe"),
          entry("결재.pdf"),
        ],
        totalCount: 4,
      })
    );
    assert.equal(html.match(/data-quote-archive-folder-entry-openable/g)?.length, 2, html);
  });

  test("🔴 폴더 경로를 모르면(빈 글자) 아무 줄에도 단추 자리를 두지 않는다 — 주소를 지어내지 않는다", () => {
    const html = markup(foundState({ relativePath: "", entries: [entry("견적서.xlsx")], totalCount: 1 }));
    assert.equal(html.includes("data-quote-archive-folder-entry-openable"), false, html);
  });

  test("🔴 여는 장치를 **베끼지 않았다** — 이미 있는 한 벌을 그대로 쓴다", () => {
    assert.ok(
      sectionSource.includes(
        'import ContactFolderEntryOpenButton from "@/components/repair-cases/files/ContactFolderEntryOpenButton";'
      ),
      "줄의 [열기] 단추를 가져다 쓰지 않는다"
    );
    // 주소를 만드는 일 · 도우미를 감지하는 일을 이 파일이 다시 짜지 않는다.
    for (const forbidden of ["dss-folder://", "iframe", "localStorage", "buildQuoteFolderFileLink", "watchFocusLoss"]) {
      assert.equal(sectionCode.includes(forbidden), false, `여는 장치를 베꼈다: ${forbidden}`);
    }
    // 어느 줄에 단추를 그릴지는 순수 함수 하나가 정한다 — 화면이 확장자를 따로 세지 않는다.
    assert.ok(sectionCode.includes("isOpenableQuoteFolderFileName"));
    assert.equal(/\.endsWith\(/.test(sectionCode), false, "화면이 확장자를 제 손으로 센다");
  });

  test("🔴 [열기]를 누르면 **늘** 「설치 명령 복사」로 이끄는 줄이 함께 나온다", () => {
    // 예전에 설치한 도우미는 파일 열기 주소를 받으면 조용히 끝난다(exit 2) — 화면은 그것을 알 수 없다.
    assert.ok(CONTACT_FOLDER_FILE_HELPER_REINSTALL_TEXT.includes("설치 명령 복사"));
    assert.ok(CONTACT_FOLDER_FILE_HELPER_REINSTALL_TEXT.includes("예전에 설치한 도우미는 파일 열기를 모릅니다"));
  });

  test("견적서 폴더 경로 + 파일 이름이 도우미 주소가 된다 — 되읽으면 같은 글자다", () => {
    const relative = `${RELATIVE_PATH}/견적서.xlsx`;
    const link = buildQuoteFolderFileLink(relative);
    assert.ok(link !== null, "주소를 만들지 못했다");
    assert.equal(parseQuoteFolderFileLink(link), relative);
    // 허용 목록 밖은 주소가 만들어지지 않는다.
    assert.equal(buildQuoteFolderFileLink(`${RELATIVE_PATH}/설치.exe`), null);
  });
});

/*
 * ============================================================================
 * 🔴 구역 맨 아래의 [폴더 열기] — **폴더를 찾았을 때만**
 * ============================================================================
 * 단추 자체는 자리 열기 단추 한 벌을 그대로 쓰므로(ContactFolderPlaceOpenButton) 눌렀을 때의
 * 흐름 · Windows 판단 · 「설치 명령 복사」 안내는 그쪽 시험이 본다. 여기서는 **언제 서고
 * 언제 서지 않는가**를 순수 함수 하나(quoteArchiveFolderOpenPath)로 보고, **베끼지 않았다**는
 * 것을 원본 글자로 본다.
 * ============================================================================
 */
describe("구역 맨 아래의 [폴더 열기] — 열 자리가 있을 때만", () => {
  test("🔴 폴더를 찾았으면 선다 — 줄의 [열기]와 **같은 경로**를 쥔다", () => {
    assert.equal(quoteArchiveFolderOpenPath(foundState()), RELATIVE_PATH);
    assert.equal(
      quoteArchiveFolderOpenPath(foundState({ entries: [entry("견적서.xlsx")], totalCount: 1 })),
      RELATIVE_PATH
    );
    // 🔴 빈 폴더에도 선다 — 폴더는 있다(거기에 파일을 넣으러 연다).
    assert.equal(quoteArchiveFolderOpenPath(foundState({ entries: [], totalCount: 0 })), RELATIVE_PATH);
  });

  test("🔴 not-found · multiple · disabled · failed · 불러오는 중에는 **안 선다**", () => {
    for (const state of [
      { kind: "not-found" },
      // 어느 폴더인지 모르는 채로 아무 폴더나 열어 주면 안 된다.
      { kind: "multiple" },
      { kind: "disabled" },
      { kind: "failed", reason: "공유폴더에 연결할 수 없습니다" },
      { kind: "loading" },
    ] satisfies QuoteArchiveFolderSectionState[]) {
      assert.equal(quoteArchiveFolderOpenPath(state), "", state.kind);
    }
    // disabled 는 구역 자체가 없으니 단추가 설 자리도 없다.
    assert.equal(markup({ kind: "disabled" }), "");
  });

  test("🔴 폴더 경로를 모르면(빈 글자) 안 선다 — 주소를 지어내지 않는다", () => {
    assert.equal(quoteArchiveFolderOpenPath(foundState({ relativePath: "" })), "");
  });

  test("🔴 판단이 **한 자리**에만 있다 — 줄의 [열기]도 같은 함수를 본다", () => {
    assert.ok(sectionCode.includes("const relativePath = quoteArchiveFolderOpenPath(state);"), sectionCode);
    // 🔴 그리는 줄은 **거른 뒤의 줄**이다. 거르지 않으면 `state.entries` 그대로다.
    assert.ok(sectionCode.includes("<EntryList entries={shown.entries} relativePath={relativePath} />"));
    assert.ok(
      sectionCode.includes('{relativePath !== "" && <ContactFolderPlaceOpenButton relativePath={relativePath} />}'),
      sectionCode.slice(sectionCode.indexOf("ContactFolderPlaceOpenButton relativePath"))
    );
  });

  test("🔴 여는 장치를 **베끼지 않았다** — 자리 열기 단추 한 벌을 그대로 쓴다", () => {
    assert.ok(
      sectionSource.includes(
        'import ContactFolderPlaceOpenButton from "@/components/repair-cases/files/ContactFolderPlaceOpenButton";'
      ),
      "자리 열기 단추를 가져다 쓰지 않는다"
    );
    // 🔴 단추를 새로 만들지 않았다 — 이 구역에는 제 <button> 이 하나도 없다.
    assert.equal(/<button/.test(sectionCode), false, "구역이 제 단추를 그린다");
    assert.equal(sectionCode.includes("runContactFolderPlaceOpen"), false, "여는 흐름을 직접 부른다");
  });

  test("🔴 「설치 명령 복사」 안내를 끄지 않는다 — 단추가 제 결과 줄로 함께 낸다", () => {
    // 그 줄을 끄는 칸(그런 것이 있다면) 을 넘기지 않는다 — 넘기는 값은 경로 하나뿐이다.
    const call = sectionCode.slice(sectionCode.indexOf("<ContactFolderPlaceOpenButton"));
    assert.ok(call.startsWith("<ContactFolderPlaceOpenButton relativePath={relativePath} />"), call.slice(0, 200));
  });

  test("자리 — 목록 **아래**, 구역 맨 끝", () => {
    const list = sectionCode.indexOf("<EntryList");
    const open = sectionCode.indexOf("<ContactFolderPlaceOpenButton");
    const close = sectionCode.indexOf("</section>");
    assert.ok(list >= 0 && list < open && open < close, "단추가 목록 위이거나 구역 밖이다");
  });

  test("인쇄에는 안 찍힌다 — 바깥 틀과 단추 둘 다 print:hidden", () => {
    assert.ok(markup(foundState({ entries: [entry("견적서.xlsx")], totalCount: 1 })).includes("print:hidden"));
    const buttonSource = readFileSync(
      path.join(srcDir, "components", "repair-cases", "files", "ContactFolderPlaceOpenButton.tsx"),
      "utf8"
    );
    assert.ok(buttonSource.includes("print:hidden"), "자리 열기 단추가 인쇄에 찍힌다");
  });
});

/*
 * ============================================================================
 * 🔴 줄은 **표**다 — [이름] [수정날짜] [크기] [동작]
 * ============================================================================
 * 🔴 1fr 은 이름 하나뿐이고 수정날짜·크기·동작은 고정 길이라 **줄에 단추가 있든 없든
 * 세 칸의 자리가 같다.** 한 벌의 규칙 자체는 unit 목록의 share-folder-entry-meta.test.ts 가
 * 본다 — 여기서는 **이 구역이 실제로 그렇게 그리는가**를 상태를 넣어 그려 보고 잰다.
 * ============================================================================
 */
describe("🔴 표 네 칸 — 이름 · 수정날짜 · 크기 · 동작", () => {
  test("수정날짜와 크기가 **따로** 나온다 — 한 글자로 이어 붙지 않는다", () => {
    const html = markup(
      foundState({
        entries: [{ name: "견적서.xlsx", isDirectory: false, sizeBytes: 2048, modifiedAt: ISO }],
        totalCount: 1,
      })
    );
    assert.deepEqual(metaCells(html, SHARE_FOLDER_ENTRY_META_SIZE_CLASS), ["2.0 KB"]);
    assert.deepEqual(metaCells(html, SHARE_FOLDER_ENTRY_META_MODIFIED_CLASS), [LOCAL_TIME]);
    // 🔴 가운뎃점으로 이어 붙이던 자리가 없다.
    assert.equal(html.includes(`2.0 KB · ${LOCAL_TIME}`), false, html);
    assert.equal(html.includes("·"), false, html);
  });

  test("🔴 열 차례가 **이름 → 수정날짜 → 크기 → 동작**이다(윈도우 탐색기와 같게)", () => {
    const html = markup(
      foundState({
        entries: [{ name: "견적서.xlsx", isDirectory: false, sizeBytes: 2048, modifiedAt: ISO }],
        totalCount: 1,
      })
    );
    const nameAt = html.indexOf("견적서.xlsx");
    const modifiedAt = html.indexOf(`class="${SHARE_FOLDER_ENTRY_META_MODIFIED_CLASS}"`);
    const sizeAt = html.indexOf(`class="${SHARE_FOLDER_ENTRY_META_SIZE_CLASS}"`);
    const actionsAt = html.indexOf(`class="${SHARE_FOLDER_ENTRY_ACTIONS_CLASS}"`);
    assert.ok(nameAt > 0 && modifiedAt > 0 && sizeAt > 0 && actionsAt > 0, html);
    assert.ok(nameAt < modifiedAt, "이름이 수정날짜보다 뒤에 있다");
    assert.ok(modifiedAt < sizeAt, "수정날짜가 크기보다 뒤에 있다");
    assert.ok(sizeAt < actionsAt, "크기가 동작보다 뒤에 있다");
  });

  test("🔴 단추가 있는 줄과 없는 줄이 **같은 표 틀**을 쓴다 — 동작 칸은 비어도 남는다", () => {
    const html = markup(
      foundState({
        entries: [
          { name: "사진", isDirectory: true, sizeBytes: 0, modifiedAt: ISO },
          { name: "메모", isDirectory: false, sizeBytes: 11 },
          { name: "견적서.xlsx", isDirectory: false, sizeBytes: 2048, modifiedAt: ISO },
        ],
        totalCount: 3,
      })
    );
    const rows = liClasses(html);
    assert.equal(rows.length, 3, html);
    assert.equal(new Set(rows).size, 1, rows.join(" | "));
    assert.ok(rows[0]?.includes("sm:grid-cols-[minmax(0,1fr)_10rem_5rem_9rem]"), rows[0]);
    assert.equal(cellCount(html, SHARE_FOLDER_ENTRY_ACTIONS_CLASS), 3, html);
  });

  test("🔴 수정시각이 없는 줄도 **칸은 남고 글자만 빈다** — 안 그러면 그 줄만 열이 어긋난다", () => {
    const html = markup(
      foundState({
        entries: [
          { name: "사진", isDirectory: true, sizeBytes: 0, modifiedAt: ISO },
          { name: "견적서.xlsx", isDirectory: false, sizeBytes: 2048 },
          { name: "결재.pdf", isDirectory: false, sizeBytes: 512, modifiedAt: ISO },
        ],
        totalCount: 3,
      })
    );
    // 세 줄 모두 두 칸을 그린다 — 가운데 줄만 수정시각 글자가 비어 있다.
    assert.deepEqual(metaCells(html, SHARE_FOLDER_ENTRY_META_SIZE_CLASS), ["폴더", "2.0 KB", "512 B"]);
    assert.deepEqual(metaCells(html, SHARE_FOLDER_ENTRY_META_MODIFIED_CLASS), [LOCAL_TIME, "", LOCAL_TIME]);
  });

  test("🔴 좁은 화면 배치가 남아 있다 — 표는 sm 이상에서만 선다", () => {
    const html = markup(
      foundState({ entries: [{ name: "결재.pdf", isDirectory: false, sizeBytes: 1 }], totalCount: 1 })
    );
    const row = liClasses(html)[0] ?? "";
    assert.ok(row.includes("flex flex-wrap"), row);
    assert.ok(row.includes("sm:grid"), row);
    assert.equal(/(^|\s)grid(\s|$)/.test(row), false, row);
  });

  test("🔴 공용 생김새를 그대로 쓴다 — 날짜도 열 길이도 제 손으로 적지 않는다", () => {
    const html = markup(
      foundState({ entries: [{ name: "결재.pdf", isDirectory: false, sizeBytes: 1 }], totalCount: 1 })
    );
    assert.ok(html.includes(`class="${SHARE_FOLDER_ENTRY_ACTIONS_CLASS}"`), html);
    assert.ok(sectionCode.includes('from "@/lib/domain/share-folder-entry-meta"'), "공용 조각을 안 쓴다");
    assert.equal(sectionCode.includes("toLocaleString"), false, sectionCode);
    assert.equal(sectionCode.includes("grid-cols-"), false, "열 길이를 제 손으로 적는다");
  });

  test("🔴 못 읽는 값은 **원본 그대로** 보인다", () => {
    const html = markup(
      foundState({
        entries: [{ name: "결재.pdf", isDirectory: false, sizeBytes: 1, modifiedAt: "날짜아님" }],
        totalCount: 1,
      })
    );
    assert.deepEqual(metaCells(html, SHARE_FOLDER_ENTRY_META_MODIFIED_CLASS), ["날짜아님"]);
    // 날것(ISO)이 그대로 나가지 않는다.
    assert.equal(
      markup(foundState({ entries: [{ name: "a.pdf", isDirectory: false, sizeBytes: 1, modifiedAt: ISO }], totalCount: 1 })).includes(ISO),
      false
    );
  });

  test("줄의 곁말 — 폴더는 「폴더」, 파일은 크기", () => {
    assert.equal(quoteArchiveFolderEntryMeta({ name: "사진", isDirectory: true, sizeBytes: 0 }).sizeText, "폴더");
    assert.equal(
      quoteArchiveFolderEntryMeta({ name: "a.pdf", isDirectory: false, sizeBytes: 2048 }).sizeText,
      "2.0 KB"
    );
  });
});

/*
 * ============================================================================
 * 🔴 자리 — **견적서 상세의 [견적서 결재] 탭, 「견적서 승인」 바로 위**
 * ============================================================================
 * 결재하는 사람이 **승인을 누르기 전에** 그 견적서 폴더를 열어 확인할 수 있어야 한다는
 * 사용자 요구다. 자리는 결재 칸의 **첫 덩이**이고, 「견적서 승인」 상자와는 **따로 선다** —
 * 뜻이 다른 둘이라(하나는 폴더를 보는 곳, 하나는 결재하는 곳) 한 상자로 보이면 안 된다.
 *
 * 🔴 차례는 **그려진 결과**로 잰다. 승인 패널 자체는 서버 액션을 물고 있어 이 환경에서
 * 그릴 수 없으므로(그 파일 머리말), 그 자리에 표 하나를 세우고 껍데기를 그려 본다.
 * ============================================================================
 */
describe("자리 — 견적서 상세 [견적서 결재] 탭의 「견적서 승인」 위", () => {
  /** 🔴 승인 구역이 설 자리를 대신하는 표. */
  const APPROVAL_STAND_IN = "견적서승인이있던자리";
  const EDIT_STAND_IN = "편집폼이있던자리";

  const tabsMarkup = (): string =>
    renderToStaticMarkup(
      createElement(QuoteEditTabs, {
        editForm: createElement("p", null, EDIT_STAND_IN),
        archiveFolderSection: createElement(QuoteArchiveFolderSectionView, {
          state: foundState({ entries: [entry("DSS 2026-089 견적서.xlsx")], totalCount: 1 }),
        }),
        approvalPanel: createElement("p", null, APPROVAL_STAND_IN),
      })
    );

  test("🔴 그려진 차례 — 공유폴더 구역이 승인 구역보다 **앞**이다", () => {
    const html = tabsMarkup();
    const section = html.indexOf("data-quote-archive-folder-section");
    const approval = html.indexOf(APPROVAL_STAND_IN);
    assert.ok(section >= 0, `공유폴더 구역이 그려지지 않았다: ${html}`);
    assert.ok(approval >= 0, `승인 구역이 그려지지 않았다: ${html}`);
    assert.ok(section < approval, "공유폴더 구역이 승인 구역보다 뒤에 그려졌다");
  });

  test("🔴 결재 칸 **안**이다 — 편집 칸에는 들어가지 않는다", () => {
    const html = tabsMarkup();
    const editPanelAt = html.indexOf('id="quote-tab-panel-edit"');
    const approvalPanelAt = html.indexOf('id="quote-tab-panel-approval"');
    assert.ok(editPanelAt >= 0 && approvalPanelAt > editPanelAt, html);
    assert.ok(
      html.indexOf("data-quote-archive-folder-section") > approvalPanelAt,
      "구역이 결재 칸 밖(편집 칸)에 그려졌다"
    );
    // 편집 칸은 예전 그대로 — 넘긴 것 하나뿐이다.
    const editPanel = html.slice(editPanelAt, approvalPanelAt);
    assert.ok(editPanel.includes(EDIT_STAND_IN), editPanel);
    assert.equal(editPanel.includes("data-quote-archive-folder-section"), false, editPanel);
  });

  test("🔴 한 상자로 보이지 않는다 — 승인 패널 안이 아니라 그 곁이고, 사이가 떠 있다", () => {
    // 승인 패널이 구역을 제 상자 안에 품으면 테두리 하나짜리 한 덩이가 된다.
    assert.equal(
      approvalPanelSource.includes("QuoteArchiveFolderSection"),
      false,
      "승인 패널이 공유폴더 구역을 제 상자 안에 품었다"
    );
    // 두 덩이를 담는 상자가 **사이를 띄운다** — 붙여 두면 테두리 둘이 맞닿아 한 상자로 읽힌다.
    const wrapper = /id="quote-tab-panel-approval"[^>]*><div class="([^"]*)"><section/.exec(tabsMarkup());
    assert.ok(wrapper, "결재 칸의 첫 덩이가 공유폴더 구역이 아니다");
    assert.ok(wrapper[1]?.includes("gap-"), `두 구역 사이가 붙어 있다: ${wrapper[1]}`);
  });

  test("🔴 감출 칸에는 배치용 class 를 붙이지 않았다 — 붙이면 감추는 장치가 진다", () => {
    // 처음 열리는 탭은 [견적서 수정] 이라 결재 칸이 감춰져 있다. 그 칸에 `flex` 가 붙으면
    // 작성자 스타일이 `hidden` 속성을 이겨 **안 보여야 할 칸이 그대로 보인다**(껍데기 머리말).
    const outer = /<div id="quote-tab-panel-approval"[^>]*>/.exec(tabsMarkup())?.[0] ?? "";
    assert.ok(outer.includes("hidden"), outer);
    assert.equal(/class="[^"]*flex/.test(outer), false, `감출 칸에 배치용 class 가 붙었다: ${outer}`);
  });

  test("🔴 상세 화면이 **그 장의 번호**를 넘긴다 — 본 번호로 깎지 않는다", () => {
    assert.ok(
      quoteDetailPage.includes(
        'import QuoteArchiveFolderSection from "@/components/quotes/QuoteArchiveFolderSection";'
      ),
      "상세 화면이 이 구역을 가져오지 않는다"
    );
    assert.ok(
      quoteDetailPage.includes(
        "archiveFolderSection={<QuoteArchiveFolderSection quoteId={quote.id} quoteNumber={quote.quoteNumber} />}"
      ),
      quoteDetailPage.slice(quoteDetailPage.indexOf("archiveFolderSection"))
    );
    assert.equal(quoteDetailPage.includes("quoteArchiveBaseNumber"), false, "상세 화면이 번호를 깎아 넘긴다");
  });

  test("🔴 상세 화면이 서버에서 공유폴더를 읽지 않는다 — NAS 가 느린 날에도 화면은 뜬다", () => {
    for (const forbidden of [
      "listQuoteArchiveEntries",
      "resolveQuoteArchiveRoot",
      "findQuoteArchiveFolder",
      "node:fs",
    ]) {
      assert.equal(quoteDetailPageCode.includes(forbidden), false, `상세 화면이 공유폴더를 읽는다: ${forbidden}`);
    }
  });
});

/*
 * ============================================================================
 * 🔴 자리 — **견적서 편집 화면에는 세우지 않는다** (사용자 결정 2026-10-06)
 * ============================================================================
 * 「견적서 수정에서는 공유폴더가 보이지 않아도 돼」. 🔴 **머리의 폴더 열기 단추는 그대로**다 —
 * 그것은 전부터 있던 다른 물건이다.
 * ============================================================================
 */
describe("자리 — 견적서 편집 화면에는 세우지 않는다", () => {
  test("🔴 편집 화면에 공유폴더 구역이 **없다** — 그리지도 가져오지도 않는다", () => {
    assert.equal(
      editFormSource.includes("QuoteArchiveFolderSection"),
      false,
      "편집 화면이 구역을 가져온다"
    );
    // 통로를 직접 부르는 길도 없다.
    assert.equal(editFormSource.includes("archive-folder"), false, "편집 화면이 공유폴더 통로를 부른다");
  });

  test("🔴 머리 단추 한 벌을 이 구역이 **베끼지 않았다** — 저장소 울타리와 같은 뜻", () => {
    // 그 단추를 부르는 원본은 편집 화면과 제 파일뿐이다(quote-folder-open-screens.test.ts).
    for (const forbidden of ["QuoteFolderOpenButton", "runQuoteFolderOpen", "quote-folder-open"]) {
      assert.equal(sectionCode.includes(forbidden), false, `구역이 머리 단추 한 벌을 가져다 쓴다: ${forbidden}`);
    }
    // 🔴 주석에도 들어오면 안 된다 — 울타리 시험은 글자로 훑는다.
    assert.equal(sectionSource.includes("QuoteFolderOpenButton"), false, "주석에 그 이름이 들어왔다");
  });

  test("🔴 서버 컴포넌트에서 읽지 않는다 — 화면이 뜬 뒤 스스로 부른다", () => {
    assert.ok(sectionSource.startsWith('"use client";'), "클라이언트 구역이 아니다");
    assert.ok(sectionSource.includes("useEffect("), "화면이 뜬 뒤 부르지 않는다");
    // 서버 액션 · server-only 사슬이 없다 — 그려 보는 시험이 그냥 돈다.
    assert.equal(sectionSource.includes("server-only"), false);
    assert.equal(sectionSource.includes('"use server"'), false);
  });

  test("🔴 통로를 부르는 길을 **베끼지 않았다** — 먼저 와 있던 모듈을 그대로 쓴다", () => {
    assert.ok(sectionCode.includes('from "./quote-archive-folder-entries"'), "㉠ 을 가져다 쓰지 않는다");
    // 응답을 읽는 일 · 주소를 만드는 일이 이 파일에 또 있지 않다.
    for (const forbidden of ["readQuoteArchiveFolderEntriesAnswer", "/archive-folder/entries"]) {
      assert.equal(sectionCode.includes(forbidden), false, `㉠ 을 베꼈다: ${forbidden}`);
    }
  });

  test("기본 내보내기도 그려진다 — 처음에는 「불러오는 중…」", () => {
    const html = renderToStaticMarkup(createElement(QuoteArchiveFolderSection, { quoteId: "q-1" }));
    assert.ok(html.includes(QUOTE_ARCHIVE_FOLDER_SECTION_LOADING_TEXT), html);
  });
});
