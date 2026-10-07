"use client";

import { useState, type ComponentProps } from "react";
import Link from "next/link";

import QuoteListScreen from "@dss/core/ui/quotes/QuoteListScreen";
import type { QuoteListItem } from "@dss/core/ui/quotes/quote-list-rows";
import { buildRepairCaseUrl } from "@/lib/domain/as-app-link";
import {
  QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE,
  canRenderQuoteDocument,
} from "@/lib/domain/quote-document-support";
import NewQuoteDialog from "./NewQuoteDialog";
import QuoteArchiveExcelOpenButton from "./QuoteArchiveExcelOpenButton";
import { QuoteFileBadges } from "./QuoteAttachmentParts";

/**
 * ============================================================================
 * 🔴 목록 화면의 **함수 슬롯**은 여기서 건다 — 서버에서는 못 건넨다
 * ============================================================================
 * 조각 3b-1 에서 `rowHref`(줄을 눌러 여는 곳)를 채우려고 `page.tsx` 에서 곧바로
 * 넘겼더니 화면이 이 오류로 통째로 죽었다(2026-09-21 눈 확인에서 잡았다):
 *
 *     Functions cannot be passed directly to Client Components unless you
 *     explicitly expose it by marking it with "use server".
 *
 * `page.tsx` 는 **서버 컴포넌트**이고 목록 화면은 `"use client"` 다. 그 경계를
 * 넘는 값은 직렬화되어야 하는데 **평범한 함수는 직렬화되지 않는다.** 휴지통
 * 액션 셋이 그대로 넘어가는 것은 그것이 **서버 액션**(`"use server"`)이라서다 —
 * 같은 「함수」처럼 보이지만 전혀 다른 물건이다.
 *
 * 🔴 **`tsc` 도 `lint` 도 이것을 잡지 못한다.** 타입으로는 맞고, 브라우저에서
 * 화면을 열어야 드러난다. 그래서 이 파일이 있다.
 *
 * ── 🔴 뒤 조각들도 여기로 온다 ──────────────────────────────────────────
 * 화면의 슬롯 일곱 중 **함수 넷**이 전부 이 경계에 걸린다:
 *
 *     rowHref           줄을 눌러 여는 곳            ← 조각 3b-1 (아래, 채웠다)
 *     intakeHref        인수번호를 눌러 가는 곳       ← 🔴 **조각 PO 3i** (아래, 채웠다)
 *                                                     2026-09-28. 「← 조각 4·5」라고
 *                                                     적혀 있던 자리다 — 저쪽(A/S)의
 *                                                     기준 주소를 **설정으로** 받게
 *                                                     되면서 그때가 앞당겨졌다
 *                                                     (env.ts 의 asAppBaseUrl)
 *     renderFileBadges  줄의 파일 딱지               ← 조각 3c-2 (아래, 채웠다)
 *                                                     딱지 셋이 다 붙는다(3d-0) —
 *                                                     엑셀 전용 · 결재 PDF · 엑셀 없음.
 *                                                     🔴 **줄을 통째로 넘긴다** — 세는
 *                                                     값(hasSignedPdf · hasExcel)은
 *                                                     목록 조회가 이미 싣고, 두 사이트가
 *                                                     같은 attachments 표를 보므로
 *                                                     A/S 에서 붙인 파일이 그대로 잡힌다
 *     renderRowActions  줄의 [미리보기 · PDF]·       ← 조각 3c-2 (아래, 채웠다)
 *                       [Excel 보기]                  미리보기는 3f 에 더한다
 *                                                     ⚠️ 🔴 **3f 는 여기 안 더했다**
 *                                                     (2026-09-28) — 까닭 둘이 아래
 *                                                     `renderRowActions` 자리에 있다.
 *                                                     화면은 지금 [받기] 하나 그대로다
 *                                                     ⚠️ 🔴 **조각 PO 3j 가 더했다**
 *                                                     (2026-09-28 · 사용자 지시).
 *                                                     위 두 줄은 **그때의 기록**이다 —
 *                                                     줄마다 [미리보기 · PDF]가 서고,
 *                                                     차례는 미리보기 → 받기다
 *                                                     (삭제는 화면이 그 뒤에 붙인다)
 *                                                     ⚠️ 🔴 **2026-10-07 에 받기가
 *                                                     빠지고 [Excel 보기]가 들어왔다**
 *                                                     — 아래 머리말이 까닭이다
 *
 * 🔴 **남은 하나(`intakeHref`)도 `page.tsx` 가 아니라 여기에 건다.** 저기서 넘기면
 * 화면이 똑같이 죽는다. 남은 셋(`newQuoteControl` · `notice` 는 ReactNode,
 * `emptyMessage` 는 글자)은 서버에서 넘겨도 된다 — 지금처럼 `page.tsx` 에 둔다.
 *
 * ── 🔴 **채웠다** (2026-09-28 · 조각 PO 3i) ──────────────────────────────
 * 위 문단은 **그때의 기록이라 그대로 둔다.** 그날이 왔고, 적힌 대로 했다 —
 * `intakeHref` 는 **여기서** 건다. 다만 그 주소에 필요한 것(A/S 의 기준 주소)은
 * **설정값**이라 서버만 안다. 그래서 `page.tsx` 가 그 **글자**를 프롭으로 내려보내고
 * (글자는 경계를 넘어도 된다) 주소를 **짓는 함수**는 여기서 얹는다. 짓는 규칙은
 * `lib/domain/as-app-link.ts` 한 벌이고, 내자 정리 화면이 같은 함수를 쓴다.
 *
 * 🔴 **`newQuoteControl` 은 그대로 `page.tsx` 가 넘기지만, 그 안의 조각은 여기 있다**
 * (조각 3e-3 의 `NewQuoteControl` — 아래). 슬롯이 ReactNode 라 서버 경계를 넘는 것은
 * 그대로이고, **창을 여닫는 상태**를 서버 컴포넌트가 들 수 없어서 조각만 이쪽으로 왔다.
 *
 * ── 🔴 이 조각은 자료를 모른다 ──────────────────────────────────────────
 * 받은 프롭을 그대로 흘려보내고 **함수 슬롯만 얹는다.** 조회도 권한 판정도
 * `page.tsx` 가 하고(서버), 저장은 서버 액션이 세션부터 다시 본다. 여기서 보는
 * `canEdit` 은 **링크를 걸지 말지**를 정할 뿐이다 — 관문이 아니다.
 *
 * 🔴 **서브모듈(vendor/dss-core)은 손대지 않는다.** 그 화면은 A/S 의 수리 건
 * 상세 [견적서] 탭도 쓰게 될 한 벌이고, 사이트마다 다른 주소를 그 안에 적으면
 * 「한 벌」이 깨진다(설계서 F절 5번 · 그쪽 README 4절).
 * ============================================================================
 */

/**
 * ============================================================================
 * 🔴 줄마다의 [견적서 받기]는 **없앴다** — 받는 곳은 공유폴더 하나다 (2026-10-07)
 * ============================================================================
 * 사용자 지시(2026-10-07): 「견적서 목록에 [Excel 보기]를 넣고 [견적서 받기]를 뺀다.」
 * A/S 가 2026-10-06 에 똑같이 했고(저쪽 `QuoteListScreen.tsx` 의
 * `DocumentUnsupportedNote` 머리말 — 「받기가 있던 자리」), 이 조각이 그것을 이 사이트로
 * 가져온 것이다.
 *
 * ── 🔴 무엇이 사라졌나 ──────────────────────────────────────────────────
 * 이 자리에는 조각 셋이 있었고 **셋 다 글자가 「견적서 받기」였다.** 셋이 함께 빠졌다:
 *  · `QuoteDownloadLink` — 받을 수 있는 줄의 평범한 링크(`GET /api/quotes/{id}/xlsx`)
 *  · `UnavailableDownload` — 앱 양식이 없는 종류의 **꺼진 단추**(그 자리를 아래
 *    `DocumentUnsupportedNote` 가 잇는다 — 저쪽과 같은 조각 · 같은 이름이다)
 *  · `ExcelMissingDownload` — 엑셀 전용인데 붙인 엑셀이 없는 줄의 **알림 팝업 단추**
 *    (조각 3d-5). 🔴 그 팝업이 말하던 사실(「붙은 엑셀이 없다」)은 **왼쪽 칸의 호박색
 *    「엑셀 없음」 딱지가 그대로 말한다** — `renderFileBadges` 는 한 글자도 안 바뀌었다.
 * 🔴 함께 쓰이던 상자 모양 상수(`ROW_ACTION_CLASS`)도 쓰는 데가 없어져 빠졌다.
 *
 * ── 🔴 받는 길이 사라진 것이 아니다 ────────────────────────────────────
 * 없앤 것은 **목록 줄의 단추 하나**다. 이 사이트에서 견적서 파일을 받는 길은 그대로 넷이다:
 *  ① 🔴 **줄의 [Excel 보기]** (이 조각이 세웠다) — 공유폴더에 저장된 그 엑셀을 이 PC 의
 *     엑셀로 연다
 *  ② **견적서 수정 화면 머리의 [폴더 열기]** — 그 견적서의 공유폴더를 탐색기로 연다
 *     (QuoteFolderOpenButton — 견적서 ④b)
 *  ③ **견적서 수정 화면 머리의 [견적서 받기]** — 그대로다(QuoteIssueButton — 조각 3c-3).
 *     🔴 이 조각은 **목록만** 건드렸다
 *  ④ **인쇄 미리보기 화면의 [견적서 받기]** — 그대로다(QuotePrintView)
 * 🔴 **통로(`GET /api/quotes/{id}/xlsx`)도 그대로 살아 있다** — 화면 한 자리에서만 뗐다.
 *
 * ── 🔴 왜 곁말 한 조각은 남는가 ─────────────────────────────────────────
 * 앱 양식이 없는 종류는 [미리보기 · PDF]도 그리지 않으므로([미리보기]가 그 조건에서
 * `null` 이다) 그 줄의 단추 칸이 **통째로 비어** 「왜 이 줄만 아무것도 없지」가 된다.
 * 저쪽이 같은 까닭으로 곁말 한 조각을 남겼고, 이쪽도 같게 둔다.
 * ============================================================================
 */

/**
 * 앱 양식이 아직 없는 종류의 곁말 — 🔴 **내려받기 링크는 없앴다**(2026-10-07).
 *
 * 🔴 저쪽(A/S `QuoteListScreen.tsx` 의 `DocumentUnsupportedNote` — 2026-10-07 실측)과
 * **한 글자까지 같다.** 문장은 통로 · 미리보기 화면 · 편집 화면과 **같은 하나**다
 * (domain/quote-document-support.ts).
 *
 * 🔴 **지금 이 갈래에 걸리는 종류는 없다**(내자 · OH · 케이블이 모두 열려 있다). 그래도
 * 자리를 만들어 두는 것은, 종류가 하나 더 생기는 날 그 줄이 말없이 비지 않게 하기
 * 위해서다 — 옛 `UnavailableDownload` 가 지키던 자리를 이것이 잇는다.
 */
function DocumentUnsupportedNote({ row }: { row: QuoteListItem }) {
  if (canRenderQuoteDocument(row)) return null;
  return (
    <span
      title={QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE}
      className="text-xs text-zinc-400 dark:text-zinc-500"
    >
      —
    </span>
  );
}

/**
 * ============================================================================
 * 🔴 줄마다의 [미리보기 · PDF] — **링크 한 줄** (조각 PO 3j)
 * ============================================================================
 * A/S 의 같은 자리(`QuoteListScreen.tsx` 의 `PreviewLink` — 2026-09-28 실측)를 그대로
 * 옮겼다. 🔴 **다른 것은 `href` 하나뿐**이다 — 글자도 상자 모양(className)도 한 글자까지
 * 같다. 두 화면을 나란히 놓고 보는 사람에게 같아 보여야 한다는 것이 사용자 지시였다.
 *
 * 🔴 **주소는 `/quotes/{row.id}/print` 한 줄이다.** 저쪽은 `quotePrintHref({ quoteId,
 * repairCaseId })` 로 짓는데 그것은 **수리 건을 싣는 함수**이고, 이 사이트에는 그 몫이
 * 없다(조각 3e-3 이 quote-new-link.ts 의 Ⓐ 를 일부러 뺐다). 베껴 오면 「돌아가기는
 * 시스템을 건너가지 않는다」(2026-09-28 원칙)가 깨지고, 실린 수리 건은 이 사이트에 아예
 * 없는 화면으로 사람을 보낸다. 그래서 미리보기의 돌아가기는 **언제나 그 견적서**다
 * (`quotes/[id]/print/page.tsx` 의 `backHref` — 그 파일 머리말 ③).
 *
 * 🔴 **`dark:` 스타일을 지우지 않는다.** 이 사이트에 다크 모드가 없어 아무것도 안 켜지지만,
 * 지우면 A/S 와 같은 모양이 깨진다(2026-09-28 사용자 결정).
 *
 * 🔴 **앱 양식이 없는 종류에는 아예 안 선다**(`null`). 그 줄에는 위 `DocumentUnsupportedNote`
 * 가 곁말 한 조각을 남긴다 — 미리보기는 조용히 빠지는 자리이고, 「왜 이 줄만 비었나」를
 * 말하는 일은 그 곁말의 몫이다. 저쪽이 그렇게 갈라 두었고, 이쪽도 같게 둔다. 판정은 두
 * 자리가 **같은 함수** 하나를 본다(domain/quote-document-support.ts) — 미리보기 화면도
 * 같은 함수로 거절하므로 화면과 서버가 한 답이다.
 * ============================================================================
 */
function QuotePreviewLink({ row }: { row: QuoteListItem }) {
  if (!canRenderQuoteDocument(row)) return null;
  return (
    <Link
      href={`/quotes/${row.id}/print`}
      className="inline-block rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      미리보기 · PDF
    </Link>
  );
}

/**
 * ============================================================================
 * 🔴 목록 머리의 [새 견적서] — 누르면 **팝업**이 뜬다 (조각 3e-3)
 * ============================================================================
 * 2026-09-22 에는 여기가 `/quotes/new` 로 곧바로 가는 링크 하나였다. 팝업을 미룬 까닭은
 * 「견적서 종류 · 엑셀 전용」을 고르는 그 창이 **엑셀 읽기와 첨부 사슬**을 통째로 끌고
 * 오기 때문이었고, 🔴 **그 사슬이 조각 3e-1·3e-2 로 다 왔다.** 그래서 이 조각이 팝업을
 * 세운다 — 누르면 창이 뜨고, [만들기]가 고른 두 값을 주소에 실어 작성 화면을 연다.
 *
 * 🔴 **`page.tsx`(서버)가 아니라 여기(클라이언트)에 둔다.** 창을 여닫는 것은 상태이고,
 * 서버 컴포넌트는 상태를 들 수 없다. `newQuoteControl` 슬롯 자체는 ReactNode 라 서버에서
 * 넘어가도 되므로 **page.tsx 가 이 조각을 그려 넘긴다** — 주소(`/quotes/new`)를 아는
 * 곳은 그대로 page.tsx 한 곳이다.
 *
 * 🔴 **서브모듈(vendor/dss-core)은 손대지 않는다.** A/S 는 같은 일을 그 화면 **안**에서
 * 하지만(저쪽 QuoteListScreen.tsx 의 `isNewQuoteDialogOpen`), 이 사이트의 그 화면은 두
 * 사이트가 함께 쓰는 한 벌이라 팝업을 그 안에 박을 수 없다. 그 화면이 `newQuoteControl`
 * 을 ReactNode 슬롯으로 열어 둔 것이 바로 이 자리다(그 파일의 그 프롭 머리말 — 「단추와
 * 그것이 여는 팝업의 상태는 **넣는 쪽이 소유한다**」).
 *
 * 🔴 **사이트를 건너가는 주소를 짓지 않는다**(2026-09-28 사용자 원칙). `baseHref` 는 늘
 * 이 사이트의 `/quotes/new` 이고, 저장 뒤에도 이 사이트의 견적서 목록으로 나간다.
 * ============================================================================
 */
export function NewQuoteControl({ baseHref }: { baseHref: string }) {
  const [isNewQuoteDialogOpen, setIsNewQuoteDialogOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setIsNewQuoteDialogOpen(true)}
        aria-haspopup="dialog"
        className="rounded-md bg-primary-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 dark:bg-primary-100 dark:text-zinc-900 dark:hover:bg-primary-300"
      >
        새 견적서
      </button>
      {/* 열려 있는 동안만 그린다 — 열 때마다 기본 선택(내자 · 엑셀 전용 아님)으로 돌아온다.
          모달 창은 화면 맨 위 층에 뜨므로 이 자리의 배치에 끼어들지 않는다. */}
      {isNewQuoteDialogOpen && (
        <NewQuoteDialog baseHref={baseHref} onCancel={() => setIsNewQuoteDialogOpen(false)} />
      )}
    </>
  );
}

/** 화면이 받는 프롭에서 **이 조각이 채우는 함수 슬롯**만 뺀 나머지. */
type PassThroughProps = Omit<
  ComponentProps<typeof QuoteListScreen>,
  "rowHref" | "intakeHref" | "renderFileBadges" | "renderRowActions"
>;

/**
 * 🔴 조각 PO 3i — 화면이 받지 않는 값 하나를 **이 조각이** 받는다.
 *
 * `asAppBaseUrl` 은 A/S 관리 시스템(3000)의 기준 주소다. 서버(page.tsx)가 설정에서
 * 읽어 내려보내고, 아래 `intakeHref` 가 그것으로 주소를 짓는다. 🔴 **서브모듈 화면에
 * 넘기지 않는다** — 그 화면은 두 사이트가 함께 쓰는 한 벌이라 사이트마다의 주소를
 * 알면 안 되고(그래서 슬롯이 함수다), 그래서 아래에서 `{...rest}` 로 갈라 보낸다.
 */
type QuoteListSlotsProps = PassThroughProps & { asAppBaseUrl: string | null };

export default function QuoteListSlots({ asAppBaseUrl, ...props }: QuoteListSlotsProps) {
  return (
    <QuoteListScreen
      {...props}
      /**
       * 🔴 조각 3b-1 — **줄을 누르면 편집 폼이 열린다.**
       *
       * 고칠 수 없는 사람에게는 링크를 걸지 않는다(null → 화면이 글자로 그린다).
       * 그 주소(`/quotes/[id]`)가 쓰기 권한자만 들여보내고 목록으로 되돌리므로,
       * 눌러서 되돌려지는 링크를 내미는 것은 「왜 안 되지」가 되기 때문이다.
       *
       * 🔴 **그것은 관문이 아니다.** 실제 저장은 `updateQuoteAction` 이 세션부터
       * 다시 확인한다 — 링크를 감추는 것으로 막았다고 여기면, 주소를 직접 여는
       * 요청 앞에서 아무것도 막지 못한다.
       */
      rowHref={(row) => (props.canEdit ? `/quotes/${row.id}` : null)}
      /**
       * 🔴 조각 PO 3i — **인수번호를 누르면 A/S 의 수리 건 상세로 간다.**
       *
       * ⚠️ 이 슬롯은 2026-09-28 까지 **비어 있었다.** 까닭은 「수리 건 상세는 A/S 의
       * 화면인데 그 주소를 이 사이트가 알 길이 없다」였고, 이제 설정으로 받는다
       * (`AS_APP_BASE_URL` — env.ts). 비워 두는 동안 화면은 인수번호를 글자로 그렸고
       * (서브모듈의 `IntakeLink`), **지금도 주소를 못 만들면 똑같이 글자다.**
       *
       * 🔴 못 만드는 갈래 둘 — 설정이 없거나 값이 엉뚱할 때, 그 줄에 수리 건 연결이
       * 없을 때. 둘 다 `buildRepairCaseUrl` 이 null 로 답하고 화면이 글자로 그린다
       * (domain/as-app-link.ts). 내자 정리 화면이 **같은 함수**를 쓴다 — 두 벌이 되면
       * 한쪽만 고쳐지는 날이 온다.
       *
       * 🔴 `row.repairCaseId` 가 없는 줄에는 화면이 이 함수를 부르지도 않는다(그쪽이
       * 먼저 「연결된 접수 건이 없습니다」로 그린다). `?? ""` 는 그 약속이 바뀌어도
       * 링크를 짓지 않게 하는 빗장이다.
       *
       * ⚠️ 서브모듈의 `IntakeLink` 는 이 주소를 `next/link` 로 그린다. **다른 사이트
       * 주소라도 괜찮다** — Next 는 바깥 주소면 가로채지 않고 브라우저에 맡긴다
       * (node_modules/next/dist/client/app-dir/link.js 의 `isLocalURL` 갈래 — 실측
       * 2026-09-28). 같은 탭에서 열리고, 이는 A/S 의 같은 링크와 같은 동작이다.
       * 🔴 그래서 **서브모듈은 손대지 않는다.**
       */
      intakeHref={(row) => buildRepairCaseUrl(asAppBaseUrl, row.repairCaseId ?? "")}
      /**
       * 🔴 조각 3c-2 — **줄마다 [견적서 받기] 링크가 선다.**
       *
       * 갈래 셋(양식 없는 종류 · 엑셀 전용 · 받기 링크)은 위 `QuoteDownloadLink` 에
       * 있다. 여기서 `canEdit` 을 보지 않는 것은 그 통로의 문턱이 READ 라서다 —
       * 수정 권한자도 같은 링크로 받는다.
       *
       * 🔴 [미리보기](3f) · 발행 단추(3c-3)는 아직 없다. 그 둘이 오면 이 한 자리에
       * 나란히 선다(화면 쪽 슬롯은 하나다 — 서브모듈은 그때도 손대지 않는다).
       *
       * ⚠️ 위 줄은 **그때의 기록**이고, 🔴 **두 조각 다 여기에는 안 섰다.**
       *  · **발행 단추(3c-3)** — 그 조각이 목록을 링크로 두기로 했다. 이 통로의 문턱은
       *    READ 이고, 목록에서 누르는 것으로 사람의 서류함(공유폴더)이 바뀌면 안 된다.
       *  · **[미리보기](3f, 2026-09-28)** — 🔴 **일부러 안 세웠다.** 미리보기 화면 자체는
       *    이 조각이 세웠고(`/quotes/{id}/print`) 편집 화면에 단추도 섰다. 여기 안 세운
       *    까닭 둘:
       *      ① 저쪽의 그 링크(`QuoteListScreen.tsx` 의 `PreviewLink`)는 주소를
       *         `quotePrintHref({ quoteId, repairCaseId })` 로 짓는다 — **수리 건을 싣는
       *         함수**이고 이 사이트에는 그 몫이 없다(조각 3e-3 이 뺐다). 베껴 오면
       *         「돌아가기는 시스템을 건너가지 않는다」(2026-09-28 원칙)가 깨진다.
       *      ② 목록에 단추를 하나 더 세우는 것은 **눈에 보이는 변경**이라 조각 3f 의
       *         지시서 범위 밖이다(그 지시서가 시킨 것은 편집 폼의 단추와 인쇄 화면이다).
       *    🔴 **세우려면 주소는 `/quotes/{row.id}/print` 한 줄이면 된다** — 그 화면이
       *    이제 있고, 돌아가기도 그 견적서로 돌아온다. **사용자 판단을 기다린다.**
       *
       * ── 🔴 **세웠다** (2026-09-28 · 조각 PO 3j — 사용자 지시) ─────────────────
       * 위 문단은 **그때의 기록이라 그대로 둔다.** 그 판단이 나왔다 — 사용자가 두 화면을
       * 나란히 놓고 「A/S 처럼 만들어 달라」고 지시했고, 적혀 있던 그대로 세웠다.
       *  · 🔴 **까닭 ① 은 주소로 풀렸다.** 이 사이트의 링크는 `/quotes/{row.id}/print`
       *    한 줄이고 **수리 건을 싣지 않는다.** 그래서 「돌아가기는 시스템을 건너가지
       *    않는다」가 그대로 지켜진다 — 미리보기의 돌아가기는 언제나 그 견적서다.
       *    저쪽의 `quotePrintHref` 는 **들여오지 않았다**(곁의 시험이 못 박는다).
       *  · 까닭 ② 는 범위 이야기였다 — 3j 의 지시서가 바로 그 범위다.
       *  · **발행 단추(3c-3)** 는 그대로 없다. 위 갈래에 적은 까닭 그대로다.
       *
       * ── 🔴 **받기가 빠지고 [Excel 보기]가 들어왔다** (2026-10-07 · 사용자 지시) ──
       * 위 문단들도 **그때의 기록이라 그대로 둔다.** 2026-10-07 에 이 자리가 다시 바뀌었다 —
       * A/S 가 2026-10-06 에 한 것을 그대로 가져왔다:
       *  · 🔴 **[견적서 받기]가 빠졌다.** 받는 곳을 사내 공유폴더 하나로 모은다는
       *    사용자 결정이다. 없앤 조각 셋과 **남은 받는 길 넷**은 위
       *    `DocumentUnsupportedNote` 머리말에 적었다 — 🔴 **통로도 다른 화면의 받기도
       *    그대로 살아 있다. 이 조각은 목록 한 자리에서만 뗐다.**
       *  · 🔴 **[Excel 보기]가 들어왔다.** 누르면 그 견적서의 공유폴더에서 **번호가 맞는**
       *    엑셀을 찾아 이 PC 의 엑셀로 연다(quote-archive-excel-open.ts). 없으면
       *    「저장된 파일이 없습니다.」라고 그 줄 옆에 적는다.
       *  · 🔴 **[미리보기 · PDF]는 한 글자도 안 건드렸다** — 지시에 없다.
       *
       * 차례는 **[미리보기 · PDF] → [Excel 보기] → 곁말** 이고, [삭제]는 화면이 그 뒤에
       * 붙인다(저쪽의 표 · 카드 두 곳과 같은 차례다 — 2026-10-07 실측).
       * 🔴 조각 셋이 나란히 서야 해서 슬롯이 **조각(fragment)** 을 돌려준다. 화면은 이 한
       * 자리를 **표와 카드 두 곳에 같이 건다**(서브모듈 QuoteListScreen.tsx 의 `QuoteTable`
       * ·`QuoteCardList` — 둘 다 `{renderRowActions?.(row)}` 다음 줄이 [삭제]다). 그래서
       * **서브모듈은 한 글자도 손대지 않았다.**
       */
      renderRowActions={(row) => (
        <>
          <QuotePreviewLink row={row} />
          <QuoteArchiveExcelOpenButton row={row} />
          <DocumentUnsupportedNote row={row} />
        </>
      )}
      /**
       * 🔴 조각 3c-2(눈 확인 뒤) · 3d-0 — **왼쪽 「견적서」 칸의 파일 딱지.**
       *
       * 🔴 **딱지는 셋이다**: 「엑셀 전용」 · 「결재 PDF」 · 「엑셀 없음」. 처음(3c-2)에는
       * 「엑셀 전용」 하나만 붙였다 — 그 값은 `quotes.is_excel_only` 칸이라 첨부를 하나도
       * 보지 않고 알 수 있어 첨부 조각을 기다리지 않았다. 🔴 **2026-09-23(조각 3d-0)에
       * 나머지 둘이 찼다**: 실제로 붙은 파일을 세는 값(`hasSignedPdf` · `hasExcel`)을
       * **목록 조회가 이미 싣고**(db/queries/quotes.ts 의 `loadAttachmentFlagsByQuoteId`),
       * 이 사이트와 A/S 가 **같은 `attachments` 표**를 보므로 붙이는 칸이 오기 전에도
       * 저쪽에서 붙인 파일이 그대로 잡힌다. 🔴 곁의 시험이 셋 전부를 단언한다
       * (quote-list-screen-source.test.ts 의 「딱지는 **셋**이다」).
       *
       * 규칙은 quote-attachment-files.ts 의 `quoteListFileBadges`, 그리는 조각은 A/S 와
       * 같은 이름 · 같은 자리(QuoteAttachmentParts.tsx).
       *
       * 🔴 **2026-10-07 에 이 슬롯이 더 중요해졌다.** 받기가 빠지면서 「엑셀 없음」을
       * 눌러서 알 길(팝업)이 사라졌다 — 이제 그 사실을 말하는 곳은 **이 딱지 하나**다.
       * 🔴 그래서 이 슬롯은 **한 글자도 건드리지 않았다.**
       */
      renderFileBadges={(row) => <QuoteFileBadges row={row} />}
    />
  );
}
