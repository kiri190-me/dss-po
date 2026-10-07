import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/**
 * ============================================================================
 * 견적서 폴더 **읽기** — 지우지 않는다 · 만들지 않는다 · 내용을 내보내지 않는다 (2026-10-07)
 * ============================================================================
 * 「지금은 안 쓴다」는 시험으로 지켜지지 않는다 — 뒤 조각에서 누군가 지우는 줄 하나를
 * 들이면 **앱이 사람의 서류함에서 파일을 지운다.** 그래서 동작이 아니라 **원본 글자**를 본다.
 *
 * 여기에 두 가지가 더 있다:
 *  · 🔴 **파일 내용을 읽지 않는다.** 공유폴더의 파일은 첨부 통로의 권한 · 확장자 검사 ·
 *    앞머리 바이트 대조 밖에 있어, 우리 출처로 내보내면 그 방어선이 통째로 빠진다.
 *  · 🔴 **찾기를 새로 쓰지 않는다.** 폴더를 고르는 규칙이 두 벌이 되면 [폴더 열기]가 여는
 *    폴더와 이 목록이 가리키는 폴더가 갈라진다 — 사람은 그것을 알 길이 없다.
 *
 * ── 🔴 A/S 에서 가져왔다 (2026-10-07) ─────────────────────────────────────
 * 원본은 `RF_Service_System/src/lib/storage/quote-archive-entries-source.test.ts`
 * (2026-10-07 실측 157줄). **재는 것은 하나도 빼지 않았다.** 고친 곳은 하나다:
 *  ① 🔴 **파일시스템을 어디서 만지는가.** 저쪽 원본은 공용 도우미
 *     (`storage/share-folder-fs.ts`)를 부르므로 「fs 를 아예 가져오지 않는다」를 쟀다.
 *     🔴 이 사이트에는 그 공용 도우미가 없어(연락서 기능도 없다) 읽기 절편이 원본 파일
 *     아래쪽에 비공개로 들어 있다 — 그래서 `node:fs/promises` 가 **들어오기는 한다.**
 *     대신 **무엇이 들어오는지를 글자로 못 박는다**: 들어오는 이름은 `readdir` 과 `stat`
 *     **둘뿐**이고, 디렉터리를 읽는 자리는 **하나뿐**이다. 만들기 · 쓰기 · 지우기 ·
 *     파일 내용 읽기는 저쪽과 똑같이 **한 글자도 없다**(아래 묶음들 그대로).
 *
 * 읽기 동작 자체는 quote-archive-entries.test.ts 가 임시 폴더에서 본다.
 * ============================================================================
 */

const source = readFileSync(new URL("./quote-archive-entries.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** 주석을 뺀 코드 — 머리말이 까닭을 설명하느라 적은 낱말(mkdir · readFile …)에 걸리지 않게. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function importedFrom(text: string): string[] {
  return [...text.matchAll(/\bfrom "([^"]+)";/g)].map((match) => match[1]).sort();
}

describe("견적서 폴더 읽기 — 원본으로 지킨다", () => {
  test("🔴 지우기 · 옮기기가 한 글자도 없다", () => {
    for (const forbidden of [/\bunlink\b/, /\brm\b/, /\brmdir\b/, /\brename\b/, /\btruncate\b/, /\bcp\b/]) {
      assert.equal(forbidden.test(code), false, `지우기 · 옮기기 흔적: ${forbidden}`);
    }
  });

  test("🔴 만들기 · 쓰기가 한 글자도 없다", () => {
    for (const forbidden of [/\bmkdir\b/, /\bwriteFile\b/, /\bappendFile\b/, /\bcreateWriteStream\b/, /"wx"/]) {
      assert.equal(forbidden.test(code), false, `쓰기 흔적: ${forbidden}`);
    }
    // 저장 · 폴더 만들기 쪽 이름을 가져오지 않는다(같은 모듈에 들어 있다).
    for (const forbidden of ["saveToQuoteArchive", "createQuoteArchiveFolder"]) {
      assert.equal(code.includes(forbidden), false, `쓰기 쪽 이름을 가져왔다: ${forbidden}`);
    }
  });

  test("🔴 파일 **내용**을 읽지 않는다 — 목록만 낸다", () => {
    for (const forbidden of [/\breadFile\b/, /\bcreateReadStream\b/, /\bopen\b\s*\(/, /\bBlob\b/, /\bBuffer\b/]) {
      assert.equal(forbidden.test(code), false, `내용을 읽는 흔적: ${forbidden}`);
    }
  });

  test("🔴 가져오는 것이 정해져 있다 — fs 에서 들어오는 이름은 `readdir` 과 `stat` 둘뿐이다", () => {
    assert.deepEqual(
      importedFrom(source),
      [
        "./quote-archive",
        "@/lib/domain/quote-archive-naming",
        "@/lib/domain/share-folder-naming",
        "node:fs/promises",
        "node:path",
      ].sort()
    );
    // 🔴 들어오는 이름을 글자로 못 박는다(머리말 ①) — 여기에 한 이름이라도 더 붙으면 걸린다.
    assert.ok(
      source.includes('import { readdir, stat } from "node:fs/promises";'),
      "fs 에서 가져오는 이름이 바뀌었다"
    );
    assert.equal(code.match(/node:fs/g)?.length, 1, "fs 를 가져오는 줄이 하나가 아니다");
    for (const forbidden of ["node:fs\"", "require(", "import(", "child_process", "console."]) {
      assert.equal(code.includes(forbidden), false, `흔적: ${forbidden}`);
    }
    // 서버에서만 도는 모듈이다.
    assert.ok(source.startsWith('import "server-only";'), "server-only 가 맨 앞에 없다");
  });

  test("🔴 찾기를 새로 쓰지 않는다 — findQuoteArchiveFolder 한 번뿐이다", () => {
    assert.equal(code.match(/findQuoteArchiveFolder\(/g)?.length, 1, "찾기를 여러 번 부르거나 아예 안 부른다");
    // 폴더를 고르는 규칙을 제 손으로 다시 짜지 않는다.
    for (const forbidden of ["matchesQuoteArchiveFolder", "isQuoteArchiveYearFolder", "findShareFolder"]) {
      assert.equal(code.includes(forbidden), false, `찾기를 다시 짰다: ${forbidden}`);
    }
    // 🔴 디렉터리를 읽는 자리는 **하나뿐**이다 — 연도 폴더 · 견적서 폴더를 훑는 일은
    //    저쪽(storage/quote-archive.ts)이 한다.
    assert.equal(code.match(/readdir\(/g)?.length, 1, "디렉터리를 읽는 자리가 하나가 아니다");
  });

  test("🔴 한 칸만 읽는다 — 재귀가 없고, 읽는 길이 하나다", () => {
    for (const forbidden of [/recursive/, /\bwalk\b/, /function\s+\w*[Rr]ecurse/]) {
      assert.equal(forbidden.test(code), false, `재귀 흔적: ${forbidden}`);
    }
    // 읽는 길은 「맨 위 칸」 하나뿐이다 — 선언 한 번 · 부름 한 번(공용 도우미가 아니라
    // 이 파일 안에 있으므로 저쪽보다 한 번 더 나온다. 머리말 ①).
    assert.equal(code.match(/listShareFolderDirents\(/g)?.length, 2);
    // 🔴 하위 폴더로 내려가는 칸이 아예 없다(실측상 하위 폴더가 0 개다).
    for (const forbidden of ["relativePath?:", "insidePath", "MAX_DEPTH", "segments.shift", "remaining"]) {
      assert.equal(code.includes(forbidden), false, `하위 폴더로 내려가는 길이 생겼다: ${forbidden}`);
    }
  });

  test("🔴 맞는 폴더가 여럿이면 **읽기보다 앞에서** 끝난다 — 목록을 내지 않는다", () => {
    const multipleAt = code.indexOf("found.multipleFolderMatches");
    assert.ok(multipleAt >= 0, "여럿 여부를 보지 않는다");
    assert.ok(multipleAt < code.indexOf("const entries = await read("), "여럿인데 그 안을 읽는다");
    // 여럿일 때 돌려주는 값에는 경로도 줄도 없다.
    assert.ok(code.includes('return { status: "multiple" };'), "여럿일 때 무언가를 더 싣는다");
  });

  test("🔴 기다리는 시간과 줄 수에 상한이 있다", () => {
    assert.ok(code.includes("withShareFolderTimeout("), "상한 없이 기다린다");
    assert.ok(code.includes("QUOTE_ARCHIVE_ENTRIES_TIMEOUT_MS"));
    assert.ok(code.includes("error instanceof ShareFolderTimeout"));
    assert.ok(code.includes("reason: QUOTE_ARCHIVE_ENTRIES_SLOW_REASON"));
    assert.ok(code.includes("QUOTE_ARCHIVE_ENTRIES_LIMIT"), "줄 수 상한이 없다");
    assert.ok(code.includes(".slice(0, limit)"), "상한대로 자르지 않는다");
    // 🔴 stat 은 **자른 뒤**에만 때린다 — 상한이 곧 NAS 왕복 횟수다.
    assert.ok(code.indexOf(".slice(0, limit)") < code.indexOf("statShareFolderEntry("), "자르기보다 stat 이 앞에 있다");
  });

  test("🔴 설정이 비어 있으면 디스크를 보기 **전에** 끝난다", () => {
    const disabledAt = code.indexOf('return { status: "disabled" };');
    assert.ok(disabledAt >= 0, "disabled 가 없다");
    assert.ok(disabledAt < code.indexOf("withShareFolderTimeout("), "디스크를 본 뒤에 꺼짐을 본다");
    assert.ok(disabledAt < code.indexOf("requireExistingShareFolderRoot("), "디스크를 본 뒤에 꺼짐을 본다");
    // 설정을 읽는 길은 공용 함수 하나다 — 환경변수를 직접 만지지 않는다.
    assert.equal(code.includes("process.env"), false);
    assert.equal(code.includes("QUOTE_ARCHIVE_DIR"), false);
    assert.equal(code.match(/resolveQuoteArchiveRoot\(\)/g)?.length, 1);
  });

  test("🔴 던지지 않는다 — 밖으로 나가는 것은 status 뿐이고, 사유에 경로를 담지 않는다", () => {
    const exported = [...source.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)]
      .map((match) => match[1])
      .sort();
    assert.deepEqual(exported, ["compareQuoteArchiveEntries", "listQuoteArchiveEntries"]);
    assert.ok(code.includes('status: "failed"'));
    // fs 오류의 message 를 사유로 쓰지 않는다 — 경로가 들어 있다.
    assert.equal(/reason:\s*[A-Za-z_$][\w$]*\.message/.test(code), false, "오류 message 를 사유로 썼다");
    assert.equal(code.includes("String(error)"), false);
  });

  test("🔴 줄 타입에 경로를 담는 칸이 없다 — 이름은 폴더 안에서의 이름뿐이다", () => {
    const entryType = source.slice(
      source.indexOf("export type QuoteArchiveEntry = {"),
      source.indexOf("export type QuoteArchiveEntriesResult")
    );
    assert.ok(entryType.includes("name: string;"), entryType);
    const fields = [...entryType.matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]).sort();
    assert.deepEqual(fields, ["isDirectory", "modifiedAtMs", "name", "sizeBytes"]);
    for (const forbidden of ["path", "root", "absolute", "fullname", "dir:"]) {
      assert.equal(entryType.toLowerCase().includes(forbidden), false, `${forbidden} 가 줄 타입에 있다`);
    }
  });

  test("🔴 결과 타입에 컨테이너 안 경로를 담는 칸이 없다 — 상대 경로 하나뿐이다", () => {
    const resultType = source.slice(
      source.indexOf("export type QuoteArchiveEntriesResult"),
      source.indexOf("export type ListQuoteArchiveEntriesInput")
    );
    assert.ok(resultType.includes("relativePath: string;"), resultType);
    for (const forbidden of ["root", "absolute", "uncpath", "fullpath", "archivedir"]) {
      assert.equal(resultType.toLowerCase().includes(forbidden), false, `${forbidden} 가 결과 타입에 있다`);
    }
  });
});
