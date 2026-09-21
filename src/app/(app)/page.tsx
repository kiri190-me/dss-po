/**
 * 첫 화면.
 *
 * 🔴 지금은 제목 한 줄뿐이다. 이 조각(설계서 G절 0b)이 세우는 것은 **뼈대**다 —
 * 「npm run dev 로 뜨고, 통합로그인을 거쳐 들어오면 메뉴바만 있는 빈 화면이
 * 나온다」까지. 업무 화면은 다음 조각들이 하나씩 옮겨 온다:
 *
 *   조각 1  작업 비용      가장 깨끗하다(견적서 말고 아무도 안 읽는다)
 *   조각 2  내자 정리
 *   조각 3  견적서         목록·휴지통 → 편집 폼 → 엑셀 → 첨부 → 결재 → 인쇄
 *
 * 세션 검증은 상위 레이아웃((app)/layout.tsx)이 한다. 여기서 또 부르지 않는
 * 이유는 이 화면이 아직 사람의 무엇도 읽지 않기 때문이다 — 역할이 필요해지는
 * 화면이 오면 그 화면이 제 손으로 requireSession 을 부른다.
 */
export default function HomePage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-slate-900">PO / 내자</h1>
      <p className="text-sm text-slate-500">
        내자 정리 · 견적서 · 작업 비용 화면은 다음 조각에서 옮겨 옵니다.
      </p>
    </div>
  );
}
