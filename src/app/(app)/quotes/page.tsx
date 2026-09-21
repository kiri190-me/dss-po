import type { Metadata } from "next";

import QuoteListScreen from "@dss/core/ui/quotes/QuoteListScreen";
import { requireAreaAccessForCurrentUser } from "@/lib/auth/area-guard";
import { hasPermission } from "@/lib/auth/permission-resolver";
import { listDeletedQuotes, listQuotes } from "@/lib/db/queries/quotes";
import {
  deleteQuoteAction,
  permanentlyDeleteQuoteAction,
  restoreQuoteAction,
} from "@/lib/server/actions/quotes";

export const metadata: Metadata = {
  title: "견적서 | DSS PO / 내자",
};

export const dynamic = "force-dynamic";

/**
 * ============================================================================
 * 견적서 — 목록 · 휴지통 (조각 3a)
 * ============================================================================
 * 이 화면에는 우리가 고객사에 부른 값이 통째로 있다(부품 단가·작업비·합계).
 * 그래서 가드가 메뉴보다 먼저 온다 — 메뉴에서 감추는 것은 막은 것이 아니고,
 * 주소를 직접 입력하거나 예전 링크를 누르면 그대로 들어와진다.
 *
 * 🔴 주소(`/quotes`)와 권한 열쇠(`quotes`)는 A/S 와 **같은 값**이다 — 열쇠를
 * 바꾸면 관리자가 저장해 둔 역할별 접근 권한이 이쪽에서만 초기화되고, 이미 쓰던
 * 링크(저쪽 알림 종의 결재 링크 포함)가 깨진다.
 *
 * ── 🔴 화면은 서브모듈의 것을 쓴다 — 복사본이 아니다 ────────────────────
 * `@dss/core/ui/quotes/QuoteListScreen` 은 **A/S 의 수리 건 상세 [견적서] 탭도
 * 쓰게 될 한 벌**이다(설계서 F절 5번). 복사본을 두면 「금액·요약 줄이 갈라지는
 * 날」이 오고, 그날 사람은 같은 견적서의 다른 금액을 두 화면에서 보게 된다.
 * ⚠️ 조각 4 까지 A/S 는 제 복사본을 계속 쓴다 — 그쪽 README 2절 참조.
 *
 * ── 🔴 이 조각에 아직 없는 것 ───────────────────────────────────────────
 * 화면의 슬롯 여섯 중 **휴지통 액션 하나만** 채운다. 나머지는 그 조각이 오면
 * 여기에 한 줄씩 더한다(화면 파일은 그때 손대지 않는다):
 *
 *   rowHref / newQuoteControl  → 조각 3b (편집 폼). 지금은 수정 화면이 없어
 *                                요약 줄이 **링크가 아니라 글자**로 그려진다.
 *   renderRowActions           → 조각 3c·3f ([견적서 받기] · [미리보기 · PDF])
 *   renderFileBadges           → 조각 3d (첨부)
 *   notice                     → 조각 3c (받기 결과 알림)
 *   intakeHref                 → 🔴 수리 건 상세는 **A/S 의 화면**이다. 사이트를
 *                                건너가는 주소를 이 사이트가 지어내지 않는다 —
 *                                그 주소를 어디서 얻을지는 배포 설정의 일이고,
 *                                조각 4·5 에서 정한다. 지금은 인수번호가 글자로
 *                                보인다(값은 그대로 보이고, 누를 수만 없다).
 *
 * ── canEdit 은 관문이 아니다 ────────────────────────────────────────────
 * 지금은 [새 견적서] 자리를 그릴지만 정하는데, 그 자리에 넣을 것이 아직 없어
 * 아무것도 그려지지 않는다. 실제 저장·삭제는 서버 액션이 세션부터 다시 확인한다 —
 * 단추를 감추는 것으로 막았다고 여기면, 액션을 직접 부르는 요청 앞에서 아무것도
 * 막지 못한다.
 * ============================================================================
 */
export default async function QuotesPage() {
  // 🔴 이 한 줄이 셋을 한다: 통합로그인(가려던 주소를 실어서) · 살아 있는 계정
  // 다시 읽기 · quotes 읽기 권한. 돌려받은 사람으로 곧이어 두 가지를 더 묻는다 —
  // 세션을 여러 번 읽으면 그 사이에 값이 갈릴 자리가 생긴다.
  const user = await requireAreaAccessForCurrentUser("quotes");

  // 역할 정책과 관리자 설정을 한 창구로 본다(permission-resolver.ts) — 서버 액션이
  // 쓰는 것과 같은 관문이라 화면과 저장 가부가 어긋나지 않는다.
  const [canEdit, canDelete] = await Promise.all([
    hasPermission(user, "quotes", "WRITE"),
    hasPermission(user, "quotes", "MANAGE"),
  ]);

  // 휴지통을 못 여는 사람에게는 그 내용을 읽지도 내려보내지도 않는다 — 쓰지 않을
  // 값을 클라이언트로 실어 보내지 않는다(내자 정리 화면과 같은 규칙).
  const [rows, trashRows] = await Promise.all([
    listQuotes(),
    canDelete ? listDeletedQuotes() : Promise.resolve([]),
  ]);

  return (
    <QuoteListScreen
      rows={rows}
      trashRows={trashRows}
      canEdit={canEdit}
      canDelete={canDelete}
      trashActions={{
        deleteQuote: deleteQuoteAction,
        restoreQuote: restoreQuoteAction,
        permanentlyDeleteQuote: permanentlyDeleteQuoteAction,
      }}
    />
  );
}
