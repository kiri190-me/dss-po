"use client";

import { useState, type ComponentProps } from "react";

import QuoteListScreen from "@dss/core/ui/quotes/QuoteListScreen";
import type { QuoteListItem } from "@dss/core/ui/quotes/quote-list-rows";
import {
  QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE,
  canRenderQuoteDocument,
} from "@/lib/domain/quote-document-support";
import { NoticePopup } from "@/components/common/NoticePopup";
import { QuoteFileBadges } from "./QuoteAttachmentParts";
import { QUOTE_EXCEL_MISSING_NOTICE } from "./quote-attachment-files";

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
 *     intakeHref        인수번호를 눌러 가는 곳       ← 조각 4·5
 *     renderFileBadges  줄의 파일 딱지               ← 조각 3c-2 (아래, 채웠다)
 *                                                     딱지 셋이 다 붙는다(3d-0) —
 *                                                     엑셀 전용 · 결재 PDF · 엑셀 없음.
 *                                                     🔴 **줄을 통째로 넘긴다** — 세는
 *                                                     값(hasSignedPdf · hasExcel)은
 *                                                     목록 조회가 이미 싣고, 두 사이트가
 *                                                     같은 attachments 표를 보므로
 *                                                     A/S 에서 붙인 파일이 그대로 잡힌다
 *     renderRowActions  줄의 [받기]·[미리보기]        ← 조각 3c-2 (아래, 채웠다)
 *                                                     미리보기는 3f 에 더한다
 *
 * 🔴 **남은 하나(`intakeHref`)도 `page.tsx` 가 아니라 여기에 건다.** 저기서 넘기면
 * 화면이 똑같이 죽는다. 남은 셋(`newQuoteControl` · `notice` 는 ReactNode,
 * `emptyMessage` 는 글자)은 서버에서 넘겨도 된다 — 지금처럼 `page.tsx` 에 둔다.
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
 * 🔴 줄마다의 [견적서 받기] — 평범한 링크 하나, **모든 줄에 같은 자리** (조각 3c-2)
 * ============================================================================
 * 주소(`/api/quotes/{id}/xlsx`)를 그대로 여는 `<a>` 다. `download` 속성도 fetch 도
 * 쓰지 않는다 — **파일 이름은 서버가 Content-Disposition 으로 정한다**
 * (domain/quote-file-name.ts). 클라이언트가 이름을 정하면 목록과 다른 화면에서 서로
 * 다른 이름으로 저장되는 날이 온다.
 *
 * 🔴 **권한으로 갈리지 않는다.** 그 통로의 문턱은 `quotes` READ 라, 목록을 볼 수 있는
 * 사람이면 파일로도 받을 수 있다(라우트 머리말의 '왜 READ 로 충분한가'). A/S 는 수정
 * 권한자에게 여기서 **발행 단추**(공유폴더에 저장하고 첨부 칸을 바꾼다)를 보이는데,
 * 그것은 **조각 3c-3** 의 것이고 3d 뒤로 미뤄져 있다 — 그래서 이 사이트에서는 지금
 * 두 갈래가 같은 링크다.
 *
 * ── 🔴 받을 수 없는 줄에도 **단추 자리를 비우지 않는다** (2026-09-22 눈 확인) ──
 * 처음에는 그 줄에 「엑셀 전용」이라는 곁말을 단추 자리에 넣었는데, 그 글자의 폭이
 * 단추와 달라 **그 두 줄만 [삭제] 가 오른쪽으로 밀려** 목록이 들쭉날쭉해졌다.
 * A/S 는 그렇지 않다 — 그쪽은 파일 딱지를 **왼쪽 「견적서」 칸**에 붙이고 단추 칸은
 * 모든 줄이 똑같다. 그래서 이 사이트도 그렇게 바꿨다:
 *   · 「엑셀 전용」은 왼쪽 칸의 배지로 (아래 `renderFileBadges` 슬롯)
 *   · 받을 수 없는 줄의 단추 자리에는 **꺼진(흐린) [견적서 받기]** 를 둔다
 *
 * 🔴 조각 3d-2 부터 **엑셀 전용 줄은 받을 수 있는 줄**이다 — 붙인 엑셀이 그대로
 * 내려온다. 그래서 꺼진 단추가 남은 갈래는 아래 ① 하나다(지금 걸리는 종류는 없다).
 *
 * ── 🔴 눌렀을 때 날 JSON 이 뜨던 줄 — **팝업으로 말한다** (조각 3d-5) ──
 * 2026-09-23 사용자가 본 것: 엑셀 전용인데 엑셀이 안 붙은 줄의 [견적서 받기]를
 * 눌렀더니 브라우저 창에 거절 JSON 이 날것으로 떴다.
 *
 *     {"error":"엑셀 전용 견적서인데 …","code":"EXCEL_NOT_ATTACHED"}
 *
 * 평범한 `<a>` 라 브라우저가 그 주소로 **이동해** 404 JSON 본문을 그대로 그린 것이고,
 * 목록으로 돌아오려면 뒤로 가기를 눌러야 했다. 사용자 요구는 「우리가 항상 쓰는 팝업
 * 스타일로 알림」이다. 그래서 **그 줄만** `<a>` 대신 단추로 두고, 누르면 팝업이 까닭을
 * 말한다(아래 ②). 🔴 **받을 수 있는 줄은 지금 그대로 `<a>` 다** — 한 글자도 바뀌지
 * 않았다(파일 이름은 서버가 정한다는 규칙이 거기 걸려 있다).
 *
 * 🔴 **fetch 로 먼저 물어보지 않는다.** 목록 줄이 `isExcelOnly` · `hasExcel` 을 이미
 * 싣고 있어(vendor/dss-core 의 `QuoteListItem`) **누르기 전에 안다.** 물어보는 길은
 * 왕복이 두 번인 데다, 물어본 뒤 파일이 지워지면 여전히 JSON 이 뜬다.
 *
 * 🔴 **꺼진 단추로 끝내지 않은 까닭**은 셋이다. ㉠ 꺼진 단추는 눌리지 않아 **팝업이
 * 뜰 수 없다** — 사용자가 요구한 것이 팝업이다. ㉡ 미리 알리는 일은 이미 왼쪽 칸의
 * 호박색 「엑셀 없음」 딱지가 하고 있다. ㉢ 까닭을 말하지 않는 흐린 단추는 「고장」으로
 * 읽힌다(바로 아래 `UnavailableDownload` 머리말이 걱정하던 그것이다).
 *
 * 🔴 **화면이 감춘 것은 경계가 아니다.** 그 갈래들은 눌러서 실패하는 단추를 내밀지
 * 않기 위한 것이고, 같은 판정을 **통로가 다시 한다**(그쪽이 관문이다). 서버는 그대로
 * 404 와 제 문장으로 거절한다 — 이 조각이 온 뒤에도 그 줄은 한 줄도 바뀌지 않았다.
 * ============================================================================
 */

/** 받기 자리의 상자 모양 — 🔴 **켜진 것과 꺼진 것이 같은 값을 쓴다**(칸이 흔들리지 않게). */
const ROW_ACTION_CLASS =
  "inline-block rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300";

/**
 * ============================================================================
 * 붙인 엑셀이 없는 엑셀 전용 줄 — **눌리는 단추**와 알림 팝업 (조각 3d-5)
 * ============================================================================
 * 🔴 **꺼져 있지 않다.** 같은 상자(`ROW_ACTION_CLASS`) · 같은 글자 · 같은 hover 라
 * 칸이 흔들리지 않지만, 눌리고 **눌러야 까닭이 나온다**. 이 줄이 다른 줄과 다르다는
 * 것은 왼쪽 칸의 호박색 「엑셀 없음」 딱지가 먼저 말한다.
 *
 * 🔴 **떠 있는지 아닌지를 이 줄이 들고 있다.** 목록은 줄마다 이 조각을 따로 그리므로
 * (`renderRowActions`), 어느 줄을 눌렀는지 위에서 들고 있을 필요가 없다. 팝업 자체는
 * 최상위 층(`showModal`)에 뜨므로 단추가 표 칸 안에 있어도 화면 가운데에 선다.
 *
 * 🔴 **문장은 딱지와 한 글자다**(quote-attachment-files.ts 의 `QUOTE_EXCEL_MISSING_NOTICE`).
 * 서버 문장(`QUOTE_EXCEL_MISSING_MESSAGE`)을 그대로 보이지 않는 까닭은 그 파일에
 * 적어 두었다 — 그 말은 **이 사이트에 아직 없는 칸**을 가리킨다.
 * ============================================================================
 */
function ExcelMissingDownload() {
  const [noticeOpen, setNoticeOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title={QUOTE_EXCEL_MISSING_NOTICE}
        onClick={() => setNoticeOpen(true)}
        className={`${ROW_ACTION_CLASS} hover:bg-zinc-50 dark:hover:bg-zinc-800`}
      >
        견적서 받기
      </button>
      {noticeOpen && (
        <NoticePopup
          title="내려받을 견적서 파일이 없습니다"
          message={QUOTE_EXCEL_MISSING_NOTICE}
          onClose={() => setNoticeOpen(false)}
        />
      )}
    </>
  );
}

/**
 * 받을 수 없는 줄의 자리 — **꺼진 단추**와 까닭.
 *
 * 흐리게 하고 `title` 에 까닭을 싣는 것은 이 저장소(와 A/S)의 관행이다 — 권한 설정
 * 화면이 「끌 수 없는 칸」을 같은 방식으로 그린다(`disabled:cursor-not-allowed
 * disabled:opacity-50` + title).
 *
 * 🔴 곁말을 **감싼 `<span>` 에도** 다는 까닭: 꺼진 단추는 마우스 사건을 받지 못해 제
 * `title` 을 띄우지 않는 브라우저가 있다(Chrome). 사람이 까닭을 못 읽으면 흐린 단추는
 * 「고장」으로 보인다. 같은 문장을 둘 다에 두어 어느 쪽이 떠도 같은 말이 나오게 한다.
 */
function UnavailableDownload({ reason }: { reason: string }) {
  return (
    <span title={reason} className="inline-block">
      <button
        type="button"
        disabled
        title={reason}
        className={`${ROW_ACTION_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        견적서 받기
      </button>
    </span>
  );
}

function QuoteDownloadLink({ row }: { row: QuoteListItem }) {
  /**
   * ① 앱 양식이 아직 없는 종류 — 꺼진 단추와 까닭.
   *
   * 🔴 **지금 이 갈래에 걸리는 종류는 없다**(내자 · OH · 케이블이 모두 열려 있다 —
   * domain/quote-document-support.ts 의 「할 수 있는 쪽」 목록). 그래도 자리를 만들어
   * 두는 것은, 종류가 하나 더 생기는 날 그 종류를 막아 주는 장치가 이것이기 때문이다
   * (그 파일 머리말 — 「빈 자물쇠가 아니라, 다음 종류를 기다리는 자물쇠」).
   */
  if (!canRenderQuoteDocument(row)) {
    return <UnavailableDownload reason={QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE} />;
  }

  /**
   * ② 🔴 **엑셀 전용인데 붙인 엑셀이 없는 줄** — 눌리는 단추와 팝업 (조각 3d-5).
   *
   * 🔴 재는 것은 **「엑셀 전용」이 아니라 「내줄 파일이 없다」**이다. 엑셀 전용이라는
   * 이유만으로 갈라지면 3d-2 가 연 길(붙인 엑셀을 그대로 내려주는 길)이 도로 막힌다 —
   * 엑셀이 붙은 엑셀 전용 줄은 아래 ③ 의 평범한 링크로 그대로 내려간다.
   *
   * 🔴 이 두 값은 **목록 조회가 이미 싣는다**(db/queries/quotes.ts 의
   * `loadAttachmentFlagsByQuoteId`) — 왼쪽 칸의 「엑셀 없음」 딱지와 **같은 조건**이다
   * (quote-attachment-files.ts 의 `quoteListFileBadges`). 딱지가 붙은 줄과 팝업이 뜨는
   * 줄이 갈리면 사람은 어느 쪽을 믿을지 알 수 없다.
   */
  if (row.isExcelOnly && !row.hasExcel) {
    return <ExcelMissingDownload />;
  }

  /**
   * ③ 🔴 **엑셀 전용 견적서에도 같은 링크가 선다** (조각 3d-2).
   *
   * 2026-09-22(3c-2)에는 이 자리에 「이 사이트에는 내줄 파일이 없다」는 꺼진 단추가
   * 있었다. 그 까닭은 붙인 엑셀을 읽는 길이 없다는 것이었는데, 두 사이트가 **같은
   * `attachments` 표**를 보므로 A/S 에서 붙인 엑셀은 처음부터 여기 있었다. 3d-2 가 그
   * 파일을 읽어 내리는 길을 가져오면서 이 갈래와 그 문장(domain/
   * quote-excel-only-download.ts)이 함께 사라졌다.
   *
   * 🔴 **엑셀이 안 붙은 장은 여기서 가리지 않는다.** 그 사실은 왼쪽 칸의 「엑셀 없음」
   * 딱지가 말하고(quote-attachment-files.ts), 통로는 404 와 사람이 읽는 문장으로
   * 답한다 — 목록 한 줄이 첨부를 세어 단추를 끄는 것보다 그쪽이 한 곳이다.
   */

  return (
    <a
      href={`/api/quotes/${row.id}/xlsx`}
      className={`${ROW_ACTION_CLASS} hover:bg-zinc-50 dark:hover:bg-zinc-800`}
    >
      견적서 받기
    </a>
  );
}

/** 화면이 받는 프롭에서 **이 조각이 채우는 함수 슬롯**만 뺀 나머지. */
type PassThroughProps = Omit<
  ComponentProps<typeof QuoteListScreen>,
  "rowHref" | "intakeHref" | "renderFileBadges" | "renderRowActions"
>;

export default function QuoteListSlots(props: PassThroughProps) {
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
       * 🔴 조각 3c-2 — **줄마다 [견적서 받기] 링크가 선다.**
       *
       * 갈래 셋(양식 없는 종류 · 엑셀 전용 · 받기 링크)은 위 `QuoteDownloadLink` 에
       * 있다. 여기서 `canEdit` 을 보지 않는 것은 그 통로의 문턱이 READ 라서다 —
       * 수정 권한자도 같은 링크로 받는다.
       *
       * 🔴 [미리보기](3f) · 발행 단추(3c-3)는 아직 없다. 그 둘이 오면 이 한 자리에
       * 나란히 선다(화면 쪽 슬롯은 하나다 — 서브모듈은 그때도 손대지 않는다).
       */
      renderRowActions={(row) => <QuoteDownloadLink row={row} />}
      /**
       * 🔴 조각 3c-2(눈 확인 뒤) — **왼쪽 「견적서」 칸의 파일 딱지.**
       *
       * 지금 붙는 것은 **「엑셀 전용」 하나**다. 그 값은 `quotes.is_excel_only` 칸이라
       * 첨부를 하나도 보지 않고 알 수 있다 — 그래서 **첨부 조각(3d)을 기다리지 않는다.**
       * 🔴 나머지 둘(「결재 PDF」 · 「엑셀 없음」)은 실제로 붙은 파일을 세어야 하므로
       * 3d 것으로 남긴다. 규칙은 quote-attachment-files.ts 의 `quoteListFileBadges`,
       * 그리는 조각은 A/S 와 같은 이름 · 같은 자리(QuoteAttachmentParts.tsx).
       *
       * 🔴 이 자리가 **단추 칸이 모든 줄에서 같아지는 까닭**이다 — 받을 수 없는 줄의
       * 표시를 단추 자리에 두면 그 줄만 칸이 밀린다(위 `QuoteDownloadLink` 머리말).
       * 화면(서브모듈)은 이 값을 표와 카드 두 곳에 같이 건다.
       */
      renderFileBadges={(row) => <QuoteFileBadges row={row} />}
    />
  );
}
