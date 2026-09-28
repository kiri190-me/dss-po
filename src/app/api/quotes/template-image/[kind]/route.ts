import { NextResponse, type NextRequest } from "next/server";

import { hasPermission } from "@/lib/auth/permission-resolver";
import { getSessionUser } from "@/lib/auth/session";
import { QuoteTemplateError, readQuoteTemplate } from "@/lib/storage/quote-template";
import { ZipArchive } from "@/lib/xlsx/zip-reader";

/**
 * ============================================================================
 * GET /api/quotes/template-image/{kind} — 양식 안의 로고와 직인
 * ============================================================================
 * 🔴 조각 3f 로 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/app/api/quotes/template-image/[kind]/route.ts` — 2026-09-28
 * 실측 92줄)에서 가져왔다. 검사의 **순서와 내용은 한 걸음도 줄이지 않았고**, 다른 것은
 * 아래 ① 하나뿐이다.
 *
 * ── 🔴 다른 것 ① 문지기 — 다섯 걸음이 한 걸음이다 ────────────────────────
 * 저쪽은 `getAuthSource()`(mock 저장 모드) → `readSession()` → `approvalStatus` 확인 →
 * `resolveActingUserForSession()` → 권한의 다섯 걸음이다. 이 사이트는 `getSessionUser()`
 * 한 걸음이 앞의 넷을 대신한다 — mock 저장 모드가 없고, 매 요청 users 한 행을 다시 읽어
 * 정지 · 삭제 · 잠김 · **승인 대기** · 포털이 끊은 세션을 전부 거른다(auth/session.ts —
 * `approval_status = 'APPROVED'` 가 그 조회의 WHERE 에 있다). 앞선 통로들이 이미 그렇게
 * 옮겨져 있다(api/quotes/[id]/xlsx/route.ts · api/quotes/parse-excel/route.ts 머리말).
 * 🔴 **권한 걸음(quotes READ)은 그대로다** — 문턱을 낮추지 않았다.
 *
 * ── 🔴 저쪽에 이 파일의 시험이 없다 ─────────────────────────────────────
 * A/S 에는 이 라우트를 재는 시험 파일이 없다(2026-09-28 실측 — `template-image` 를 무는
 * 시험은 `print-grid/SheetPrintGridView.test.tsx` 하나이고 그것은 이 통로를 재지 않는다).
 * 그래서 이 사이트에서 **새로 적었다** — `api/quotes/template-image-route-source.test.ts`.
 * 인증 순서 · 저장 루트 밖 거부 · 응답에 내부 경로가 없음을 잰다.
 *
 * PDF 미리보기(`/quotes/{id}/print`)가 쓰는 그림 두 장이다. **양식 파일에서
 * 그때그때 꺼낸다** — 따로 복사해서 public/ 에 두면 두 벌이 되고, 로고를 바꾼
 * 뒤로 xlsx 와 PDF 가 서로 다른 회사 것처럼 보이는 날이 온다.
 *
 * ── 🔴 로그인 없이 열 수 없다 ───────────────────────────────────────────
 * 하나는 **법인 직인**이다. public/ 에 두면 주소를 아는 누구나 회사 직인 이미지를
 * 받아 갈 수 있고, 그건 인감을 인터넷에 올려 두는 것과 같다. 그래서 견적서를 볼
 * 수 있는 사람에게만 내보낸다 — 견적서 파일 자체와 같은 문턱이다.
 *
 * 감사는 남기지 않는다. 이 그림은 문서가 아니라 **문서의 부품**이고, 미리보기를
 * 한 번 열 때마다 두 줄씩 쌓이면 "누가 무엇을 가져갔는가"를 찾을 수 없게 된다
 * (첨부 다운로드가 썸네일을 기록하지 않는 것과 같은 판단). 실제로 나간 문서는
 * xlsx 라우트가 EXCEL_EXPORT 로 남긴다.
 * ============================================================================
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 양식 안의 그림 경로. 이름이 아니라 **자리**로 고른다 — drawing1.xml 의 앵커를
 * 실측해서 정한 값이다(rId1 = 직인 `사용인감1gif`, rId2 = 우측 상단 로고).
 */
const IMAGE_PARTS: Record<string, { part: string; contentType: string }> = {
  seal: { part: "xl/media/image1.png", contentType: "image/png" },
  logo: { part: "xl/media/image2.jpeg", contentType: "image/jpeg" },
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ kind: string }> }
): Promise<NextResponse> {
  // 세션에 박힌 값이 아니라 살아 있는 계정을 매 요청 다시 읽는다(auth/session.ts).
  const actingUser = await getSessionUser();
  if (!actingUser) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  if (!(await hasPermission(actingUser, "quotes", "READ"))) {
    return NextResponse.json({ error: "이 작업을 수행할 권한이 없습니다." }, { status: 403 });
  }

  const { kind } = await context.params;
  const target = IMAGE_PARTS[kind];
  if (!target) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });

  try {
    const archive = ZipArchive.fromBuffer(await readQuoteTemplate());
    const bytes = archive.readEntry(target.part);
    if (!bytes) {
      // 양식이 바뀌어 그림이 없어진 경우. 미리보기는 그림 없이도 읽을 수 있어야
      // 하므로 404 로 답하고, 화면은 빈 자리로 그린다.
      return NextResponse.json({ error: "양식에 그 그림이 없습니다." }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": target.contentType,
        // 직인이다. 중간 캐시에 남기지 않고, 브라우저에만 잠깐 둔다.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    if (err instanceof QuoteTemplateError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[quote-template-image] 그림을 꺼내지 못했다", {
      kind,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "그림을 불러오지 못했습니다." }, { status: 500 });
  }
}
