import type { Metadata } from "next";

import RepairLaborScreen from "@/components/repair-labor/RepairLaborScreen";
import { requireAreaAccessForCurrentUser } from "@/lib/auth/area-guard";
import { hasPermission } from "@/lib/auth/permission-resolver";
import { listRepairLabor } from "@/lib/db/queries/repair-labor";

export const metadata: Metadata = {
  title: "작업 비용 | DSS PO / 내자",
};

export const dynamic = "force-dynamic";

/**
 * 작업 비용 — 견적서 작업비의 근거가 되는 표(수리 작업 · 조사 · 통전 · 서류).
 *
 * 🔴 주소(`/repair-labor`)와 권한 열쇠(`repairLabor`)는 A/S 와 **같은 값**이다 —
 * 열쇠를 바꾸면 관리자가 저장해 둔 역할별 접근 권한이 이쪽에서만 초기화되고,
 * 이미 쓰던 링크가 깨진다.
 *
 * 가드가 메뉴보다 먼저 온다 — 메뉴에서 감추는 것은 막은 것이 아니고, 주소를
 * 직접 치거나 예전 링크를 누르면 그대로 들어와진다.
 *
 * canEdit 은 **화면을 그리기 위한 값일 뿐 관문이 아니다.** 실제 저장은 서버
 * 액션이 세션부터 다시 확인한다 — 단추를 감추는 것으로 막았다고 여기면, 액션을
 * 직접 부르는 요청 앞에서 아무것도 막지 못한다.
 */
export default async function RepairLaborPage() {
  // 🔴 이 한 줄이 셋을 한다: 통합로그인(가려던 주소를 실어서) · 살아 있는 계정
  // 다시 읽기 · repairLabor 읽기 권한. 돌려받은 사람으로 곧이어 「고칠 수
  // 있는가」를 묻는다 — 세션을 두 번 읽으면 그 사이에 값이 갈릴 자리가 생긴다.
  const user = await requireAreaAccessForCurrentUser("repairLabor");

  // 고치는 권한은 관리자가 설정한 수준 하나로 정해진다(A/S 의 2026-08-31 전환).
  // 기본값은 그대로다(server/actions/repair-labor.ts 의 같은 주석).
  const canEdit = await hasPermission(user, "repairLabor", "MANAGE");

  const kinds = await listRepairLabor();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">작업 비용</h1>
      <RepairLaborScreen kinds={kinds} canEdit={canEdit} />
    </div>
  );
}
