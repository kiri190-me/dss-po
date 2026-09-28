import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/**
 * ============================================================================
 * GET /api/quotes/template-image/{kind} — 🔴 **이 저장소가 새로 적은 시험** (조각 3f)
 * ============================================================================
 * 🔴 **A/S 에도 이 라우트의 시험이 없다**(2026-09-28 실측 — 저쪽에서 `template-image`
 * 라는 글자를 무는 시험 파일은 `print-grid/SheetPrintGridView.test.tsx` 하나이고,
 * 그것은 이 통로가 아니라 격자 화면을 잰다). 조각 3f 가 라우트만 그대로 가져오면서
 * **아무도 안 지키는 통로**가 되는 것을 막으려고 여기서 세웠다.
 *
 * 🔴 **그대로 둘 수 없는 통로다.** 이것이 내주는 그림 하나는 **법인 직인**이다.
 * 문지기가 한 줄 밀리면 주소를 아는 누구나 회사 인감을 받아 갈 수 있게 된다.
 *
 * 이 저장소는 라우트를 직접 부를 수 없다 — 쿠키(`next/headers`) · 양식 `.xlsx` 파일이
 * 필요하다. 그래서 형제들(`issue-route-source.test.ts` · `xlsx-route-source.test.ts` ·
 * `excel-preview-route-source.test.ts`)과 같은 장치를 쓴다: **원본을 글자로 읽는다.**
 *
 * 재는 것 셋(지시서가 「적어도」로 짚은 그 셋):
 *   ① **인증 순서** — 세션 → 권한이 **양식을 여는 것보다 앞**이다. 뒤로 밀리면
 *      로그인 안 한 사람의 요청으로 디스크의 양식 파일이 열린다.
 *   ② **저장 루트 밖을 안 읽는다** — 요청의 `kind` 는 **경로가 되지 않는다.**
 *      미리 적어 둔 표(`IMAGE_PARTS`)의 열쇠로만 쓰고, 없으면 404 다.
 *   ③ **응답에 내부 경로가 없다** — 실패 응답도 200 의 헤더도.
 *
 * ── 🔴 이 파일이 라우트 곁이 아니라 **대괄호 밖**에 있는 까닭 ────────────
 * `node --test` 는 받은 경로를 **글롭 패턴으로 읽는다.** `[kind]` 는 그 문법에서
 * 「k · i · n · d 중 한 글자」라, 시험 목록에 그 폴더를 적으면 아무것도 맞지 않아
 * **그 시험이 조용히 안 돈다**(2026-09-22 실측 — scripts/run-test-list.mjs 머리말).
 * ============================================================================
 */

const route = readFileSync(new URL("./template-image/[kind]/route.ts", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n"
);
const getBody = route.slice(route.indexOf("export async function GET"));
const flat = getBody.replace(/\s+/g, " ");

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

describe("양식 그림 통로 — 소스로 지킨다", () => {
  test("🔴 Next 가 정한 이름만 export 한다 — GET · runtime · dynamic 뿐", () => {
    assert.deepEqual(exportedNames(route), ["GET", "dynamic", "runtime"]);
    assert.equal(/^export\s*(?:\{|default|\*)/m.test(route), false);
    assert.ok(route.includes('export const runtime = "nodejs";'));
    // 🔴 force-dynamic 이 아니면 Next 가 응답을 빌드에 구워 둘 수 있다 — 직인이
    //    로그인 없이 나가는 길이 된다.
    assert.ok(route.includes('export const dynamic = "force-dynamic";'));
  });

  test("🔴 ① 순서: 세션 → quotes READ → kind 고르기 → 양식 열기", () => {
    const marks = [
      "await getSessionUser()",
      'hasPermission(actingUser, "quotes", "READ")',
      "await context.params",
      "IMAGE_PARTS[kind]",
      "ZipArchive.fromBuffer(await readQuoteTemplate())",
    ];
    let previous = -1;
    for (const mark of marks) {
      const at = getBody.indexOf(mark);
      assert.ok(at >= 0, `없다: ${mark}`);
      assert.ok(at > previous, `순서가 어긋났다: ${mark}`);
      previous = at;
    }
  });

  test("🔴 ① 문지기가 막으면 **그 자리에서 돌아간다** — 401 · 403", () => {
    assert.ok(flat.includes('if (!actingUser) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });'));
    assert.ok(flat.includes('if (!(await hasPermission(actingUser, "quotes", "READ"))) { return NextResponse.json({ error: "이 작업을 수행할 권한이 없습니다." }, { status: 403 }); }'));
    // 🔴 문턱은 READ 하나다 — 넓히지도, 한 번 더 묻지도 않는다.
    assert.equal(getBody.match(/hasPermission\(/g)?.length, 1);
    assert.equal(getBody.includes('"WRITE"'), false);
    assert.equal(getBody.includes('"ADMIN"'), false);
    assert.equal(getBody.includes('"MANAGE"'), false);
  });

  test("🔴 ② 요청의 kind 는 **경로가 되지 않는다** — 미리 적어 둔 표의 열쇠로만 쓴다", () => {
    // 표는 라우트 안에 글자로 박혀 있고, 값 둘뿐이다.
    assert.ok(route.includes('seal: { part: "xl/media/image1.png", contentType: "image/png" },'));
    assert.ok(route.includes('logo: { part: "xl/media/image2.jpeg", contentType: "image/jpeg" },'));
    assert.equal(route.match(/^ {2}\w+: \{ part: /gm)?.length, 2, "그림이 둘뿐이어야 한다");
    // 🔴 kind 가 쓰이는 곳은 **표의 열쇠 · 로그** 둘뿐이다. 이어붙이는 곳이 없다.
    assert.ok(getBody.includes("const target = IMAGE_PARTS[kind];"));
    assert.equal(getBody.includes("${kind}"), false, "kind 를 글자에 이어붙인다");
    assert.equal(getBody.includes("kind +"), false, "kind 를 글자에 이어붙인다");
    // 표에 없으면 404 — 「그 kind 는 있는데 못 준다」로 갈라 답하지 않는다.
    assert.ok(flat.includes('if (!target) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });'));
  });

  test("🔴 ② 저장 루트 밖을 열 길이 없다 — 파일을 여는 것은 양식 하나이고 경로는 설정이 정한다", () => {
    // 🔴 이 통로에는 파일 시스템이 아예 없다. 양식 바이트는 storage 층이 주고,
    //    그 층이 경로를 정하며 **경로를 사용자에게 보이지 않는다**(그 파일 머리말).
    for (const forbidden of [
      "node:fs",
      "node:path",
      "readFileSync",
      "createReadStream",
      "resolveQuoteTemplatePath",
      "process.env",
      "..",
      "require(",
      "import(",
    ]) {
      assert.equal(route.includes(forbidden), false, `경로를 스스로 만진다: ${forbidden}`);
    }
    // 읽는 것은 양식 **안의 부품** 하나뿐이고, 그 이름도 위 표에서만 온다.
    assert.equal(getBody.match(/archive\.readEntry\(/g)?.length, 1);
    assert.ok(getBody.includes("archive.readEntry(target.part)"));
  });

  test("🔴 ③ 응답에 내부 경로가 없다 — 실패도 성공도", () => {
    // 실패 응답의 문장은 **넷 다 고정 글자**이거나, 경로를 일부러 안 싣는
    // QuoteTemplateError 의 문장이다(storage/quote-template.ts 머리말).
    assert.ok(flat.includes("if (err instanceof QuoteTemplateError) { return NextResponse.json({ error: err.message }, { status: 503 }); }"));
    // 🔴 그 밖의 오류는 **err.message 를 응답에 싣지 않는다** — 고정 문장이다.
    assert.ok(flat.includes('return NextResponse.json({ error: "그림을 불러오지 못했습니다." }, { status: 500 });'));
    const lastCatch = getBody.slice(getBody.indexOf("} catch (err) {"));
    assert.equal(
      lastCatch.match(/NextResponse\.json\(\{ error: err\.message/g)?.length,
      1,
      "err.message 를 응답에 싣는 자리가 QuoteTemplateError 말고 또 있다"
    );
    // 응답 어디에도 경로를 부르는 이름이 없다.
    for (const leak of ["target.part", "storedPath", "QUOTE_TEMPLATE_PATH", "String(err) }"]) {
      assert.equal(flat.includes(`error: ${leak}`), false, `응답에 ${leak}`);
    }
  });

  test("🔴 ③ 성공 — 그림 바이트 · 표가 정한 Content-Type · 중간 캐시에 안 남긴다", () => {
    assert.ok(flat.includes('"Content-Type": target.contentType,'));
    // 🔴 직인이다. `private` 가 빠지면 사내 프록시에 그림이 남는다.
    assert.ok(flat.includes('"Cache-Control": "private, max-age=300",'));
    assert.ok(flat.includes("status: 200,"));
    // 전역 보안 헤더(next.config.ts)와 같은 이름을 달지 않는다 — 겹치면 Next 가
    // 조용히 버린다(오류가 안 난다. 그래서 시험이 필요하다).
    for (const globalHeader of [
      "X-Frame-Options",
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ]) {
      assert.equal(route.includes(`"${globalHeader}"`), false, `전역 헤더와 같은 이름: ${globalHeader}`);
    }
  });

  test("🔴 쓰기도 감사도 없다 — 가져오는 것은 문지기 · 양식 읽기 · zip 뿐", () => {
    assert.deepEqual(importSpecifiers(route), [
      "@/lib/auth/permission-resolver",
      "@/lib/auth/session",
      "@/lib/storage/quote-template",
      "@/lib/xlsx/zip-reader",
      "next/server",
    ]);
    for (const forbidden of [
      "mutations",
      "recordQuoteExport",
      "recordAudit",
      "auditLogs",
      "getDb",
      "saveToQuoteArchive",
      "quote-approval",
      "approval-route",
    ]) {
      assert.equal(route.includes(forbidden), false, `이 통로에 있으면 안 되는 것: ${forbidden}`);
    }
    // 🔴 감사를 **일부러** 안 남긴다는 판단이 머리말에 적혀 있어야 한다 — 없으면
    //    다음 사람이 「빠뜨린 것」으로 읽고 줄을 쌓기 시작한다.
    assert.ok(route.includes("감사는 남기지 않는다"));
    assert.ok(route.includes("로그인 없이 열 수 없다"));
  });

  test("로그에는 kind 와 오류만 — 한 자리뿐이다", () => {
    const blocks = [...route.matchAll(/console\.(\w+)\(([\s\S]*?)\}\);/g)];
    assert.equal(blocks.length, 1);
    const [, method, args] = blocks[0];
    assert.equal(method, "error");
    assert.ok(args.includes("kind,"), args);
    // 🔴 로그는 서버 안이라 오류 문장을 남긴다. 그 값이 **응답으로는 안 나간다**는
    //    것을 위 ③ 묶음이 따로 잰다 — 둘을 섞지 않는다.
    assert.equal(args.includes("target.part"), false, `로그에 양식 안의 경로: ${args}`);
  });
});
