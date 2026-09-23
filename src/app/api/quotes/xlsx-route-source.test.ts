import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { QUOTE_EXCEL_MISSING_MESSAGE } from "@/app/api/quotes/[id]/xlsx/download-source";

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
 * ── 🔴 조각 3d-2 — 엑셀 전용 장의 501 이 **갈래**가 되었다 ───────────────
 * 그 장은 이제 거절되지 않고 **엑셀 칸에 붙어 있는 파일이 그대로** 내려온다. 그래서 이
 * 파일은 원본을 **둘로 잘라** 본다:
 *   · `getBody`      — `export async function GET` 부터 아래 함수 앞까지(일반 견적서 길)
 *   · `attachedBody` — 모듈 안 함수 `sendAttachedExcel`(붙인 엑셀 길)
 * 🔴 **자르지 않으면 두 길의 감사·거절이 섞여** 「거절이 전부 감사보다 앞」 같은 단언이
 * 뜻을 잃는다 — 두 길에 감사가 하나씩 있고, 붙인 엑셀 길의 거절은 앞 길의 감사보다 뒤다.
 * 🔴 일반 견적서 길의 단언은 **한 줄도 고치지 않았다**(그 길이 한 바이트도 안 달라졌다).
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
/** 붙인 엑셀 길의 시작. 🔴 위 머리말의 「둘로 잘라 본다」가 이 자리다. */
const attachedAt = route.indexOf("async function sendAttachedExcel");
const getBody = route.slice(route.indexOf("export async function GET"), attachedAt);
const attachedBody = route.slice(attachedAt);
const flat = (source: string) => source.replace(/\s+/g, " ");

/**
 * 주석을 뺀 코드.
 *
 * 🔴 아래 「가져오면 안 되는 것」 목록에 필요하다 — 이 라우트의 머리말은 **A/S 가 쓰는
 * 도구 이름**(`readSession()` · `resolveActingUserForSession()` · `getAuthSource()`)을
 * 적어 두고 「이 사이트는 `getSessionUser()` 한 걸음이다」를 설명한다. 원본을 그대로
 * 훑으면 그 설명이 금지 낱말로 걸려, 시험이 **주석을 고치라고** 요구하게 된다.
 *
 * 🔴 두 길을 가를 때도 필요하다 — `sendAttachedExcel` 의 **머리말은 그 함수 선언보다
 * 앞**이라 위 `getBody` 에 딸려 들어온다. 그 머리말이 아래 함수가 쓰는 도구 이름을
 * 적어 두므로, 주석을 그대로 두고 「일반 견적서 길에 없다」를 재면 거짓으로 걸린다
 * (실제로 걸렸다 — `getAttachmentStorage()`).
 */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
const codeOnly = codeOf(route);

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
    // 🔴 조각 3d-2 가 더한 `sendAttachedExcel` 도 **모듈 안 함수**다(A/S 도 같다).
    //    내보내는 순간 `next build` 가 실패한다 — 저쪽에서 실제로 겪은 일이다.
    assert.ok(route.includes("async function sendAttachedExcel("), "붙인 엑셀 길이 없다");
    assert.equal(route.includes("export async function sendAttachedExcel"), false);
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

  test("🔴 조각 3d-2 — 엑셀 전용 견적서는 **붙인 엑셀 길로 갈라진다**(앱 양식으로 채우지 않는다)", () => {
    const body = flat(getBody);
    // 🔴 한 줄이다. 무엇을 고르고 무엇을 막을지는 전부 아래 함수와 형제 파일에 있다 —
    //    여기서 갈래를 늘리면 「일반 견적서 길에 조회가 하나 는다」가 된다.
    assert.ok(
      body.includes("if (quote.isExcelOnly) return sendAttachedExcel(quote, actingUser.id);"),
      "엑셀 전용 갈래가 없다 — 품목 없는 빈 견적서가 나간다"
    );
    // 🔴 **일반 견적서 길에는 조회가 하나도 늘지 않았다.** 첨부 조회 · 저장소 · 경로
    //    판정은 전부 갈라진 뒤에만 불린다(A/S 머리말의 그 약속).
    //    🔴 주석을 뺀 코드로 잰다 — 아래 함수의 머리말이 그 도구 이름을 적어 둔다.
    const getCode = flat(codeOf(getBody));
    for (const onlyAfterSplit of [
      "listLiveQuoteAttachments(",
      "decideQuoteDownloadSource(",
      "decideAttachmentDownload(",
      "getAttachmentStorage(",
      "resolveUploadsRoot(",
      "resolveAttachmentAbsolutePath(",
    ]) {
      assert.equal(getCode.includes(onlyAfterSplit), false, `일반 견적서 길에 들어왔다: ${onlyAfterSplit}`);
      assert.ok(flat(attachedBody).includes(onlyAfterSplit), `붙인 엑셀 길에 없다: ${onlyAfterSplit}`);
    }
    // 🔴 3c-2 의 거절 갈래와 그 문장 상수는 사라졌다. **코드만 본다** — 머리말이 그
    //    파일 이름을 적어 두고 「3d-2 가 지웠다」를 설명한다(위 codeOnly 의 까닭).
    assert.equal(codeOnly.includes("EXCEL_ONLY_NOT_SUPPORTED"), false, "쓰지 않는 거절 코드가 남았다");
    assert.equal(codeOnly.includes("quote-excel-only-download"), false, "지워진 파일을 아직 들여온다");
  });

  test("🔴 붙인 엑셀 길 — 없으면 404, 검사에 막히면 403, 경로가 루트 밖이면 500", () => {
    const body = flat(attachedBody);
    // ① 엑셀 칸이 비었다 — 앱 양식으로 대신 채우지 않는다(품목이 없어 빈 견적서가 나간다).
    assert.ok(
      body.includes('if (source.kind !== "ATTACHED_EXCEL") {'),
      "붙인 엑셀이 없는 경우를 가르지 않는다"
    );
    assert.ok(body.includes('return fail(404, "EXCEL_NOT_ATTACHED", QUOTE_EXCEL_MISSING_MESSAGE);'));
    // 🔴 문장은 **형제 파일의 그 하나**다 — 무엇을 하면 되는지까지 말하고 내부 경로는 없다.
    assert.match(QUOTE_EXCEL_MISSING_MESSAGE, /엑셀/);
    assert.equal(QUOTE_EXCEL_MISSING_MESSAGE.includes("quotes/"), false);

    // ② 🔴 여기서 다시 묻는 것은 **권한이 아니라 악성코드 검사 상태**다. 권한은 위
    //    GET 의 관문에서 이미 끝났다 — 두 곳에서 물으면 어느 쪽이 관문인지 흐려진다.
    assert.ok(body.includes("const decision = decideAttachmentDownload({"));
    assert.ok(body.includes('if (!decision.allowed) { return fail(403, "SCAN_BLOCKED", decision.message); }'));
    assert.equal(body.includes("hasPermission("), false, "붙인 엑셀 길이 권한을 다시 묻는다");

    // ③ DB 에 적힌 경로라도 믿지 않는다 — 루트 밖이면 500(경로는 응답에 싣지 않는다).
    assert.ok(body.includes("resolveAttachmentAbsolutePath(resolveUploadsRoot(), attachment.storedPath);"));
    assert.ok(body.includes("if (error instanceof AttachmentPathError) {"));
    assert.ok(
      body.includes(
        'return fail(500, "STORAGE_FAILED", "파일 경로를 확인할 수 없습니다. 관리자에게 문의해 주세요.");'
      )
    );
    assert.ok(
      body.includes('return fail(404, "NOT_FOUND", "저장된 파일을 찾을 수 없습니다. 관리자에게 문의해 주세요.");')
    );

    // 🔴 **세 거절 어디에도 경로 · 첨부 id 가 응답에 실리지 않는다.** 그 둘은 서버
    //    로그에만 남는다 — 오류 문구가 디스크 구조를 알려 주는 창구가 되면 안 된다.
    for (const message of body.matchAll(/fail\((?:403|404|500), "[A-Z_]+", ([^)]*)\)/g)) {
      for (const leak of ["storedPath", "attachment.id", "resolveUploadsRoot", "absolute"]) {
        assert.equal(message[1].includes(leak), false, `거절 응답에 내부 값을 실었다: ${leak}`);
      }
    }
    for (const logged of ["[quote-xlsx] 붙인 엑셀의 stored_path", "[quote-xlsx] 붙인 엑셀을 읽지 못했다"]) {
      assert.ok(body.includes(`console.error("${logged}`), `서버 로그에 남기지 않는다: ${logged}`);
    }
  });

  test("🔴 붙인 엑셀 길 — 바이트를 메모리에 올리지 않고, 크기 · 형식은 DB 의 정본이다", () => {
    const body = flat(attachedBody);
    // 🔴 스트림을 그대로 응답에 싣는다. Buffer 로 받아 두면 20MB 짜리 몇 개로 프로세스가
    //    흔들린다(storage/storage-adapter.ts 머리말의 같은 판단).
    assert.ok(body.includes("stream = await storage.read(attachment.storedPath);"));
    assert.ok(body.includes("return new Response(stream, {"), "스트림을 그대로 흘려보내지 않는다");
    for (const buffered of ["arrayBuffer()", "Buffer.from(", "new Uint8Array(stream"]) {
      assert.equal(body.includes(buffered), false, `바이트를 통째로 메모리에 올린다: ${buffered}`);
    }
    // 🔴 브라우저가 올릴 때 보낸 값도, 디스크를 stat 한 값도 아니다 — **DB 의 정본**이다.
    assert.ok(body.includes('"Content-Type": attachment.mimeType,'));
    assert.ok(body.includes('"Content-Length": String(attachment.fileSize),'));
    assert.equal(body.includes("stat("), false, "크기를 디스크에서 다시 잰다");
    // 이름 규칙은 일반 견적서와 같고 확장자만 붙인 파일의 것이다(xlsx · xls).
    assert.ok(body.includes('"Content-Disposition": quoteContentDisposition(fileName),'));
    assert.ok(body.includes("extension,"), "확장자를 파일 이름에 넘기지 않는다");
    // 사람이 올린 파일이다 — 형식을 다시 추측하지 않게 하고 캐시에 남기지 않는다.
    assert.ok(body.includes('"X-Content-Type-Options": "nosniff",'));
    assert.ok(body.includes('"Cache-Control": "no-store, must-revalidate",'));
  });

  test("🔴 붙인 엑셀 길의 감사도 전송 앞 · 거절 뒤다 — 나가지 않은 파일은 기록되지 않는다", () => {
    const body = flat(attachedBody);
    const auditAt = body.indexOf("await recordQuoteExport({");
    assert.ok(auditAt >= 0, "붙인 엑셀 길에 감사가 없다 — 직인이 찍힌 문서가 나가는 일이다");
    for (const rejection of [
      'fail(404, "EXCEL_NOT_ATTACHED"',
      'fail(403, "SCAN_BLOCKED"',
      'fail(500, "STORAGE_FAILED"',
      'fail(404, "NOT_FOUND"',
    ]) {
      const at = body.indexOf(rejection);
      assert.ok(at >= 0, `거절 갈래가 없다: ${rejection}`);
      assert.ok(at < auditAt, `${rejection} 이 감사보다 뒤다 — 나가지 않은 파일이 기록된다`);
    }
    assert.ok(body.indexOf("return new Response(stream, {") > auditAt, "감사가 전송보다 뒤다");
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

  test("🔴 쓰기가 없다 — 가져오는 것은 문지기 · 조회 · 판정 · 양식 · 저장소 읽기 · 감사뿐이다", () => {
    // 🔴 조각 3d-2 가 넷을 더했다 — 첨부 조회 · 내보내도 되는가(검사 상태) · 경로 검증 ·
    //    저장소(읽기). 그리고 형제 파일 하나(무엇을 내려줄지 고르기).
    assert.deepEqual(importSpecifiers(route), [
      "./download-source",
      "@/lib/auth/permission-resolver",
      "@/lib/auth/session",
      "@/lib/db/mutations/quote-exports",
      "@/lib/db/queries/attachments",
      "@/lib/db/queries/quotes",
      "@/lib/domain/attachment-download-policy",
      "@/lib/domain/attachment-path",
      "@/lib/domain/quote-document-support",
      "@/lib/domain/quote-file-name",
      "@/lib/server/services/quote-workbook",
      "@/lib/storage/local-fs-adapter",
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
      // 🔴 조각 3d-2 는 **읽기만** 한다 — 붙이기 · 지우기(3d-3)는 이 통로의 것이 아니다.
      "mutations/attachments",
      "writeTemp",
      "storage.commit",
      "storage.delete",
      // 🔴 저장소에 닿는 것은 StorageAdapter 하나다 — 어디선가 fs 를 직접 부르면 그
      //    자리가 NAS 이식 때 빠뜨리는 자리가 된다(storage/storage-adapter.ts 머리말).
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
