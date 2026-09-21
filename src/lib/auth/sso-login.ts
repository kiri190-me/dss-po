/**
 * 포털이 확인해 준 사람을 이 시스템의 계정과 잇는다.
 *
 * 🔴 **읽기만 한다.** 계정을 만들지도, 되살리지도, 고치지도 않는다.
 *
 * 왜 그런가 — A/S 관리 시스템(RF_Service_System)과 **같은 users 표**를 보기
 * 때문이다. 계정을 만들고 역할·이름·이메일을 포털 값으로 반영하는 일은
 * 그쪽(RF_Service_System/src/lib/auth/sso-login.ts)이 이미 하고 있고, 그
 * 자리가 둘이 되면 두 가지가 깨진다:
 *
 *  1. 🔴 **역할 클레임은 클라이언트마다 다르다.** 포털은 사람에게 시스템별로
 *     역할을 준다 — `rf-service-system` 의 역할과 `dss-po` 의 역할이 다를 수
 *     있다. 이 사이트가 제 클레임을 users.role 에 적으면 **A/S 의 역할을
 *     덮어쓴다.** 같은 칸 하나를 두 시스템이 서로 다른 뜻으로 적는 셈이다.
 *  2. 계정 생성·이메일 충돌·삭제 계정 되살리기 규칙이 두 벌이 되면 어느 쪽이
 *     이겼는지 사람이 추적할 수 없다.
 *
 * 그래서 이 사이트에서 로그인할 수 있는 사람은 **A/S 에 이미 있는 계정**이다.
 * 없으면 거절하고(NOT_PROVISIONED), 사람이 A/S 에 한 번 들어갔다 오면 된다.
 * PO/내자를 쓰는 사람은 모두 A/S 사용자이므로 실제로 막히는 사람은 없다.
 *
 * 들어올 수 있는지는 오직 **지금 DB 에 적힌 그 행**으로 정한다 — 잠김 ·
 * 정지 · 삭제 · 승인 상태. ID 토큰의 role 클레임은 **판정에 쓰지 않는다.**
 *
 * 호출자는 이 함수를 부르기 전에 ID 토큰의 서명 · 발급자 · 수신자 · 만료 ·
 * nonce 를 모두 검증했어야 한다. subject 는 여기서 믿는다.
 */
import { and, eq } from "drizzle-orm";

import { users } from "@dss/core/schema";
import { db } from "@/lib/db";
import type { PoUser } from "./session";
import type { SsoIdentity } from "./oidc";

export type SsoLoginResult =
  | { outcome: "SESSION"; user: PoUser }
  | {
      outcome: "REJECTED";
      code:
        /** 포털의 sub 가 uuid 모양이 아니다. */
        | "BAD_SUBJECT"
        /** 이 시스템(= A/S 와 같은 users 표)에 그 사람의 계정이 없다. */
        | "NOT_PROVISIONED"
        /** 잠긴 계정. */
        | "ACCOUNT_LOCKED"
        /** 정지된 계정. */
        | "ACCOUNT_DISABLED"
        /** 아직 승인되지 않은 계정. */
        | "ACCOUNT_PENDING";
    };

/**
 * 포털의 users.id 는 uuid 다. 아닌 값으로 조회하면 postgres 가 던지므로
 * 먼저 막는다 — 오류 화면이 아니라 거절로 끝나야 한다.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveSsoLogin(identity: SsoIdentity): Promise<SsoLoginResult> {
  if (!UUID_PATTERN.test(identity.subject)) {
    console.error("[sso] sub 가 uuid 형식이 아닙니다.");
    return { outcome: "REJECTED", code: "BAD_SUBJECT" };
  }

  // 삭제된 행은 걸러 읽는다. 되살리는 일은 A/S 의 몫이다(그쪽 sso-login.ts).
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.ssoSubject, identity.subject), eq(users.isDeleted, false)))
    .limit(1);

  if (!row) {
    console.warn(
      `[sso] 이 시스템에 계정이 없는 사람입니다: ${identity.subject} ` +
        "(A/S 관리 시스템에 한 번 로그인하면 계정이 만들어집니다)",
    );
    return { outcome: "REJECTED", code: "NOT_PROVISIONED" };
  }

  if (row.lockedAt !== null) {
    console.warn(`[sso] 잠긴 계정입니다: ${row.name}`);
    return { outcome: "REJECTED", code: "ACCOUNT_LOCKED" };
  }
  if (!row.isActive) {
    console.warn(`[sso] 정지된 계정입니다: ${row.name}`);
    return { outcome: "REJECTED", code: "ACCOUNT_DISABLED" };
  }
  if (row.approvalStatus !== "APPROVED") {
    // A/S 는 승인 대기 계정에도 세션을 주고 /pending-approval 로 보낸다.
    // 여기는 그 화면이 없으므로 닫는 쪽으로 기운다 — 승인은 A/S 에서 한다.
    console.warn(`[sso] 아직 승인되지 않은 계정입니다: ${row.name}`);
    return { outcome: "REJECTED", code: "ACCOUNT_PENDING" };
  }

  return { outcome: "SESSION", user: row };
}
