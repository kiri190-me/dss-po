import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/domain/attachment-allowlist";
import { HANDWRITTEN_QUOTE_FAILURE_MESSAGES } from "@/lib/xlsx/handwritten-quote-reader";

/**
 * ============================================================================
 * POST /api/quotes/parse-excel — 문지기 순서 · 이름 · 쓰기 없음을 **소스로** 지킨다 (3e-1)
 * ============================================================================
 * 이 저장소는 라우트를 직접 부를 수 없다 — 쿠키(`next/headers`) · DB 가 필요하고 그
 * 사슬은 `import "server-only"` 로 시작한다. 그래서 형제 시험들
 * (`../attachments-route-source.test.ts` · `../xlsx-route-source.test.ts`)과 같은
 * 장치를 쓴다: **원본을 글자로 읽는다.** 읽는 일 자체는
 * `lib/xlsx/handwritten-quote-reader.test.ts` 가 실제로 불러서 본다.
 *
 * 🔴 여기서 재는 것은 **순서**와 **하지 않는 일** 둘이다:
 *   · 관문보다 본문 받기가 앞이면 거절될 20MB 를 다 받고 나서 버리게 된다.
 *   · 이 통로는 **아무것도 쓰지 않는다** — 첨부 저장소 · 임시 폴더 · DB · 감사 어느
 *     곳에도. 쓰는 줄이 하나 생기면 「읽어서 폼에 채워 줄 뿐」이라는 전제가 무너지고,
 *     견적서 id 없이 부르는 통로가 갑자기 자료를 남기는 통로가 된다.
 *
 * ── 🔴 이 파일이 라우트 **곁에** 있는 까닭 ───────────────────────────────
 * 형제 둘은 대괄호를 피해 한 칸 위에 있다 — `node --test` 가 경로를 글롭으로 읽어
 * `[id]` 를 문자클래스로 보기 때문이다(scripts/run-test-list.mjs 머리말). 이 통로의
 * 경로 `parse-excel` 에는 대괄호가 없어 곁에 둘 수 있다(A/S 의 같은 자리 그대로).
 * 아래 첫 묶음이 그 사실 자체를 잰다.
 * ============================================================================
 */

/** 저장소 뿌리 기준 경로 — 대괄호가 없다는 것을 아래에서 잰다. */
const ROUTE = "src/app/api/quotes/parse-excel/route.ts";
const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");

/**
 * 주석을 뺀 코드.
 *
 * 🔴 순서 단언과 「가져오면 안 되는 것」에 필요하다 — 이 라우트의 머리말은 **A/S 가
 * 쓰는 도구 이름**(`readSession()` · `getAuthSource()` · `resolveActingUserForSession()`)
 * 을 적어 두고 「이 사이트는 그렇게 하지 않는다」를 설명한다. 원본을 그대로 훑으면 그
 * 설명이 금지 낱말로 걸려, 시험이 **주석을 고치라고** 요구하게 된다. 순서도 마찬가지다 —
 * 머리말이 `isTrustedOrigin(request)` 를 먼저 적어 두므로 주석을 두고 재면 자리가 밀린다.
 */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
const codeOnly = codeOf(route);

/** POST 본문만 — 위쪽의 실패 코드 유니온 · fail() 은 여기 들어오지 않는다. */
const postBody = codeOnly.slice(codeOnly.indexOf("export async function POST"));

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

describe("수기 견적서 엑셀 읽기 통로 — 소스로 지킨다", () => {
  test("🔴 Next 가 정한 이름만 export 한다 — POST · runtime · dynamic 뿐", () => {
    assert.deepEqual(exportedNames(route), ["POST", "dynamic", "runtime"]);
    assert.equal(/^export\s*(?:\{|default|\*)/m.test(route), false, "다른 모양으로 내보내고 있다");
    // 파일 바이트를 다루므로 Node 런타임이고, 쿠키를 읽으므로 캐시된 응답을 내놓을 수 없다.
    assert.ok(route.includes('export const runtime = "nodejs";'));
    assert.ok(route.includes('export const dynamic = "force-dynamic";'));
  });

  test("🔴 견적서 id 가 없는 통로다 — 새 견적서(아직 id 없음)에서도 부른다", () => {
    // 경로에 대괄호가 없다 — 있으면 이 시험 파일이 조용히 안 돈다(머리말).
    assert.equal(ROUTE.includes("["), false);
    assert.match(route, /export async function POST\(request: NextRequest\): Promise<NextResponse>/);
    assert.equal(postBody.includes("params"), false, "견적서 id 를 받고 있다");
  });

  test("🔴 순서: 출처 → 세션(살아 있는 계정 · 승인) → quotes WRITE → 선언 길이 → 세며 읽기 → 읽개 → JSON", () => {
    const marks = [
      "isTrustedOrigin(request)",
      "await getSessionUser()",
      'hasPermission(actingUser, "quotes", "WRITE")',
      "declaredLength > MAX_ATTACHMENT_SIZE_BYTES",
      "readBodyWithinLimit(body, MAX_ATTACHMENT_SIZE_BYTES)",
      "readHandwrittenQuoteWorkbook(received.bytes, {",
      "NextResponse.json(",
    ];
    let previous = -1;
    for (const mark of marks) {
      const at = postBody.indexOf(mark);
      assert.ok(at >= 0, `없다: ${mark}`);
      assert.ok(at > previous, `순서가 어긋났다: ${mark}`);
      previous = at;
    }
  });

  test("🔴 같은 출처 확인이 **첫 줄**이다 — 그 앞에 await 가 하나도 없다", () => {
    // 라우트 핸들러에는 Next 의 CSRF 방어가 없다(서버 액션과 다른 점). 이것이 뒤로
    // 밀리면 남의 사이트가 심은 <form> 한 줄이 먼저 세션을 쓰고 DB 를 읽는다.
    const guard = postBody.indexOf("if (!isTrustedOrigin(request)) {");
    assert.ok(guard >= 0, "같은 출처 문지기가 없다");
    assert.equal(postBody.slice(0, guard).includes("await"), false, "문지기보다 앞에서 무언가를 기다린다");
    assert.ok(postBody.indexOf('fail(403, "UNTRUSTED_ORIGIN"', guard) > guard);
  });

  test("🔴 인증은 이 사이트 식 한 걸음이다 — A/S 에만 있는 실패 코드가 유니온에 없다", () => {
    // getSessionUser() 한 줄이 저쪽의 네 걸음을 대신한다. 그 조회가 승인 · 활성 ·
    // 삭제 · 잠김을 매 요청 다시 보므로(auth/session.ts) 아래 두 코드가 설 자리가 없다.
    assert.ok(codeOnly.includes('import { getSessionUser } from "@/lib/auth/session";'));
    // 로그인하지 않은 요청은 401 — 승인 대기 · 정지 · 삭제 · 잠김도 같은 한 줄이 거른다.
    assert.match(
      postBody,
      /if \(!actingUser\) \{\s*return fail\(401, "UNAUTHENTICATED", "로그인이 필요합니다\."\);/
    );
    for (const gone of ["DATABASE_MODE_REQUIRED", "ACCOUNT_NOT_APPROVED"]) {
      assert.equal(codeOnly.includes(gone), false, `A/S 에만 있는 실패 코드가 남아 있다: ${gone}`);
    }
    assert.equal(codeOnly.match(/await getSessionUser\(\)/g)?.length, 1, "세션을 두 번 읽거나 읽지 않는다");
  });

  test("보기 권한(READ)으로 들어오는 길이 없다 — 권한 판정은 한 번, WRITE", () => {
    assert.equal(postBody.includes('"READ"'), false);
    assert.equal(postBody.match(/hasPermission\(/g)?.length, 1);
    const gate = postBody.indexOf('hasPermission(actingUser, "quotes", "WRITE")');
    assert.ok(gate >= 0, "권한 관문이 없다");
    assert.ok(postBody.indexOf('fail(403, "FORBIDDEN"', gate) > gate, "권한이 없을 때 403 이 아니다");
  });

  test("🔴 본문은 **모든 거절 뒤에** 받는다 — 거절될 20MB 를 받아 놓고 버리지 않는다", () => {
    const bodyAt = postBody.indexOf("const body = request.body;");
    assert.ok(bodyAt >= 0, "본문을 받는 자리가 없다");
    for (const rejection of ['"UNTRUSTED_ORIGIN"', '"UNAUTHENTICATED"', '"FORBIDDEN"']) {
      const at = postBody.indexOf(rejection);
      assert.ok(at >= 0, `거절 갈래가 없다: ${rejection}`);
      assert.ok(at < bodyAt, `${rejection} 이 본문 받기보다 뒤다`);
    }
    // 질의 문자열에서 받는 것은 `?sheet=` 하나뿐이다 — 파일 이름도 분류도 받지 않는다.
    assert.equal(postBody.match(/searchParams\.get\(/g)?.length, 1, "질의 문자열에서 다른 값을 더 받는다");
  });

  test("상한 — 선언 길이로 먼저 자르고, 읽으면서 다시 센다(둘 다 413)", () => {
    // 1겹: 브라우저가 알려 준 크기. 맞을 때 20MB 를 받아 놓고 버리는 일을 아낀다.
    assert.ok(postBody.includes('const declaredLength = Number(request.headers.get("content-length") ?? "");'));
    // 2겹: 실제로 센 바이트. 상한을 넘는 순간 읽기를 끊는다.
    assert.equal(postBody.match(/fail\(413, "FILE_TOO_LARGE"/g)?.length, 2);
    assert.ok(codeOnly.includes("if (total > maxBytes) {"));
    assert.ok(codeOnly.includes("await reader.cancel()"));
    // 상한값은 허용목록 한 곳이 정한다(20MB) — 라우트가 숫자를 손으로 적지 않는다.
    assert.equal(MAX_ATTACHMENT_SIZE_BYTES, 20 * 1024 * 1024, "상한이 20MB 가 아니다");
    assert.equal(codeOnly.match(/MAX_ATTACHMENT_SIZE_BYTES/g)?.length, 3, "상한을 다른 곳에서도 정한다");
    // 빈 파일도 막는다.
    assert.ok(postBody.includes("received.bytes.length === 0"));
  });

  test("🔴 쓰는 줄이 없다 — DB · 저장소 · 감사 · 공유폴더 어느 것도 부르지 않는다", () => {
    assert.deepEqual(importSpecifiers(route), [
      "@/lib/auth/permission-resolver",
      "@/lib/auth/request-guards",
      "@/lib/auth/session",
      "@/lib/domain/attachment-allowlist",
      "@/lib/xlsx/handwritten-quote-reader",
      "next/server",
    ]);
    for (const forbidden of [
      // 🔴 DB 에 한 줄도 쓰지 않는다. 읽기 조회조차 없다 — 세션과 권한이 보는 것이 전부다.
      "db.insert",
      "db.update",
      "db.delete",
      "db.select",
      "tx.",
      "@/lib/db/",
      "mutations",
      "createAttachmentRecord",
      // 🔴 디스크에 닿지 않는다 — 임시 폴더도 첨부 저장소도.
      "@/lib/storage/",
      "getAttachmentStorage",
      "writeTemp",
      "resolveUploadsRoot",
      "node:fs",
      "node:path",
      // 🔴 감사를 남기지 않는다(머리말 '읽기 전용') — 기록할 변경이 없다.
      "auditLogs",
      "recordAudit",
      "recordQuoteExport",
      // 🔴 공유폴더는 발행(3c-3)의 몫이다.
      "saveToQuoteArchive",
      "resolveQuoteArchiveRoot",
      // 🔴 A/S 의 인증 사슬을 끌고 오지 않았다.
      "acting-user",
      "auth-source",
      "readSession",
      "require(",
    ]) {
      // 🔴 코드만 본다 — 머리말이 A/S 의 도구 이름을 설명한다(위 codeOnly).
      assert.equal(codeOnly.includes(forbidden), false, `이 통로에 있으면 안 되는 것: ${forbidden}`);
    }
    // 🔴 그 자리에 까닭이 적혀 있다 — 곁말이 없으면 다음 사람이 빠뜨린 것으로 읽는다.
    assert.match(route, /읽기 전용이다/);
    assert.match(route, /감사를 남기지 않는다/);
  });

  test("🔴 응답에 내부 경로를 싣지 않는다 — 거절도 200 도", () => {
    // 거절 응답: fail() 이 들어 있는 문장 어디에도 저장 경로 · 임시 경로가 없다.
    for (const statement of postBody.split(";")) {
      if (!statement.includes("fail(")) continue;
      for (const leak of ["storedPath", "tempPath", "resolveUploadsRoot", "UPLOADS_DIR", "absolute", "__dirname"]) {
        assert.equal(statement.includes(leak), false, `거절 응답에 내부 값을 실었다: ${leak}`);
      }
    }
    // 200 응답: 읽개가 돌려준 값 여섯뿐이다.
    const okResponse = postBody.slice(postBody.indexOf("return NextResponse.json("));
    for (const leak of ["storedPath", "tempPath", "resolveUploadsRoot", "actingUser", "received.bytes"]) {
      assert.equal(okResponse.includes(leak), false, `200 응답에 내부 값을 실었다: ${leak}`);
    }
  });

  test("실패 응답 — 읽개의 실패 코드마다 415 · 422 · 413, 모양은 { error, code }", () => {
    const expected: Record<string, number> = {
      XLS_LEGACY: 415,
      NOT_XLSX: 415,
      NO_QUOTE_SHEET: 422,
      CONTENT_TOO_LARGE: 413,
      SHEET_NOT_FOUND: 422,
    };
    assert.deepEqual(Object.keys(HANDWRITTEN_QUOTE_FAILURE_MESSAGES).sort(), Object.keys(expected).sort());
    for (const [code, status] of Object.entries(expected)) {
      assert.ok(route.includes(`  ${code}: ${status},`), `${code} → ${status}`);
    }
    assert.ok(route.includes("NextResponse.json({ error: message, code }, { status })"));
    assert.ok(postBody.includes("fail(STATUS_BY_READ_FAILURE[result.code], result.code, result.message)"));
  });

  test("성공 — 200 { sheet, sheetIndex, sheetName, sheets, fields, warnings } · 캐시하지 않는다", () => {
    for (const key of ["sheet", "sheetIndex", "sheetName", "sheets", "fields", "warnings"]) {
      assert.ok(postBody.includes(`      ${key}: result.${key},`), `응답에 ${key} 가 없다`);
    }
    assert.ok(postBody.includes("status: 200"));
    // 고객 정보가 담긴 응답이다 — 중간 캐시에 남지 않게 한다.
    assert.ok(postBody.includes('"Cache-Control": "no-store"'));
  });

  test("🔴 `?sheet=` 를 읽개에 그대로 넘긴다 — 없는 시트를 조용히 딴 것으로 바꾸지 않는다", () => {
    assert.ok(postBody.includes("request.nextUrl.searchParams.get(SHEET_QUERY)"));
    assert.ok(postBody.includes("sheetIndex: sheetParam === null ? undefined : sheetIndexOf(sheetParam)"));
    // 숫자가 아니거나 빈 값이면 NaN 을 그대로 넘긴다 — 읽개가 SHEET_NOT_FOUND 로 거절한다.
    assert.ok(codeOnly.includes('return value.trim() === "" ? Number.NaN : Number(value);'));
    for (const guess of ["?? 0", "|| 0"]) {
      assert.equal(codeOnly.includes(guess), false, `없는 시트를 짐작으로 채운다: ${guess}`);
    }
  });

  test("로그에 파일의 값을 싣지 않는다 — console 은 한 번, 오류 이름만", () => {
    const calls = route.match(/console\.\w+\(/g) ?? [];
    assert.deepEqual(calls, ["console.error("]);
    const line = route.split("\n").find((candidate) => candidate.includes("console.error(")) ?? "";
    assert.ok(line.includes("errorNameOf(error)"), line);
  });

  test("머리말에 읽기 전용 · 감사 없음 · id 없는 까닭 · 종류 판정이 적혀 있다", () => {
    assert.ok(route.includes("왜 견적서 id 가 없는 통로인가"));
    assert.ok(route.includes("폼이 파일을 **저장 전에** 들고 있다"));
    // 🔴 확장자를 보지 않는 까닭이 적혀 있다 — 이 통로에는 파일 이름이 없다.
    assert.ok(route.includes("파일 이름이 아예 없다"));
    assert.equal(codeOnly.includes("fileName"), false, "저장하지도 않으면서 파일 이름을 받는다");
    // 🔴 아직 부르는 화면이 없다는 사실도 적혀 있어야 한다(3e-1 에서 참이다).
    assert.ok(route.includes("아직 부르는 화면이 없다"));
  });
});
