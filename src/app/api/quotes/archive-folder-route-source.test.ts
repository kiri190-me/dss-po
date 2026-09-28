import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/**
 * ============================================================================
 * GET /api/quotes/{id}/archive-folder — 문지기 순서 · 이름 · 쓰기 없음 · 루트 비노출을 **소스로** 지킨다 (견적서 ④a)
 * ============================================================================
 * 이 저장소는 라우트를 직접 부르지 않는다(세션 · DB 가 필요하다). 찾기 자체는
 * storage/quote-archive.test.ts 가, 주소 규칙은 domain/quote-folder-link.test.ts 가 본다.
 *
 * ── 🔴 A/S 에서 가져왔다 (조각 PO 3g, 2026-09-28) ─────────────────────────
 * 원본은 `RF_Service_System/src/app/api/quotes/[id]/archive-folder/route-source.test.ts`
 * (2026-09-28 실측 154줄). **재는 것은 하나도 빼지 않았다.** 고친 곳은 셋이다:
 *  ① 🔴 **파일이 `[id]` 폴더 밖에 있다** — 이 저장소의 시험 목록은 대괄호가 든 줄을
 *     거부한다(scripts/run-test-list.mjs · test-lists/test-list-registration.test.ts).
 *     저쪽은 `src/app/api/quotes/*\/archive-folder/...` 글롭으로 적었지만 이쪽은 그
 *     길이 막혀 있다. **라우트 본체는 `[id]` 안에 그대로** 있고, 여기서 그것을 읽는다.
 *     앞선 조각들이 같은 방식으로 옮겨져 있다(issue-route-source.test.ts 등).
 *  ② 문지기 순서 — 저쪽의 네 걸음이 이 사이트에서는 `getSessionUser()` 한 걸음이다
 *     (라우트 머리말 ①). 걸음 수만 줄었고 **문턱은 그대로 quotes READ 하나**다.
 *  ③ import 목록 — ②의 결과로 `auth/acting-user` · `config/auth-source` 두 줄이 빠진다.
 * ============================================================================
 */

const route = readFileSync(new URL("./[id]/archive-folder/route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
/** 주석을 뺀 코드 — 머리말이 까닭을 설명하느라 적은 낱말(mkdir · QUOTE_ARCHIVE_UNC_ROOT …)에 걸리지 않게. */
const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const nextConfig = readFileSync(new URL("../../../../next.config.ts", import.meta.url), "utf8");
const getBody = route.slice(route.indexOf("export async function GET"));

const GLOBAL_HEADERS = [
  "X-Frame-Options",
  "Content-Security-Policy",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Strict-Transport-Security",
];

/**
 * 🔴 **저쪽에는 있고 이 사이트에는 없는 전제** (2026-09-28 실측 — 조각 PO 3g)
 * ────────────────────────────────────────────────────────────────────────────
 * 저쪽(RF_Service_System)의 `next.config.ts` 에는 위 여섯 이름의 **전역 보안 헤더**가
 * 있고, 그래서 저쪽 시험은 두 가지를 함께 쟀다:
 *   ① 라우트가 그 이름을 **다시 붙이지 않는가** — 겹치면 Next 가 **조용히 버린다**
 *      (증상이 없어 더 위험하다. 이 회사가 실제로 한 번 겪었다)
 *   ② `next.config.ts` 에 그 목록이 **여전히 있는가** — ①의 전제라서
 *
 * 🔴 **이 저장소의 next.config.ts 에는 전역 보안 헤더가 아직 없다.** 그래서 ②를 저쪽
 * 그대로 두면 **늘 실패한다.** 단언을 **빼지 않고 뒤집어** 둔다 — 헤더 설정이 생기는
 * 날 이 시험이 소리를 내고, 그때 ①의 목록과 맞는지 사람이 보게 한다.
 * ⚠️ **이것은 이 조각이 고칠 일이 아니다** — 전역 설정은 모든 응답에 걸리므로 별건이다.
 *    보고에 올려 두었다(2026-09-28).
 *
 * ── 🔴 **되돌렸다** (2026-09-28 · 조각 PO 3h — 전역 보안 헤더) ──────────────
 * 위 문단은 **그때의 기록이라 지우지 않고 그대로 둔다.** 그 뒤 `next.config.ts` 에
 * 위 여섯이 들어왔다 — A/S 의 값도 곁말도 그대로 옮겨 왔다. 그래서 뒤집어 두었던
 * 단언 `assertGlobalHeadersStillAbsent(nextConfig)`(「헤더 설정이 생기면 소리를
 * 내라」)를 **지우고 저쪽 것으로 되돌렸다.** 이제 아래 루프가 ①과 ②를 함께 잰다:
 *     assert.ok(nextConfig.includes(`"${name}"`), `next.config.ts 의 전역 헤더 목록이 바뀌었다: ${name}`);
 */

function exportedNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(
    /^export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm
  )) {
    names.push(match[1]);
  }
  return names.sort();
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/^import\s[\s\S]*?\sfrom\s+"([^"]+)";/gm)].map((match) => match[1]).sort();
}

describe("견적서 폴더 위치 통로 — 소스로 지킨다", () => {
  test("🔴 Next 가 정한 이름만 export 한다 — GET · runtime · dynamic 뿐", () => {
    assert.deepEqual(exportedNames(route), ["GET", "dynamic", "runtime"]);
    assert.equal(/^export\s*(?:\{|default|\*)/m.test(route), false);
    assert.ok(route.includes('export const runtime = "nodejs";'));
    assert.ok(route.includes('export const dynamic = "force-dynamic";'));
  });

  test("🔴 순서: 세션 → quotes READ → id → 견적서 → 루트 → 찾기 → 규칙", () => {
    const marks = [
      // 🔴 저쪽의 네 걸음(getAuthSource · readSession · resolveActingUserForSession ·
      //    approvalStatus)이 이 한 줄이다 — 걸음 수만 줄었고 거르는 것은 그대로다
      //    (라우트 머리말 ①). **세션이 권한보다 앞**이라는 것이 여기서 재는 것이다.
      "await getSessionUser()",
      'hasPermission(actingUser, "quotes", "READ")',
      "isValidQuoteId(id)",
      "await getQuoteForEdit(id)",
      "resolveQuoteArchiveRoot()",
      "findQuoteArchiveFolder({",
      "isQuoteFolderRelativePath(result.relativePath)",
      "resolveQuoteFolderHelperUncPath(result.relativePath)",
    ];
    let previous = -1;
    for (const mark of marks) {
      const at = getBody.indexOf(mark);
      assert.ok(at >= 0, `없다: ${mark}`);
      assert.ok(at > previous, `순서가 어긋났다: ${mark}`);
      previous = at;
    }
    assert.equal(getBody.match(/hasPermission\(/g)?.length, 1);
    assert.equal(getBody.includes('"WRITE"'), false);
  });

  test("🔴 쓰기가 없다 — 가져오는 것은 문지기 · 조회 · 읽기 전용 찾기 · 주소 규칙뿐", () => {
    assert.deepEqual(importSpecifiers(route), [
      "@/lib/auth/permission-resolver",
      "@/lib/auth/session",
      "@/lib/db/queries/quotes",
      "@/lib/domain/quote-folder-link",
      "@/lib/server/quote-folder-helper",
      "@/lib/storage/quote-archive",
      "@/lib/validation/quote-input",
      "next/server",
    ]);
    for (const forbidden of [
      "saveToQuoteArchive",
      "mutations",
      "recordAudit",
      "recordQuoteExport",
      "node:fs",
      "mkdir",
      "writeFile",
      "require(",
      "import(",
      "console.",
      // 🔴 A/S 의 인증 사슬(mock 자료 · 세션 되읽기)을 끌고 오지 않았다 — 이 사이트는
      //    getSessionUser() 한 걸음이다(라우트 머리말 ①). 앞선 통로들과 같은 잣대다
      //    (api/quotes/issue-route-source.test.ts · xlsx-route-source.test.ts).
      "acting-user",
      "mock-data",
      "readSession",
      "auth-source",
    ]) {
      assert.equal(code.includes(forbidden), false, `쓰기 · 기록 흔적: ${forbidden}`);
    }
  });

  test("🔴 컨테이너 안 경로가 응답에 실리지 않는다 — 루트는 찾기에만 쓰고, 환경변수는 읽지 않는다", () => {
    assert.equal(code.includes("QUOTE_ARCHIVE_DIR"), false);
    assert.equal(code.includes("QUOTE_ARCHIVE_UNC_ROOT"), false);
    assert.equal(code.includes("process.env"), false);
    // archiveRoot 는 선언 · null 판정 · 찾기 입력 세 번만 나온다.
    assert.equal(getBody.match(/archiveRoot/g)?.length, 3);
    assert.ok(getBody.includes("const archiveRoot = resolveQuoteArchiveRoot();"));
    assert.ok(getBody.includes("if (archiveRoot === null) {"));
    assert.ok(getBody.includes("root: archiveRoot,"));
    // 응답을 만드는 자리마다 루트가 없다.
    const responses = [...getBody.matchAll(/respond\(\{[\s\S]*?\}\)/g)].map((match) => match[0]);
    assert.equal(responses.length, 5);
    for (const response of responses) {
      assert.equal(response.toLowerCase().includes("root"), false, response);
    }
    // 응답 본문 타입에 루트 칸이 없다.
    const type = route.slice(route.indexOf("type ArchiveFolderResponse"), route.indexOf("const UNOPENABLE_FOLDER_REASON"));
    assert.equal(type.toLowerCase().includes("root"), false);
  });

  test("전체 주소(uncPath) — 찾았을 때만, 만드는 일은 server/quote-folder-helper 한 곳", () => {
    assert.ok(getBody.includes("const uncPath = resolveQuoteFolderHelperUncPath(result.relativePath);"));
    // 🔴 설정이 비었거나 틀리면(null) 그 칸만 빠지고 나머지 응답은 그대로 나간다.
    assert.ok(getBody.includes("...(uncPath === null ? {} : { uncPath }),"));
    // 이 통로는 루트를 스스로 읽거나 이어 붙이지 않는다 — 가져와 부르는 자리 하나뿐이다.
    assert.equal(code.match(/resolveQuoteFolderHelperUncPath/g)?.length, 2);
    assert.equal(code.includes("resolveQuoteFolderHelperRoot"), false);
    assert.equal(getBody.match(/uncPath/g)?.length, 3);
    // found 응답 말고는 uncPath 가 없다(not-found · disabled · failed 는 그대로다).
    const withUncPath = [...getBody.matchAll(/respond\(\{[\s\S]*?\}\)/g)]
      .map((match) => match[0])
      .filter((response) => response.includes("uncPath"));
    assert.equal(withUncPath.length, 1);
    assert.ok(withUncPath[0].includes('status: "found"'));
  });

  test("상태 넷 — found · not-found · disabled · failed, 캐시하지 않는다", () => {
    for (const status of ['status: "found"', 'status: "not-found"', 'status: "disabled"', 'status: "failed"']) {
      assert.ok(getBody.includes(status), status);
    }
    assert.ok(route.includes('NextResponse.json(body, { status: 200, headers: { "Cache-Control": "no-store" } })'));
  });

  test("전역 보안 헤더와 같은 이름의 헤더를 붙이지 않는다", () => {
    for (const name of GLOBAL_HEADERS) {
      assert.equal(route.includes(`"${name}"`), false, name);
      assert.ok(nextConfig.includes(`"${name}"`), `next.config.ts 의 전역 헤더 목록이 바뀌었다: ${name}`);
    }
  });
});
