import "server-only";
import { eq } from "drizzle-orm";
import { users } from "@dss/core/schema";
import type { db } from "@/lib/db";
import type { Role } from "@/lib/auth/session";

/**
 * ============================================================================
 * 🔴 「이 사람이 지금도 일할 수 있는 계정인가」 — 트랜잭션 안에서 다시 읽는다
 * ============================================================================
 * A/S 관리 시스템의 `src/lib/db/mutations/procedure-templates.ts:72-102` 에서
 * `resolveEligibleActor` **한 덩이만** 발췌했다(2026-09-28, 조각 PO 결재-B).
 * 저쪽은 절차 템플릿 저장 경로가 쥐고 있고 「편집기 쪽에서도 같은 자격 검사를
 * 다시 쓰라」고 export 해 둔 함수다.
 *
 * 🔴 **이 사이트에는 절차 템플릿 기능이 오지 않았다.** 그래서 저쪽 파일
 * (1,272줄)을 통째로 가져오는 대신 이 27줄만 떼어 제 파일로 두었다. 이웃한
 * `mutations/quote-approvals.ts` 가 **저쪽과 바이트 그대로 같은 모양**을 지키려면
 * 이 함수가 그 파일 밖에 있어야 한다(그 파일의 `requireActor` 가 이것을 부른다).
 *
 * ── 저쪽과 다른 곳 둘 ───────────────────────────────────────────────────
 *  1. **들여오는 줄** — 표는 공용 묶음 `@dss/core/schema`, 접속 타입은 `@/lib/db`.
 *     `Role` 은 이 사이트의 `auth/session.ts` 가 공용 이넘에서 뽑아 둔 것을 쓴다
 *     (저쪽은 `@/lib/domain/types`). queries/shipment-approval-routes.ts 가
 *     조각 결재-A 에서 한 것과 같은 자리다.
 *  2. 🔴 **막힐 때 던지는 것** — 저쪽은 그 파일의 `ProcedureTemplateMutationError`
 *     를 던진다. 이 사이트에는 그 종류가 없어 보통 `Error` 를 던진다. 🔴 **부르는
 *     쪽에서는 뜻이 같다** — `mutations/quote-approvals.ts` 의 `requireActor` 가
 *     `try/catch` 로 **무엇이 날아오든** 잡아 `FORBIDDEN` 으로 접기 때문이다
 *     (저쪽도 그렇게 부른다). 문장도 저쪽과 글자 그대로 같게 둔다.
 *
 * ── 🔴 왜 세션이 아니라 DB 를 다시 읽나 ─────────────────────────────────
 * 세션이 만들어진 뒤에 역할이 내려갔거나 계정이 잠겼을 수 있다. 조건(승인됨 ·
 * 활성 · 잠기지 않음 · 삭제 안 됨)을 부르는 쪽마다 적지 않고 여기 한 벌만 둔다.
 * ============================================================================
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EligibleActor = { id: string; role: Role; isDeveloper: boolean };

function fail(message: string): never {
  throw new Error(message);
}

/**
 * 그 계정이 지금 일할 수 있는 상태인지 **이 트랜잭션 안에서** 확인하고, 권한을
 * 물을 때 필요한 세 칸만 돌려준다. 아니면 던진다.
 */
export async function resolveEligibleActor(tx: Tx, actorUserId: string): Promise<EligibleActor> {
  const [actor] = await tx
    .select({
      id: users.id,
      role: users.role,
      approvalStatus: users.approvalStatus,
      isActive: users.isActive,
      lockedAt: users.lockedAt,
      isDeleted: users.isDeleted,
      isDeveloper: users.isDeveloper,
    })
    .from(users)
    .where(eq(users.id, actorUserId));
  if (
    !actor ||
    actor.isDeleted ||
    actor.approvalStatus !== "APPROVED" ||
    !actor.isActive ||
    actor.lockedAt !== null
  ) {
    fail("사용자 정보를 확인할 수 없습니다.");
  }
  return actor;
}
