"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permission-resolver";
import { restoreAttachment, softDeleteAttachment } from "@/lib/db/mutations/attachment-trash";
import { getAttachmentForDownload } from "@/lib/db/queries/attachment-download";
import {
  hasAnyAttachmentOwnerAccess,
  isAttachmentOwnerAccessAllowed,
  resolveAttachmentOwnerAccess,
} from "@/lib/domain/attachment-download-policy";

/**
 * ============================================================================
 * 첨부 휴지통 서버 액션 — 화면이 부르는 통로
 * ============================================================================
 * 업로드는 Route Handler였다(본문이 파일 바이트라 스트림이 필요했다). 지우고
 * 되살리는 것은 실어 보낼 본문이 id와 사유뿐이라 서버 액션이 맞다.
 *
 * 🔴 **이 조각(3d-3c)은 통로만 연다.** 아직 이 두 액션을 부르는 화면이 하나도
 * 없는 것이 정상이다 — 지우기 단추와 되살리기 단추는 조각 3d-3d 이후에 온다.
 * 관문이 견적서 WRITE 라, 화면이 없는 동안 이 통로로 할 수 있는 일은 **그 사람이
 * 이미 할 수 있는 일**뿐이다(권한이 넓어지지 않는다).
 *
 * ── 인가를 여기서도, mutation에서도 확인한다 ──────────────────────────────
 * 여기서 보는 것은 "이 사람이 이 종류의 일을 할 수 있는가"(역할 권한)이고,
 * mutation이 보는 것은 "그 대상이 지금 그 일을 받을 수 있는 상태인가"
 * (존재·중복·잠금·견적서 휴지통·칸)다. 둘은 다른 질문이라 한쪽이 다른 쪽을
 * 대신하지 못한다.
 *
 * ── 🔴 A/S 와 다른 점은 **세션을 읽는 방법 하나**다 ──────────────────────
 * 저쪽 `resolveWriteActor` 는 네 걸음이다: `getRepairCaseWriteSource()`(mock 모드)
 * 갈래 → `readSession()` → `resolveActingUserForSession()` → `approvalStatus`
 * 확인. 이 사이트에는 mock 모드가 없고(사람은 언제나 통합로그인을 거쳐 온다),
 * `getSessionUser()` 하나가 나머지 셋을 한다 — 매 요청 users 한 행을 다시 읽어
 * 정지·삭제·잠김·승인 대기·포털이 끊은 세션을 전부 거른다(auth/session.ts).
 * 🔴 **이 사이트의 다른 서버 액션들이 이미 그렇게 옮겨져 있다**
 * (actions/quotes.ts 머리말 ①②, actions/domestic-orders.ts). 그 꼴을 따랐다.
 *
 * 그 아래 — 넓은 문턱 · 주인 다시 읽기 · NOT_FOUND 로 감추기 — 는 저쪽과
 * **한 걸음도 다르지 않다.**
 *
 * ── 화면 갱신 ────────────────────────────────────────────────────────────
 * 성공했을 때만 revalidatePath를 부른다. 실패에 걸면 아무것도 안 바뀐 화면을
 * 다시 그리느라 헛일을 한다.
 *
 * 갱신되는 것은 **행위자 본인의 다음 렌더**다. 다른 사람이 열어 둔 브라우저에
 * 밀어 넣지는 못한다 — 그건 폴링/웹소켓이 필요한 별도 작업이다.
 *
 * ── 🔴 권한은 첨부의 **주인**을 보고 고른다 ──────────────────────────────
 * 첨부의 주인은 접수 건 · 제품 모델 · 견적서 중 하나다(schema/attachments.ts).
 *
 *   접수 건 첨부     →  repairCases.files WRITE
 *   모델 첨부        →  productModels.files WRITE
 *   견적서 첨부      →  **quotes WRITE** (결재 PDF · 수기 엑셀)
 *
 * 🔴 **이 사이트에서 실제로 열리는 것은 견적서 갈래 하나뿐이다.** 앞의 두 영역 키는
 * 이 사이트의 권한 표에 아예 없어(auth/permission-areas.ts 의 셋: domesticOrders ·
 * quotes · repairLabor) `hasPermission` 이 언제나 NONE 을 돌려준다 — 즉 접수 건 ·
 * 모델 첨부의 id 로 이 액션을 불러도 **NOT_FOUND 로 닫힌다.** 갈래를 코드에서 쳐
 * 내지 않은 까닭은 그 판정이 **두 사이트가 함께 쓰는 판정 표**
 * (domain/attachment-download-policy.ts 의 ATTACHMENT_OWNER_PERMISSIONS)에서 오기
 * 때문이다. 표를 그대로 두면 A/S 와 같은 답을 내고, 쳐 내면 두 사이트의 답이 갈린다.
 *
 * **부르는 쪽이 넘긴 ID는 권한 판단에 쓰지 않는다** — 클라이언트가 정하는 값으로
 * 권한을 고르면 그 값을 바꿔 보내는 것만으로 문턱이 바뀐다. 인자의 ID는 오직 화면
 * 갱신 경로를 정하는 데만 쓴다.
 *
 * ── 권한 묻는 순서 ───────────────────────────────────────────────────────
 * 주인을 알아야 물을 권한이 정해지므로 조회가 앞으로 왔다. 두 겹이다 — 어느 쪽
 * 파일도 다룰 수 없는 사람은 조회 전에 FORBIDDEN, 문턱은 넘었지만 이 주인의
 * 파일은 못 다루는 사람에게는 **"없음"과 같은 응답**(NOT_FOUND). 갈라 답하면 그
 * ID가 실재한다는 사실이 새어 나간다.
 * ============================================================================
 */

export type AttachmentTrashActionResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

/**
 * 화면 갱신 대상. **권한 판단에는 쓰이지 않는다** — 주인은 DB에서 다시 읽는다
 * (파일 헤더의 🔴 항목). 둘 다 비어 있으면 갱신할 화면이 없다는 뜻이고, 그
 * 경우에도 삭제·복원 자체는 정상으로 처리한다.
 *
 * 🔴 세 칸을 A/S 와 같게 둔다. 이 사이트에는 접수 건 · 제품 모델 화면이 없어 앞의
 * 두 칸이 채워져 오는 일이 없지만(그 첨부는 권한에서 이미 막힌다), 칸을 빼면 저쪽
 * 파일과 모양이 갈린다 — 위 머리말의 같은 판단이다.
 */
type AttachmentTrashActionTarget = {
  attachmentId: string;
  repairCaseId?: string;
  productModelId?: string;
  /** 견적서의 결재 PDF · 수기 엑셀이면 그 견적서의 id — 견적서 수정 화면과 목록을 다시 그린다. */
  quoteId?: string;
};

async function resolveWriteActor(
  attachmentId: string
): Promise<
  | { ok: true; userId: string }
  | { ok: false; result: AttachmentTrashActionResult & { ok: false } }
> {
  // 살아 있는 계정을 다시 읽는다 — 강등·정지된 계정이 세션 만료 전까지 예전
  // 권한으로 파일을 지우는 구멍을 막는다(auth/session.ts). 저쪽의 세 걸음
  // (readSession · resolveActingUserForSession · approvalStatus)이 이 한 줄이다.
  const actingUser = await getSessionUser();
  if (!actingUser) {
    return { ok: false, result: { ok: false, code: "UNAUTHORIZED", message: "로그인이 필요합니다." } };
  }

  // ── 넓은 문턱 — 조회보다 앞이다 ────────────────────────────────────────
  // 어느 쪽 파일도 다룰 수 없는 사람은 첨부를 읽기 전에 막는다 — 그때는 존재
  // 여부가 드러나지 않는다. 여러 번 물어도 DB는 한 번만 읽힌다
  // (permission-resolver의 cache()).
  //
  // 무엇을 묻는지는 판정 파일의 표(ATTACHMENT_OWNER_PERMISSIONS.CHANGE) 한 곳이 정한다 —
  // 세 주인 모두 WRITE. 견적서 파일은 올리기 통로와 같은 quotes WRITE 이고,
  // 휴지통 견적서의 파일은 mutation 이 잠근 견적서 행으로 막는다(파일 헤더).
  const access = await resolveAttachmentOwnerAccess("CHANGE", (areaKey, level) =>
    hasPermission(actingUser, areaKey, level)
  );
  if (!hasAnyAttachmentOwnerAccess(access)) {
    return { ok: false, result: { ok: false, code: "FORBIDDEN", message: "파일을 지울 권한이 없습니다." } };
  }

  // ── 주인을 DB에서 읽어 물을 권한을 고른다 ──────────────────────────────
  const attachment = await getAttachmentForDownload(attachmentId);
  if (!attachment) {
    // mutation이 돌려주던 것과 같은 코드·문장이다.
    return { ok: false, result: { ok: false, code: "NOT_FOUND", message: "파일을 찾을 수 없습니다." } };
  }

  // 주인 종류 → 물을 권한. 주인이 아무도 없는 첨부는 예전처럼 접수 건 권한으로
  // 본다(isAttachmentOwnerAccessAllowed 주석).
  if (!isAttachmentOwnerAccessAllowed(attachment, access)) {
    // 🔴 FORBIDDEN이 아니라 NOT_FOUND다 — 없는 것과 못 다루는 것을 응답에서
    // 구분하지 않는다(파일 헤더의 '권한 묻는 순서').
    return { ok: false, result: { ok: false, code: "NOT_FOUND", message: "파일을 찾을 수 없습니다." } };
  }

  return { ok: true, userId: actingUser.id };
}

/**
 * 성공 뒤 다시 그릴 화면. 인자로 받은 ID만 쓴다 — 이 값은 권한을 정하지 않으므로
 * 클라이언트가 정해도 안전하다. 넘어온 것이 없으면 아무것도 갱신하지 않는다.
 *
 * 🔴 이 사이트가 실제로 가진 화면은 견적서 둘뿐이다(`/quotes/{id}` · `/quotes`).
 * 앞의 두 갈래는 라우트가 없어 아무 일도 하지 않지만, 저쪽 파일과 모양을 맞춰 둔다.
 */
function revalidateAfterTrashChange(target: AttachmentTrashActionTarget): void {
  if (target.repairCaseId) {
    revalidatePath(`/repair-cases/${target.repairCaseId}`, "layout");
  }
  if (target.productModelId) {
    revalidatePath(`/product-models/${target.productModelId}`, "layout");
  }
  if (target.quoteId) {
    // 견적서 수정 화면의 첨부 칸과, 목록의 결재 PDF · 엑셀 표시(hasSignedPdf · hasExcel).
    revalidatePath(`/quotes/${target.quoteId}`);
    revalidatePath("/quotes");
  }
}

/** 첨부를 휴지통으로 보낸다. 디스크 파일은 남는다(mutations/attachment-trash.ts 참조). */
export async function softDeleteAttachmentAction(
  input: AttachmentTrashActionTarget & { reason?: string | null }
): Promise<AttachmentTrashActionResult> {
  const actor = await resolveWriteActor(input.attachmentId);
  if (!actor.ok) return actor.result;

  const reason = (input.reason ?? "").trim();
  const result = await softDeleteAttachment({
    attachmentId: input.attachmentId,
    actorUserId: actor.userId,
    reason: reason.length > 0 ? reason.slice(0, 500) : null,
  });

  if (!result.ok) return { ok: false, code: result.code, message: result.message };

  revalidateAfterTrashChange(input);
  return { ok: true };
}

/** 휴지통의 첨부를 되살린다. */
export async function restoreAttachmentAction(
  input: AttachmentTrashActionTarget
): Promise<AttachmentTrashActionResult> {
  const actor = await resolveWriteActor(input.attachmentId);
  if (!actor.ok) return actor.result;

  const result = await restoreAttachment({
    attachmentId: input.attachmentId,
    actorUserId: actor.userId,
  });

  if (!result.ok) return { ok: false, code: result.code, message: result.message };

  revalidateAfterTrashChange(input);
  return { ok: true };
}
