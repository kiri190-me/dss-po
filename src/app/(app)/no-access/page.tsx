import type { Metadata } from "next";
import Link from "next/link";

import { requireSession } from "@/lib/auth/guards";
import { listAccessibleAreaKeys } from "@/lib/auth/permission-resolver";
import { filterNavItemsForAccess, navItems, permissionAreaLabel } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "접근 권한 없음 | DSS PO / 내자",
};

export const dynamic = "force-dynamic";

/**
 * 권한이 없어 막혔을 때 오는 화면(auth/area-guard.ts 가 보낸다).
 *
 * 첫 화면으로 조용히 돌려보내지 않는 이유: 이유를 모르면 사용자는 고장으로
 * 여기고, 관리자에게 물을 때도 "안 돼요"밖에 말할 수 없다. 어느 메뉴가 막혔는지,
 * 누구에게 무엇을 요청해야 하는지, 지금 갈 수 있는 곳은 어디인지를 적어 준다.
 *
 * 🔴 **권한을 푸는 곳은 A/S 관리 시스템이다** — 설정 화면이 저쪽 [사용자 관리]
 * 안에 있고 이 사이트는 그 값을 읽기만 한다(db/queries/role-permissions.ts).
 * 그래서 안내 문구가 저쪽 화면의 이름을 그대로 댄다. 여기서 "관리자에게
 * 문의하세요" 로만 끝내면 관리자도 어디를 열어야 하는지 모른다.
 */
export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>;
}) {
  const { area } = await searchParams;
  const user = await requireSession();

  const blockedLabel = area ? permissionAreaLabel(area) : null;
  // 메뉴와 **같은 창구**로 거른다 — 거르는 규칙이 두 곳에 있으면 한쪽만 고쳐지는
  // 날 "메뉴에는 있는데 이 목록에는 없다"가 된다.
  const accessibleItems = filterNavItemsForAccess(navItems, await listAccessibleAreaKeys(user));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">접근 권한이 없습니다</h1>
        <p className="mt-2 text-sm text-slate-600">
          {blockedLabel ? (
            <>
              <strong>{blockedLabel}</strong> 화면은 지금 계정에 열려 있지 않습니다.
            </>
          ) : (
            <>요청하신 화면은 지금 계정에 열려 있지 않습니다.</>
          )}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          필요하시면 관리자에게 <strong>A/S 관리 시스템 &gt; 사용자 관리 &gt; 역할별 접근 권한</strong>
          에서 이 화면을 열어 달라고 요청해 주세요. 두 시스템이 같은 설정을 봅니다.
        </p>
      </div>

      {accessibleItems.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">지금 이용할 수 있는 화면</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {accessibleItems.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="text-sm text-slate-700 underline-offset-2 hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
