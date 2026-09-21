"use server";

import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permission-resolver";
import { isValidExpectedVersion, isValidQuoteId } from "@/lib/validation/quote-input";
import { permanentlyDeleteQuote, restoreQuote, softDeleteQuote } from "@/lib/db/mutations/quote-trash";

/**
 * ============================================================================
 * 견적서 — 서버 액션 (정책 계층). 🔴 **지금은 휴지통 셋뿐이다**
 * ============================================================================
 * server/actions/domestic-orders.ts 와 같은 형식이다: 세션 확인 → 인가 확인 →
 * 입력 검증 → mutation 호출. **순서가 곧 규칙이다** — 검증을 먼저 하면
 * 로그인하지 않은 요청이 어떤 값이 유효한지를 알아낼 수 있게 된다.
 *
 * 🔴 A/S 의 같은 이름 파일에는 만들기 · 고치기 · 인수번호 찾기도 있다. 그 셋은
 * **편집 폼이 부르는 것**이고 편집 폼은 조각 3b 에서 온다(설계서 G절). 지금 옮겨
 * 오면 아무도 부르지 않는 저장 통로가 열린 채로 남는다 — 화면이 없어도 서버 액션은
 * 주소만 알면 부를 수 있으므로, 쓰지 않는 쓰기 통로를 열어 두지 않는다.
 *
 * ── 관문은 하나다 ───────────────────────────────────────────────────────
 * 관리자가 설정한 수준(hasPermission)만 본다. A/S 가 2026-08-31 에 그렇게 전환했고
 * (`quotes` 는 저쪽 permission-features.ts 의 '설정이 최종 판정' 목록에 있다), 같은
 * `role_permissions` 표를 읽는 이 사이트도 같은 답을 내야 한다.
 *
 * 기본값은 그대로다 — permission-baseline.ts 의 quotes 사다리가 바로 그
 * canViewQuotes/canEditQuotes/canDeleteQuotes 를 불러 만들어지므로, 설정을
 * 건드리지 않은 상태에서는 저쪽과 **정확히 같은 답**을 낸다.
 *
 * ── 화면이 감춘 것은 경계가 아니다 ──────────────────────────────────────
 * 목록은 지울 수 없는 역할에게 휴지통 탭도 [삭제] 단추도 그리지 않는다. 그것은
 * 편의일 뿐이고, 이 액션은 화면이 무엇을 보여 줬든 상관없이 매번 처음부터 다시
 * 검사한다.
 *
 * ── A/S 와 다른 점 둘 (내자 정리 액션과 같다) ───────────────────────────
 * ① 저쪽에는 `AUTH_SOURCE !== "database"`(mock 모드) 갈래가 있다. 이 사이트에는
 *    mock 모드가 없다 — 사람은 언제나 통합로그인을 거쳐 오고 users 표에서 읽힌다.
 * ② 저쪽은 `readSession()` 으로 쿠키를 읽고 `resolveActingUserForSession()` 으로
 *    살아 있는 행을 다시 읽는다(두 걸음). 이 사이트의 `getSessionUser()` 가 그 둘을
 *    **한 걸음**으로 한다 — 매 요청 users 한 행을 읽고 정지·삭제·잠김·승인 대기·
 *    포털이 끊은 세션을 전부 거른다(auth/session.ts). 그래서 저쪽의
 *    `approvalStatus !== "APPROVED"` 갈래도 여기서는 이미 그 안에 들어 있다.
 *
 * ── 🔴 A/S 와 같은 DB, 같은 표다 ────────────────────────────────────────
 * 여기서 휴지통에 넣은 견적서는 **A/S 목록에서도 사라지고**, 저쪽에서 되살릴 수 있다
 * (조각 4 전까지는 양쪽에 같은 화면이 있다 — 설계서 G절). 그래서 mutation 이 저쪽과
 * 한 걸음도 다르면 안 된다(mutations/quote-trash.ts 머리말).
 * ============================================================================
 */

export type QuoteActionResultCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DATABASE_UNAVAILABLE";

export type QuoteActionResult =
  | { ok: true; id: string; version: number }
  | { ok: false; code: QuoteActionResultCode; message: string };

/** 완전 삭제의 결과. 지운 뒤에는 version 이 없으므로 id 만 돌려준다. */
export type QuotePermanentDeleteActionResult =
  | { ok: true; id: string }
  | { ok: false; code: QuoteActionResultCode; message: string };

const DATABASE_UNAVAILABLE_MESSAGE = "일시적으로 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.";

/** 완전 삭제 사유의 길이 상한. 내자 정리 휴지통(actions/domestic-orders.ts)과 같은 값이다. */
const MAX_PURGE_REASON_LENGTH = 2000;

/**
 * 휴지통의 관문은 한 칸 더 좁다. 만들기·고치기는 `quotes` WRITE 지만, 지우고
 * 되살리고 완전히 지우는 것은 `quotes` MANAGE 다 — 견적서는 고객사에 나간 문서라
 * 지우는 판단을 담당자 각자에게 맡기지 않는다(quote-authorization.ts 의 '삭제는
 * 관리자 이상이다'). 내자 정리 휴지통의 셋이 한 관문인 것과 같다.
 */
async function resolveDeletingUser() {
  // 살아 있는 계정을 다시 읽는다 — 강등된 계정이 세션 만료 전까지 예전 권한으로
  // 지우는 구멍을 막는다(auth/session.ts).
  const actingUser = await getSessionUser();
  if (!actingUser) {
    return { ok: false as const, code: "UNAUTHORIZED" as const, message: "로그인이 필요합니다." };
  }
  if (!(await hasPermission(actingUser, "quotes", "MANAGE"))) {
    return { ok: false as const, code: "FORBIDDEN" as const, message: "견적서를 지울 권한이 없습니다." };
  }
  return { ok: true as const, actingUser };
}

/**
 * 휴지통으로 보낸다. 되돌릴 수 있는 조작이라 사유는 선택이다.
 *
 * 붙어 있던 결재 PDF · 수기 엑셀도 **같은 트랜잭션에서** 첨부 휴지통으로 간다
 * (mutations/quote-trash.ts 의 '견적서의 첨부'). 🔴 첨부 화면이 아직 이 사이트에
 * 없어도 그 일은 한다 — 같은 DB 를 A/S 가 함께 보기 때문이다.
 */
export async function deleteQuoteAction(input: {
  id: string;
  expectedVersion: number;
  reason: string | null;
}): Promise<QuoteActionResult> {
  const auth = await resolveDeletingUser();
  if (!auth.ok) return { ok: false, code: auth.code, message: auth.message };

  if (!isValidQuoteId(input?.id)) {
    return { ok: false, code: "NOT_FOUND", message: "해당 견적서를 찾을 수 없습니다." };
  }
  if (!isValidExpectedVersion(input.expectedVersion)) {
    return { ok: false, code: "CONFLICT", message: "최신 정보를 다시 불러온 뒤 시도해 주세요." };
  }

  try {
    const reason = typeof input.reason === "string" && input.reason.trim() !== "" ? input.reason.trim() : null;
    const result = await softDeleteQuote({
      quoteId: input.id,
      expectedVersion: input.expectedVersion,
      actorUserId: auth.actingUser.id,
      reason,
    });
    if (!result.ok) {
      return { ok: false, code: result.code === "CONFLICT" ? "CONFLICT" : "NOT_FOUND", message: result.message };
    }
    return result;
  } catch (err) {
    // 값 자체는 절대 로그에 담지 않는다 — 품명·신고증상에 고객사 사정이 섞일 수
    // 있다(schema/quotes.ts 의 PII 항목).
    console.error("deleteQuoteAction: unexpected DB error", err);
    return { ok: false, code: "DATABASE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE };
  }
}

/**
 * 휴지통에서 되살린다. 발행번호가 그 사이에 다른 견적서에 쓰였으면 거절한다 —
 * 지우는 순간 그 번호가 풀리기 때문이다(mutations/quote-trash.ts 의 '지운 견적서의
 * 번호는 다시 쓸 수 있다').
 */
export async function restoreQuoteAction(input: {
  id: string;
  expectedVersion: number;
}): Promise<QuoteActionResult> {
  const auth = await resolveDeletingUser();
  if (!auth.ok) return { ok: false, code: auth.code, message: auth.message };

  if (!isValidQuoteId(input?.id)) {
    return { ok: false, code: "NOT_FOUND", message: "해당 견적서를 찾을 수 없습니다." };
  }
  if (!isValidExpectedVersion(input.expectedVersion)) {
    return { ok: false, code: "CONFLICT", message: "최신 정보를 다시 불러온 뒤 시도해 주세요." };
  }

  try {
    const result = await restoreQuote({
      quoteId: input.id,
      expectedVersion: input.expectedVersion,
      actorUserId: auth.actingUser.id,
    });
    if (!result.ok) {
      // NUMBER_TAKEN 은 형식 오류가 아니라 지금 상태 때문에 못 하는 일이라,
      // 사용자가 무엇을 해야 하는지 그 문장이 이미 말해 준다.
      const code =
        result.code === "CONFLICT" ? "CONFLICT" : result.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION_ERROR";
      return { ok: false, code, message: result.message };
    }
    return result;
  } catch (err) {
    console.error("restoreQuoteAction: unexpected DB error", err);
    return { ok: false, code: "DATABASE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE };
  }
}

/**
 * 15일을 기다리지 않고 휴지통의 견적서를 완전히 지운다. 되돌릴 수 없으므로 사유가
 * 필수다. 휴지통에 있는 장만 지워진다 — 그 판정은 mutation 이 잠금 안에서 한다
 * (mutations/quote-trash.ts 의 permanentlyDeleteQuote).
 */
export async function permanentlyDeleteQuoteAction(input: {
  id: string;
  expectedVersion: number;
  reason: string;
}): Promise<QuotePermanentDeleteActionResult> {
  const auth = await resolveDeletingUser();
  if (!auth.ok) return { ok: false, code: auth.code, message: auth.message };

  if (!isValidQuoteId(input?.id)) {
    return { ok: false, code: "NOT_FOUND", message: "해당 견적서를 찾을 수 없습니다." };
  }
  if (!isValidExpectedVersion(input.expectedVersion)) {
    return { ok: false, code: "CONFLICT", message: "최신 정보를 다시 불러온 뒤 시도해 주세요." };
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason === "") {
    return { ok: false, code: "VALIDATION_ERROR", message: "완전 삭제 사유를 입력해 주세요." };
  }
  if (reason.length > MAX_PURGE_REASON_LENGTH) {
    return { ok: false, code: "VALIDATION_ERROR", message: "완전 삭제 사유가 너무 깁니다." };
  }

  try {
    const result = await permanentlyDeleteQuote({
      quoteId: input.id,
      expectedVersion: input.expectedVersion,
      actorUserId: auth.actingUser.id,
      reason,
    });
    if (!result.ok) return { ok: false, code: result.code, message: result.message };
    return { ok: true, id: result.id };
  } catch (err) {
    // 오류 객체를 통째로 남기지 않고 코드만 남긴다 — 되돌릴 수 없는 조작의 실패라
    // 사유(사람이 적은 글자)가 오류 문맥에 섞여 로그로 새지 않게 한다(actions/
    // domestic-orders.ts 의 휴지통 액션과 같은 판단).
    const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: unknown }).code : undefined;
    console.error("permanentlyDeleteQuoteAction: unexpected DB error", { id: input.id, code });
    return { ok: false, code: "DATABASE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE };
  }
}
