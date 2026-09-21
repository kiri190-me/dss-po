/**
 * 첫 화면.
 *
 * 🔴 아직 「어디로 갈지」를 알리는 자리다. 업무 화면은 조각마다 하나씩 온다:
 *
 *   조각 1  작업 비용  ← **여기 왔다**(가장 깨끗하다 — 견적서 말고 아무도 안 읽는다)
 *   조각 2  내자 정리
 *   조각 3  견적서     목록·휴지통 → 편집 폼 → 엑셀 → 첨부 → 결재 → 인쇄
 *
 * 화면으로 가는 길은 머리말 아래 메뉴(components/AppNav.tsx)다 — 여기에 링크를
 * 또 두지 않는다. 두 곳에 두면 권한으로 거르는 자리가 둘이 되고, 한쪽만 고쳐지는
 * 날 「첫 화면에는 있는데 메뉴에는 없다」가 된다.
 *
 * 세션 검증은 상위 레이아웃((app)/layout.tsx)이 한다. 여기서 또 부르지 않는
 * 이유는 이 화면이 사람의 무엇도 읽지 않기 때문이다 — 권한이 필요한 화면은
 * 제 손으로 requireAreaAccessForCurrentUser 를 부른다(auth/area-guard.ts).
 */
export default function HomePage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-slate-900">PO / 내자</h1>
      <p className="text-sm text-slate-500">
        위 메뉴에서 화면을 고르세요. 내자 정리 · 견적서는 다음 조각에서 옮겨 옵니다.
      </p>
    </div>
  );
}
