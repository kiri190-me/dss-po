import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { QUOTE_ISSUE_RESULT_HEADER } from "@/lib/domain/quote-issue-result";

/**
 * ============================================================================
 * POST /api/quotes/{id}/issue — 🔴 **검사의 순서**를 소스로 지킨다 (조각 3c-3)
 * ============================================================================
 * 이 저장소는 라우트를 직접 부를 수 없다 — 쿠키(`next/headers`) · DB · 디스크 · 양식
 * 파일이 전부 필요하고 그 사슬은 `import "server-only"` 로 시작한다. 그래서 형제
 * 시험들(`xlsx-route-source.test.ts` · `attachments-route-source.test.ts`)과 같은
 * 장치를 쓴다: **원본을 글자로 읽는다.**
 *
 * 🔴 이 통로는 이 사이트에서 **가장 위험한 쓰기 통로**다. 누르면 세 가지가 한꺼번에
 * 일어난다: 사내 공유폴더에 파일이 생기고, 「수기 견적서 엑셀」 첨부 칸이 바뀌고,
 * 감사(EXCEL_EXPORT)가 남는다. 그래서 여기서 재는 것이 넷이다.
 *   · **순서** — 관문보다 조회가 앞이면 권한 없는 사람이 응답 갈래로 그 id 의
 *     견적서가 있는지 알아낸다. 출처 검사가 뒤로 밀리면 남의 사이트가 심은
 *     `<form>` 한 줄이 공유폴더에 파일을 만든다(라우트 핸들러에는 Next 의 CSRF
 *     방어가 없다).
 *   · **문턱** — `quotes` **WRITE** 하나다. READ 로 들어오는 길이 있으면 보기
 *     권한자가 사람의 서류함을 바꾸게 된다.
 *   · **결과 헤더 이름** — 전역 보안 헤더(next.config.ts)와 겹치면 Next 가 조용히
 *     버린다(오류가 안 난다 — 그래서 시험이 필요하다).
 *   · **응답에 내부 경로가 없다** — 실패 사유에도, 200 의 헤더에도.
 *
 * 🔴 **중심 함수(services/quote-issue.ts)가 무엇을 하는지는 여기서 재지 않는다** —
 * 그것은 시험 DB 와 임시 폴더로 직접 부르는
 * `lib/server/services/quote-issue.integration.test.ts` 의 몫이다. 그 파일의 맨 아래
 * 묶음도 이 라우트를 글자로 읽는데, 거기는 **A/S 에서 가져온 그 묶음**이고 여기는
 * 이 저장소의 라우트 소스 시험 관례(형제 둘과 같은 모양)다. 겹치는 단언이 있어도
 * 두 곳 다 둔다 — `npm test` 만 돌려도 이 통로의 문지기가 지켜진다.
 *
 * ── 🔴 이 파일이 라우트 **곁이 아니라 한 칸 위에** 있는 까닭 ─────────────
 * `node --test` 는 받은 경로를 **글롭 패턴으로 읽는다.** App Router 의 `[id]` 는 그
 * 문법에서 「i 또는 d 한 글자」라, 시험 목록에 그 폴더를 그대로 적으면 아무것도 맞지
 * 않아 **그 시험이 조용히 안 돈다**(2026-09-22 실측 — scripts/run-test-list.mjs 머리말).
 * 그래서 시험만 대괄호 밖에 두고, 읽는 원본만 아래 경로로 그 안을 가리킨다.
 * ============================================================================
 */

const route = readFileSync(new URL("./[id]/issue/route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");

const flat = (source: string) => source.replace(/\s+/g, " ");

/**
 * 주석을 뺀 코드.
 *
 * 🔴 아래 「가져오면 안 되는 것」과 순서 단언에 필요하다 — 이 라우트의 머리말은 **A/S 가
 * 쓰는 도구 이름**(`readSession()` · `getAuthSource()` · `resolveActingUserForSession`)을
 * 적어 두고 「이 사이트는 그렇게 하지 않는다」를 설명한다. 원본을 그대로 훑으면 그 설명이
 * 금지 낱말로 걸려, 시험이 **주석을 고치라고** 요구하게 된다.
 */
const codeOf = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
const codeOnly = codeOf(route);

/** POST 본문만 — 위쪽의 실패 코드 유니온 · 응답 코드 표 · fail() 은 여기 들어오지 않는다. */
const body = flat(codeOnly.slice(codeOnly.indexOf("export async function POST")));

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

/** `mark` 가 본문에 있고, 앞의 것보다 뒤에 있는가. 없으면 어느 것이 없는지 말한다. */
function assertInOrder(marks: readonly string[]): void {
  let previous = -1;
  for (const mark of marks) {
    const at = body.indexOf(mark);
    assert.ok(at >= 0, `없다: ${mark}`);
    assert.ok(at > previous, `순서가 어긋났다: ${mark}`);
    previous = at;
  }
}

describe("발행 통로 — 소스로 지킨다", () => {
  test("🔴 Next 가 정한 이름만 export 한다 — POST 뿐, GET 은 없다", () => {
    assert.deepEqual(exportedNames(route), ["POST", "dynamic", "runtime"]);
    assert.equal(/^export\s*(?:\{|default|\*)/m.test(route), false, "다른 모양으로 내보내고 있다");
    // 🔴 GET 이 있으면 주소 한 줄(메일 · 채팅 · img · 미리 불러오기)로 공유폴더에
    //    파일이 생기고 첨부 칸이 바뀐다.
    assert.equal(/export\s+(?:async\s+)?function\s+GET\b/.test(route), false, "GET 이 생겼다");
    // 파일과 디스크를 다루므로 Node 런타임이고, 쿠키를 읽으므로 캐시된 응답을 내놓을 수 없다.
    assert.ok(route.includes('export const runtime = "nodejs";'));
    assert.ok(route.includes('export const dynamic = "force-dynamic";'));
  });

  test("🔴 순서: 같은 출처 → 세션 → quotes WRITE → id → 저장소 → 중심 함수 → 전송", () => {
    assertInOrder([
      "isTrustedOrigin(request)",
      // 🔴 저쪽(A/S)의 네 걸음(getAuthSource · readSession · resolveActingUserForSession ·
      //    approvalStatus)이 이 한 줄이다 — 라우트 머리말 ①.
      "await getSessionUser()",
      'hasPermission(actingUser, "quotes", "WRITE")',
      "await context.params",
      "isValidQuoteId(id)",
      "getAttachmentStorage()",
      "issueQuoteFile({",
      "resolveQuoteArchiveRoot()",
      "return new NextResponse(",
    ]);
  });

  test("🔴 같은 출처 확인이 **첫 줄**이다 — 그 앞에 await 가 하나도 없다", () => {
    // 라우트 핸들러에는 Next 의 CSRF 방어가 없다(서버 액션과 다른 점). 이것이 뒤로
    // 밀리면 남의 사이트가 심은 <form> 한 줄이 먼저 세션을 쓰고 공유폴더에 파일을 만든다.
    const guard = body.indexOf("if (!isTrustedOrigin(request)) {");
    assert.ok(guard >= 0, "같은 출처 문지기가 없다");
    assert.equal(body.slice(0, guard).includes("await"), false, "문지기보다 앞에서 무언가를 기다린다");
    assert.ok(body.indexOf('fail(403, "UNTRUSTED_ORIGIN"', guard) > guard);
    // 로그인하지 않은 요청은 401 — 승인 대기 · 정지 · 삭제도 getSessionUser() 가 함께 거른다.
    assert.ok(body.includes('if (!actingUser) return fail(401, "UNAUTHENTICATED", "로그인이 필요합니다.");'));
  });

  test("🔴 문턱은 quotes **WRITE** 하나다 — READ 로 들어오는 길이 없다", () => {
    // 보기 권한자의 받기는 예전 그대로 GET /api/quotes/{id}/xlsx 다.
    assert.equal(body.includes('"READ"'), false, "보기 권한으로 들어오는 길이 생겼다");
    assert.equal(body.includes('"MANAGE"'), false, "문턱이 둘이 되었다");
    assert.equal((body.match(/hasPermission\(/g) ?? []).length, 1, "권한 확인이 둘이다");
    // 권한이 **견적서 조회보다 앞**이다 — 중심 함수가 조회를 한다.
    assert.ok(body.indexOf('hasPermission(actingUser, "quotes", "WRITE")') < body.indexOf("issueQuoteFile({"));
  });

  test("🔴 A/S 의 인증 사슬을 끌고 오지 않았다 — 이 사이트는 두 걸음이다", () => {
    for (const forbidden of [
      "acting-user",
      "auth-source",
      "getAuthSource",
      "readSession",
      "resolveActingUserForSession",
      "ACCOUNT_NOT_APPROVED",
      "DATABASE_MODE_REQUIRED",
      "mock-data",
    ]) {
      // 🔴 코드만 본다 — 머리말이 A/S 의 도구 이름을 설명한다(위 codeOnly).
      assert.equal(codeOnly.includes(forbidden), false, `가져오면 안 되는 것: ${forbidden}`);
    }
  });

  test("🔴 결재를 한 번도 보지 않는다 — 발행은 결재를 기다리지 않는다(2026-09-18)", () => {
    // 🔴 같은 것을 domain/quote-approval-rules.test.ts 의 ISSUE_PATH_SOURCES 가
    //    발행 통로 여섯 파일에 대해 함께 잰다. 여기에도 두는 까닭은 이 파일이
    //    「이 통로가 무엇을 보는가」를 한자리에 모아 두는 자리이기 때문이다.
    for (const forbidden of ["quoteApprovals", "quote_approvals", "quote-approvals", "resolveQuoteApprovalState"]) {
      assert.equal(
        route.includes(forbidden),
        false,
        `발행 통로가 결재를 보기 시작했다(${forbidden}) — 막아야 한다면 코드를 고치기 전에 먼저 물을 것.`
      );
    }
  });

  test("🔴 결과 헤더는 전역 보안 헤더와 겹치지 않는 새 이름이다 — 겹치면 Next 가 조용히 버린다", () => {
    assert.ok(route.includes("[QUOTE_ISSUE_RESULT_HEADER]: encodeQuoteIssueResult(outcome.result)"));
    assert.ok(route.includes('"Cache-Control": "no-store, must-revalidate"'), "직인 찍힌 문서가 중간 캐시에 남는다");
    for (const name of [
      "X-Frame-Options",
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ]) {
      assert.equal(route.includes(`"${name}"`), false, `전역 헤더와 같은 이름: ${name}`);
    }
    const nextConfig = readFileSync(new URL("../../../../next.config.ts", import.meta.url), "utf8");
    assert.equal(nextConfig.toLowerCase().includes(QUOTE_ISSUE_RESULT_HEADER.toLowerCase()), false);
  });

  test("🔴 실패도 200 도 내부 경로 · 저장 루트를 싣지 않는다", () => {
    for (const statement of body.split(";")) {
      if (!statement.includes("fail(")) continue;
      for (const leak of ["storedPath", "tempPath", "resolveUploadsRoot", "UPLOADS_DIR", "QUOTE_ARCHIVE_DIR", "archiveRoot"]) {
        assert.equal(statement.includes(leak), false, `거절 응답에 내부 값을 실었다: ${leak}`);
      }
    }
    const sent = body.slice(body.indexOf("return new NextResponse("));
    for (const leak of ["storedPath", "archiveRoot", "resolveUploadsRoot", "QUOTE_ARCHIVE_DIR"]) {
      assert.equal(sent.includes(leak), false, `200 응답에 내부 값을 실었다: ${leak}`);
    }
    // 로그도 마찬가지다 — 남기는 것은 견적서 id 뿐이다.
    assert.ok(body.includes('console.error("[quote-issue] 첨부 저장소를 열지 못했다", { quoteId: id })'));
  });

  test("🔴 가져오는 것은 문지기 · 이름 · 결과 모양 · 중심 함수 · 저장소뿐이다", () => {
    assert.deepEqual(importSpecifiers(route), [
      "@/lib/auth/permission-resolver",
      "@/lib/auth/request-guards",
      "@/lib/auth/session",
      "@/lib/domain/quote-file-name",
      "@/lib/domain/quote-issue-result",
      "@/lib/server/services/quote-issue",
      "@/lib/storage/local-fs-adapter",
      "@/lib/storage/quote-archive",
      "@/lib/storage/storage-adapter",
      "@/lib/validation/quote-input",
      "next/server",
    ]);
    for (const forbidden of [
      // 🔴 공유폴더에 닿는 것은 중심 함수 하나다 — 라우트는 루트만 건네준다.
      "saveToQuoteArchive",
      "findQuoteArchiveFolder",
      // 🔴 저장소에 닿는 것도 StorageAdapter 하나다 — 어디선가 fs 를 직접 부르면
      //    그 자리가 NAS 이식 때 빠뜨리는 자리가 된다(storage/storage-adapter.ts 머리말).
      "node:fs",
      "node:path",
      "require(",
      // 🔴 첨부 칸을 바꾸는 것도 중심 함수의 몫이다(칸 교체 잠금 안에서).
      "createAttachmentRecord",
    ]) {
      assert.equal(codeOnly.includes(forbidden), false, `가져오면 안 되는 것: ${forbidden}`);
    }
  });

  test("🔴 중심 함수의 실패 코드마다 응답 코드가 정해져 있다 — 케이블 같은 「아직 안 만든 기능」은 501", () => {
    const table = route.slice(route.indexOf("const STATUS_BY_ISSUE_FAILURE"), route.indexOf("function fail("));
    for (const [code, status] of [
      ["NOT_FOUND", "404"],
      ["EXCEL_NOT_ATTACHED", "404"],
      ["KIND_NOT_SUPPORTED", "501"],
      ["SCAN_BLOCKED", "403"],
      ["TEMPLATE_UNAVAILABLE", "503"],
      ["RENDER_FAILED", "500"],
      ["STORAGE_FAILED", "500"],
    ] as const) {
      assert.ok(table.includes(`${code}: ${status},`), `${code} 의 응답 코드가 ${status} 가 아니다`);
    }
    // Record 로 둔다 — 코드가 하나 늘면 컴파일러가 여기를 채우라고 짚는다.
    assert.ok(flat(route).includes("const STATUS_BY_ISSUE_FAILURE: Record<QuoteIssueFailureCode, number> = {"));
  });
});
