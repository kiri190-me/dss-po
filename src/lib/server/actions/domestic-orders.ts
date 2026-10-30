"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permission-resolver";
import {
  isValidDomesticOrderId,
  isValidExpectedVersion,
  validateDomesticOrderFields,
} from "@/lib/validation/domestic-order-input";
// 🔴 `setDomesticOrderCompletion` 은 여기서 더 이상 부르지 않는다(2026-10-18) — 완료
//    처리·해제는 A/S 통로를 거치고, 그 끝에서 **저쪽이** 같은 이름의 mutation 을 부른다.
//    mutation 자체는 지우지 않았다(아래 setDomesticOrderCompletionAction 머리말).
import { createDomesticOrder, updateDomesticOrder } from "@/lib/db/mutations/domestic-orders";
import {
  asCompletionUnreachableMessage,
  setAsDomesticOrderCompletion,
} from "@/lib/server/as-gateway";
import {
  permanentlyDeleteDomesticOrder,
  restoreDomesticOrder,
  softDeleteDomesticOrder,
  type DomesticOrderTrashResult,
} from "@/lib/db/mutations/domestic-orders-trash";
import { saveDomesticOrderSheetHeading } from "@/lib/db/mutations/domestic-order-sheet-settings";
import {
  validateDomesticOrderSheetHeadingInput,
  type DomesticOrderSheetHeadingFieldErrors,
} from "@/lib/domain/domestic-order-sheet-heading";
import type { RequestedDueDateLinkOutcome } from "@/lib/domain/requested-due-date-link";

/**
 * ============================================================================
 * 내자 정리 — 행 추가·수정 서버 액션 (정책 계층)
 * ============================================================================
 * end-users.ts 와 같은 형식이다: 세션 확인 → 인가 확인 → 입력 검증 →
 * mutation 호출. 순서가 곧 규칙이다 — 검증을 먼저 하면 로그인하지 않은 요청이
 * 어떤 값이 유효한지를 알아낼 수 있게 된다.
 *
 * ── 관문이 둘인 이유 ────────────────────────────────────────────────────
 * canEditDomesticOrders(역할 정책)와 hasPermission("domesticOrders", "WRITE")
 * (관리자가 설정한 수준)를 **둘 다** 통과해야 저장된다.
 *
 * 내자 정리는 아직 permission-features.ts 의 '설정이 최종 판정' 목록에 없다.
 * 그 목록에 없는 메뉴는 기존 역할 함수가 여전히 최종 관문이고, 설정으로는
 * 좁힐 수만 있다 — 여기 두 검사를 AND 로 두는 것이 정확히 그 뜻이다. 설정
 * 화면도 이 사실을 그대로 표시하므로, 관리자가 "열어 줬다고 믿는데 막혀 있는"
 * 상태가 생기지 않는다.
 *
 * ── 화면이 감춘 것은 경계가 아니다 ──────────────────────────────────────
 * 목록 화면은 고칠 수 없는 역할에게 '행 추가' 버튼과 편집 폼을 그리지 않는다.
 * 그것은 편의일 뿐이고, 이 액션은 화면이 무엇을 보여 줬든 상관없이 매번 처음부터
 * 다시 검사한다.
 *
 * ── 🔴 위 '관문이 둘인 이유' 는 A/S 의 낡은 주석이다(글자 그대로 옮겨 왔다) ──
 * 저쪽 코드도 오늘은 hasPermission 하나만 본다 — 2026-08-31 전환 때
 * canEditDomesticOrders(역할) 검사가 실제로 빠졌고, `domesticOrders` 는 저쪽
 * permission-features.ts 의 '설정이 최종 판정' 목록에 **들어 있다**. 주석만
 * 뒤따라오지 못한 것이다. 🔴 이 저장소도 **저쪽 코드와 같은 검사 하나**를 한다 —
 * 아래 두 함수가 그 한 줄이다. 기본 동작은 전환 전과 같다:
 * permission-baseline.ts 의 domesticOrders 기본값이 바로 그 역할 함수라,
 * 설정을 건드리지 않은 상태에서는 예전 검사와 정확히 같은 답이 나온다.
 *
 * ── 🔴 A/S 와 같은 DB, 같은 표다 ────────────────────────────────────────
 * 여기서 저장하면 **A/S 화면에서도 그대로 보인다**(조각 4 전까지는 양쪽에 같은
 * 화면이 있다 — 설계서 G절). 그래서 권한 판정이 저쪽과 어긋나면 안 된다.
 *
 * ── A/S 와 다른 점 둘 ───────────────────────────────────────────────────
 * ① 저쪽에는 `AUTH_SOURCE !== "database"`(mock 모드) 갈래가 있다. 이 사이트에는
 *    mock 모드가 없다 — 사람은 언제나 통합로그인을 거쳐 오고 users 표에서
 *    읽힌다. 없는 갈래를 베껴 두면 영원히 참이 아닌 조건이 코드에 남는다.
 * ② 저쪽은 `readSession()` 으로 쿠키를 읽고 `resolveActingUserForSession()` 으로
 *    살아 있는 행을 다시 읽는다(두 걸음). 이 사이트의 `getSessionUser()` 가
 *    그 둘을 **한 걸음**으로 한다 — 매 요청 users 한 행을 읽고 정지·삭제·잠김·
 *    승인 대기·포털이 끊은 세션을 전부 거른다(auth/session.ts). 그래서 저쪽의
 *    `approvalStatus !== "APPROVED"` 갈래도 여기서는 **이미 그 안에 들어 있다** —
 *    빠진 것이 아니라 한 곳으로 모인 것이다(작업 비용 액션과 같은 모양).
 * ============================================================================
 */

export type DomesticOrderActionResultCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DATABASE_UNAVAILABLE";

export type DomesticOrderActionResult =
  | {
      ok: true;
      id: string;
      version: number;
      /**
       * 🔴 이번 저장이 **수리 건의 고객 요청 납기일까지 맞췄는가**(2026-10-30).
       * mutation 이 그대로 실어 보낸다(db/mutations/domestic-orders.ts). 화면은
       * `linked: false` 일 때 **읽어야 닫히는 알림**을 띄운다 — 저장 팝업은 0.5초
       * 뒤에 사라져 경고를 전할 수 없다(components/common/NoticePopup.tsx 머리말).
       */
      requestedDueDateLink?: RequestedDueDateLinkOutcome;
    }
  | {
      ok: false;
      code: DomesticOrderActionResultCode;
      fieldErrors?: Record<string, string>;
      message: string;
    };

const VALIDATION_MESSAGE = "입력값을 확인해 주세요.";
const DATABASE_UNAVAILABLE_MESSAGE = "일시적으로 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.";

async function resolveAuthorizedActingUser() {
  // 🔴 세션의 값이 아니라 **살아 있는 계정을 다시 읽는다**(auth/session.ts 의
  // getSessionUser). 정지·삭제·잠김·승인 대기·포털이 끊은 세션이 여기서 전부
  // 걸린다 — 강등된 계정이 토큰 만료 전까지 예전 권한으로 저장하는 구멍이 없다.
  // A/S 가 readSession + resolveActingUserForSession 두 걸음으로 하는 일이고,
  // 이 사이트에서는 그 둘이 한 함수다(파일 머리말 '다른 점 둘' ②).
  const actingUser = await getSessionUser();
  if (!actingUser) {
    return { ok: false as const, code: "UNAUTHORIZED" as const, message: "로그인이 필요합니다." };
  }
  // 관문은 하나다 — 관리자가 설정한 수준(2026-08-31 전환). 예전에는
  // canEditDomesticOrders(역할)와 AND 였고, 그래서 넓혀 줘도 열리지 않았다.
  // 기본값은 그대로다 — permission-baseline.ts 의 domesticOrders 기본값이
  // 바로 그 역할 함수라, 설정을 건드리지 않으면 같은 답을 낸다.
  if (!(await hasPermission(actingUser, "domesticOrders", "WRITE"))) {
    return { ok: false as const, code: "FORBIDDEN" as const, message: "이 작업을 수행할 권한이 없습니다." };
  }
  return { ok: true as const, actingUser };
}

export async function createDomesticOrderAction(input: {
  fields: Record<string, unknown>;
}): Promise<DomesticOrderActionResult> {
  const auth = await resolveAuthorizedActingUser();
  if (!auth.ok) return { ok: false, code: auth.code, message: auth.message };

  const validation = validateDomesticOrderFields(input.fields ?? {});
  if (!validation.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fieldErrors: validation.fieldErrors,
      message: VALIDATION_MESSAGE,
    };
  }

  try {
    return await createDomesticOrder({ fields: validation.data, actorUserId: auth.actingUser.id });
  } catch (err) {
    // 값 자체는 절대 로그에 담지 않는다 — 현황·이력·기타·납품자에 사람 이름이
    // 섞일 수 있다(schema/domestic-orders.ts 의 PII 항목).
    console.error("createDomesticOrderAction: unexpected DB error", err);
    return { ok: false, code: "DATABASE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE };
  }
}

export async function updateDomesticOrderAction(input: {
  id: string;
  expectedVersion: number;
  fields: Record<string, unknown>;
}): Promise<DomesticOrderActionResult> {
  const auth = await resolveAuthorizedActingUser();
  if (!auth.ok) return { ok: false, code: auth.code, message: auth.message };

  if (!isValidDomesticOrderId(input.id)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fieldErrors: { id: "항목을 확인할 수 없습니다." },
      message: VALIDATION_MESSAGE,
    };
  }
  if (!isValidExpectedVersion(input.expectedVersion)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fieldErrors: { expectedVersion: "수정 시점 정보를 확인할 수 없습니다." },
      message: VALIDATION_MESSAGE,
    };
  }

  const validation = validateDomesticOrderFields(input.fields ?? {});
  if (!validation.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fieldErrors: validation.fieldErrors,
      message: VALIDATION_MESSAGE,
    };
  }

  try {
    return await updateDomesticOrder({
      id: input.id,
      expectedVersion: input.expectedVersion,
      fields: validation.data,
      actorUserId: auth.actingUser.id,
    });
  } catch (err) {
    console.error("updateDomesticOrderAction: unexpected DB error", err);
    return { ok: false, code: "DATABASE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE };
  }
}

/**
 * ============================================================================
 * 완료 처리 · 완료 해제 — 🔴 **A/S 통로를 부른다** (2026-10-18)
 * ============================================================================
 * 관문은 위 둘과 **똑같다**(hasPermission("domesticOrders", "WRITE")). 권한 상한을
 * 따로 올리지 않는다: 완료는 누른 그 자리에서 다시 눌러 되돌릴 수 있는 조작이고,
 * 값이 사라지지도 않는다. 되돌릴 수 없는 조작(삭제 등)이 생기면 그때 별도의
 * 수준을 논한다.
 *
 * ── 🔴 저장은 이 사이트가 하지 않는다 ───────────────────────────────────
 * 2026-10-18 부터 [완료 처리]/[완료 해제]는 그 줄에 붙은 **수리 건의 출하 완료까지**
 * 함께 움직인다. 그 판정(최종 출하 승인 확인 · 되돌리기 · 두 mutation 의 차례)은
 * A/S 가 쥐고 있고, **베끼면 규칙이 두 벌이 된다.** 그래서 여기서는 `setDomesticOrder
 * Completion` mutation 을 곧장 부르지 않고 저쪽 통로를 부른다(server/as-gateway.ts).
 * 저쪽이 같은 서비스를 거쳐 그 mutation 을 마지막 한 걸음으로 부른다.
 *
 * 🔵 그 mutation 은 **지우지 않았다.** 이 액션이 유일한 호출자였으므로 지금은 쓰이지
 *    않지만, 지우는 것은 이 조각의 일이 아니다(설계·시험이 함께 걸린다).
 *
 * ── 🔴 관문을 그대로 두는 까닭 ──────────────────────────────────────────
 * 저쪽도 `requester.sub` 로 사람을 되짚어 권한을 **다시** 본다(저쪽 1-2절). 그래도
 * 이 검사를 빼지 않는다 — 빼면 PO 화면이 **로그인하지 않은 사람에게도** 열리고,
 * 통로가 닫혀 있는 서버에서는 거절조차 받지 못해 무엇이 막았는지 알 수 없게 된다.
 *
 * ── 🔴 `requester.sub` 는 **포털 번호**다 ───────────────────────────────
 * `users.sso_subject` 이고 이 사이트의 `users.id` 가 **아니다**. `getSessionUser()` 가
 * users 한 행을 통째로 돌려주므로(auth/session.ts) 그 칸이 이미 손에 있다 — 조회를
 * 더하지 않는다. 🔴 그 칸은 **비어 있을 수 있다**(nullable). 포털을 거치지 않고 만들어진
 * 계정이 그렇고, 그대로 보내면 저쪽이 사람을 못 찾아 403 이 된다 — 사람에게는 「권한이
 * 없다」로 보여 영문을 알 수 없다. 그래서 **보내기 전에** 가르고 다른 말로 돌려준다.
 *
 * ── 결과가 세 갈래다 ────────────────────────────────────────────────────
 *  · 성공 — 수리 건까지 함께 움직였는지를 두 칸으로 함께 돌려준다(화면의 성공 문구가 갈린다).
 *  · 저쪽이 거절 — 코드를 그대로 올린다. 🔴 `SHIPMENT_COMPLETION_BLOCKED` 는 **내자 줄도
 *    안 바뀌었다**는 뜻이고, `message` 는 사람에게 그대로 보여 줄 글이다.
 *  · 🔴 통로에 못 닿음 — 설정이 없든 저쪽이 꺼졌든, **사람이 읽을 수 있는 한 줄**로 바꾼다
 *    (as-gateway.ts 의 asCompletionUnreachableMessage). 그 글이 「내자 줄은 그대로다」와
 *    「바뀌었는지 모른다」를 가른다.
 * ============================================================================
 */

export type DomesticOrderCompletionActionResultCode =
  | DomesticOrderActionResultCode
  /**
   * 붙어 있는 수리 건의 출하 완료 상태를 바꾸지 못해 **내자 줄도 그대로다.**
   * 두 방향이 같은 코드를 쓴다 — 완료 처리에서는 "넘기지 못했다", 완료 해제에서는
   * "되돌리지 못했다"이고, 어느 쪽인지는 화면이 이미 안다(지금 누른 단추가 무엇인지).
   * 화면은 이 코드를 보고 **읽고 닫아야 하는 알림**(NoticePopup)을 띄운다 — 승인이
   * 남았다는 말은 줄 위 빨간 글씨 한 줄로는 놓치기 쉽고, 무엇보다 **내자 줄도 안 됐다**는
   * 사실을 함께 전해야 한다.
   */
  | "SHIPMENT_COMPLETION_BLOCKED"
  /**
   * 🔴 **A/S 통로에 닿지 못했다**(이 사이트에만 있는 갈래다 — 저쪽 화면은 같은 앱 안에서
   * 서비스를 직접 부르므로 이런 일이 없다). 설정이 빠졌거나 저쪽이 꺼졌다는 뜻이고,
   * 고칠 사람도 고칠 자리도 업무 거절과 전혀 다르다.
   */
  | "AS_UNREACHABLE";

export type DomesticOrderCompletionActionResult =
  | {
      ok: true;
      id: string;
      version: number;
      /** 이번 누름으로 수리 건까지 함께 출하 완료됐는가(화면의 성공 문구가 갈린다). */
      repairCaseShipmentCompleted: boolean;
      /** 이번 누름으로 수리 건의 출하 완료까지 되돌렸는가(완료 해제 쪽 문구가 갈린다). */
      repairCaseShipmentReverted: boolean;
    }
  | {
      ok: false;
      code: DomesticOrderCompletionActionResultCode;
      fieldErrors?: Record<string, string>;
      message: string;
    };

/** 포털 번호가 없는 계정. 저쪽에 보내 봐야 403 이라 여기서 가른다(위 머리말). */
const NO_PORTAL_SUBJECT_MESSAGE =
  "통합 로그인 계정 정보가 없어 A/S 관리 시스템에 완료 처리를 요청할 수 없습니다. 관리자에게 알려 주세요.";

export async function setDomesticOrderCompletionAction(input: {
  id: string;
  expectedVersion: number;
  completed: boolean;
}): Promise<DomesticOrderCompletionActionResult> {
  const auth = await resolveAuthorizedActingUser();
  if (!auth.ok) return { ok: false, code: auth.code, message: auth.message };

  if (!isValidDomesticOrderId(input.id)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fieldErrors: { id: "항목을 확인할 수 없습니다." },
      message: VALIDATION_MESSAGE,
    };
  }
  if (!isValidExpectedVersion(input.expectedVersion)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fieldErrors: { expectedVersion: "수정 시점 정보를 확인할 수 없습니다." },
      message: VALIDATION_MESSAGE,
    };
  }
  // 불리언이 아닌 값을 받아 두면 undefined 가 "해제"로 조용히 읽힌다.
  // 🔴 저쪽도 같은 것을 본다(불리언이 아니면 400) — 두 벌이 아니라 한 벌이 앞당겨진 것이다.
  if (typeof input.completed !== "boolean") {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fieldErrors: { completed: "완료 여부를 확인할 수 없습니다." },
      message: VALIDATION_MESSAGE,
    };
  }

  const requesterSub = auth.actingUser.ssoSubject?.trim() ?? "";
  if (requesterSub === "") {
    console.error("setDomesticOrderCompletionAction: 포털 번호가 없는 계정입니다.", {
      userId: auth.actingUser.id,
    });
    return { ok: false, code: "FORBIDDEN", message: NO_PORTAL_SUBJECT_MESSAGE };
  }

  const result = await setAsDomesticOrderCompletion({
    id: input.id,
    expectedVersion: input.expectedVersion,
    completed: input.completed,
    requesterSub,
  });

  if (result.ok) {
    return {
      ok: true,
      id: result.id,
      version: result.version,
      repairCaseShipmentCompleted: result.repairCaseShipmentCompleted,
      repairCaseShipmentReverted: result.repairCaseShipmentReverted,
    };
  }
  if (result.kind === "rejected") {
    // 🔵 저쪽이 쓰는 코드가 이 액션의 코드와 **같은 낱말**이다(SHIPMENT_COMPLETION_BLOCKED
    //    하나만 이 사이트에 새로 생겼다). 그대로 올리고 글자도 그대로 보여 준다.
    return { ok: false, code: result.code, message: result.message };
  }
  return {
    ok: false,
    code: "AS_UNREACHABLE",
    message: asCompletionUnreachableMessage(result.reason, input.completed),
  };
}

/**
 * ============================================================================
 * 휴지통 — 보내기 · 되살리기 · 완전 삭제 (2026-09-11)
 * ============================================================================
 * 관문이 한 칸 좁다. 추가·수정·완료는 `domesticOrders` WRITE 지만, 이 셋은
 * `domesticOrders` MANAGE 다 — 15일이 지나면 세금계산서·입금 기록이 영구히
 * 사라지는 조작이라 지우는 판단을 담당자 각자에게 맡기지 않는다
 * (domestic-order-authorization.ts 의 canDeleteDomesticOrders). 판정 방식은
 * 견적서 휴지통(actions/quotes.ts 의 resolveDeletingUser)과 같다.
 *
 * ── 모양은 다른 휴지통 액션과 같다 ──────────────────────────────────────
 * 여러 건을 받아 **한 건씩 제 트랜잭션에서** 처리하고 건마다 결과를 돌려준다
 * (actions/inventory-trash.ts · customer-trash.ts). 그래서 화면은 고객사·부품이
 * 쓰는 훅(useMasterDataTrash)과 확인 창을 그대로 쓴다. 지금 화면은 한 번에 한
 * 줄만 보내지만, 모양을 맞춰 두면 창과 오류 요약이 화면마다 달라지지 않는다.
 *
 * ── 예기치 못한 오류는 그 한 건의 실패로 적는다 ─────────────────────────
 * Postgres 오류를 그대로 브라우저로 넘기지 않고, 로그에는 오류 코드만 남긴다 —
 * 이 표의 자유 입력 칸(현황·이력·기타·납품자)에 사람 이름이 섞일 수 있어
 * 값이 로그로 새지 않게 한다(inventory.ts 의 withErrorRedaction 과 같은 판단).
 *
 * ── 성공하면 목록 화면을 다시 그리게 한다 ───────────────────────────────
 * 한 건이라도 바뀌었으면 revalidatePath("/domestic-orders"). 화면도 훅이
 * router.refresh() 를 부르지만, 다른 탭에 열린 같은 화면이 낡은 캐시를 보지
 * 않게 서버 쪽에서도 무효화한다. 아무것도 안 바뀐 요청(관문·검증에서 막힘,
 * 전부 실패)에는 부르지 않는다.
 * ============================================================================
 */

const MAX_TRASH_ITEMS = 200;
const MAX_TRASH_REASON_LENGTH = 2000;
const DOMESTIC_ORDERS_PATH = "/domestic-orders";

/** 한 건. 수정·완료와 같은 version 대조를 쓴다(mutations/domestic-orders-trash.ts). */
export type DomesticOrderTrashItem = { id: string; expectedVersion: number };

export type DomesticOrderTrashItemResult = {
  id: string;
  ok: boolean;
  code?: string;
  message?: string;
};

export type DomesticOrderTrashActionResult =
  | { ok: true; results: DomesticOrderTrashItemResult[] }
  | { ok: false; code: "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION_ERROR"; message: string };

async function resolveManagingActingUser() {
  // 살아 있는 계정을 다시 읽는다 — 위 resolveAuthorizedActingUser 와 같은 이유.
  const actingUser = await getSessionUser();
  if (!actingUser) {
    return { ok: false as const, code: "UNAUTHORIZED" as const, message: "로그인이 필요합니다." };
  }
  if (!(await hasPermission(actingUser, "domesticOrders", "MANAGE"))) {
    return { ok: false as const, code: "FORBIDDEN" as const, message: "내자 정리 항목을 지울 권한이 없습니다." };
  }
  return { ok: true as const, actingUser };
}

function validateTrashItems(
  items: unknown,
  emptyMessage: string
): { ok: true; items: DomesticOrderTrashItem[] } | { ok: false; result: DomesticOrderTrashActionResult } {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, result: { ok: false, code: "VALIDATION_ERROR", message: emptyMessage } };
  }
  if (items.length > MAX_TRASH_ITEMS) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `한 번에 최대 ${MAX_TRASH_ITEMS}건까지 처리할 수 있습니다.`,
      },
    };
  }
  const checked: DomesticOrderTrashItem[] = [];
  for (const item of items as { id?: unknown; expectedVersion?: unknown }[]) {
    if (!isValidDomesticOrderId(item?.id) || !isValidExpectedVersion(item?.expectedVersion)) {
      return {
        ok: false,
        result: { ok: false, code: "VALIDATION_ERROR", message: "선택한 항목 정보를 확인할 수 없습니다." },
      };
    }
    // 받은 객체를 그대로 넘기지 않고 두 칸만 옮겨 담는다 — 화면이 덧붙인 다른
    // 값이 mutation 까지 흘러가지 않게 한다.
    checked.push({ id: item.id, expectedVersion: item.expectedVersion });
  }
  return { ok: true, items: checked };
}

/**
 * 건마다 실행하고 건마다 결과를 담는다. 한 건이라도 성공했으면 목록 화면을
 * 무효화한다(위 머리말).
 */
async function runEachTrashItem(
  items: DomesticOrderTrashItem[],
  label: string,
  run: (item: DomesticOrderTrashItem) => Promise<DomesticOrderTrashResult>
): Promise<DomesticOrderTrashItemResult[]> {
  const results: DomesticOrderTrashItemResult[] = [];
  for (const item of items) {
    try {
      const result = await run(item);
      results.push(
        result.ok ? { id: item.id, ok: true } : { id: item.id, ok: false, code: result.code, message: result.message }
      );
    } catch (err) {
      const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: unknown }).code : undefined;
      console.error(`${label}: unexpected DB error`, { id: item.id, code });
      results.push({ id: item.id, ok: false, code: "DATABASE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE });
    }
  }
  if (results.some((result) => result.ok)) revalidatePath(DOMESTIC_ORDERS_PATH);
  return results;
}

/** 휴지통으로 보낸다. 되돌릴 수 있는 조작이라 사유는 선택이다. */
export async function deleteDomesticOrdersAction(input: {
  items: DomesticOrderTrashItem[];
  reason: string | null;
}): Promise<DomesticOrderTrashActionResult> {
  const auth = await resolveManagingActingUser();
  if (!auth.ok) return { ok: false, code: auth.code, message: auth.message };

  const validated = validateTrashItems(input?.items, "휴지통으로 보낼 항목을 선택해 주세요.");
  if (!validated.ok) return validated.result;

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length > MAX_TRASH_REASON_LENGTH) {
    return { ok: false, code: "VALIDATION_ERROR", message: "삭제 사유가 너무 깁니다." };
  }

  const results = await runEachTrashItem(validated.items, "deleteDomesticOrdersAction", (item) =>
    softDeleteDomesticOrder({
      id: item.id,
      expectedVersion: item.expectedVersion,
      actorUserId: auth.actingUser.id,
      reason: reason || null,
    })
  );
  return { ok: true, results };
}

/** 휴지통에서 되살린다. */
export async function restoreDomesticOrdersAction(input: {
  items: DomesticOrderTrashItem[];
}): Promise<DomesticOrderTrashActionResult> {
  const auth = await resolveManagingActingUser();
  if (!auth.ok) return { ok: false, code: auth.code, message: auth.message };

  const validated = validateTrashItems(input?.items, "복원할 항목을 선택해 주세요.");
  if (!validated.ok) return validated.result;

  const results = await runEachTrashItem(validated.items, "restoreDomesticOrdersAction", (item) =>
    restoreDomesticOrder({ id: item.id, expectedVersion: item.expectedVersion, actorUserId: auth.actingUser.id })
  );
  return { ok: true, results };
}

/** 15일을 기다리지 않고 휴지통의 줄을 완전히 지운다. 되돌릴 수 없으므로 사유가 필수다. */
export async function permanentlyDeleteDomesticOrdersAction(input: {
  items: DomesticOrderTrashItem[];
  reason: string;
}): Promise<DomesticOrderTrashActionResult> {
  const auth = await resolveManagingActingUser();
  if (!auth.ok) return { ok: false, code: auth.code, message: auth.message };

  const validated = validateTrashItems(input?.items, "완전 삭제할 항목을 선택해 주세요.");
  if (!validated.ok) return validated.result;

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason === "") {
    return { ok: false, code: "VALIDATION_ERROR", message: "완전 삭제 사유를 입력해 주세요." };
  }
  if (reason.length > MAX_TRASH_REASON_LENGTH) {
    return { ok: false, code: "VALIDATION_ERROR", message: "완전 삭제 사유가 너무 깁니다." };
  }

  const results = await runEachTrashItem(validated.items, "permanentlyDeleteDomesticOrdersAction", (item) =>
    permanentlyDeleteDomesticOrder({
      id: item.id,
      expectedVersion: item.expectedVersion,
      actorUserId: auth.actingUser.id,
      reason,
    })
  );
  return { ok: true, results };
}

/**
 * ============================================================================
 * 머리말(인사문 · 내부 메모) 저장 (2026-09-11)
 * ============================================================================
 * 관문은 **행 추가·수정과 같다**(resolveAuthorizedActingUser — domesticOrders WRITE).
 * 머리말은 이 화면을 고치는 사람이 함께 고치는 문서의 일부이고, 되돌릴 수 있는
 * 조작이라(기본 문구로 · 감사 로그의 전후 문구) 휴지통처럼 한 칸 좁힐 이유가 없다.
 * 화면의 [머리말 편집] 단추도 같은 판정(page.tsx 의 canEdit)으로만 보인다.
 *
 * 순서는 이 파일의 다른 액션과 같다: 세션 → 인가 → 입력 검증 → mutation. mutation
 * 이 트랜잭션 안에서 행위자와 권한을 한 번 더 본다(mutations/domestic-order-sheet-
 * settings.ts) — 세션을 읽은 뒤 강등된 계정이 그 사이에 저장하는 구멍을 막는다.
 *
 * 🔴 오류 로그에 문구를 싣지 않는다 — 인사문에 사람 이름이 들어 있다. 오류 코드만 남긴다.
 * ============================================================================
 */

export type DomesticOrderSheetHeadingActionResult =
  | { ok: true; revertedToDefault: boolean }
  | {
      ok: false;
      code: "VALIDATION_ERROR" | "UNAUTHORIZED" | "FORBIDDEN" | "DATABASE_UNAVAILABLE";
      message: string;
      fieldErrors?: DomesticOrderSheetHeadingFieldErrors;
    };

export async function saveDomesticOrderSheetHeadingAction(input: {
  greetingText: string;
  internalMemo: string;
}): Promise<DomesticOrderSheetHeadingActionResult> {
  const auth = await resolveAuthorizedActingUser();
  if (!auth.ok) return { ok: false, code: auth.code, message: auth.message };

  const validation = validateDomesticOrderSheetHeadingInput(input);
  if (!validation.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fieldErrors: validation.fieldErrors,
      message: VALIDATION_MESSAGE,
    };
  }

  try {
    const result = await saveDomesticOrderSheetHeading({
      greetingText: validation.data.greetingText,
      internalMemo: validation.data.internalMemo,
      actorUserId: auth.actingUser.id,
    });
    if (!result.ok) {
      return {
        ok: false,
        code: result.code === "FORBIDDEN" ? "FORBIDDEN" : "VALIDATION_ERROR",
        fieldErrors: result.fieldErrors,
        message: result.message,
      };
    }
    if (result.changed) revalidatePath(DOMESTIC_ORDERS_PATH);
    return { ok: true, revertedToDefault: result.revertedToDefault };
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: unknown }).code : undefined;
    console.error("saveDomesticOrderSheetHeadingAction: unexpected DB error", { code });
    return { ok: false, code: "DATABASE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE };
  }
}
