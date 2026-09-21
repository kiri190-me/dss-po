import type { Metadata } from "next";

import DomesticOrderListScreen from "@/components/domestic-orders/DomesticOrderListScreen";
import { requireAreaAccessForCurrentUser } from "@/lib/auth/area-guard";
import { hasPermission } from "@/lib/auth/permission-resolver";
import {
  listCustomerOptions,
  listDeletedDomesticOrders,
  listDomesticOrders,
  listRepairCaseLinkOptions,
} from "@/lib/db/queries/domestic-orders";
import { getDomesticOrderSheetHeading } from "@/lib/db/queries/domestic-order-sheet-settings";
import { listQuoteOptions } from "@/lib/db/queries/quotes";
import { toKstDateOnly } from "@/lib/domain/date-only";

export const metadata: Metadata = {
  title: "내자 정리 | DSS PO / 내자",
};

export const dynamic = "force-dynamic";

/**
 * 내자 정리(국내 수주 진행 상황표) — 목록 + 행 추가·수정 + 휴지통.
 *
 * 🔴 주소(`/domestic-orders`)와 권한 열쇠(`domesticOrders`)는 A/S 와 **같은 값**
 * 이다 — 열쇠를 바꾸면 관리자가 저장해 둔 역할별 접근 권한이 이쪽에서만
 * 초기화되고, 이미 쓰던 링크가 깨진다(작업 비용과 같은 판단).
 *
 * 이 화면에는 거래 금액과 입금 여부가 있다. 그래서 가드가 메뉴보다 먼저 온다 —
 * 메뉴에서 감추는 것은 막은 것이 아니고, 주소를 직접 입력하거나 예전 링크를
 * 누르면 그대로 들어와진다.
 *
 * 휴지통은 canDelete(domesticOrders MANAGE) 세션에만 보이고, 그 세션에만
 * 휴지통의 줄을 읽어 보낸다.
 *
 * canEdit · canDelete 는 **화면을 그리기 위한 값일 뿐 관문이 아니다.** 실제 저장은
 * server/actions/domestic-orders.ts 가 세션부터 다시 확인한다 — 버튼을 감추는
 * 것으로 막았다고 여기면, 액션을 직접 부르는 요청 앞에서 아무것도 막지 못한다.
 *
 * ── A/S 와 다른 점 둘 ───────────────────────────────────────────────────
 * ① 저쪽에는 `AUTH_SOURCE !== "database"`(mock 모드)일 때 안내판을 그리는 갈래가
 *    있다. 이 사이트에는 mock 모드가 없다 — 없는 갈래를 베껴 두면 영원히 참이
 *    아닌 조건이 코드에 남는다(작업 비용 화면과 같은 판단).
 * ② 저쪽은 가드를 부른 뒤 세션을 **다시** 읽어 acting user 를 구한다. 여기서는
 *    가드가 그 사람을 그대로 돌려준다 — 두 번 읽으면 그 사이에 값이 갈릴 자리가
 *    생긴다(auth/area-guard.ts 의 같은 주석).
 */
export default async function DomesticOrdersPage() {
  // 🔴 이 한 줄이 셋을 한다: 통합로그인(가려던 주소를 실어서) · 살아 있는 계정
  // 다시 읽기 · domesticOrders 읽기 권한.
  //
  // 이름을 `actingUser` 로 둔 것은 A/S 와 맞추기 위해서다 — 옮겨 온 시험
  // (components/domestic-orders/domestic-order-trash.test.ts)이 이 파일의 글자를
  // 읽어 「화면의 판정과 서버 액션의 관문이 같은 수준인가」를 확인한다.
  const actingUser = await requireAreaAccessForCurrentUser("domesticOrders");

  // 고치는 권한은 관리자가 정한 수준 하나로 정해진다(A/S 의 2026-08-31 전환) —
  // 예전에는 canEditDomesticOrders(역할)를 AND 로 겹쳐 넓혀도 열리지 않았다.
  // 머리말 편집도 이 값 하나로 단추가 보인다 — 저장 액션
  // (saveDomesticOrderSheetHeadingAction)이 같은 관문을 다시 본다.
  const canEdit = await hasPermission(actingUser, "domesticOrders", "WRITE");
  // 휴지통으로 보내기·복원·완전 삭제는 한 칸 좁다 — 관리. 서버 액션
  // (actions/domestic-orders.ts 의 resolveManagingActingUser)과 **같은 판정**이라
  // 화면에 보이는 단추와 실제로 되는 일이 어긋나지 않는다.
  const canDelete = await hasPermission(actingUser, "domesticOrders", "MANAGE");

  // 고칠 수 없는 사람에게는 폼의 드롭다운 목록을 읽지 않는다 — 쓰지 않을 값을
  // 클라이언트로 내려보내지 않는다. 고객사 목록도 같은 규칙이다: 이 화면을 볼
  // 수만 있는 사람에게 전체 고객사 명단을 실어 보낼 이유가 없다.
  const [rows, repairCaseOptions, customerOptions, quoteOptions, trashRows, sheetHeading] = await Promise.all([
    listDomesticOrders(),
    canEdit ? listRepairCaseLinkOptions() : Promise.resolve([]),
    canEdit ? listCustomerOptions() : Promise.resolve([]),
    // 견적서 목록도 폼에서만 쓴다 — 고칠 수 없는 사람에게 실어 보내지 않는다.
    canEdit ? listQuoteOptions() : Promise.resolve([]),
    // 휴지통은 지울 수 있는 사람에게만 읽어 보낸다 — 볼 수 없는 탭의 내용을
    // 실어 보내지 않는다.
    canDelete ? listDeletedDomesticOrders() : Promise.resolve([]),
    // 머리말(인사문 · 내부 메모). 볼 수 있는 사람 모두에게 보이는 글이라 누구에게나
    // 읽어 보낸다. 행이 없거나 표가 아직 없으면 코드의 기본 문구다 — 그때 화면은
    // 이 기능을 넣기 전과 한 글자도 다르지 않다(queries/domestic-order-sheet-settings.ts).
    getDomesticOrderSheetHeading(),
  ]);

  // 머리말의 "{날짜}자 진행 상황입니다"에 들어갈 날짜. 클라이언트에서 만들면
  // 서버가 그린 것과 달라져 hydration이 어긋나므로 여기서 정해 내려보낸다.
  // 표준시를 못 박는 것도 같은 이유다 — 서버가 어디서 돌든 같은 날짜가 나와야
  // 한다.
  const asOfDate = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // 발주 년도 칸의 기본값이 되는 "올해". 이것도 서버가 정한다 — 클라이언트에서
  // new Date().getFullYear() 를 부르면 서버가 그린 것과 달라져 hydration 이
  // 어긋나고, 한국 표준시 대신 브라우저의 시간대로 해가 정해진다(연초·연말
  // 하루가 실제로 다르게 나온다). toKstDateOnly 는 그 판단이 이미 적혀 있는
  // 곳이다(domain/date-only.ts).
  const currentYear = toKstDateOnly(new Date()).slice(0, 4);

  return (
    <DomesticOrderListScreen
      rows={rows}
      asOfDate={asOfDate}
      currentYear={currentYear}
      canEdit={canEdit}
      repairCaseOptions={repairCaseOptions}
      customerOptions={customerOptions}
      quoteOptions={quoteOptions}
      canDelete={canDelete}
      trashRows={trashRows}
      sheetHeading={sheetHeading}
    />
  );
}
