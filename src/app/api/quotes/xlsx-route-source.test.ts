import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { QUOTE_EXCEL_ONLY_DOWNLOAD_MESSAGE } from "@/lib/domain/quote-excel-only-download";

/**
 * ============================================================================
 * GET /api/quotes/{id}/xlsx — 🔴 **문지기 순서**와 거절 갈래를 소스로 지킨다 (3c-2)
 * ============================================================================
 * 이 저장소는 라우트를 직접 부를 수 없다 — 쿠키(`next/headers`) · DB · 디스크의 양식
 * 파일이 전부 필요하고, 그 사슬은 `import "server-only"` 로 시작한다. 그래서 A/S 의
 * 같은 통로들이 쓰는 장치를 그대로 쓴다: **원본을 글자로 읽는다**(저쪽
 * `api/quotes/[id]/excel-preview/route-source.test.ts` · `parse-excel/route-source.test.ts`).
 *
 * 🔴 여기서 재는 것은 **순서**다. 이 통로의 위험은 "권한 없는 사람이 파일을 받는 것"
 * 하나가 아니다 — 관문보다 조회가 앞이면, 권한이 없는 사람도 **그 id 의 견적서가
 * 있는지**를 응답이 갈리는 것으로 알아낼 수 있다(404 냐 403 냐). 그래서 조회 · 채우기 ·
 * 감사가 전부 관문 뒤에 있는지를 자리로 확인한다.
 *
 * 실제로 파일이 내려오는지는 사람이 띄워 놓은 서버로 확인했다(조각 3c-2 보고 ①):
 * 종류별로 xlsx 가 `PK\x03\x04` 로 시작하고, 엑셀 전용 장은 501 로 거절되고, 감사에
 * `EXCEL_EXPORT` 한 줄이 남았다.
 *
 * ── 🔴 이 파일이 라우트 **곁이 아니라 한 칸 위에** 있는 까닭 ─────────────
 * `node --test` 는 받은 경로를 **글롭 패턴으로 읽는다.** App Router 의 `[id]` 는 그
 * 문법에서 「i 또는 d 한 글자」라, 시험 목록에 그 폴더를 그대로 적으면 아무것도 맞지
 * 않아 **그 시험이 조용히 안 돈다**(실측 2026-09-22: 파일은 41개로 세면서 tests 는
 * 0 이 늘었다. 목록 검사도 통과한다 — 파일이 정말로 있으니까).
 *
 * A/S 는 목록에 `src/app/api/quotes/*\/xlsx/download-source.test.ts` 처럼 그 칸을 `*`
 * 로 적고 실행기가 펼치지만, 🔴 **이 저장소의 실행기에는 그 펼치기가 없다**
 * (scripts/run-test-list.mjs 머리말 — 「`*` 가 든 줄은 여기서 그냥 「없는 파일」이다」).
 * 그래서 시험만 대괄호 밖으로 옮겼다. 읽는 원본은 아래 경로 그대로다.
 * ============================================================================
 */

const route = readFileSync(new URL("./[id]/xlsx/route.ts", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n"
);
const getBody = route.slice(route.indexOf("export async function GET"));
const flat = (source: string) => source.replace(/\s+/g, " ");

/**
 * 주석을 뺀 코드.
 *
 * 🔴 아래 「가져오면 안 되는 것」 목록에 필요하다 — 이 라우트의 머리말은 **A/S 가 쓰는
 * 도구 이름**(`readSession()` · `resolveActingUserForSession()` · `getAuthSource()`)을
 * 적어 두고 「이 사이트는 `getSessionUser()` 한 걸음이다」를 설명한다. 원본을 그대로
 * 훑으면 그 설명이 금지 낱말로 걸려, 시험이 **주석을 고치라고** 요구하게 된다.
 */
const codeOnly = route.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

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

describe("받기 통로 — 소스로 지킨다", () => {
  test("🔴 Next 가 정한 이름만 export 한다 — GET · runtime · dynamic 뿐", () => {
    // 라우트 파일은 Next 가 아는 이름 말고는 내보낼 수 없다. 다른 통로가 이 코드를
    // 불러 쓰려면 서비스로 떼어 놓아야 한다 — 양식 채우기가 그렇게 떼어져 있다
    // (lib/server/services/quote-workbook.ts 머리말 · A/S 의 같은 판단).
    assert.deepEqual(exportedNames(route), ["GET", "dynamic", "runtime"]);
    assert.equal(/^export\s*(?:\{|default|\*)/m.test(route), false, "다른 모양으로 내보내고 있다");
    assert.ok(route.includes('export const runtime = "nodejs";'));
    assert.ok(route.includes('export const dynamic = "force-dynamic";'));
  });

  test("🔴 순서: 세션 → 권한(READ) → id 형식 → 조회 → 종류 → 엑셀 전용 → 채우기 → 감사 → 전송", () => {
    const body = flat(getBody);
    const marks = [
      "await getSessionUser()",
      'hasPermission(actingUser, "quotes", "READ")',
      "isValidQuoteId(id)",
      "await getQuoteForEdit(id)",
      "canRenderQuoteDocument(quote)",
      "quote.isExcelOnly",
      "await renderQuoteWorkbook(quote)",
      "await recordQuoteExport({",
      "buildQuoteFileName({",
      "new Response(new Uint8Array(workbook)",
    ];
    let previous = -1;
    for (const mark of marks) {
      const at = body.indexOf(mark);
      assert.ok(at >= 0, `없다: ${mark}`);
      assert.ok(at > previous, `순서가 어긋났다: ${mark}`);
      previous = at;
    }
  });

  test("🔴 로그인하지 않은 요청은 401 — 그 앞에 DB 조회가 하나도 없다", () => {
    const body = flat(getBody);
    assert.ok(body.includes('if (!actingUser) return fail(401, "UNAUTHENTICATED", "로그인이 필요합니다.");'));
    // 🔴 세션 확인이 **첫 줄**이다. 조회가 그보다 앞이면 로그인하지 않은 요청도 그
    //    견적서가 있는지를 응답 시간과 갈래로 알아낼 수 있다.
    const sessionAt = body.indexOf("await getSessionUser()");
    assert.ok(sessionAt >= 0);
    assert.ok(body.indexOf("getQuoteForEdit(") > sessionAt, "조회가 세션 확인보다 앞이다");
  });

  test("🔴 권한 없는 요청은 403 — 🔴 **확인이 조회보다 앞이다**", () => {
    const body = flat(getBody);
    const gate = body.indexOf('if (!(await hasPermission(actingUser, "quotes", "READ"))) {');
    assert.ok(gate >= 0, "권한 관문이 없다");
    assert.ok(body.indexOf('fail(403, "FORBIDDEN"', gate) > gate, "권한이 없을 때 403 이 아니다");
    /**
     * 🔴 **이 한 줄이 이 시험의 요점이다.** 조회가 관문보다 앞이면 권한이 없는 사람도
     * "그 id 의 견적서가 있다"는 사실을 알아낼 수 있다(403 이 아니라 404 가 오는 것으로).
     * 포털 쪽에서 그렇게 잠근 선례가 있고, 이 저장소의 목록 · 작성 화면도 같은 순서다
     * (quote-list-screen-source.test.ts 의 「관문이 먼저다」).
     */
    assert.ok(body.indexOf("getQuoteForEdit(") > gate, "조회가 권한 확인보다 앞이다");
    assert.ok(body.indexOf("isValidQuoteId(") > gate, "id 형식 확인이 권한 확인보다 앞이다");
  });

  test("🔴 문턱은 READ 하나다 — 넓히지도 좁히지도 않는다", () => {
    // 이 통로는 아무것도 바꾸지 않는다 — 목록에서 그 견적서를 볼 수 있는 사람이면
    // 파일로도 받을 수 있는 것이 맞다(라우트 머리말 '왜 READ 로 충분한가'). 그래서
    // 목록의 링크도 canEdit 으로 갈리지 않는다.
    assert.equal(getBody.match(/hasPermission\(/g)?.length, 1, "권한을 두 번 묻거나 묻지 않는다");
    assert.equal(getBody.includes('"WRITE"'), false);
    assert.equal(getBody.includes('"MANAGE"'), false);
  });

  test("🔴 없는 id · 형식이 틀린 id · 지워진 장은 모두 404 한 문장이다", () => {
    const body = flat(getBody);
    // 🔴 형식이 틀린 글자로 DB 를 때리지 않는다. 그리고 「형식이 틀렸다」와 「없다」에
    //    다른 답을 주지 않는다 — 가르면 그 차이가 곧 견적서 id 를 찾는 도구가 된다.
    assert.equal(
      body.split('return fail(404, "NOT_FOUND", "해당 견적서를 찾을 수 없습니다.");').length - 1,
      2,
      "형식 · 조회 두 자리에서 같은 404 로 답하지 않는다"
    );
    // 지워진 장이 여기서도 없는 것인 까닭은 조회 쪽에 있다(getQuoteForEdit 이
    // is_deleted 로 좁히고, 앱이 다루지 못하는 종류도 null 로 답한다).
    assert.ok(body.includes("const quote = await getQuoteForEdit(id); if (!quote)"));
  });

  test("🔴 엑셀 전용 견적서는 501 과 사람이 읽는 문장으로 거절한다 — 앱 양식으로 대신 채우지 않는다", () => {
    const body = flat(getBody);
    assert.ok(
      body.includes(
        'if (quote.isExcelOnly) { return fail(501, "EXCEL_ONLY_NOT_SUPPORTED", QUOTE_EXCEL_ONLY_DOWNLOAD_MESSAGE); }'
      ),
      "엑셀 전용 갈래가 없다 — 품목 없는 빈 견적서가 나간다"
    );
    // 🔴 문장은 **화면과 같은 하나**다(목록의 곁말이 이 상수를 그대로 쓴다). 두 벌이면
    //    화면에서 본 말과 통로에서 듣는 말이 달라진다.
    assert.match(QUOTE_EXCEL_ONLY_DOWNLOAD_MESSAGE, /붙/);
    assert.match(QUOTE_EXCEL_ONLY_DOWNLOAD_MESSAGE, /내려받을 수 없습니다/);
    // 🔴 첨부 사슬을 끌고 오지 않았다 — 그것이 이 갈래가 거절로 끝나는 까닭이다.
    for (const forbidden of [
      "download-source",
      "attachment",
      "listLiveQuoteAttachments",
      "storage-adapter",
      "local-fs-adapter",
    ]) {
      assert.equal(route.includes(forbidden), false, `첨부 사슬을 끌고 왔다: ${forbidden}`);
    }
  });

  test("🔴 양식을 못 읽으면 503, 채우다 터지면 500 — 경로도 값도 응답에 담지 않는다", () => {
    const body = flat(getBody);
    // 🔴 양식 파일이 없거나 못 읽는 것은 **고장이 아니라 준비가 안 된 것**이라 503 이고,
    //    문장은 그 오류가 들고 온 것을 쓴다(경로는 담기지 않는다 — 서버 로그에만 있다).
    const templateAt = body.indexOf("if (err instanceof QuoteTemplateError) {");
    assert.ok(templateAt >= 0, "양식을 못 읽은 경우를 가르지 않는다");
    assert.ok(
      body.indexOf('fail(503, "TEMPLATE_UNAVAILABLE", err.message)', templateAt) > templateAt,
      "양식을 못 읽었을 때 503 과 그 문장으로 답하지 않는다"
    );
    assert.ok(body.includes('return fail(500, "RENDER_FAILED", "견적서를 만들지 못했습니다. 관리자에게 문의해 주세요.");'));
    // 로그에도 값을 담지 않는다 — 품명 · 신고증상에 고객사 사정이 섞인다.
    const logAt = body.indexOf('console.error("[quote-xlsx] 견적서를 만들지 못했다"');
    assert.ok(logAt >= 0, "만들기 실패를 서버 로그에 남기지 않는다");
    const logged = body.slice(logAt, body.indexOf("});", logAt));
    for (const leak of ["quote.items", "quote.customerNameText", "quote.subject", "faultDescription"]) {
      assert.equal(logged.includes(leak), false, `로그에 값을 담았다: ${leak}`);
    }
  });

  test("🔴 감사(EXCEL_EXPORT)는 파일을 돌려주기 전에, 모든 거절 뒤에 남는다", () => {
    const body = flat(getBody);
    const auditAt = body.indexOf("await recordQuoteExport({");
    assert.ok(auditAt >= 0, "감사를 남기지 않는다 — 직인이 찍힌 문서가 나가는 일이다");
    // 거절 전부가 감사보다 앞이다 — 나가지 않은 문서에는 한 줄도 남지 않는다.
    for (const rejection of [
      'fail(401, "UNAUTHENTICATED"',
      'fail(403, "FORBIDDEN"',
      'fail(404, "NOT_FOUND"',
      'fail(501, "KIND_NOT_SUPPORTED"',
      'fail(501, "EXCEL_ONLY_NOT_SUPPORTED"',
      'fail(503, "TEMPLATE_UNAVAILABLE"',
      'fail(500, "RENDER_FAILED"',
    ]) {
      const at = body.indexOf(rejection);
      assert.ok(at >= 0, `거절 갈래가 없다: ${rejection}`);
      assert.ok(at < auditAt, `${rejection} 이 감사보다 뒤다 — 나가지 않은 문서가 기록된다`);
    }
    // 🔴 응답보다 앞이다. 응답을 먼저 반환하면 기록이 누락될 수 있다.
    assert.ok(body.indexOf("new Response(new Uint8Array(workbook)") > auditAt, "감사가 전송보다 뒤다");
  });

  test("🔴 응답 머리글 — xlsx MIME · 서버가 정한 파일 이름 · 캐시 금지", () => {
    const body = flat(getBody);
    assert.ok(
      body.includes(
        '"Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",'
      ),
      "xlsx MIME 이 아니다"
    );
    // 파일 이름은 **서버가 정한다** — 그래서 목록의 받기가 평범한 링크 하나로 끝난다.
    assert.ok(body.includes('"Content-Disposition": quoteContentDisposition(fileName),'));
    assert.ok(body.includes('"Content-Length": String(workbook.byteLength),'));
    // 직인이 찍힌 문서다. 중간 캐시에 남지 않게 한다.
    assert.ok(body.includes('"Cache-Control": "no-store, must-revalidate",'));
    // 거절 응답도 캐시하지 않는다 — 세션 · 권한에 따라 답이 달라진다.
    assert.ok(flat(route).includes('{ status, headers: { "cache-control": "no-store" } }'));
  });

  test("🔴 쓰기가 없다 — 가져오는 것은 문지기 · 조회 · 판정 · 양식 · 감사 한 줄뿐이다", () => {
    assert.deepEqual(importSpecifiers(route), [
      "@/lib/auth/permission-resolver",
      "@/lib/auth/session",
      "@/lib/db/mutations/quote-exports",
      "@/lib/db/queries/quotes",
      "@/lib/domain/quote-document-support",
      "@/lib/domain/quote-excel-only-download",
      "@/lib/domain/quote-file-name",
      "@/lib/server/services/quote-workbook",
      "@/lib/storage/quote-template",
      "@/lib/validation/quote-input",
    ]);
    for (const forbidden of [
      // 🔴 A/S 의 인증 사슬(mock 자료 · users 조회)을 끌고 오지 않았다 — 이 사이트는
      //    getSessionUser() 한 걸음이다.
      "acting-user",
      "mock-data",
      "readSession",
      "auth-source",
      // 🔴 견적서를 **고치는** 길이 이 통로에 없다. 받기는 아무것도 바꾸지 않는다.
      "mutations/quotes",
      "quote-trash",
      "updateQuote",
      // 발행(3c-3) — 공유폴더 · 첨부 칸을 바꾸는 일은 이 통로의 것이 아니다.
      "quote-issue",
      "archive-folder",
      // 요청 글자가 경로가 되는 일이 없다.
      "node:fs",
      "node:path",
      "require(",
    ]) {
      // 🔴 코드만 본다 — 머리말이 A/S 의 도구 이름을 설명한다(위 codeOnly).
      assert.equal(codeOnly.includes(forbidden), false, `가져오면 안 되는 것: ${forbidden}`);
    }
  });

  test("🔴 요청의 다른 값을 보지 않는다 — id 는 형식을 본 뒤 조회에만 쓰인다", () => {
    const body = flat(getBody);
    assert.equal(body.match(/\(id\)/g)?.length, 2, "id 가 두 곳(형식 · 조회) 밖에서 쓰인다");
    assert.equal(body.includes("${id}"), false, "id 를 글자로 이어 붙인다");
    // 요청 객체 자체를 쓰지 않는다(질의 문자열로 갈래가 생기지 않는다).
    assert.ok(route.includes("_request: Request"), "요청을 쓰지 않는 표시(_request)가 사라졌다");
    assert.equal(body.includes("_request."), false, "요청의 다른 값을 쓴다");
  });
});
