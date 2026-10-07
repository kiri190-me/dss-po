import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  QUOTE_ARCHIVE_FOLDER_SECTION_FAILED_TEXT,
  QUOTE_ARCHIVE_FOLDER_SECTION_MULTIPLE_TEXT,
  QUOTE_ARCHIVE_FOLDER_SECTION_NOT_FOUND_TEXT,
  loadQuoteArchiveFolderEntries,
  quoteArchiveFolderEntriesUrl,
  readQuoteArchiveFolderEntriesAnswer,
} from "./quote-archive-folder-entries";

/**
 * ============================================================================
 * 공유폴더 안 목록을 받아 오는 길 — 🔴 **던지지 않고, 경로를 들이지 않는다**
 * ============================================================================
 * 🔴 **A/S 에서 가져왔다**(2026-10-07). 원본은 저쪽의
 * `QuoteArchiveFolderSection.test.tsx` 가운데 「통로를 부르는 길 — 던지지 않는다」
 * 묶음이다(저쪽 327~392줄). 🔴 **단언은 하나도 빼지 않았다** — 저쪽의 나머지 묶음은
 * **구역을 그리는 부분**을 재는 것이라 이 사이트에 오지 않았다(그 부분이 안 왔다 —
 * quote-archive-folder-entries.ts 머리말 ㉡).
 *
 * 저쪽에서 `sectionCode`(원본 글자)로 재던 한 줄(「하위 폴더 칸이 생겼다」)은 이 파일의
 * 원본을 읽어 같은 것을 잰다.
 * ============================================================================
 */

const RELATIVE_PATH = "21. 2026 내자견적서/DSS 2026-078 가나상사 MODEL-X";
const moduleSource = readFileSync(new URL("./quote-archive-folder-entries.ts", import.meta.url), "utf8");

describe("통로를 부르는 길 — 던지지 않는다", () => {
  test("주소 — 🔴 하위 폴더 칸이 없다", () => {
    assert.equal(quoteArchiveFolderEntriesUrl("q-1"), "/api/quotes/q-1/archive-folder/entries");
    assert.equal(quoteArchiveFolderEntriesUrl("a/b"), "/api/quotes/a%2Fb/archive-folder/entries");
    assert.equal(moduleSource.includes("?path="), false, "하위 폴더로 내려가는 칸이 생겼다");
  });

  test("🔴 알려진 칸만 옮긴다 — 응답에 다른 칸이 끼어 있어도 화면까지 오지 않는다", () => {
    const answer = readQuoteArchiveFolderEntriesAnswer({
      status: "found",
      relativePath: RELATIVE_PATH,
      // 🔴 서버가 실수로 실어 보내도 화면 값에는 들어오지 않는다.
      absolutePath: "/mnt/share/견적서",
      root: "/mnt/share",
      entries: [{ name: "견적서.xlsx", isDirectory: false, sizeBytes: 10, absolutePath: "/mnt/share/x" }],
      totalCount: 1,
      truncated: false,
    });
    assert.ok(answer !== null && answer.kind === "found");
    if (answer === null || answer.kind !== "found") throw new Error("unreachable");
    assert.deepEqual(Object.keys(answer).sort(), ["entries", "kind", "relativePath", "totalCount", "truncated"]);
    assert.deepEqual(Object.keys(answer.entries[0]).sort(), ["isDirectory", "name", "sizeBytes"]);
    assert.equal(JSON.stringify(answer).includes("/mnt/share"), false, JSON.stringify(answer));
  });

  test("모양이 다르면 null — 부르는 쪽은 「읽지 못했습니다」가 된다", () => {
    for (const bad of [null, "x", 1, [], { status: "뭔가" }]) {
      assert.equal(readQuoteArchiveFolderEntriesAnswer(bad), null, JSON.stringify(bad));
    }
  });

  test("🔴 네트워크가 끊겨도 던지지 않는다 — failed 한 상태로 끝난다", async () => {
    const thrown = await loadQuoteArchiveFolderEntries("q-1", () => Promise.reject(new Error("끊김")));
    assert.equal(thrown.kind, "failed");

    const rejected = await loadQuoteArchiveFolderEntries("q-1", () =>
      Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ error: "권한이 없습니다.", code: "FORBIDDEN" }) })
    );
    assert.deepEqual(rejected, { kind: "failed", reason: "권한이 없습니다." });

    const broken = await loadQuoteArchiveFolderEntries("q-1", () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error("JSON 아님")) })
    );
    assert.equal(broken.kind, "failed");
  });

  test("성공 — 부르는 주소가 그 견적서의 것이고, 받은 상태를 그대로 쓴다", async () => {
    const called: string[] = [];
    const state = await loadQuoteArchiveFolderEntries("q-7", (url) => {
      called.push(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "found",
            relativePath: RELATIVE_PATH,
            entries: [{ name: "견적서.xlsx", isDirectory: false, sizeBytes: 10 }],
            totalCount: 1,
            truncated: false,
          }),
      });
    });
    assert.deepEqual(called, ["/api/quotes/q-7/archive-folder/entries"]);
    assert.equal(state.kind, "found");
  });
});

/**
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 저쪽과 **문장이 갈라지지 않는가**
 * ────────────────────────────────────────────────────────────────────────────
 * 이 사이트의 상수는 A/S 의 같은 이름 상수와 **한 글자까지 같아야 한다** — 같은 공유폴더를
 * 두고 두 화면이 다른 말을 하면 사람이 어느 쪽을 믿을지 알 수 없다. 🔴 「[저장]을 누르면
 * 만들어집니다」는 **이 사이트에서도 참**이다(server/actions/quotes.ts — 저장이 폴더를
 * 세우고 엑셀을 넣는다). 참이 아니게 되는 날 이 단언이 아니라 **그 문장**을 고쳐야 한다.
 */
describe("🔴 문장 — A/S 와 같은 글자", () => {
  test("폴더 없음 · 여럿 · 읽기 실패", () => {
    assert.equal(
      QUOTE_ARCHIVE_FOLDER_SECTION_NOT_FOUND_TEXT,
      "아직 공유폴더에 이 견적서의 폴더가 없습니다 — [저장]을 누르면 만들어집니다"
    );
    assert.equal(QUOTE_ARCHIVE_FOLDER_SECTION_MULTIPLE_TEXT, "맞는 폴더가 여럿입니다 — 공유폴더에서 하나로 정리해 주세요");
    assert.equal(QUOTE_ARCHIVE_FOLDER_SECTION_FAILED_TEXT, "공유폴더를 읽지 못했습니다");
  });

  test("🔴 어느 문장에도 경로가 없다", () => {
    for (const text of [
      QUOTE_ARCHIVE_FOLDER_SECTION_NOT_FOUND_TEXT,
      QUOTE_ARCHIVE_FOLDER_SECTION_MULTIPLE_TEXT,
      QUOTE_ARCHIVE_FOLDER_SECTION_FAILED_TEXT,
    ]) {
      assert.equal(text.includes("/"), false, text);
      assert.equal(text.includes(String.fromCharCode(92)), false, text);
    }
  });
});

/**
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 읽기 전용이다 — 만들거나 올리거나 지우는 코드가 없다
 * ────────────────────────────────────────────────────────────────────────────
 */
describe("🔴 읽기 전용", () => {
  test("쓰는 메서드도, 파일을 받는 길도 없다", () => {
    for (const forbidden of ['method: "POST"', 'method: "DELETE"', 'method: "PUT"', ".blob(", "FormData"]) {
      assert.equal(moduleSource.includes(forbidden), false, `'${forbidden}' 가 들어왔다`);
    }
  });

  test("부르는 통로는 목록 하나뿐이다", () => {
    assert.equal(moduleSource.split("/api/").length - 1, 1, "통로를 둘 이상 부른다");
  });
});
