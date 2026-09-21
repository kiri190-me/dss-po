"use server";

import { hasPermission } from "@/lib/auth/permission-resolver";
import { getSessionUser } from "@/lib/auth/session";
import { validateRepairLaborFields } from "@/lib/validation/repair-task-input";
import { saveRepairLabor, type SaveRepairLaborResult } from "@/lib/db/mutations/repair-labor";

/**
 * ============================================================================
 * 수리 작업 비용 — 서버 액션 (정책 계층)
 * ============================================================================
 * 세션 확인 → 인가 확인 → 입력 검증 → mutation. 순서가 곧 규칙이다.
 *
 * ── 🔴 고치는 권한이 견적서를 고치는 권한보다 **좁다** ──────────────────
 * 개별 견적서를 고치는 것은 그 한 장의 일이지만, 여기서 시간당 단가나 공수시간을
 * 바꾸면 **앞으로 나갈 모든 견적서의 금액이 바뀐다.** 회사가 부르는 값을 정하는
 * 자리라 영업 담당자 각자에게 맡기지 않는다 — 견적서를 지울 수 있는 사람과 같은
 * 집합(관리자 이상)으로 둔다.
 *
 * 보는 것은 견적서를 보는 사람과 같다. 견적을 내려면 어떤 작업이 얼마인지 알아야
 * 하고, 그걸 못 보게 하면 사람은 다시 Excel 을 연다.
 *
 * ── 🔴 관문은 하나다 — 관리자가 설정한 수준 ──────────────────────────────
 * A/S 가 2026-08-31 에 전환한 그대로다. 예전에는 canDeleteQuotes(역할)와 이 설정을
 * **둘 다** 봤고, 그러면 설정을 넓혀 줘도 역할 함수가 막아 실제로는 열리지 않았다.
 * 역할 함수를 떼도 기본 동작은 그대로다 — permission-baseline.ts 의 repairLabor
 * 기본값이 `ladder({ manage: canDeleteQuotes(role) })` 라, 설정을 건드리지 않은
 * 상태에서 이 검사는 예전 검사와 **정확히 같은 답**을 낸다.
 *
 * ── 🔴 A/S 와 같은 DB, 같은 표다 ────────────────────────────────────────
 * 여기서 저장하면 **A/S 화면에서도 그대로 보인다**(조각 4 전까지는 양쪽에 같은
 * 화면이 있다 — 설계서 G절). 그래서 권한 판정이 저쪽과 어긋나면 안 된다:
 * 여기서 뚫리면 A/S 의 실제 견적 금액이 바뀐다.
 *
 * ── A/S 와 다른 점 하나 ─────────────────────────────────────────────────
 * 저쪽에는 `AUTH_SOURCE !== "database"`(mock 모드) 갈래가 있다. 이 사이트에는 mock
 * 모드가 없다 — 사람은 언제나 통합로그인을 거쳐 오고 users 표에서 읽힌다. 없는
 * 갈래를 베껴 두면 영원히 참이 아닌 조건이 코드에 남는다.
 * ============================================================================
 */

type Forbidden = { ok: false; code: "FORBIDDEN"; message: string };

const DB_UNAVAILABLE = "일시적으로 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.";

export type SaveRepairLaborActionResult =
  | SaveRepairLaborResult
  | Forbidden
  | { ok: false; code: "VALIDATION_ERROR"; message: string; fieldErrors: Record<string, string> };

async function resolveActor(): Promise<
  { ok: true; userId: string } | { ok: false; result: Forbidden }
> {
  const deny = (message: string) => ({
    ok: false as const,
    result: { ok: false as const, code: "FORBIDDEN" as const, message },
  });

  // 🔴 세션의 값이 아니라 **살아 있는 계정을 다시 읽는다**(auth/session.ts 의
  // getSessionUser). 정지·삭제·잠김·승인 대기·포털이 끊은 세션이 여기서 전부
  // 걸린다 — 강등된 계정이 토큰 만료 전까지 예전 권한으로 저장하는 구멍이 없다.
  const user = await getSessionUser();
  if (!user) return deny("로그인이 필요합니다.");

  if (!(await hasPermission(user, "repairLabor", "MANAGE"))) {
    return deny("수리 작업 비용을 고칠 권한이 없습니다. 관리자에게 문의해 주세요.");
  }
  return { ok: true, userId: user.id };
}

export async function saveRepairLaborAction(input: {
  fields: Record<string, unknown>;
}): Promise<SaveRepairLaborActionResult> {
  const actor = await resolveActor();
  if (!actor.ok) return actor.result;

  const validation = validateRepairLaborFields(input.fields ?? {});
  if (!validation.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "입력값을 확인해 주세요.",
      fieldErrors: validation.fieldErrors,
    };
  }

  try {
    return await saveRepairLabor({ fields: validation.data, actorUserId: actor.userId });
  } catch (err) {
    console.error("saveRepairLaborAction: unexpected DB error", err);
    return { ok: false, code: "FORBIDDEN", message: DB_UNAVAILABLE };
  }
}
