import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/domain/attachment-allowlist";
import { ATTACHMENT_OWNER_PERMISSIONS } from "@/lib/domain/attachment-download-policy";

/**
 * ============================================================================
 * POST /api/quotes/{id}/attachments — 🔴 **검사의 순서**를 소스로 지킨다 (3d-3b)
 * ============================================================================
 * 이 저장소는 라우트를 직접 부를 수 없다 — 쿠키(`next/headers`) · DB · 디스크가 전부
 * 필요하고 그 사슬은 `import "server-only"` 로 시작한다. 그래서 형제 시험
 * (`xlsx-route-source.test.ts`)과 같은 장치를 쓴다: **원본을 글자로 읽는다.**
 *
 * 🔴 여기서 재는 것은 **순서**다. 올리기 통로의 위험은 「권한 없는 사람이 파일을 붙이는
 * 것」 하나가 아니다:
 *   · 관문보다 조회가 앞이면 권한 없는 사람이 응답 갈래(404 냐 403 이냐)로 **그 id 의
 *     견적서가 있는지**를 알아낸다.
 *   · 검사보다 본문 받기가 앞이면 거절될 요청의 20MB 를 다 받고 나서 버리게 된다.
 *   · DB 가 파일보다 앞이면 **실물 없는 행**이 남는다 — 화면에서 눌러도 아무것도 나오지
 *     않는 고장이고, 주인 없는 파일(반대 순서의 실패)보다 나쁘다.
 *
 * ── 🔴 이 파일이 라우트 **곁이 아니라 한 칸 위에** 있는 까닭 ─────────────
 * `node --test` 는 받은 경로를 **글롭 패턴으로 읽는다.** App Router 의 `[id]` 는 그
 * 문법에서 「i 또는 d 한 글자」라, 시험 목록에 그 폴더를 그대로 적으면 아무것도 맞지
 * 않아 **그 시험이 조용히 안 돈다**(2026-09-22 실측 — scripts/run-test-list.mjs 머리말).
 * 이제 실행기가 그런 줄을 아예 거절한다. 그래서 시험만 대괄호 밖에 두고, 읽는 원본만
 * 아래 경로로 그 안을 가리킨다(본보기는 형제 파일 xlsx-route-source.test.ts).
 * ============================================================================
 */

const route = readFileSync(new URL("./[id]/attachments/route.ts", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n"
);

const flat = (source: string) => source.replace(/\s+/g, " ");

/**
 * 주석을 뺀 코드.
 *
 * 🔴 아래 「가져오면 안 되는 것」과 순서 단언에 필요하다 — 이 라우트의 머리말은 **A/S 가
 * 쓰는 도구 이름**(`readSession()` · `getAuthSource()` · `archiveSignedQuotePdf`)을 적어
 * 두고 「이 사이트는 그렇게 하지 않는다」를 설명한다. 원본을 그대로 훑으면 그 설명이
 * 금지 낱말로 걸려, 시험이 **주석을 고치라고** 요구하게 된다. 순서도 마찬가지다 —
 * 머리말이 `isTrustedOrigin(request)` 를 먼저 적어 두므로 주석을 두고 재면 자리가 밀린다.
 */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
const codeOnly = codeOf(route);

/** POST 본문만 — 위쪽의 실패 코드 유니온 · fail() 은 여기 들어오지 않는다. */
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

describe("올리기 통로 — 소스로 지킨다", () => {
  test("🔴 Next 가 정한 이름만 export 한다 — POST · runtime · dynamic 뿐", () => {
    assert.deepEqual(exportedNames(route), ["POST", "dynamic", "runtime"]);
    assert.equal(/^export\s*(?:\{|default|\*)/m.test(route), false, "다른 모양으로 내보내고 있다");
    // 파일을 다루므로 Node 런타임이고, 쿠키를 읽으므로 캐시된 응답을 내놓을 수 없다.
    assert.ok(route.includes('export const runtime = "nodejs";'));
    assert.ok(route.includes('export const dynamic = "force-dynamic";'));
  });

  test("🔴 순서: 같은 출처 → 세션 → 권한 → 견적서 → 분류 · 이름 · 확장자 → 크기 → 본문", () => {
    assertInOrder([
      "isTrustedOrigin(request)",
      "await getSessionUser()",
      "ATTACHMENT_OWNER_PERMISSIONS.CHANGE.QUOTE",
      "await hasPermission(actingUser, permission.areaKey, permission.level)",
      "await context.params",
      "await getQuoteAttachmentUploadTarget(quoteId)",
      "target.isDeleted",
      "isAttachmentCategory(rawCategory)",
      "isQuoteAttachmentSlotCategory(rawCategory)",
      "MAX_ORIGINAL_FILE_NAME_LENGTH",
      "normalizeFileExtension(originalFileName)",
      "isAllowedExtension(extension)",
      "isExtensionAllowedForCategory(extension, category)",
      'request.headers.get("content-length")',
      "const body = request.body;",
      "getAttachmentStorage()",
      "storage.writeTemp(body, { maxBytes: MAX_ATTACHMENT_SIZE_BYTES })",
      "written.size === 0",
      "isContentCompatibleWithExtension(extension, written.header)",
      "randomUUID().toLowerCase()",
      "buildQuoteAttachmentStoredPath({",
      "await storage.commit(written.tempPath, storedPath)",
      "await createAttachmentRecord({",
      "return NextResponse.json(",
    ]);
  });

  test("🔴 같은 출처 확인이 **첫 줄**이다 — 그 앞에 await 가 하나도 없다", () => {
    // 라우트 핸들러에는 Next 의 CSRF 방어가 없다(서버 액션과 다른 점). 이것이 뒤로
    // 밀리면 남의 사이트가 심은 <form> 한 줄이 먼저 세션을 쓰고 DB 를 읽는다.
    const guard = body.indexOf("if (!isTrustedOrigin(request)) {");
    assert.ok(guard >= 0, "같은 출처 문지기가 없다");
    assert.equal(body.slice(0, guard).includes("await"), false, "문지기보다 앞에서 무언가를 기다린다");
    assert.ok(body.indexOf('fail(403, "UNTRUSTED_ORIGIN"', guard) > guard);
    // 로그인하지 않은 요청은 401 — 승인 대기 · 정지 · 삭제도 getSessionUser() 가 함께 거른다.
    assert.ok(body.includes('if (!actingUser) { return fail(401, "UNAUTHENTICATED", "로그인이 필요합니다.");'));
  });

  test("🔴 권한 확인이 **견적서 조회보다 앞**이다 — 문턱은 quotes WRITE 하나다", () => {
    const gate = body.indexOf("await hasPermission(actingUser, permission.areaKey, permission.level)");
    assert.ok(gate >= 0, "권한 관문이 없다");
    assert.ok(body.indexOf('fail(403, "FORBIDDEN"', gate) > gate, "권한이 없을 때 403 이 아니다");
    /**
     * 🔴 **이 한 줄이 이 시험의 요점이다.** 조회가 관문보다 앞이면 권한이 없는 사람도
     * "그 id 의 견적서가 있다"는 사실을 알아낼 수 있다(403 이 아니라 404 가 오는 것으로).
     * 받기 통로도 같은 순서다(xlsx-route-source.test.ts 의 「확인이 조회보다 앞이다」).
     */
    assert.ok(body.indexOf("getQuoteAttachmentUploadTarget(") > gate, "견적서 조회가 권한 확인보다 앞이다");
    // 무엇을 묻는지는 판정 파일의 표 한 곳이 정한다 — 지우기 · 되살리기 액션과 같은 칸이다.
    assert.deepEqual(ATTACHMENT_OWNER_PERMISSIONS.CHANGE.QUOTE, { areaKey: "quotes", level: "WRITE" });
    assert.equal(body.match(/hasPermission\(/g)?.length, 1, "권한을 두 번 묻거나 묻지 않는다");
    assert.equal(body.includes('"quotes", "WRITE"'), false, "표를 거치지 않고 손으로 적었다");
  });

  test("🔴 본문은 **모든 거절 뒤에** 받는다 — 거절될 20MB 를 받아 놓고 버리지 않는다", () => {
    const bodyAt = body.indexOf("const body = request.body;");
    assert.ok(bodyAt >= 0, "본문을 받는 자리가 없다");
    for (const rejection of [
      '"UNTRUSTED_ORIGIN"',
      '"UNAUTHENTICATED"',
      '"FORBIDDEN"',
      '"QUOTE_NOT_FOUND"',
      '"QUOTE_IN_TRASH"',
      '"INVALID_CATEGORY"',
      '"CATEGORY_NOT_ALLOWED_FOR_OWNER"',
      '"INVALID_FILE_NAME"',
      '"EXTENSION_NOT_ALLOWED"',
      '"EXTENSION_NOT_ALLOWED_FOR_CATEGORY"',
      '"FILE_TOO_LARGE"',
    ]) {
      const at = body.indexOf(rejection);
      assert.ok(at >= 0, `거절 갈래가 없다: ${rejection}`);
      assert.ok(at < bodyAt, `${rejection} 이 본문 받기보다 뒤다`);
    }
    // 휴지통의 견적서는 404 가 아니라 409 다 — 「없다」와 「지금은 못 붙인다」는 다른 답이다.
    assert.ok(body.includes('return fail(404, "QUOTE_NOT_FOUND", QUOTE_NOT_FOUND_MESSAGE);'));
    assert.ok(body.includes('return fail(409, "QUOTE_IN_TRASH", QUOTE_IN_TRASH_MESSAGE);'));
    // 받는 것은 분류와 파일 이름 둘뿐이다 — 설명은 받지 않는다(칸 이름이 곧 설명이다).
    assert.equal(body.match(/searchParams\.get\(/g)?.length, 2, "질의 문자열에서 다른 값을 더 받는다");
    assert.ok(body.includes("description: null,"));
  });

  test("🔴 크기 제한은 두 겹 — 헤더는 믿지 않고, 진짜는 writeTemp 가 센다", () => {
    // 1겹: 브라우저가 알려 준 크기. 맞을 때 20MB 를 받아 놓고 버리는 일을 아낀다.
    assert.ok(body.includes('const declaredLength = Number(request.headers.get("content-length") ?? "");'));
    assert.ok(
      body.includes("if (Number.isFinite(declaredLength) && declaredLength > MAX_ATTACHMENT_SIZE_BYTES) {")
    );
    // 2겹: 실제로 센 바이트. 상한값은 허용목록 한 곳이 정한다(20MB).
    assert.ok(body.includes("await storage.writeTemp(body, { maxBytes: MAX_ATTACHMENT_SIZE_BYTES });"));
    assert.equal(MAX_ATTACHMENT_SIZE_BYTES, 20 * 1024 * 1024, "상한이 20MB 가 아니다");
    assert.equal(body.match(/maxBytes:/g)?.length, 1, "상한을 두 곳에서 정한다");
    // 🔴 임시파일은 writeTemp 가 던지기 **전에** 이미 지웠다 — 여기서 또 지우지 않는다.
    const tooLargeAt = body.indexOf("if (error instanceof AttachmentTooLargeError) {");
    assert.ok(tooLargeAt >= 0, "20MB 초과를 가르지 않는다");
    assert.equal(
      body.slice(tooLargeAt, body.indexOf("}", tooLargeAt)).includes("discard"),
      false,
      "저장소가 이미 치운 임시파일을 라우트가 또 지운다"
    );
  });

  test("🔴 파일 종류는 확장자와 **내용 앞머리 둘 다**로 본다 — 브라우저가 보낸 형식은 쓰지 않는다", () => {
    assert.ok(body.includes("if (!isContentCompatibleWithExtension(extension, written.header)) {"));
    assert.ok(body.includes('"CONTENT_MISMATCH"'));
    // 빈 파일도 막는다 — 둘 다 임시파일을 버리고 돌아간다.
    assert.ok(body.includes("if (written.size === 0) { await storage.discard(written.tempPath);"));
    // 🔴 저장하는 MIME 은 **확장자에서 서버가 고른 정본**이다.
    assert.ok(body.includes('mimeType: canonicalMimeTypeForExtension(extension) ?? "application/octet-stream",'));
    assert.equal(body.includes('get("content-type")'), false, "브라우저가 보낸 Content-Type 을 쓴다");
  });

  test("🔴 디스크에 쓸 이름은 **서버가 정한다** — 사용자가 준 이름은 표시용으로만 남는다", () => {
    assert.ok(body.includes("const attachmentId = randomUUID().toLowerCase();"));
    assert.ok(
      body.includes(
        "const storedPath = buildQuoteAttachmentStoredPath({ quoteId: target.id, attachmentId, extension });"
      ),
      "저장 경로를 규칙 함수로 만들지 않는다"
    );
    // 원본 이름에는 경로 구분자 · ".." · 예약어가 섞일 수 있다 — 경로에 쓰지 않는다.
    assert.equal(
      body.includes("buildQuoteAttachmentStoredPathFromFileName"),
      false,
      "사용자가 준 이름으로 경로를 만든다"
    );
    assert.ok(body.includes("originalFileName,"), "원본 이름을 행에 남기지 않는다");
  });

  test("🔴 파일 먼저 · DB 나중 — 뒤집으면 실물 없는 행이 남는다", () => {
    const commitAt = body.indexOf("await storage.commit(written.tempPath, storedPath);");
    const recordAt = body.indexOf("await createAttachmentRecord({");
    assert.ok(commitAt >= 0, "파일을 최종 자리로 옮기지 않는다");
    assert.ok(recordAt >= 0, "행을 넣지 않는다");
    assert.ok(commitAt < recordAt, "🔴 DB 가 파일보다 앞이다 — 실물 없는 행이 남는다");

    // 옮기다 실패하면 임시파일을 버린다.
    assert.ok(body.includes('console.error("견적서 첨부 파일 이동 실패", error);'));
    assert.ok(body.includes('return fail(500, "STORAGE_FAILED", "파일을 저장하는 중 문제가 발생했습니다.");'));
    // 🔴 행을 못 만들면 방금 놓은 파일은 주인이 없다 — 치워 보되 실패해도 더 하지 않는다.
    const cleanupAt = body.indexOf("await storage.delete(storedPath).catch(() => undefined);");
    assert.ok(cleanupAt > recordAt, "기록 실패 뒤에 파일을 치우지 않는다");
    // 잠근 트랜잭션의 판정이 막은 것만 404 · 409 로 갈라 답하고, 나머지는 500 이다.
    const rejectedAt = body.indexOf("if (error instanceof QuoteAttachmentRejectedError) {");
    assert.ok(rejectedAt > cleanupAt, "파일을 치우기 전에 답부터 돌려준다");
    assert.ok(body.includes('case "NOT_FOUND": return fail(404, "QUOTE_NOT_FOUND", error.message);'));
    assert.ok(body.includes('case "QUOTE_IN_TRASH": return fail(409, "QUOTE_IN_TRASH", QUOTE_IN_TRASH_MESSAGE);'));
    assert.ok(body.includes('return fail(500, "RECORD_FAILED", "파일 기록을 저장하는 중 문제가 발생했습니다.");'));
  });

  test("🔴 응답에 내부 경로를 싣지 않는다 — 거절도 201 도", () => {
    // 거절 응답: fail() 이 들어 있는 문장 어디에도 저장 경로 · 임시 경로가 없다.
    for (const statement of body.split(";")) {
      if (!statement.includes("fail(")) continue;
      for (const leak of ["storedPath", "tempPath", "resolveUploadsRoot", "UPLOADS_DIR", "absolute"]) {
        assert.equal(statement.includes(leak), false, `거절 응답에 내부 값을 실었다: ${leak}`);
      }
    }
    // 201 응답: 화면이 쓸 값만 싣는다(저장 경로 · 체크섬 자리의 내부 정보는 없다).
    const created = body.slice(body.indexOf("return NextResponse.json("));
    for (const leak of ["storedPath", "tempPath", "resolveUploadsRoot", "uploadedBy"]) {
      assert.equal(created.includes(leak), false, `201 응답에 내부 값을 실었다: ${leak}`);
    }
    assert.ok(created.includes("displacedAttachmentIds: created.displacedAttachmentIds,"), "밀려난 파일을 알리지 않는다");
    assert.ok(created.includes("{ status: 201 }"));
  });

  test("🔴 공유폴더 사본은 아직 오지 않았다 — archive 는 언제나 null 이다", () => {
    // 발행(3c-3)의 몫이다. 응답 모양만 A/S 와 맞춰 두고 값은 고정한다.
    assert.ok(body.includes("archive: null,"), "archive 칸이 없다 — A/S 와 응답 모양이 갈린다");
    assert.equal(body.includes("archiveSignedQuotePdf"), false);
    assert.equal(body.includes("resolveQuoteArchiveRoot"), false);
    // 🔴 그 자리에 까닭이 적혀 있다 — 곁말이 없으면 다음 사람이 빠뜨린 것으로 읽는다.
    assert.match(route, /공유폴더 복사는 아직 오지 않았다/);
  });

  test("🔴 가져오는 것은 문지기 · 판정 · 저장소 · 행 만들기뿐이다", () => {
    assert.deepEqual(importSpecifiers(route), [
      "@/lib/auth/permission-resolver",
      "@/lib/auth/request-guards",
      "@/lib/auth/session",
      "@/lib/db/mutations/attachments",
      "@/lib/db/queries/attachments",
      "@/lib/domain/attachment-allowlist",
      "@/lib/domain/attachment-category",
      "@/lib/domain/attachment-download-policy",
      "@/lib/domain/attachment-path",
      "@/lib/storage/local-fs-adapter",
      "@/lib/storage/storage-adapter",
      "next/server",
      "node:crypto",
    ]);
    for (const forbidden of [
      // 🔴 A/S 의 인증 사슬(mock 자료 · 세션 네 걸음)을 끌고 오지 않았다 —
      //    이 사이트는 isTrustedOrigin + getSessionUser() 두 걸음이다.
      "acting-user",
      "auth-source",
      "readSession",
      "mock-data",
      // 🔴 공유폴더는 발행(3c-3)의 몫이다.
      "quote-archive",
      "archiveSignedQuotePdf",
      // 🔴 저장소에 닿는 것은 StorageAdapter 하나다 — 어디선가 fs 를 직접 부르면 그
      //    자리가 NAS 이식 때 빠뜨리는 자리가 된다(storage/storage-adapter.ts 머리말).
      "node:fs",
      "node:path",
      "require(",
      // 🔴 임시 폴더 훑기는 이 통로의 일이 아니다(A/S 의 올리기 통로에도 없다).
      "sweepTemp",
    ]) {
      // 🔴 코드만 본다 — 머리말이 A/S 의 도구 이름을 설명한다(위 codeOnly).
      assert.equal(codeOnly.includes(forbidden), false, `가져오면 안 되는 것: ${forbidden}`);
    }
    // `node:crypto` 의 randomUUID 는 **허용**이다 — 저장 이름을 서버가 정하는 근거다.
    assert.ok(route.includes('import { randomUUID } from "node:crypto";'));
  });
});
