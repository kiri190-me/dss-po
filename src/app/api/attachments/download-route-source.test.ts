import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { ATTACHMENT_EXTENSION_RULES } from "@/lib/domain/attachment-allowlist";
import { ATTACHMENT_OWNER_PERMISSIONS } from "@/lib/domain/attachment-download-policy";
import { shouldServeInline } from "./[id]/download/inline-view";

/**
 * ============================================================================
 * GET /api/attachments/{id}/download — 🔴 **방어의 순서**를 소스로 지킨다 (3d-4)
 * ============================================================================
 * 이 저장소는 라우트를 직접 부를 수 없다 — 쿠키(`next/headers`) · DB · 디스크가 전부
 * 필요하고 그 사슬은 `import "server-only"` 로 시작한다. 그래서 형제 시험
 * (`api/quotes/attachments-route-source.test.ts` · `xlsx-route-source.test.ts`)과 같은
 * 장치를 쓴다: **원본을 글자로 읽는다.**
 *
 * 🔴 이 통로가 이 사이트에서 **파일이 밖으로 나가는 단 하나의 길**이다. 여기서 재는
 * 것은 그래서 「돌아가는가」가 아니라 **「무엇을 먼저 보는가」**다:
 *   · 권한보다 조회가 앞이면 권한 없는 사람이 응답 갈래로 **그 id 의 파일이 있는지**를
 *     알아낸다.
 *   · 판정(휴지통 · 견적서 휴지통 · 악성코드 검사)보다 주인별 권한이 뒤면, 볼 자격이
 *     없는 사람이 **그 파일의 상태를 설명하는 문장**을 받아 간다.
 *   · 경로 재검증이 빠지면 DB 값 하나가 곧 **임의 파일 읽기**가 된다. 🔴 두 사이트가
 *     같은 저장 루트를 보므로, 여기서 빠지면 A/S 가 지키는 것을 이 주소로 우회할 수 있다.
 *   · 감사를 응답 뒤로 미루면 스트림이 끝나는 시점을 알 수 없어 **기록이 누락된다.**
 *
 * ── 🔴 이 파일이 라우트 곁이 아니라 **두 칸 위에** 있는 까닭 ─────────────
 * `node --test` 는 받은 경로를 **글롭 패턴으로 읽는다.** App Router 의 `[id]` 는 그
 * 문법에서 「i 또는 d 한 글자」라, 시험 목록에 그 폴더를 그대로 적으면 아무것도 맞지
 * 않아 **그 시험이 조용히 안 돈다**(2026-09-22 실측 — scripts/run-test-list.mjs 머리말).
 * 이제 실행기가 그런 줄을 아예 거절한다. 그래서 시험만 대괄호 밖에 두고, 읽는 원본과
 * 위 `inline-view` import 만 그 안을 가리킨다 — **import 경로는 글롭이 아니라 모듈
 * 이름이라** 대괄호가 문제되지 않는다.
 *
 * ── 판정 함수는 **실제로 불러서** 잰다 ──────────────────────────────────
 * `shouldServeInline` 은 형제 파일(`inline-view.ts`)에 있고 DB 도 쿠키도 건드리지
 * 않는다. 그래서 아래 마지막 묶음은 글자가 아니라 **답**을 잰다 — A/S 의 같은 이름
 * 시험(`[id]/download/route.test.ts`)에서 그대로 옮겼다.
 * ============================================================================
 */

const route = readFileSync(new URL("./[id]/download/route.ts", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n"
);

const flat = (source: string) => source.replace(/\s+/g, " ");

/**
 * 주석을 뺀 코드.
 *
 * 🔴 아래 「가져오면 안 되는 것」과 순서 단언에 필요하다 — 이 라우트의 머리말은 **A/S 가
 * 쓰는 도구 이름**(`readSession()` · `getAuthSource()` · `resolveActingUserForSession`)을
 * 적어 두고 「이 사이트는 그렇게 하지 않는다」를 설명한다. 원본을 그대로 훑으면 그 설명이
 * 금지 낱말로 걸려, 시험이 **주석을 고치라고** 요구하게 된다. 순서도 마찬가지다.
 */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
const codeOnly = codeOf(route);

/** GET 본문만 — 위쪽의 실패 코드 유니온 · fail() · 파일 이름 짓기는 여기 들어오지 않는다. */
const body = flat(codeOnly.slice(codeOnly.indexOf("export async function GET")));

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

describe("내려받기 통로 — 소스로 지킨다", () => {
  test("🔴 Next 가 정한 이름만 export 한다 — GET · runtime · dynamic 뿐", () => {
    assert.deepEqual(exportedNames(route), ["GET", "dynamic", "runtime"]);
    assert.equal(/^export\s*(?:\{|default|\*)/m.test(route), false, "다른 모양으로 내보내고 있다");
    // 파일을 다루므로 Node 런타임이고, 쿠키를 읽으므로 캐시된 응답을 내놓을 수 없다.
    assert.ok(route.includes('export const runtime = "nodejs";'));
    assert.ok(route.includes('export const dynamic = "force-dynamic";'));
    // 🔴 판정 함수는 형제 파일에 있다 — route.ts 에서 export 하면 next build 가 타입
    //    검사에서 실패한다(저쪽이 그 상태로 여덟 커밋을 보냈다 — inline-view.ts 머리말).
    assert.ok(route.includes('from "./inline-view";'), "판정 함수를 형제 파일에서 가져오지 않는다");
  });

  test("🔴 들여오는 것이 정확히 이 아홉이다 — 늘어나면 방어가 한 곳에서 새어 나간 것이다", () => {
    assert.deepEqual(importSpecifiers(route), [
      "./inline-view",
      "@/lib/auth/permission-resolver",
      "@/lib/auth/session",
      "@/lib/db/mutations/attachment-trash",
      "@/lib/db/queries/attachment-download",
      "@/lib/domain/attachment-download-policy",
      "@/lib/domain/attachment-path",
      "@/lib/storage/local-fs-adapter",
      "next/server",
    ]);
  });

  test("🔴 인증은 이 사이트 식 한 걸음이다 — 저쪽의 네 걸음을 베끼지 않았다", () => {
    assert.ok(body.includes("await getSessionUser();"), "세션을 이 사이트 식으로 읽지 않는다");
    // 저쪽 도구들. 이 사이트에는 mock 모드가 없고, getSessionUser() 한 줄이
    // 승인 · 활성 · 삭제 · 잠금 · 끊긴 세션을 매 요청 다시 본다(auth/session.ts).
    for (const forbidden of ["readSession(", "getAuthSource(", "resolveActingUserForSession("]) {
      assert.equal(codeOnly.includes(forbidden), false, `저쪽 도구를 그대로 가져왔다: ${forbidden}`);
    }
    // 🔴 그 한 걸음이 **승인 확인까지** 한다는 것이 이 접기의 전제다. 그 조회가
    //    approvalStatus 를 보지 않게 되는 날 이 라우트가 조용히 열린다.
    const session = readFileSync(new URL("../../../lib/auth/session.ts", import.meta.url), "utf8");
    assert.ok(
      flat(session).includes('eq(users.approvalStatus, "APPROVED")'),
      "세션 조회가 승인 상태를 보지 않는다 — 이 라우트의 401 이 승인 대기를 못 거른다"
    );
  });

  test("🔴 순서: 세션 → 넓은 문턱 → 첨부 조회 → 주인별 권한 → 허용 판정 → 경로 → 감사 → 전송", () => {
    assertInOrder([
      "await getSessionUser();",
      'resolveAttachmentOwnerAccess("VIEW"',
      "hasAnyAttachmentOwnerAccess(access)",
      "await getAttachmentForDownload(attachmentId)",
      "isAttachmentOwnerAccessAllowed(attachment, access)",
      "decideAttachmentDownload({",
      "resolveAttachmentAbsolutePath(resolveUploadsRoot(), servedPath)",
      "await storage.read(servedPath)",
      "await recordAttachmentDownload({",
      "return new NextResponse(stream,",
    ]);
  });

  test("🔴 두 겹으로 막는다 — 문턱은 403, 주인별은 404(없음과 같은 응답)", () => {
    // 문턱을 못 넘은 사람에게는 조회 전에 403. 여기서는 존재 여부가 드러나지 않는다.
    assert.ok(body.includes('fail(403, "FORBIDDEN"'), "넓은 문턱이 403 으로 막지 않는다");
    // 🔴 문턱은 넘었지만 이 주인의 파일은 못 보는 사람에게는 **404** 다 — 403 으로
    //    갈라 답하면 「그 ID 는 실재하는 이런 종류의 첨부」가 새어 나간다.
    const ownerGate = body.slice(
      body.indexOf("isAttachmentOwnerAccessAllowed(attachment, access)"),
      body.indexOf("const view =")
    );
    assert.ok(ownerGate.includes('fail(404, "NOT_FOUND"'), "주인별 관문이 404 로 닫지 않는다");
    assert.equal(ownerGate.includes("403"), false, "주인별 관문이 403 으로 갈라 답한다");
  });

  test("🔴 무엇을 묻는지는 판정 표 한 곳이 정한다 — 라우트에 권한 이름을 적지 않는다", () => {
    // 표가 정하는 값(보기는 셋 다 READ). 라우트가 hasPermission 을 직접 적기 시작하면
    // 두 사이트의 답이 갈린다(server/actions/attachments.ts 의 같은 판단).
    assert.deepEqual(ATTACHMENT_OWNER_PERMISSIONS.VIEW, {
      REPAIR_CASE: { areaKey: "repairCases.files", level: "READ" },
      // 🔴 files 가 아니라 view 다 — 보는 것은 상세를 보는 일의 일부다.
      PRODUCT_MODEL: { areaKey: "productModels.view", level: "READ" },
      QUOTE: { areaKey: "quotes", level: "READ" },
    });
    for (const areaKey of ["repairCases.files", "productModels.view", '"quotes"']) {
      assert.equal(body.includes(areaKey), false, `라우트가 권한 이름을 직접 적는다: ${areaKey}`);
    }
  });

  test("🔴 허용 판정에 다섯을 그대로 넘긴다 — 악성코드 검사 상태가 빠지지 않는다", () => {
    const decision = body.slice(body.indexOf("decideAttachmentDownload({"), body.indexOf("if (!decision.allowed)"));
    for (const field of [
      "repairCaseId: attachment.repairCaseId",
      "productModelId: attachment.productModelId",
      "quoteId: attachment.quoteId",
      "isDeleted: attachment.isDeleted",
      // 견적서가 휴지통이면 그 파일은 나가지 않는다.
      "quoteInTrash: attachment.quoteInTrash",
      // 🔴 검사에 막힌 파일(PENDING · INFECTED · FAILED)을 내보내지 않는 근거다.
      "malwareScanStatus: attachment.malwareScanStatus",
    ]) {
      assert.ok(decision.includes(field), `판정에 넘기지 않는다: ${field}`);
    }
    // 되돌릴 수 있는 상태(휴지통 둘)는 409, 아닌 것은 403.
    assert.ok(
      body.includes('decision.reason === "DELETED" || decision.reason === "QUOTE_IN_TRASH" ? 409 : 403'),
      "사유별 상태 코드가 달라졌다"
    );
    // 라우트에 판정을 다시 적지 않는다 — 흩어지면 검사 엔진이 오는 날 고칠 자리를 못 찾는다.
    assert.equal(body.includes("INFECTED"), false, "라우트가 검사 상태를 스스로 가른다");
  });

  test("🔴 DB 에 적힌 경로도 믿지 않는다 — 루트 밖이면 읽기 전에 던진다", () => {
    // 🔴 **읽기보다 앞이어야 한다.** 뒤에 두면 이미 연 스트림이 루트 밖 파일이다.
    const check = body.indexOf("resolveAttachmentAbsolutePath(resolveUploadsRoot(), servedPath)");
    const read = body.indexOf("await storage.read(servedPath)");
    assert.ok(check >= 0 && read > check, "경로 검증이 읽기보다 뒤에 있다");
    // 디스크에 직접 닿지 않는다 — NAS 로 옮기는 날 갈아 끼울 자리를 한 곳에 모아 둔다.
    assert.equal(/require\(|from "node:fs/.test(codeOnly), false, "저장소 어댑터를 거치지 않고 디스크를 만진다");
    // 루트를 벗어난 값은 500 이고, 사람에게는 경로를 말하지 않는다.
    assert.ok(body.includes("error instanceof AttachmentPathError"), "경로 오류를 갈라 보지 않는다");
    assert.ok(body.includes('fail(500, "STORAGE_FAILED"'), "경로 오류가 500 이 아니다");
  });

  test("🔴 응답에 내부 경로를 싣지 않는다 — 오류 문장도 서버 로그도 갈라 둔다", () => {
    // 실패 응답이 싣는 것은 사람이 읽는 문장과 갈래 코드 둘뿐이다.
    assert.ok(
      flat(codeOnly).includes("return NextResponse.json({ error: message, code }, { status });"),
      "실패 응답의 모양이 달라졌다"
    );
    // 경로는 console 에만 — 그것도 `reason` · `error` 로 접어서 남긴다.
    const failures = flat(codeOnly);
    for (const leak of ["storedPath", "servedPath: ", "resolveUploadsRoot()}"]) {
      assert.equal(
        failures.includes(`${leak} }`) || failures.includes(`error: ${leak}`),
        false,
        `응답이나 로그에 내부 경로를 싣는다: ${leak}`
      );
    }
    // 첨부는 사내 자료다 — 중간 캐시에도 브라우저 디스크에도 남기지 않는다.
    assert.ok(body.includes('"Cache-Control": "private, no-store"'), "받아 간 파일이 캐시에 남는다");
    // 브라우저가 내용을 보고 형식을 다시 추측하지 않게 한다.
    assert.ok(body.includes('"X-Content-Type-Options": "nosniff"'), "nosniff 가 빠졌다");
  });

  test("🔴 감사(FILE_DOWNLOAD)는 **가져가는 행위**에만, 스트림을 돌려주기 전에 남긴다", () => {
    const audit = body.indexOf("await recordAttachmentDownload({");
    const response = body.indexOf("return new NextResponse(stream,");
    assert.ok(audit >= 0 && response > audit, "감사가 응답보다 뒤에 있다 — 기록이 누락된다");
    // ⚠️ 화면 안에서 보는 것(inline)은 기록하지 않는다 — 썸네일 열 개가 곧 열 줄이 된다.
    assert.ok(body.includes("if (!inline) {"), "미리보기까지 감사에 쌓고 있다");
    // 주인 셋을 그대로 넘긴다 — 기록하는 쪽이 어느 주인인지 갈라 적는다.
    const record = body.slice(audit, response);
    for (const field of [
      "repairCaseId: attachment.repairCaseId",
      "productModelId: attachment.productModelId",
      "quoteId: attachment.quoteId",
      "originalFileName: attachment.originalFileName",
    ]) {
      assert.ok(record.includes(field), `감사에 싣지 않는다: ${field}`);
    }
  });

  test("🔴 무엇을 화면에서 열지는 **서버가** 정한다 — 질의값을 그대로 믿지 않는다", () => {
    // 클라이언트가 보낸 view 는 판정 함수에 넘길 뿐, 라우트가 스스로 가르지 않는다.
    assert.ok(body.includes('request.nextUrl.searchParams.get("view")'), "질의값을 읽지 않는다");
    assert.ok(body.includes("shouldServeInline(view, attachment.mimeType)"), "판정 함수를 거치지 않는다");
    // 형식 목록을 라우트에 다시 적지 않는다(두 벌이 되면 한쪽만 넓어지는 날이 온다).
    for (const mime of ["image/svg", "text/html", "application/pdf"]) {
      assert.equal(body.includes(mime), false, `라우트가 형식 목록을 스스로 들고 있다: ${mime}`);
    }
    // 썸네일은 **있을 때만** 준다 — 없으면 원본이고, 크게 보기 · 내려받기는 언제나 원본이다.
    assert.ok(
      body.includes("preferPreview && attachment.previewPath ? attachment.previewPath : attachment.storedPath"),
      "미리보기 고르기가 달라졌다"
    );
  });

  /**
   * ==========================================================================
   * 🔴 전역 보안 헤더와 이 통로 (2026-09-28 · 조각 PO 3i)
   * ==========================================================================
   * 조각 PO 3h 가 `next.config.ts` 에 전역 보안 헤더 **여섯**을 놓았다. 전역
   * `headers()` 가 **먼저** 붙고, 라우트가 내는 헤더는 그 이름이 이미 있으면 Next 가
   * **조용히 버린다**(node_modules/next/dist/server/send-response.js — 여럿 허용은
   * set-cookie · www-authenticate · proxy-authenticate · vary 넷뿐).
   *
   * 🔴 **형제 시험(api/quotes/archive-folder-route-source.test.ts)을 그대로 베끼지
   * 않는다.** 저쪽은 「그 이름을 라우트가 **붙이지 않는다**」를 재지만, 이 통로는
   * `X-Content-Type-Options` 를 **일부러 겹쳐서 낸다** — 전역 목록이 바뀌거나 이
   * 통로가 다른 앞단 뒤로 옮겨지는 날을 위한 선언이다(A/S 도 같은 두 자리에서 지우지
   * 않는다). 그래서 여기서 재는 것은 셋이다:
   *   ① 전역 목록에 여섯이 **여전히 있다**(위 사실의 전제).
   *   ② 이 통로가 겹쳐 내는 이름은 **그 하나뿐**이다 — 하나 더 늘면 그 헤더는
   *      코드에는 있고 응답에는 없는 상태가 된다(오류도 경고도 나지 않는다).
   *   ③ 겹치는 그 하나의 **값이 전역과 같다.** 갈라지면 나가는 값이 조용히
   *      전역 쪽으로 바뀐다 — 이 파일만 읽어서는 알 수 없는 고장이다.
   * ==========================================================================
   */
  test("🔴 전역 보안 헤더 — 겹치는 이름은 nosniff 하나이고, 값이 전역과 같다", () => {
    const nextConfig = readFileSync(new URL("../../../../next.config.ts", import.meta.url), "utf8");
    const GLOBAL_HEADERS = [
      "X-Frame-Options",
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ] as const;
    /** 응답이 붙이는 헤더 묶음만 — 주석을 뺀 코드에서 잘라 본다. */
    const headers = flat(
      codeOnly.slice(
        codeOnly.indexOf("return new NextResponse(stream,"),
        codeOnly.indexOf('"Cache-Control": "private, no-store"')
      )
    );
    assert.ok(headers.length > 0, "전송 자리를 찾지 못했다");

    for (const name of GLOBAL_HEADERS) {
      // ① 전제 — 전역 목록이 바뀌면 여기서 소리가 난다.
      assert.ok(nextConfig.includes(`"${name}"`), `next.config.ts 의 전역 헤더 목록이 바뀌었다: ${name}`);
      // ② 겹치는 것은 nosniff 하나뿐이다.
      if (name === "X-Content-Type-Options") continue;
      assert.equal(
        headers.includes(`"${name}"`),
        false,
        `전역과 이름이 겹치는 헤더를 새로 낸다 — 조용히 버려진다: ${name}`
      );
    }
    // ③ 그 하나의 값이 전역과 같다(위 「응답에 내부 경로를 싣지 않는다」가 이 줄의 존재를 잰다).
    assert.ok(headers.includes('"X-Content-Type-Options": "nosniff"'), "겹쳐 내는 값이 nosniff 가 아니다");
    assert.ok(
      flat(nextConfig).includes('{ key: "X-Content-Type-Options", value: "nosniff" }'),
      "전역의 값이 nosniff 가 아니다 — 나가는 값이 이 라우트의 것과 달라진다"
    );
  });
});

/**
 * ============================================================================
 * 무엇을 **화면에서 열어 줄지** — 조용히 새는 쪽으로만 틀리는 판정
 * ============================================================================
 * `Content-Disposition: inline` 은 브라우저에게 "내려받지 말고 열어라"라고 말하는
 * 것이다. 열리는 문서는 **우리 출처에서** 열리므로, 스크립트를 품을 수 있는 형식이
 * 이 목록에 들어가면 그 스크립트가 우리 도메인의 것으로 돈다 — 세션 쿠키가 닿는 자리다.
 *
 * 이 고장은 **겉으로 아무 티가 나지 않는다.** SVG 를 목록에 더해도 화면은 멀쩡하고,
 * 사진도 잘 열리고, 아무도 아무것도 눈치채지 못한다. 반대 방향도 마찬가지로 조용하다 —
 * 목록이 좁아지면 결재본이 새 탭에서 열리는 대신 파일로 떨어지고, 사용자는 그것을
 * "원래 그런 것"으로 여긴다.
 *
 * 🔴 A/S 의 같은 이름 시험(`[id]/download/route.test.ts`)에서 그대로 옮겼다. 격리
 * 헤더(sandbox) 시험이 없는 것은 빠뜨린 것이 아니다 — 그 함수는 저쪽에서 **지웠고**
 * (붙여도 전역 CSP 와 이름이 겹쳐 브라우저까지 가지 못했다), 이 사이트에는 애초에
 * 전역 헤더가 없다. 사연은 inline-view.ts 의 🚨 절에 있다.
 *
 * ⚠️ 🔴 **마지막 한 마디가 바뀌었다**(2026-09-28 · 조각 PO 3i). 위 문단은 **그때의
 * 기록이라 그대로 둔다** — 다만 「이 사이트에는 애초에 전역 헤더가 없다」는 이제
 * 거짓이다. 조각 PO 3h 가 `next.config.ts` 에 전역 보안 헤더 **여섯**을 놓았고
 * (A/S 와 같은 목록), 그래서 **저쪽과 같은 까닭으로** 격리 헤더를 붙일 자리가 없다 —
 * 붙여도 이름이 겹치면 Next 가 조용히 버린다. 결론(시험이 없는 것이 맞다)은 그대로다.
 * 🔴 아래 「전역 보안 헤더」 묶음이 그 여섯이 실제로 있는지를 이제 함께 잰다.
 * ============================================================================
 */
describe("inline 판정 — 실제로 불러서 잰다", () => {
  /** 스크립트를 품을 수 있어 **영영 inline 이면 안 되는** 형식들. */
  const NEVER_INLINE_MIME_TYPES = [
    "image/svg+xml",
    "text/html",
    "application/xhtml+xml",
    "application/xml",
    "text/xml",
    "text/javascript",
    "application/javascript",
  ];

  test("PDF 는 ?view=full 에서 화면에 열린다 — 결재본을 받아서 여는 번거로움을 없앤 자리다", () => {
    assert.equal(shouldServeInline("full", "application/pdf"), true);
  });

  test("사진은 예전 그대로 열린다 — 넓히면서 있던 것을 잃지 않았다", () => {
    assert.equal(shouldServeInline("full", "image/jpeg"), true);
    assert.equal(shouldServeInline("full", "image/png"), true);
    assert.equal(shouldServeInline("thumb", "image/jpeg"), true);
    assert.equal(shouldServeInline("thumb", "image/png"), true);
  });

  test("🔴 SVG · HTML · XML 계열은 ?view=full 로 물어도 막힌다 — 넓힌 것이 '아무거나'가 아니다", () => {
    for (const mimeType of NEVER_INLINE_MIME_TYPES) {
      assert.equal(shouldServeInline("full", mimeType), false, `${mimeType} 가 화면 안에서 열린다`);
      assert.equal(shouldServeInline("thumb", mimeType), false, `${mimeType} 가 썸네일 자리에서 열린다`);
    }
  });

  test("view 인자가 없으면(그냥 내려받기면) 어떤 형식이든 inline 이 아니다", () => {
    assert.equal(shouldServeInline(null, "application/pdf"), false);
    assert.equal(shouldServeInline(null, "image/jpeg"), false);
  });

  test("모르는 view 값은 내려받기다 — 클라이언트가 지어낸 말로 열리지 않는다", () => {
    for (const view of ["", "FULL", "inline", "preview", "thumbnail", "full "]) {
      assert.equal(shouldServeInline(view, "application/pdf"), false, `view=${JSON.stringify(view)} 로 PDF 가 열린다`);
      assert.equal(shouldServeInline(view, "image/jpeg"), false, `view=${JSON.stringify(view)} 로 사진이 열린다`);
    }
  });

  test("PDF 는 썸네일 자리(?view=thumb)에서는 열리지 않는다 — 그 자리에 원본이 통째로 실리지 않게", () => {
    // 미리보기(JPEG)를 만드는 쪽이 jpeg·png 가 아니면 아예 만들지 않으므로 PDF 에는
    // 미리보기가 없다. thumb 에서 열어 주면 작은 그림칸에 몇 MB짜리 원본이 실려 나가고
    // 그려지지도 않는다. 🔴 이 사이트에는 thumb 을 부르는 화면이 없지만, 판정을 저쪽과
    // 갈라 놓지 않는다.
    assert.equal(shouldServeInline("thumb", "application/pdf"), false);
  });

  test("업로드가 허용하는 형식 중 화면에서 열리는 것은 사진 둘과 PDF 뿐이다", () => {
    const inlineCapable = ATTACHMENT_EXTENSION_RULES.flatMap((rule) =>
      rule.allowedMimeTypes.filter((mimeType) => shouldServeInline("full", mimeType))
    );
    // 엑셀·워드·zip 이 여기 끼면 그날 목록이 넓어진 것이다.
    assert.deepEqual([...new Set(inlineCapable)].sort(), ["application/pdf", "image/jpeg", "image/png"]);
  });
});
