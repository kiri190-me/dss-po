"use server";

import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permission-resolver";
import {
  isValidExpectedVersion,
  isValidQuoteId,
  validateQuoteFields,
} from "@/lib/validation/quote-input";
import { createQuote, updateQuote } from "@/lib/db/mutations/quotes";
import { permanentlyDeleteQuote, restoreQuote, softDeleteQuote } from "@/lib/db/mutations/quote-trash";
import { lookupIntakeForQuote, type QuoteIntakeLookup } from "@/lib/db/queries/quotes";

/**
 * ============================================================================
 * 견적서 — 서버 액션 (정책 계층). 🔴 **만들기 · 고치기 · 휴지통 셋 · 인수번호 찾기**
 * ============================================================================
 * server/actions/domestic-orders.ts 와 같은 형식이다: 세션 확인 → 인가 확인 →
 * 입력 검증 → mutation 호출. **순서가 곧 규칙이다** — 검증을 먼저 하면
 * 로그인하지 않은 요청이 어떤 값이 유효한지를 알아낼 수 있게 된다.
 *
 * 🔴 **인수번호 찾기**(lookupIntakeForQuoteAction)가 들어왔다 — 조각 3b-3 의 앞쪽
 * 절반이다. 그 하나가 **저장하지 않는 유일한 액션**이라 문턱도 여기서만 READ 다
 * (아래 resolveReadingUser). 그 값을 참고 목록으로 늘어놓고 부품 줄로 담는
 * 화면(부품 고르개 포함)은 **뒤쪽 절반**이고, 이 파일은 더 늘지 않는다.
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
  | {
      ok: false;
      code: QuoteActionResultCode;
      /**
       * 칸 단위 한국어 오류 — 화면이 입력칸 밑에 문장을 붙인다(validation/quote-input.ts
       * 의 fieldErrors). 🔴 **조각 3b-1 에서 더해졌다**: 휴지통 셋에는 붙일 칸이 없어
       * 필요가 없었지만, 만들기 · 고치기는 「어느 칸이 문제인가」를 말해야 한다.
       * 부품 줄은 `items.2.quantity` 처럼 줄 번호를 낀 키라, 다섯째 줄이 틀렸는데
       * 첫 줄에 빨간 글씨가 붙는 일이 없다. A/S 와 같은 모양이다.
       */
      fieldErrors?: Record<string, string>;
      message: string;
    };

/**
 * 인수번호 찾기의 결과. 🔴 **못 찾은 것은 `ok: false` 가 아니다** — `found: null`
 * 이다(아래 lookupIntakeForQuoteAction 의 같은 항목).
 */
export type QuoteLookupResult =
  | { ok: true; found: QuoteIntakeLookup | null }
  | { ok: false; code: QuoteActionResultCode; message: string };

/** 완전 삭제의 결과. 지운 뒤에는 version 이 없으므로 id 만 돌려준다. */
export type QuotePermanentDeleteActionResult =
  | { ok: true; id: string }
  | { ok: false; code: QuoteActionResultCode; message: string };

const DATABASE_UNAVAILABLE_MESSAGE = "일시적으로 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.";
const VALIDATION_MESSAGE = "입력값을 확인해 주세요.";

/** 완전 삭제 사유의 길이 상한. 내자 정리 휴지통(actions/domestic-orders.ts)과 같은 값이다. */
const MAX_PURGE_REASON_LENGTH = 2000;

/**
 * ============================================================================
 * 만들기 · 고치기 — 관문은 `quotes` WRITE 하나다 (조각 3b-1)
 * ============================================================================
 * 휴지통의 셋보다 한 칸 넓다(그쪽은 MANAGE — 아래 resolveDeletingUser).
 *
 * 🔴 **A/S 와 다른 점은 세션을 읽는 방법 하나다.** 저쪽은 `readSession()` +
 * `resolveActingUserForSession()` 두 걸음에 `getAuthSource()`(mock 모드) 갈래가
 * 붙지만, 이 사이트의 `getSessionUser()` 가 그 일을 한 걸음으로 하고 mock 모드는
 * 없다(휴지통 셋이 이미 그렇게 옮겨져 있다 — 위 머리말 ①②). 검증과 mutation 은
 * **같은 함수 같은 순서**다.
 * ============================================================================
 */
async function resolveWritingUser() {
  // 살아 있는 계정을 다시 읽는다 — 강등된 계정이 세션 만료 전까지 예전 권한으로
  // 저장하는 구멍을 막는다(auth/session.ts).
  const actingUser = await getSessionUser();
  if (!actingUser) {
    return { ok: false as const, code: "UNAUTHORIZED" as const, message: "로그인이 필요합니다." };
  }
  if (!(await hasPermission(actingUser, "quotes", "WRITE"))) {
    return { ok: false as const, code: "FORBIDDEN" as const, message: "이 작업을 수행할 권한이 없습니다." };
  }
  return { ok: true as const, actingUser };
}

/**
 * 새 견적서 한 장.
 *
 * 🔴 **이 사이트에는 아직 [새 견적서] 화면이 없다**(조각 3b-2). 그런데도 이 액션을
 * 함께 옮기는 까닭은 편집 폼이 A/S 와 **같은 한 컴포넌트**이기 때문이다 — 만들기와
 * 고치기가 같은 칸, 같은 검증, 같은 저장을 쓴다(components/quotes/QuoteEditForm.tsx ·
 * mutations/quotes.ts 의 toColumnValues). 둘로 가르면 「새로 만들면 들어가는데
 * 고치면 안 들어가는 칸」이 생긴다. 3b-2 는 `/quotes/new` 라우트만 얹으면 된다.
 *
 * 관문은 고치기와 같은 `quotes` WRITE 라, 화면이 없는 동안 이 통로로 할 수 있는
 * 일은 **그 사람이 이미 할 수 있는 일**뿐이다(권한이 넓어지지 않는다).
 */
export async function createQuoteAction(input: {
  fields: Record<string, unknown>;
}): Promise<QuoteActionResult> {
  const auth = await resolveWritingUser();
  if (!auth.ok) return { ok: false, code: auth.code, message: auth.message };

  const validation = validateQuoteFields(input?.fields ?? {});
  if (!validation.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fieldErrors: validation.fieldErrors,
      message: VALIDATION_MESSAGE,
    };
  }

  try {
    return await createQuote({ fields: validation.data, actorUserId: auth.actingUser.id });
  } catch (err) {
    // 값 자체는 절대 로그에 담지 않는다 — 품명·신고증상에 고객사 사정이 섞일 수
    // 있다(schema/quotes.ts 의 PII 항목).
    console.error("createQuoteAction: unexpected DB error", err);
    return { ok: false, code: "DATABASE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE };
  }
}

/**
 * 있는 견적서 한 장을 고친다 — **조각 3b-1 의 심장**이다.
 *
 * 🔴 낙관적 잠금(`expectedVersion`)이 여기서 끝나지 않는다. 최종 판정은 mutation 이
 * 트랜잭션 안에서 행을 잠그고 한다 — 여기서는 형식만 본다(mutations/quotes.ts 의
 * '동시 수정은 version 으로 막는다'). 🔴 **A/S 에도 같은 편집 화면이 남아 있고**
 * (조각 4 전까지, 설계서 G절) 같은 `quotes` 표를 고친다. 자료가 갈라지지 않는 것은
 * 그 version 덕이다 — 먼저 저장한 쪽이 이기고 늦은 쪽은 CONFLICT 를 받는다.
 */
export async function updateQuoteAction(input: {
  id: string;
  expectedVersion: number;
  fields: Record<string, unknown>;
}): Promise<QuoteActionResult> {
  const auth = await resolveWritingUser();
  if (!auth.ok) return { ok: false, code: auth.code, message: auth.message };

  if (!isValidQuoteId(input?.id)) {
    return { ok: false, code: "NOT_FOUND", message: "해당 견적서를 찾을 수 없습니다." };
  }
  if (!isValidExpectedVersion(input.expectedVersion)) {
    return { ok: false, code: "CONFLICT", message: "최신 정보를 다시 불러온 뒤 시도해 주세요." };
  }

  const validation = validateQuoteFields(input.fields ?? {});
  if (!validation.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fieldErrors: validation.fieldErrors,
      message: VALIDATION_MESSAGE,
    };
  }

  try {
    return await updateQuote({
      id: input.id,
      expectedVersion: input.expectedVersion,
      fields: validation.data,
      actorUserId: auth.actingUser.id,
    });
  } catch (err) {
    console.error("updateQuoteAction: unexpected DB error", err);
    return { ok: false, code: "DATABASE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE };
  }
}

/**
 * ============================================================================
 * 인수번호 찾기 — 관문은 `quotes` READ 다 (조각 3b-3 앞쪽 절반)
 * ============================================================================
 * 🔴 **저장하지 않는데도 세션을 확인한다.** 이 액션은 접수 건의 고객사 · 모델 ·
 * L/N · S/N · 신고증상과 **그 건에 출고된 부품**을 돌려주므로, 아무나 부를 수 있으면
 * 인수번호를 넣어 보는 것만으로 그 정보가 새어 나간다. 그래서 쓰기와 같은 자리에서
 * 세션을 확인하고 **문턱만 READ 로** 둔다(A/S 의 같은 판단 — 저쪽 actions/quotes.ts
 * 머리말 「불러오기는 읽기 권한으로 충분하다」).
 *
 * 🔴 **READ 문턱은 이 파일에서 여기 하나다.** 만들기 · 고치기는 WRITE
 * (resolveWritingUser), 휴지통 셋은 MANAGE(resolveDeletingUser)다. 세 헬퍼가
 * 나뉘어 있는 것이 곧 「어느 조작이 어디까지 열리는가」의 목록이다.
 * ============================================================================
 */
async function resolveReadingUser() {
  // 살아 있는 계정을 다시 읽는다 — 권한이 좁아진 계정이 세션 만료 전까지 예전
  // 권한으로 읽는 구멍을 막는다(auth/session.ts).
  const actingUser = await getSessionUser();
  if (!actingUser) {
    return { ok: false as const, code: "UNAUTHORIZED" as const, message: "로그인이 필요합니다." };
  }
  if (!(await hasPermission(actingUser, "quotes", "READ"))) {
    return { ok: false as const, code: "FORBIDDEN" as const, message: "이 작업을 수행할 권한이 없습니다." };
  }
  return { ok: true as const, actingUser };
}

/**
 * 인수번호로 접수 건을 찾아 폼에 채울 값을 돌려준다.
 *
 * 못 찾은 것은 **오류가 아니다**(`found: null`). 아직 접수되지 않은 건으로 먼저
 * 견적을 내는 일이 실제로 있고, 그때 화면은 "찾지 못했습니다 — 직접 입력하세요"
 * 로 안내하고 사람이 손으로 채운다. 오류로 만들면 그 정상적인 흐름이 빨간
 * 글씨로 막힌 것처럼 보인다.
 *
 * 🔴 **빈 문자열이면 DB 를 열지 않는다** — 칸을 비운 채 누른 것이고, 찾을 것이
 * 없는 질의를 한 번 던지는 일과 같다. 화면도 그 앞에서 먼저 막지만
 * (QuoteEditForm 의 handleLookup) 그것은 편의일 뿐이라 여기서 다시 본다.
 *
 * 🔴 **로그에 인수번호를 담지 않는다.** 그 글자는 어느 고객사의 어느 장비가 언제
 * 들어왔는지를 가리킨다(schema/quotes.ts 의 PII 항목과 같은 판단) — 나머지 액션들이
 * 품명 · 신고증상을 로그에 담지 않는 것과 한 규칙이다.
 */
export async function lookupIntakeForQuoteAction(input: {
  intakeNumber: string;
}): Promise<QuoteLookupResult> {
  const auth = await resolveReadingUser();
  if (!auth.ok) return { ok: false, code: auth.code, message: auth.message };

  const intakeNumber = typeof input?.intakeNumber === "string" ? input.intakeNumber.trim() : "";
  if (intakeNumber === "") return { ok: true, found: null };

  try {
    return { ok: true, found: await lookupIntakeForQuote(intakeNumber) };
  } catch (err) {
    console.error("lookupIntakeForQuoteAction: unexpected DB error", err);
    return { ok: false, code: "DATABASE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE };
  }
}

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
