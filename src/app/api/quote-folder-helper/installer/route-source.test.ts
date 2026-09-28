import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/**
 * ============================================================================
 * GET /api/quote-folder-helper/installer — 문지기 · 루트 비노출 · 첨부 헤더를 **소스로** 지킨다 (견적서 ④a)
 * ============================================================================
 * 설치 파일 본문 자체는 server/quote-folder-helper.test.ts 가 본다.
 *
 * ── 🔴 A/S 에서 가져왔다 (조각 PO 3g, 2026-09-28) ─────────────────────────
 * 원본은 `RF_Service_System/src/app/api/quote-folder-helper/installer/route-source.test.ts`
 * (2026-09-28 실측 106줄). **재는 것은 하나도 빼지 않았다.** 고친 곳은 둘 —
 * 문지기 순서와 import 목록이고, 둘 다 같은 까닭이다: 저쪽의 네 걸음이 이 사이트에서는
 * `getSessionUser()` 한 걸음이다(라우트 머리말). **문턱은 그대로 quotes READ 하나**다.
 * ============================================================================
 */

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const nextConfig = readFileSync(new URL("../../../../../next.config.ts", import.meta.url), "utf8");
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
 */
function assertGlobalHeadersStillAbsent(nextConfig: string): void {
  assert.equal(
    /\bheaders\s*\(/.test(nextConfig),
    false,
    "next.config.ts 에 헤더 설정이 생겼다 — 위 GLOBAL_HEADERS 목록과 맞는지, 라우트가 같은 이름을 다시 붙이지 않는지 확인할 것"
  );
}

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

describe("도우미 설치 파일 통로 — 소스로 지킨다", () => {
  test("🔴 Next 가 정한 이름만 export 한다 — GET · runtime · dynamic 뿐", () => {
    assert.deepEqual(exportedNames(route), ["GET", "dynamic", "runtime"]);
    assert.equal(/^export\s*(?:\{|default|\*)/m.test(route), false);
    assert.ok(route.includes('export const runtime = "nodejs";'));
    assert.ok(route.includes('export const dynamic = "force-dynamic";'));
  });

  test("🔴 순서: 세션 → quotes READ → UNC 루트 → 설치 파일", () => {
    const marks = [
      // 🔴 저쪽의 네 걸음이 이 한 줄이다 — 걸음 수만 줄었고 거르는 것은 그대로다(파일 머리말).
      "await getSessionUser()",
      'hasPermission(actingUser, "quotes", "READ")',
      "resolveQuoteFolderHelperRoot()",
      'helperRoot.status === "unset"',
      'helperRoot.status === "invalid"',
      "buildQuoteFolderHelperInstaller({ uncRoot: helperRoot.root, uncRootAlt: helperRoot.alt })",
    ];
    let previous = -1;
    for (const mark of marks) {
      const at = getBody.indexOf(mark);
      assert.ok(at >= 0, `없다: ${mark}`);
      assert.ok(at > previous, `순서가 어긋났다: ${mark}`);
      previous = at;
    }
    assert.equal(getBody.match(/hasPermission\(/g)?.length, 1);
  });

  test("루트가 비었거나 틀리면 409 와 사람이 읽는 문장 — 값은 싣지 않는다", () => {
    assert.ok(getBody.includes('fail(409, "HELPER_ROOT_NOT_CONFIGURED", "관리자가 공유폴더 주소를 설정해야 합니다.")'));
    assert.ok(getBody.includes('fail(409, "HELPER_ROOT_INVALID",'));
    // 루트 값은 설치 파일을 만드는 자리 한 번만 나온다(오류 · 로그에 없다).
    assert.equal(getBody.match(/helperRoot\.root/g)?.length, 1);
    for (const call of [...getBody.matchAll(/fail\([^)]*\)/g)].map((match) => match[0])) {
      assert.equal(call.includes("helperRoot.root"), false, call);
    }
    assert.equal(route.includes("console."), false);
    assert.equal(route.includes("process.env"), false);
  });

  test("🔴 라우트는 설치 파일을 만들기만 한다 — 실행 · 파일 · 레지스트리 · DB 가 없다", () => {
    assert.deepEqual(importSpecifiers(route), [
      "@/lib/auth/permission-resolver",
      "@/lib/auth/session",
      "@/lib/server/quote-folder-helper",
      "next/server",
    ]);
    for (const forbidden of ["child_process", "spawn(", "exec(", "node:fs", "Registry", "@/lib/db/", "mutations", "require(", "import("]) {
      assert.equal(route.includes(forbidden), false, forbidden);
    }
    // 🔴 A/S 의 인증 사슬(mock 자료 · 세션 되읽기)을 끌고 오지 않았다 — 이 사이트는
    //    getSessionUser() 한 걸음이다. **코드만 본다** — 이 라우트의 머리말은 저쪽과
    //    무엇이 다른지를 설명하느라 그 이름들을 일부러 적는다(앞선 통로들과 같은
    //    방식이다 — api/quotes/xlsx-route-source.test.ts 의 codeOnly).
    const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of ["acting-user", "mock-data", "readSession", "auth-source"]) {
      assert.equal(code.includes(forbidden), false, forbidden);
    }
  });

  test("첨부로 내려준다 — 이름 · 형식 · 길이 · 캐시하지 않음, 전역 헤더 이름은 쓰지 않는다", () => {
    assert.ok(getBody.includes('"Content-Type": "application/octet-stream"'));
    assert.ok(getBody.includes('"Content-Disposition": `attachment; filename="${QUOTE_FOLDER_HELPER_INSTALLER_FILE_NAME}"`'));
    assert.ok(getBody.includes('"Content-Length": String(body.byteLength)'));
    assert.ok(getBody.includes('"Cache-Control": "no-store"'));
    for (const name of GLOBAL_HEADERS) {
      assert.equal(route.includes(`"${name}"`), false, name);
    }
    assertGlobalHeadersStillAbsent(nextConfig);
  });
});
