import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/**
 * ============================================================================
 * GET /api/quote-folder-helper/install-command — 문지기 · 루트 비노출 · 캐시 없음을 **소스로** 지킨다 (견적서 ④c)
 * ============================================================================
 * 설치 명령 본문 자체는 server/quote-folder-helper.test.ts 가 본다(설치 파일과 한 벌인지까지).
 * 이 시험은 설치 파일 통로(installer/route-source.test.ts)와 **같은 방식 · 같은 잣대**다 —
 * 두 통로의 문지기가 갈라지지 않게.
 *
 * ── 🔴 A/S 에서 가져왔다 (조각 PO 3g, 2026-09-28) ─────────────────────────
 * 원본은 `RF_Service_System/src/app/api/quote-folder-helper/install-command/route-source.test.ts`
 * (2026-09-28 실측 135줄). **재는 것은 하나도 빼지 않았다.** 고친 곳은 곁 통로 시험과
 * 똑같이 셋 — 문지기 순서 · import 목록 · 두 통로를 맞대어 보는 `fail(...)` 목록에서
 * 이 사이트에 없는 코드 둘(`DATABASE_MODE_REQUIRED` · `ACCOUNT_NOT_APPROVED`)을 뺀 것.
 * 🔴 **맞대어 보는 일 자체는 그대로다** — 남은 다섯이 두 통로에 글자까지 같아야 한다.
 * ============================================================================
 */

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const installerRoute = readFileSync(new URL("../installer/route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
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

describe("도우미 설치 명령 통로 — 소스로 지킨다", () => {
  test("🔴 Next 가 정한 이름만 export 한다 — GET · runtime · dynamic 뿐", () => {
    assert.deepEqual(exportedNames(route), ["GET", "dynamic", "runtime"]);
    assert.equal(/^export\s*(?:\{|default|\*)/m.test(route), false);
    assert.ok(route.includes('export const runtime = "nodejs";'));
    assert.ok(route.includes('export const dynamic = "force-dynamic";'));
  });

  test("🔴 순서: 세션 → quotes READ → UNC 루트 → 명령", () => {
    const marks = [
      // 🔴 저쪽의 네 걸음이 이 한 줄이다 — 걸음 수만 줄었고 거르는 것은 그대로다(파일 머리말).
      "await getSessionUser()",
      'hasPermission(actingUser, "quotes", "READ")',
      "resolveQuoteFolderHelperRoot()",
      'helperRoot.status === "unset"',
      'helperRoot.status === "invalid"',
      "buildQuoteFolderHelperInlineInstallCommand({ uncRoot: helperRoot.root, uncRootAlt: helperRoot.alt })",
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

  test("🔴 문지기가 설치 파일 통로와 같다 — 실패 코드 · 사유 문장이 글자 그대로 같다", () => {
    const installerGetBody = installerRoute.slice(installerRoute.indexOf("export async function GET"));
    for (const call of [
      // 🔴 저쪽의 일곱에서 둘(DATABASE_MODE_REQUIRED · ACCOUNT_NOT_APPROVED)이 빠졌다 —
      //    이 사이트에 mock 저장 모드가 없고, 승인 대기는 getSessionUser() 가 이미
      //    거르기 때문이다(두 라우트 머리말). 맞대어 보는 일 자체는 그대로다.
      'fail(401, "UNAUTHENTICATED", "로그인이 필요합니다.")',
      'fail(403, "FORBIDDEN", "이 작업을 수행할 권한이 없습니다.")',
      'fail(409, "HELPER_ROOT_NOT_CONFIGURED", "관리자가 공유폴더 주소를 설정해야 합니다.")',
      'fail(409, "HELPER_ROOT_INVALID",',
    ]) {
      assert.ok(getBody.includes(call), `이 통로에 없다: ${call}`);
      assert.ok(installerGetBody.includes(call), `설치 파일 통로와 다르다: ${call}`);
    }
    // 🔴 빠진 둘이 **어느 쪽에도 되살아나지 않았다** — 한쪽만 옛 사슬로 돌아가면
    //    파일로는 막히는 사람이 명령으로는 통과하는 구멍이 생긴다.
    for (const gone of ["DATABASE_MODE_REQUIRED", "ACCOUNT_NOT_APPROVED"]) {
      assert.equal(getBody.includes(gone), false, gone);
      assert.equal(installerGetBody.includes(gone), false, gone);
    }
  });

  test("루트 값은 명령을 만드는 자리 한 번뿐 — 오류 · 로그에 없다", () => {
    assert.equal(getBody.match(/helperRoot\.root/g)?.length, 1);
    for (const call of [...getBody.matchAll(/fail\([^)]*\)/g)].map((match) => match[0])) {
      assert.equal(call.includes("helperRoot.root"), false, call);
    }
    assert.equal(route.includes("console."), false);
    assert.equal(route.includes("process.env"), false);
    assert.equal(route.includes("QUOTE_ARCHIVE_DIR"), false);
  });

  test("🔴 라우트는 명령을 만들기만 한다 — 실행 · 파일 · 레지스트리 · DB 가 없다", () => {
    assert.deepEqual(importSpecifiers(route), [
      "@/lib/auth/permission-resolver",
      "@/lib/auth/session",
      "@/lib/server/quote-folder-helper",
      "next/server",
    ]);
    for (const forbidden of [
      "child_process",
      "spawn(",
      "exec(",
      "node:fs",
      "Registry",
      "@/lib/db/",
      "mutations",
      "require(",
      "import(",
    ]) {
      assert.equal(route.includes(forbidden), false, forbidden);
    }
    // 🔴 A/S 의 인증 사슬을 끌고 오지 않았다 — **코드만 본다**(머리말이 저쪽과 무엇이
    //    다른지 설명하느라 그 이름들을 일부러 적는다). 곁 통로 시험과 같은 잣대다.
    const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of ["acting-user", "mock-data", "readSession", "auth-source"]) {
      assert.equal(code.includes(forbidden), false, forbidden);
    }
  });

  test("JSON 한 칸(command)으로 · 캐시하지 않음, 전역 헤더 이름은 쓰지 않는다", () => {
    assert.ok(
      getBody.includes(
        'NextResponse.json({ command }, { status: 200, headers: { "Cache-Control": "no-store" } })'
      )
    );
    for (const name of GLOBAL_HEADERS) {
      assert.equal(route.includes(`"${name}"`), false, name);
      assert.ok(nextConfig.includes(`"${name}"`), `next.config.ts 의 전역 헤더 목록이 바뀌었다: ${name}`);
    }
  });
});
