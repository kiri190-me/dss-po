import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { shipmentApprovalRouteSteps, shipmentApprovalRoutes, users } from "@dss/core/schema";
import { db } from "@/lib/db";
import type { Role } from "@/lib/auth/session";
import type { ShipmentApprovalRouteScope } from "@/lib/domain/shipment-approval-route";

/**
 * ============================================================================
 * 🔴 이 사이트(PO/내자)에서 이 파일이 무엇인가 — 먼저 읽을 것
 * ============================================================================
 * A/S 관리 시스템의 `src/lib/db/queries/shipment-approval-routes.ts`(349줄)에서
 * 가져왔다(2026-09-28, 조각 PO 결재-A). 🔴 **내보내는 것이 전부 `select` 다** —
 * `insert` · `update` · `delete` 가 한 줄도 없다. 이 사이트는 결재선을 **읽기만**
 * 한다(설정은 A/S 에서만 — domain/shipment-approval-route.ts 머리말).
 *
 * ── 저쪽과 다른 곳 ──────────────────────────────────────────────────────
 * 코드 본문은 저쪽과 바이트 그대로 같고, 다른 것은 다음 셋뿐이다.
 *
 *  1. **들여오는 줄** — 표는 공용 묶음 `@dss/core/schema`, 접속은 `@/lib/db` 다
 *     (저쪽은 `../schema` · `../client`). `Role` 은 이 사이트의
 *     `auth/session.ts` 가 공용 이넘에서 뽑아 둔 것을 쓴다.
 *  2. **`AccountApprovalStatus`** — 이 사이트에는 저쪽의 `domain/types.ts` 같은
 *     자리가 없어 **표에서 곧장** 뽑는다(아래 한 줄). 값 목록이 두 벌이 되지
 *     않도록 손으로 적지 않는다.
 *  3. 🔴 **`listSelectableApproverCandidates` 를 안 가져왔다** — 「결재선에 올릴
 *     수 있는 사람」 목록은 **설정 화면 전용**이고, 이 사이트에는 그 화면이 없다.
 *     그 이름이 이 저장소 어디에도 없다는 것을 시험이 잰다
 *     (`src/lib/db/approval-route-read-only.test.ts`).
 *
 * 🔴 **나머지는 한 함수도 자르지 않았다.** 「현재 판」의 정의(그 용도 안에서
 * version 이 가장 큰 판)가 이 파일 하나에만 적혀 있어서다 — 반만 가져오면 그
 * 정의가 두 벌이 된다.
 * ============================================================================
 */

/**
 * 승인 상태 — 값 목록은 공용 묶음의 `account_approval_status` 이넘 하나가 정한다
 * (`auth/session.ts` 의 `Role` 이 `roleEnum` 에서 뽑는 것과 같은 방식이다).
 */
type AccountApprovalStatus = (typeof users.$inferSelect)["approvalStatus"];

/**
 * ============================================================================
 * 승인 절차(결재선) 읽기
 * ============================================================================
 * 「현재 절차」는 **그 용도(scope) 안에서 version 이 가장 큰 판** 하나다 —
 * is_current 같은 깃발 칸이 없는 이유는 db/schema/shipment-approval-routes.ts
 * 머리말에 있다(같은 사실이 두 곳에 적히면 갈라진다). 그래서 여기서도
 * `WHERE scope = ? ORDER BY version DESC LIMIT 1` 하나로 정한다. 이 정의가 적힌
 * 곳은 저장소 전체에서 이 파일 하나여야 한다.
 *
 * 🔴 **용도를 받는 함수는 기본값을 두지 않는다.** 부르는 쪽이 언제나 「출하」인지
 * 「불출」인지 적어야 한다 — 기본값을 두면 새 용도를 더할 때 고쳐야 할 자리가
 * 컴파일러에 보이지 않고, 빠뜨린 자리는 조용히 출하 절차를 읽는다.
 *
 * 그 용도의 판이 하나도 없으면 null 이다. 그때 앱은 이 기능이 없던 때와 똑같이 —
 * 「출하 대표」(users.is_shipment_representative)·위임 방식으로 — 최종 출하 승인을
 * 처리한다.
 * ============================================================================
 */

/**
 * 절차 한 단계 + **그 승인자의 지금 상태**.
 *
 * 🔴 상태를 함께 싣는 이유: 화면이 「이 사람은 지금 비활성입니다」·「삭제된
 * 계정입니다」를 말해 줘야 하기 때문이다. 결재선에 올라간 뒤에 계정이 잠기거나
 * 지워지는 일은 실제로 일어나고, 그때 결재는 그 단계에서 멈춘다. 화면이 이유를
 * 보여 주지 못하면 「왜 결재가 안 넘어가지」를 아무도 답할 수 없다.
 */
export type ShipmentApprovalRouteStepView = {
  /** 1부터. 이 순서대로 결재한다. */
  stepOrder: number;
  approverUserId: string;
  approverName: string;
  approverRole: Role;
  approverIsActive: boolean;
  approverApprovalStatus: AccountApprovalStatus;
  /** null 이 아니면 잠긴 계정이다. */
  approverLockedAt: Date | null;
  approverIsDeleted: boolean;
};

export type ShipmentApprovalRouteView = {
  id: string;
  /**
   * 이 판이 어느 절차의 것인가. 부른 쪽이 이미 아는 값이지만 함께 실어 보낸다 —
   * 다음 조각의 편집 화면이 판 하나를 통째로 받아 「지금 보고 있는 절차」를
   * 표시하는데, 그때 화면이 자기 상태와 받은 판을 짝지어야 하기 때문이다.
   */
  scope: ShipmentApprovalRouteScope;
  /** 판 번호. **그 용도 안에서** 가장 큰 것이 현재 절차다. */
  version: number;
  createdAt: Date;
  /** 이 판을 만든 사람의 이름. 「누가 언제 결재선을 바꿨나」가 화면에 그대로 보인다. */
  createdByName: string;
  /** step_order 순. **빈 배열도 정상이다** — 「절차를 쓰지 않겠다」는 뜻이다. */
  steps: ShipmentApprovalRouteStepView[];
};

/**
 * 트랜잭션 핸들과 최상위 db 양쪽을 받는다 — 승인 요청 mutation 은 자기
 * 트랜잭션 안에서, 서버 컴포넌트(페이지)는 트랜잭션 없이 읽기 때문이다. 읽기
 * 전용이라 둘 중 무엇으로 실행하든 의미가 같다(queries/workflow-rules.ts 의
 * loadWorkflowRules 가 같은 모양이다).
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * 🔴 **「현재 절차」의 정의가 적힌 유일한 곳.** 그 용도 안에서 version 이 가장 큰
 * 판 하나다. 이 파일의 공개 함수들은 전부 여기를 거친다 — 같은 정렬(과 같은
 * 걸러내기)을 한 벌 더 적으면 언젠가 한쪽만 고쳐지고, 그때 「현재」가 둘이 되거나
 * 다른 용도의 판이 섞여 나온다.
 *
 * 🔴 **용도로 거르는 것이 정렬만큼 중요하다.** 거르지 않으면 부품 불출 절차를
 * 한 판 저장하는 것만으로 출하 쪽 「현재 절차」가 바뀌어 버린다 — 판 번호는 용도
 * 안에서 세므로 다른 용도의 판이 더 큰 번호를 가질 수 있다.
 */
async function selectCurrentRouteHeader(tx: Tx, scope: ShipmentApprovalRouteScope) {
  const [route] = await tx
    .select({
      id: shipmentApprovalRoutes.id,
      scope: shipmentApprovalRoutes.scope,
      version: shipmentApprovalRoutes.version,
      createdAt: shipmentApprovalRoutes.createdAt,
      createdByName: users.name,
    })
    .from(shipmentApprovalRoutes)
    .innerJoin(users, eq(users.id, shipmentApprovalRoutes.createdByUserId))
    .where(eq(shipmentApprovalRoutes.scope, scope))
    .orderBy(desc(shipmentApprovalRoutes.version))
    .limit(1);
  return route ?? null;
}

/**
 * 그 용도에 지금 쓰이는 절차 한 판과 그 단계들. 그 용도의 판이 하나도 없으면 null.
 *
 * 🔴 **소프트삭제된 사용자의 단계도 빼지 않는다.** 조용히 빼면 절차가 짧아진
 * 것처럼 보이고, 결재가 왜 그 자리에서 멈췄는지 화면에서 알 방법이 없어진다.
 * 그 대신 approverIsDeleted 를 그대로 실어 보내 화면이 「삭제된 계정입니다」를
 * 보여 주고 고치게 한다. 비활성·잠김·미승인도 같은 이유로 거르지 않는다.
 *
 * users 조인은 innerJoin 이어도 행을 잃지 않는다 — 사람 참조가 RESTRICT 이고
 * 이 저장소의 사용자는 소프트삭제만 하므로, 참조된 users 행은 언제나 실재한다.
 */
export async function getCurrentShipmentApprovalRoute(
  scope: ShipmentApprovalRouteScope
): Promise<ShipmentApprovalRouteView | null> {
  const route = await selectCurrentRouteHeader(db, scope);

  if (!route) return null;

  const steps = await db
    .select({
      stepOrder: shipmentApprovalRouteSteps.stepOrder,
      approverUserId: shipmentApprovalRouteSteps.approverUserId,
      approverName: users.name,
      approverRole: users.role,
      approverIsActive: users.isActive,
      approverApprovalStatus: users.approvalStatus,
      approverLockedAt: users.lockedAt,
      approverIsDeleted: users.isDeleted,
    })
    .from(shipmentApprovalRouteSteps)
    .innerJoin(users, eq(users.id, shipmentApprovalRouteSteps.approverUserId))
    .where(eq(shipmentApprovalRouteSteps.routeId, route.id))
    .orderBy(asc(shipmentApprovalRouteSteps.stepOrder));

  return { ...route, steps };
}

/**
 * 승인 사슬을 잇는 데 필요한 최소한의 단계 한 줄 — 몇 번째이고 누구인가.
 *
 * 화면용 ShipmentApprovalRouteStepView 와 달리 승인자의 계정 상태를 싣지
 * 않는다. 🔴 **다음 단계 승인자의 자격을 다시 검사하지 않기 때문이다** —
 * 검사하면 뒷사람 사정 때문에 앞사람이 결재를 못 하게 된다. 그 사람이 자리를
 * 비웠으면 그 단계에서 멈추고 최고관리자가 대신 처리하는 것이 설계다.
 */
export type ShipmentApprovalRouteChainStep = {
  /** 1부터. */
  stepOrder: number;
  approverUserId: string;
};

/** 승인 요청이 붙잡아 둘 판 하나 — id 와 단계들뿐이다. */
export type ShipmentApprovalRouteChain = {
  routeId: string;
  /** 판 번호. 요청 행에는 적지 않는다(판 id 가 그것을 이미 가리킨다). */
  version: number;
  /** step_order 순. **빈 배열도 정상이다** — 「절차를 쓰지 않겠다」는 뜻이다. */
  steps: ShipmentApprovalRouteChainStep[];
};

/**
 * 승인을 요청할 때 붙잡아 둘 **그 용도의 지금 판**. 그 용도의 판이 하나도 없으면
 * null.
 *
 * getCurrentShipmentApprovalRoute() 와 「현재 절차」의 정의를 공유한다
 * (selectCurrentRouteHeader) — 승인 요청 mutation 은 자기 트랜잭션 안에서
 * 읽어야 하는데 그쪽은 db 를 직접 쓰기 때문에 이 함수가 따로 있다.
 *
 * 🔴 돌려주는 값에 용도를 싣지 않는다 — 부르는 쪽이 방금 넘긴 값이라 다시 받을
 * 이유가 없고, 실어 보내면 「받은 용도」와 「넘긴 용도」를 견주는 코드가 생긴다.
 * 화면에 그릴 판을 통째로 읽는 쪽(ShipmentApprovalRouteView)만 용도를 싣는다.
 *
 * 단계가 0개인 판은 `steps: []` 로 돌아온다. 부르는 쪽은 그때 「결재선을 쓰지
 * 않는다」로 다뤄야 한다 — 판이 아예 없을 때와 같다.
 */
export async function getCurrentShipmentApprovalRouteChain(
  tx: Tx,
  scope: ShipmentApprovalRouteScope
): Promise<ShipmentApprovalRouteChain | null> {
  const route = await selectCurrentRouteHeader(tx, scope);
  if (!route) return null;

  const steps = await getShipmentApprovalRouteSteps(tx, route.id);

  return { routeId: route.id, version: route.version, steps };
}

/**
 * **그 판의 단계 전부** — step_order 순. 단계가 0개면 빈 배열이다.
 *
 * 🔴 「현재 판」이 아니라 **행에 적힌 판**으로 읽는다. 진행 중인 건은 관리자가
 * 절차를 바꿔도 요청 시점의 옛 판을 끝까지 따라가야 하기 때문이다.
 *
 * 🔴 **한 단계씩이 아니라 통째로 읽는 이유.** 사슬은 「바로 다음 한 칸」으로
 * 나아가지 않는다 — 승인자가 그 요청의 요청자인 단계는 건너뛰므로, 다음에
 * 결재할 단계는 두 칸 뒤일 수도 세 칸 뒤일 수도 있다. 고르는 규칙은 순수 함수
 * (domain/shipment-approval-route.ts 의 findNextRouteStepToApprove)가 쥐고
 * 있고, 이 조회는 그 함수가 볼 자료를 그대로 실어 줄 뿐이다. 단계 상한이 10이라
 * 한 번에 읽어도 판 하나에 열 줄이다.
 *
 * listShipmentApprovalRouteSteps(아래)와 달리 승인자 이름을 싣지 않고 tx 를
 * 받는다 — 이쪽은 결재 트랜잭션 **안에서** 부르고, 화면에 그릴 것이 아니다.
 */
export async function getShipmentApprovalRouteSteps(
  tx: Tx,
  routeId: string
): Promise<ShipmentApprovalRouteChainStep[]> {
  return tx
    .select({
      stepOrder: shipmentApprovalRouteSteps.stepOrder,
      approverUserId: shipmentApprovalRouteSteps.approverUserId,
    })
    .from(shipmentApprovalRouteSteps)
    .where(eq(shipmentApprovalRouteSteps.routeId, routeId))
    .orderBy(asc(shipmentApprovalRouteSteps.stepOrder));
}

/**
 * 화면이 결재선을 **그리는 데** 필요한 단계 한 줄 — 몇 번째이고 누구인가.
 *
 * ShipmentApprovalRouteStepView(관리자 화면용)와 달리 승인자의 계정 상태를 싣지
 * 않는다. 이쪽은 이미 확정된 진행을 보여 줄 뿐이라 「지금 이 사람을 올릴 수
 * 있는가」를 묻지 않기 때문이다 — 그 물음은 절차를 **편집하는** 화면의 것이다.
 */
export type ShipmentApprovalRouteStepLabel = {
  /** 1부터. */
  stepOrder: number;
  approverUserId: string;
  approverName: string;
};

/** 판 하나와 그 단계들. */
export type ShipmentApprovalRouteStepList = {
  routeId: string;
  /** step_order 순. **빈 배열도 정상이다** — 「절차를 쓰지 않겠다」는 뜻이다. */
  steps: ShipmentApprovalRouteStepLabel[];
};

/**
 * **판 여러 개**의 단계들을 한 번에. 승인 카드의 진행 미리보기와 승인 이력의
 * 「n/m단계」가 함께 쓴다.
 *
 * 🔴 **판을 여러 개 받는 이유.** 이력에는 서로 다른 판을 탄 줄이 섞여 있다 —
 * 관리자가 절차를 바꾸면 새 판이 얹히고, 그때 진행 중이던 건은 옛 판을 끝까지
 * 따라가기 때문이다. 단계 수를 「현재 판」으로 세면 옛 판을 탄 줄이 「2/4단계」로
 * 보여 아직 두 사람이 더 남은 것처럼 읽힌다. 그래서 **그 줄에 적힌 판**으로
 * 세도록 줄들이 가리키는 판을 전부 받아 한 번에 읽는다.
 *
 * 🔴 **Map 이 아니라 배열로 돌려준다.** 이 값은 서버 컴포넌트를 지나 클라이언트
 * 컴포넌트(승인 카드)까지 내려가는데, Map 은 그 경계를 넘지 못한다.
 *
 * 없는 판 id 를 넘겨도 그 판은 결과에 들어 있지 않다(빈 배열이 아니라 아예
 * 없다). 부르는 쪽은 「못 찾음」과 「단계 0개」를 같게 다뤄야 한다 — 둘 다 진행
 * 표시를 그리지 않는다는 뜻이다.
 *
 * 🔴 소프트삭제·비활성 승인자의 단계도 빼지 않는다(getCurrentShipmentApprovalRoute
 * 와 같은 이유다). 조용히 빼면 이미 지나온 단계가 사라져 「1/3단계」가 「1/2단계」로
 * 보이고, 그러면 이력이 실제로 일어난 일과 다른 말을 한다.
 */
export async function listShipmentApprovalRouteSteps(
  routeIds: readonly string[]
): Promise<ShipmentApprovalRouteStepList[]> {
  const uniqueIds = [...new Set(routeIds)];
  // 빈 IN 절은 드라이버마다 다르게 굴러 굳이 확인할 이유가 없다 — 물어볼 판이
  // 없으면 질의 자체를 하지 않는다.
  if (uniqueIds.length === 0) return [];

  const rows = await db
    .select({
      routeId: shipmentApprovalRouteSteps.routeId,
      stepOrder: shipmentApprovalRouteSteps.stepOrder,
      approverUserId: shipmentApprovalRouteSteps.approverUserId,
      approverName: users.name,
    })
    .from(shipmentApprovalRouteSteps)
    .innerJoin(users, eq(users.id, shipmentApprovalRouteSteps.approverUserId))
    .where(inArray(shipmentApprovalRouteSteps.routeId, uniqueIds))
    .orderBy(asc(shipmentApprovalRouteSteps.routeId), asc(shipmentApprovalRouteSteps.stepOrder));

  const byRoute: ShipmentApprovalRouteStepList[] = [];
  for (const row of rows) {
    const last = byRoute[byRoute.length - 1];
    const bucket = last?.routeId === row.routeId ? last : null;
    const target = bucket ?? { routeId: row.routeId, steps: [] };
    if (!bucket) byRoute.push(target);
    target.steps.push({
      stepOrder: row.stepOrder,
      approverUserId: row.approverUserId,
      approverName: row.approverName,
    });
  }
  return byRoute;
}

/**
 * ============================================================================
 * 🔴 여기서 끝이다 — 저쪽의 마지막 한 함수는 **일부러 안 가져왔다**
 * ============================================================================
 * A/S 원본의 `:295-349` 에는 「결재선에 올릴 수 있는 사람」을 뽑는 조회와 그 줄
 * 타입이 더 있다. **설정 화면 전용**이라 이 사이트에는 부를 곳이 없고, 가져오면
 * 「설정도 여기서 한다」로 읽히게 된다 — 2026-09-28 사용자 결정은 그 반대다.
 *
 * 그 이름이 이 저장소 어디에도 없다는 것과, 이 파일에 쓰기(`insert` · `update` ·
 * `delete`)가 한 줄도 없다는 것을 `src/lib/db/approval-route-read-only.test.ts`
 * 가 글자로 잰다.
 * ============================================================================
 */

