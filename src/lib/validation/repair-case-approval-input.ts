/**
 * ============================================================================
 * 🔴 이 사이트(PO/내자)에서 이 파일이 무엇인가 — 먼저 읽을 것
 * ============================================================================
 * A/S 관리 시스템의 `src/lib/validation/repair-case-approval-input.ts`(115줄)에서
 * **셋만** 발췌했다(2026-09-28, 조각 PO 결재-B):
 *
 *   `APPROVAL_DECISION_CODES` · `ApprovalDecisionCode` · `isValidApprovalDecision`
 *   `validateReasonFormat`(+ `ReasonValidationResult` · `MAX_REASON_LENGTH`)
 *
 * 🔴 **가져온 셋은 저쪽과 바이트 그대로 같다** — 들여오는 줄이 하나도 없는 순수
 * 함수라 고칠 자리가 없었다. 아래 JSDoc 이 이름으로 가리키는 파일들
 * (`workflow-transition-input.ts` · `approval-types.ts` · local-demo 층)은 **저쪽의
 * 파일이다.** 그 문장을 고치지 않은 까닭은, 그것이 「이 값들이 어디서 왔는가」를
 * 말하는 유일한 자리이기 때문이다.
 *
 * ── 안 가져온 것 ────────────────────────────────────────────────────────
 * 접수 건(repair case)에만 쓰이는 나머지 — `isValidRepairCaseId` ·
 * `REPAIR_CASE_APPROVAL_TYPES` · `isValidApprovalType` ·
 * `validateAssignedApproverId` · `ApprovalActionResultCode` ·
 * `ApprovalActionResult`. 🔴 **이 사이트에는 접수 건 화면이 없다.**
 *  · 견적서 id 검사는 이미 있는 `validation/quote-input.ts` 의 `isValidQuoteId` 가 한다.
 *  · 「누구에게 보낼까」를 사람이 고르는 자리가 견적서 결재에는 없다 — 결재선의
 *    그 단계 승인자가 곧 지정이다(mutations/quote-approvals.ts).
 *
 * ── 🔴 파일 이름을 저쪽 그대로 둔 까닭 ──────────────────────────────────
 * 이 사이트에 「접수 건」이 없는데도 이름을 바꾸지 않았다. 바꾸면 이 셋을 부르는
 * `server/actions/quote-approvals.ts` 의 들여오는 줄이 저쪽과 달라져, 다음 사람이
 * 두 파일을 맞대어 볼 때 **진짜 다른 자리**(인증)와 섞여 보인다. 이름은 출처를
 * 가리키는 표지로 남겨 두고, 무엇을 뺐는지는 위에 적어 둔다.
 * ============================================================================
 */

export const APPROVAL_DECISION_CODES = ["APPROVED", "REJECTED"] as const;
export type ApprovalDecisionCode = (typeof APPROVAL_DECISION_CODES)[number];

export function isValidApprovalDecision(value: unknown): value is ApprovalDecisionCode {
  return typeof value === "string" && (APPROVAL_DECISION_CODES as readonly string[]).includes(value);
}

const MAX_REASON_LENGTH = 2000;

export type ReasonValidationResult =
  | { ok: true; reason: string | null }
  | { ok: false; error: string };

/**
 * Pure format check only — identical shape to workflow-transition-input.ts's
 * validateReasonFormat. Whether a reason is *required* (e.g. REJECTED
 * always requires one, matching the local-demo layer's
 * COMMENT_REQUIRED rule) is a stateful decision made in the mutation layer,
 * not here.
 */
export function validateReasonFormat(value: unknown): ReasonValidationResult {
  if (value === null || value === undefined || value === "") {
    return { ok: true, reason: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "사유 값을 확인할 수 없습니다." };
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_REASON_LENGTH) {
    return { ok: false, error: "사유 내용이 너무 깁니다." };
  }
  return { ok: true, reason: trimmed === "" ? null : trimmed };
}
