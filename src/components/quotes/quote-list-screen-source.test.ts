import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * ============================================================================
 * 견적서 목록 — 🔴 **한 벌인가**, 그리고 휴지통의 약속이 지켜지는가
 * ============================================================================
 * 이 조각(3a)이 지키려는 것은 둘이다.
 *
 *  1. 🔴 **화면이 한 벌이다.** 목록은 `vendor/dss-core` 의 것을 쓴다 — 이 사이트에
 *     복사본을 두면 A/S 의 수리 건 상세 [견적서] 탭과 「금액·요약 줄이 갈라지는
 *     날」이 온다(설계서 F절 5번). 아래 첫 묶음이 그 복사본이 생기지 않았는지 본다.
 *
 *  2. **휴지통의 약속.** 만료 배지 · [완전 삭제] · 보관 문구 · 관문(quotes MANAGE) ·
 *     빈 사유 막기. 자료의 규칙은 A/S 의 통합 시험이 실제 DB 로 보고
 *     (저쪽 `mutations/quote-trash.integration.test.ts`, 이 저장소에는 시험용 DB
 *     장치가 없어 옮기지 않았다), 여기서 지키는 것은 **화면과 액션 쪽 약속**이다.
 *
 * ── 왜 렌더하지 않고 원본을 읽는가 ──────────────────────────────────────
 * 목록은 **서버 액션을 프롭으로 받는 클라이언트 컴포넌트**이고 page.tsx 는 그
 * 사슬 끝에 `server-only` 를 단다 — react-server 조건 없이 도는 이 러너에서는
 * import 자체가 던진다. 게다가 카드는 정적 렌더로 그려지지 않는다(표가 먼저
 * 나온다). 그래서 A/S 의 같은 시험(QuoteListScreen.test.ts)과 같은 방법으로
 * 원본을 글자로 읽는다.
 * ============================================================================
 */

const repoUrl = new URL("../../../", import.meta.url);
/** CRLF 로 받아 둔 저장소에서도 아래 줄바꿈 표지가 맞도록 LF 로 맞춘다. */
const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, repoUrl), "utf8").replace(/\r\n/g, "\n");
/** 줄바꿈·들여쓰기 차이로 시험이 깨지지 않도록 공백을 하나로 접는다. */
const flat = (source: string) => source.replace(/\s+/g, " ");

/**
 * 주석을 뺀 코드.
 *
 * 🔴 「가져오지 않았는지」를 재는 단언에 필요하다 — 이 저장소의 머리말들은 **아직 오지
 * 않은 조각의 파일 이름**을 그대로 적어 두고 「여기에는 없다」고 설명한다(예:
 * quote-attachment-files.ts 의 「이 저장소에는 아직 `queries/attachments.ts` 도 없다」).
 * 원본을 그대로 훑으면 그 설명이 금지 낱말로 걸려, 시험이 주석을 고치라고 요구하게 된다.
 */
const codeOf = (source: string) =>
  flat(source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " "));

/** 원본에서 **한 갈래만** 잘라낸다 — 파일 전체에 정규식을 걸면 이웃 갈래에 걸린다. */
const sliceBetween = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `원본에서 '${startMarker}' 를 찾지 못했다`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `원본에서 '${endMarker}' 를 찾지 못했다`);
  return source.slice(start, end);
};

const SCREEN_PATH = "vendor/dss-core/src/ui/quotes/QuoteListScreen.tsx";
const listSource = read(SCREEN_PATH);
const pageSource = read("src/app/(app)/quotes/page.tsx");
const newPageSource = read("src/app/(app)/quotes/new/page.tsx");
const slotsSource = read("src/components/quotes/QuoteListSlots.tsx");
/** 목록 딱지의 규칙과 그리는 조각 — 🔴 A/S 와 같은 이름 · 같은 자리다(조각 3c-2 · 3d). */
const filesSource = read("src/components/quotes/quote-attachment-files.ts");
const partsSource = read("src/components/quotes/QuoteAttachmentParts.tsx");
/**
 * 🔴 조각 3d-4 — 「엑셀 없음」 문장이 가리키는 **붙이는 칸**이 실제로 서는지 보는 셋.
 * 그 문장을 A/S 말로 되돌리면서 옛 단언(「견적서 수정 화면」 금지)을 지웠고, 그 자리를
 * 이 셋이 메운다(아래 3d-5 묶음의 마지막 시험).
 */
const sectionSource = read("src/components/quotes/QuoteAttachmentsSection.tsx");
const editFormSource = read("src/components/quotes/QuoteEditForm.tsx");
const detailPageSource = read("src/app/(app)/quotes/[id]/page.tsx");
/** 🔴 조각 3d-5 — 받을 수 없는 줄이 띄우는 알림 팝업(공용 자리 · A/S 로 그대로 옮길 수 있게). */
const popupSource = read("src/components/common/NoticePopup.tsx");
const actionSource = read("src/lib/server/actions/quotes.ts");
const dialogsSource = read("vendor/dss-core/src/ui/common/master-data-trash-dialogs.tsx");

/**
 * 🔴 화면 조각이 **값으로 끌면 안 되는** 첨부 사슬 넷. 왜 막는지와 누가 무엇을 풀었는지는
 * 아래 「딱지는 셋이다」 시험 안의 곁말에 있다(조각 3d-0 이 세웠고 3d-3d 가 두 칸을 풀었다).
 */
const ATTACHMENT_CHAINS = [
  "queries/attachments",
  "attachment-allowlist",
  "attachment-path",
  "storage-adapter",
] as const;

describe("🔴 화면은 한 벌이다 — 이 사이트에 복사본을 두지 않는다", () => {
  test("목록 화면은 서브모듈(vendor/dss-core)에서 들여온다", () => {
    assert.ok(
      slotsSource.includes('from "@dss/core/ui/quotes/QuoteListScreen"'),
      "QuoteListSlots 가 서브모듈의 목록 화면을 쓰지 않는다"
    );
    assert.ok(
      pageSource.includes('from "@/components/quotes/QuoteListSlots"'),
      "page.tsx 가 함수 슬롯을 거는 클라이언트 조각을 쓰지 않는다"
    );
  });

  test("🔴 이 저장소에 같은 화면의 복사본이 없다", () => {
    // 복사본이 생기는 날, 두 화면은 조용히 갈라지기 시작한다 — 그리고 그 차이는
    // 「같은 견적서의 다른 금액」으로 한참 뒤에 드러난다.
    for (const copy of [
      "src/components/quotes/QuoteListScreen.tsx",
      "src/components/common/responsive-list.tsx",
      "src/components/common/master-data-trash-dialogs.tsx",
      "src/components/common/master-data-trash-retention-badge.tsx",
    ]) {
      assert.equal(
        existsSync(fileURLToPath(new URL(copy, repoUrl))),
        false,
        `${copy} — 서브모듈로 옮긴 파일의 복사본이 남아 있다`
      );
    }
  });

  test("🔴 서브모듈의 화면은 사이트 별칭(@/…)을 쓰지 않는다", () => {
    // 별칭은 가져다 쓰는 사이트마다 다르게 설정돼 있다. 한 줄이라도 섞이면 다른
    // 사이트(A/S — 조각 4)가 이 화면을 쓰는 날 그쪽에서만 깨진다.
    assert.equal(/from "@\//.test(listSource), false, "서브모듈 화면에 @/ 별칭 import 가 있다");
  });
});

/**
 * ============================================================================
 * 🔴 함수 슬롯은 **서버 컴포넌트에서 못 건넨다** (2026-09-21 눈 확인에서 잡았다)
 * ============================================================================
 * 조각 3b-1 이 `rowHref` 를 page.tsx 에서 곧바로 넘겼더니 화면이 통째로 죽었다 —
 * "Functions cannot be passed directly to Client Components…". page.tsx 는 서버
 * 컴포넌트이고 목록 화면은 `"use client"` 라, 그 경계를 넘는 값은 직렬화되어야
 * 한다. 휴지통 액션은 **서버 액션**이라 넘어간다(같은 「함수」가 아니다).
 *
 * 🔴 **tsc 도 lint 도 이것을 잡지 못한다.** 그래서 여기서 글자로 본다 — 뒤 조각
 * 셋(`intakeHref` · `renderFileBadges` · `renderRowActions`)이 똑같이 걸린다.
 * ============================================================================
 */
describe("🔴 함수 슬롯은 클라이언트 조각(QuoteListSlots)이 건다", () => {
  test("QuoteListSlots 가 \"use client\" 다 — 아니면 함수를 걸 수 없다", () => {
    assert.ok(slotsSource.startsWith('"use client";'), "첫 줄이 \"use client\" 가 아니다");
  });

  test("🔴 page.tsx 는 함수 슬롯 넷을 하나도 넘기지 않는다 — 넘기면 화면이 죽는다", () => {
    const call = flat(sliceBetween(pageSource, "<QuoteListSlots", "/>\n  );"));
    for (const slot of ["rowHref=", "intakeHref=", "renderFileBadges=", "renderRowActions="]) {
      assert.equal(
        call.includes(slot),
        false,
        `${slot} — 서버 컴포넌트에서 함수를 넘기고 있다. QuoteListSlots 에 걸 것`
      );
    }
  });
});

describe("조각 3a·3b-1 이 채우는 것과 비워 두는 것", () => {
  test("page.tsx 는 휴지통 액션 셋을 넘긴다 — 화면은 DB 를 모른다", () => {
    const call = flat(sliceBetween(pageSource, "<QuoteListSlots", "/>\n  );"));
    assert.ok(call.includes("deleteQuote: deleteQuoteAction"), "휴지통 보내기 액션이 넘어가지 않는다");
    assert.ok(call.includes("restoreQuote: restoreQuoteAction"), "되살리기 액션이 넘어가지 않는다");
    assert.ok(
      call.includes("permanentlyDeleteQuote: permanentlyDeleteQuoteAction"),
      "완전 삭제 액션이 넘어가지 않는다"
    );
  });

  test("🔴 조각 3b-1 — 줄을 누르면 편집 폼으로 간다. 고칠 수 없는 사람에게는 링크가 없다", () => {
    // 🔴 주소를 이 사이트가 지어낸다 — 화면(서브모듈)은 사이트마다의 주소를 모른다.
    assert.ok(
      flat(slotsSource).includes("rowHref={(row) => (props.canEdit ? `/quotes/${row.id}` : null)}"),
      "줄 링크 슬롯이 채워지지 않았거나 모양이 다르다"
    );
    // 🔴 그 주소에 실제로 화면이 있어야 한다 — 없는 곳으로 보내는 링크는 3a 가 막던 그것이다.
    assert.equal(
      existsSync(fileURLToPath(new URL("src/app/(app)/quotes/[id]/page.tsx", repoUrl))),
      true,
      "줄 링크가 가리키는 수정 화면이 없다"
    );
  });

  test("🔴 조각 3e-3 — [새 견적서] 를 누르면 **팝업**이 뜨고, [만들기]가 작성 화면으로 간다", () => {
    // ⚠️ 이 시험의 이름은 2026-09-22 까지 「**팝업을 거치지 않는다**」였다(조각 3b-2).
    //    그것은 **그때의 기록**이다 — 팝업을 미룬 까닭이 그 창의 엑셀 전용 스위치가
    //    엑셀 읽기 · 첨부 사슬을 통째로 끌고 오는 것이었고, 🔴 **그 사슬이 조각
    //    3e-1·3e-2 로 다 왔다.** 그래서 3e-3 이 팝업을 세웠고, 금지가 **긍정**이 되었다.
    //
    // 🔴 **슬롯을 넘기는 곳은 그대로 page.tsx 다** — 이 슬롯은 ReactNode 라 서버 경계를
    //    넘는다(함수 슬롯 넷과 갈리는 자리다). 바뀐 것은 그 안에 들어가는 것뿐이다:
    //    링크 하나 → **창을 여닫는 상태를 든 클라이언트 조각**(NewQuoteControl).
    //    🔴 주소(`/quotes/new`)를 아는 곳도 그대로 page.tsx 한 곳이다.
    //
    // ⚠️ 🔴 **2026-09-28 에 이 글자에 `key` 한 마디가 늘었다.** 슬롯도 주소도 그대로이고,
    //    늘어난 까닭은 이 파일 맨 끝 묶음(「서버 컴포넌트가 프롭으로 건네는 요소 — key」)에
    //    적었다 — 없으면 목록을 열 때마다 개발 오버레이에 콘솔 오류가 떴다. 단언의 세기는
    //    그대로 두고(여전히 글자 하나까지 못 박는다) **지금 맞는 글자**로 옮겼다.
    const call = flat(sliceBetween(pageSource, "<QuoteListSlots", "/>\n  );"));
    assert.ok(call.includes("newQuoteControl="), "[새 견적서] 자리가 비어 있다");
    assert.ok(
      call.includes('newQuoteControl={<NewQuoteControl key="new-quote" baseHref="/quotes/new" />}'),
      "[새 견적서] 자리가 팝업 조각이 아니거나 작성 화면을 가리키지 않는다(key 가 빠졌을 수도 있다)"
    );
    assert.ok(
      flat(pageSource).includes('import QuoteListSlots, { NewQuoteControl } from "@/components/quotes/QuoteListSlots";'),
      "팝업 조각을 클라이언트 쪽(QuoteListSlots)에서 가져오지 않는다"
    );

    // 🔴 그 조각이 **정말로 창을 띄운다** — 단추 하나만 두고 끝내지 않는다.
    const slots = flat(slotsSource);
    assert.ok(slots.includes('import NewQuoteDialog from "./NewQuoteDialog";'), "팝업을 들여오지 않는다");
    assert.ok(slots.includes("const [isNewQuoteDialogOpen, setIsNewQuoteDialogOpen] = useState(false);"), slots);
    assert.ok(
      slots.includes('<button type="button" onClick={() => setIsNewQuoteDialogOpen(true)} aria-haspopup="dialog"'),
      "[새 견적서] 단추가 창을 열지 않는다"
    );
    assert.ok(
      slots.includes("{isNewQuoteDialogOpen && ( <NewQuoteDialog baseHref={baseHref} onCancel={() => setIsNewQuoteDialogOpen(false)} /> )}"),
      "창이 열려 있는 동안만 그려지지 않거나 닫는 길이 없다"
    );
    // 🔴 그리는 곳은 한 곳이다 — 두 곳이면 창이 겹쳐 뜨거나 한쪽만 닫힌다.
    assert.equal(slots.split("<NewQuoteDialog ").length - 1, 1, "팝업을 그리는 곳이 하나가 아니다");

    // 🔴 그 주소에 실제로 화면이 있어야 한다 — 없는 곳으로 보내는 링크는 3a 가 막던 그것이다.
    assert.equal(
      existsSync(fileURLToPath(new URL("src/app/(app)/quotes/new/page.tsx", repoUrl))),
      true,
      "[새 견적서] 링크가 가리키는 작성 화면이 없다"
    );
  });

  test("🔴 아직 없는 화면으로 가는 슬롯은 넘기지 않는다 — 없는 주소로 보내지 않는다", () => {
    // 발행(3c-3) 이 오면 한 줄씩 더한다.
    // 미리 넘기면 없는 화면으로 가는 링크·단추가 목록에 선다.
    // 🔴 두 파일을 함께 본다 — 함수 슬롯은 QuoteListSlots, 나머지는 page.tsx 다.
    //
    // 🔴 `renderRowActions=` 는 2026-09-22(**조각 3c-2**)에 이 목록에서 **빠졌다** —
    //    그 조각이 받기 통로(`/api/quotes/{id}/xlsx`)와 목록의 받기 링크를 함께 만들어,
    //    이제 그 슬롯이 **가리키는 화면이 실제로 있다.** 빈 자리는 아래 이웃 시험이
    //    메운다(3c-1 이 `new/page.tsx` 에서 한 방식과 같게, 금지가 아니라 **무엇이
    //    걸렸는지를 이름으로** 못 박는다).
    //
    // 🔴 `renderFileBadges=` 도 같은 날(**눈 확인 뒤**) 빠졌다 — 그 슬롯은 「첨부
    //    조각(3d)의 것」으로 적혀 있었지만, 거기 붙는 딱지 셋 가운데 **「엑셀 전용」
    //    하나는 첨부와 무관하다**: `quotes.is_excel_only` 칸 값이라 붙은 파일을 하나도
    //    보지 않고 알 수 있다. 그 하나만 채웠다.
    //    🔴 **「결재 PDF」 · 「엑셀 없음」은 그대로 3d 것**이다 — 둘은 실제로 붙은
    //    파일을 세어야 알 수 있고, 이 사이트에는 파일을 붙이는 칸이 아예 없어 지금
    //    달면 언제나 같은 답이 된다(아래 이웃 시험이 그 하나뿐임을 못 박는다).
    //    옮긴 까닭은 **단추 칸이 모든 줄에서 같아야** 하기 때문이다 — 받을 수 없는
    //    줄의 표시를 단추 자리에 두었더니 그 줄만 [삭제] 가 밀렸다.
    //
    // 🔴 남은 하나는 **그대로 금지**다: `notice`(발행 결과 알림 — 조각 3c-3.
    //    3c-2 의 받기는 평범한 링크라 알릴 것이 없다).
    const both = flat(sliceBetween(pageSource, "<QuoteListSlots", "/>\n  );")) + flat(slotsSource);
    for (const slot of ["notice="]) {
      assert.equal(both.includes(slot), false, `${slot} — 아직 그 조각이 오지 않았는데 슬롯이 채워져 있다`);
    }
    // ⚠️ 여기 있던 금지 한 줄은 **그때의 기록**이라 지우지 않고 옮겨 적는다:
    //
    //     🔴 인수번호가 가는 곳(수리 건 상세)은 **A/S 의 화면**이다. 사이트를 건너가는
    //     주소를 이 사이트가 지어내지 않는다 — 조각 4·5 에서 정한다.
    //     assert.equal(both.includes("intakeHref="), false, …);
    //
    // 🔴 **풀었다**(2026-09-28 · 조각 PO 3i). 그 금지의 전제는 「저쪽 주소를 알 길이
    //    없다」였고, 이제 설정으로 받는다(`AS_APP_BASE_URL` — lib/env.ts 의
    //    asAppBaseUrl). 🔴 **지우지 않고 긍정 단언으로 갈았다** — 아래 이웃 시험이
    //    「무엇이 어디에 걸렸는지」를 이름으로 못 박는다(3c-2 가 `renderRowActions=`
    //    에서 한 방식과 같다). 지금도 **금지인 것은 `notice=` 하나**다(위 루프).
  });

  test("🔴 조각 PO 3i — 인수번호는 A/S 의 수리 건 상세로 간다. 주소를 못 지으면 링크가 없다", () => {
    const slots = flat(slotsSource);

    // 🔴 함수 슬롯이라 **QuoteListSlots 에서** 건다 — page.tsx 에서 넘기면 화면이 죽는다
    //    (그쪽에 없다는 것은 위 「함수 슬롯 넷을 하나도 넘기지 않는다」가 잰다).
    assert.ok(
      slots.includes("intakeHref={(row) => buildRepairCaseUrl(asAppBaseUrl, row.repairCaseId ?? \"\")}"),
      "인수번호 슬롯이 채워지지 않았거나 모양이 다르다"
    );

    // 🔴 주소를 **짓는 규칙은 한 벌**이다 — 내자 정리 화면이 같은 함수를 쓴다.
    //    여기서 문자열을 이어 붙이기 시작하면 두 화면의 주소가 갈라지는 날이 온다.
    assert.ok(
      slots.includes('import { buildRepairCaseUrl } from "@/lib/domain/as-app-link";'),
      "주소 짓는 규칙을 공용 함수에서 가져오지 않는다"
    );
    assert.equal(
      slots.includes("/repair-cases"),
      false,
      "QuoteListSlots 가 수리 건 주소를 직접 짓고 있다 — 규칙은 as-app-link.ts 한 곳이다"
    );

    // 🔴 그 기준 주소는 **설정값**이라 서버가 내려보낸다(글자라 경계를 넘는다).
    const call = flat(sliceBetween(pageSource, "<QuoteListSlots", "/>\n  );"));
    assert.ok(call.includes("asAppBaseUrl={env.asAppBaseUrl}"), "A/S 기준 주소를 서버가 내려보내지 않는다");
    assert.ok(
      flat(pageSource).includes('import { env } from "@/lib/env";'),
      "page.tsx 가 설정을 읽지 않는다"
    );

    // 🔴 **없어도 돌아야 한다** — 설정이 빠진 서버에서 404 로 가는 링크가 서는 것보다
    //    글자만 보이는 쪽이 낫다는 판단이다. 그 판정은 순수 함수가 지키고
    //    (domain/as-app-link.test.ts), 여기서는 **그 길이 열려 있는지**만 본다:
    //    프롭의 타입이 null 을 받고, 화면이 짓는 값도 null 일 수 있다.
    assert.ok(
      slots.includes("type QuoteListSlotsProps = PassThroughProps & { asAppBaseUrl: string | null };"),
      "기준 주소가 없는 경우(null)를 받지 않는다"
    );
    assert.ok(
      flat(read("src/lib/env.ts")).includes("get asAppBaseUrl(): string | null {"),
      "설정 getter 가 없거나 없을 때 null 을 돌려주지 않는다"
    );
  });

  /**
   * ==========================================================================
   * 🔴 **2026-10-07 — 받기가 빠지고 [Excel 보기]가 들어왔다** (사용자 지시)
   * ==========================================================================
   * 이 자리에 있던 시험의 이름은 「줄마다 [미리보기 · PDF] · **[견적서 받기]** 가 선다」
   * 였다(조각 3c-2 · 3d-2 · PO 3j). 그것은 **그때의 기록**이다 — 사용자가 받는 곳을
   * **사내 공유폴더 하나로 모으기로** 했고(A/S 가 2026-10-06 에 같은 일을 했다), 목록
   * 줄의 받기 단추 셋이 함께 빠졌다:
   *   `QuoteDownloadLink` · `UnavailableDownload` · `ExcelMissingDownload`
   *
   * 🔴 **단언을 약하게 하지 않았다.** 옛 시험이 재던 것(슬롯의 모양 · 무엇이 걸렸는지 ·
   * 차례)을 그대로 재고, **없어진 것이 정말로 없어졌는지**와 🔴 **받는 길이 남아 있는지**를
   * 더 잰다. 「하나를 더하면서 다른 하나가 조용히 빠지는 것」을 막는 것이 이 시험의 몫이고,
   * 이번에는 **일부러 뺀 것**이라 그 사실까지 글자로 못 박는다.
   * ==========================================================================
   */
  test("🔴 2026-10-07 — 줄마다 [미리보기 · PDF] · [Excel 보기] 가 선다. [견적서 받기]는 빠졌다", () => {
    const slots = flat(slotsSource);

    // 🔴 함수 슬롯이라 **QuoteListSlots 에서** 건다 — page.tsx 에서 넘기면 화면이 죽는다.
    assert.ok(
      slots.includes(
        "renderRowActions={(row) => ( <> <QuotePreviewLink row={row} /> " +
          "<QuoteArchiveExcelOpenButton row={row} /> <DocumentUnsupportedNote row={row} /> </> )}"
      ),
      "줄 단추 슬롯이 채워지지 않았거나 모양이 다르다"
    );
    const rowActions = sliceBetween(
      codeOf(slotsSource),
      "renderRowActions={(row) =>",
      "renderFileBadges="
    );
    assert.ok(
      rowActions.includes("<QuotePreviewLink row={row} />"),
      "미리보기가 줄 단추 슬롯에서 빠졌다"
    );
    assert.ok(
      rowActions.includes("<QuoteArchiveExcelOpenButton row={row} />"),
      "[Excel 보기]가 줄 단추 슬롯에서 빠졌다"
    );
    assert.ok(
      rowActions.includes("<DocumentUnsupportedNote row={row} />"),
      "앱 양식이 없는 종류의 곁말이 빠졌다 — 그 줄의 단추 칸이 통째로 빈다"
    );
    // 🔴 **차례도 잰다.** 사용자가 화면을 보고 지시한 것이라 차례가 바뀌면 지시와 다른
    //    것이 된다. [삭제]는 화면(서브모듈)이 이 슬롯 **다음 줄**에 붙인다.
    assert.ok(
      rowActions.indexOf("<QuotePreviewLink") < rowActions.indexOf("<QuoteArchiveExcelOpenButton"),
      "차례가 뒤집혔다 — [미리보기 · PDF] → [Excel 보기] 여야 한다"
    );

    // 🔴 단추 조각은 **제 파일**에 있다 — 서브모듈 화면에 박을 수 없어 따로 섰다.
    assert.ok(
      slots.includes('import QuoteArchiveExcelOpenButton from "./QuoteArchiveExcelOpenButton";'),
      "[Excel 보기] 조각을 제 파일에서 가져오지 않는다"
    );
    assert.equal(
      existsSync(fileURLToPath(new URL("src/components/quotes/QuoteArchiveExcelOpenButton.tsx", repoUrl))),
      true,
      "[Excel 보기] 조각이 없다"
    );

    // 🔴 **받기가 정말로 빠졌다** — 목록 쪽 원본(주석을 뺀 코드)에 자취가 없다.
    const slotsCode = codeOf(slotsSource);
    for (const gone of [
      "QuoteDownloadLink",
      "UnavailableDownload",
      "ExcelMissingDownload",
      "ROW_ACTION_CLASS",
      "견적서 받기",
      "/xlsx",
      "QUOTE_EXCEL_MISSING_NOTICE",
      "NoticePopup",
    ]) {
      assert.equal(slotsCode.includes(gone), false, `목록에 받기의 자취가 남았다: ${gone}`);
    }

    // 🔴 **곁말 한 조각은 저쪽과 같은 모양이다** — 옛 꺼진 단추가 지키던 자리를 잇는다.
    const note = codeOf(sliceBetween(slotsSource, "function DocumentUnsupportedNote(", "\n}\n"));
    assert.ok(note.includes("if (canRenderQuoteDocument(row)) return null;"), note);
    assert.ok(note.includes("title={QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE}"), note);
    assert.equal(note.includes("canEdit"), false, "권한 갈래가 남았다");
    assert.equal(note.includes("disabled"), false, "곁말이 아직 꺼진 단추다");
  });

  /**
   * ==========================================================================
   * 🔴 **받는 길이 사라진 것이 아니다** (2026-10-07)
   * ==========================================================================
   * 목록 줄의 받기 단추를 뗀 조각이라, 「그래서 사람이 파일을 못 받게 됐나」를 여기서
   * 못 박는다. 🔴 **통로도, 다른 화면의 받기도 한 줄도 안 건드렸다.**
   *
   * ── ⚠️ 위는 **그때의 기록**이다 — 🔴 **넷이 둘이 되었다** (2026-10-07 같은 날) ──
   * 사용자 지시가 이어졌다 — 「PO 의 [견적서 받기] 나머지 세 자리도 빼자」. 그래서 남아
   * 있던 받기 셋(③ 수정 화면 머리 · ④ 인쇄 미리보기 두 갈래)을 모두 걷어냈다. A/S 가
   * 2026-10-06 에 한 것과 같다.
   *
   * 🔴 **단언을 지우지 않고 새 사실로 뒤집어 적었다.** ①②는 그대로 「있는가」를 재고,
   * ③④는 「**없는가**」를 잰다 — 슬그머니 되살아나면 여기서 깨진다. 받는 길이 정말로
   * 남아 있는지(①②)를 재는 것이 이 시험의 본래 몫이고, 그것은 더 중요해졌다.
   *
   * 🔴 **권한을 따라가 보았다**(2026-10-07): 보기 권한자(quotes READ)는 수정 화면
   * (`/quotes/{id}`)에 못 들어가므로 ② [폴더 열기]를 못 본다. **그 사람의 길은 ① 하나**이고,
   * ① 은 목록 줄에 **권한 갈래 없이** 서며 그 통로의 문턱도 READ 다 — 아래가 그 둘을 잰다.
   * ==========================================================================
   */
  test("🔴 2026-10-07 — 받는 길은 둘이고, 화면의 받기는 하나도 없다. 통로는 살아 있다", () => {
    // ① 줄의 [Excel 보기] — 앞 조각이 세운 길. 공유폴더의 그 엑셀을 PC 의 엑셀로 연다.
    const open = read("src/components/quotes/quote-archive-excel-open.ts");
    assert.ok(open.includes("export async function runQuoteArchiveExcelOpen("), "[Excel 보기] 흐름이 없다");
    assert.ok(
      codeOf(read("src/components/quotes/QuoteArchiveExcelOpenButton.tsx")).includes("runQuoteArchiveExcelOpen("),
      "단추가 그 흐름을 부르지 않는다"
    );

    // ② 견적서 수정 화면 머리의 [폴더 열기] — 그 견적서의 공유폴더를 탐색기로 연다.
    assert.ok(
      codeOf(editFormSource).includes("<QuoteFolderOpenButton"),
      "수정 화면의 [폴더 열기]가 사라졌다 — A/S 가 받는 두 길 가운데 하나다"
    );

    // 🔴 ③ 수정 화면 머리의 [견적서 받기] — **없다.** 되살아나면 여기서 깨진다.
    const editCode = codeOf(editFormSource);
    assert.equal(editCode.includes("<QuoteIssueButton"), false, "수정 화면에 [견적서 받기]가 되살아났다");
    assert.equal(editCode.includes("/xlsx"), false, "수정 화면에 받기 주소가 되살아났다");

    // 🔴 ④ 인쇄 미리보기의 [견적서 받기] 두 갈래(앱 양식 · 엑셀 전용) — **없다.**
    const printCode = codeOf(read("src/components/quotes/QuotePrintView.tsx"));
    assert.equal(
      printCode.includes("href={`/api/quotes/${quoteId}/xlsx`}"),
      false,
      "인쇄 미리보기에 받기 링크가 되살아났다"
    );
    assert.equal(printCode.includes("<QuoteIssueButton"), false, "인쇄 미리보기에 발행 단추가 되살아났다");

    // 🔴 통로 자체는 그대로다 — 화면에서만 뗐다(지우는 것은 되돌리기 어렵다).
    assert.equal(
      existsSync(fileURLToPath(new URL("src/app/api/quotes/[id]/xlsx/route.ts", repoUrl))),
      true,
      "받기 통로가 사라졌다"
    );
    assert.equal(
      existsSync(fileURLToPath(new URL("src/app/api/quotes/[id]/issue/route.ts", repoUrl))),
      true,
      "발행 통로가 사라졌다"
    );
  });

  /**
   * ==========================================================================
   * 🔴 **보기 권한자도 받을 수 있다** — ① 이 그 사람의 유일한 길이다 (2026-10-07)
   * ==========================================================================
   * 받기를 걷어낼 때 가장 조심할 것은 「수정 못 하는 사람이 파일을 못 받게 되는 것」이었다.
   * 수정 화면(`/quotes/{id}`)은 quotes WRITE 가 있어야 들어가므로 ② [폴더 열기]는 그 사람에게
   * 보이지 않는다. 그래서 **목록 줄의 [Excel 보기] 하나**가 남는데, 그것이 정말 보이는지를
   * 두 자리에서 잰다 — 화면 쪽(권한으로 가르지 않는다)과 통로 쪽(문턱이 READ 다).
   * ==========================================================================
   */
  test("🔴 2026-10-07 — [Excel 보기]는 보기 권한자에게도 선다. 통로 문턱도 READ 다", () => {
    // 화면 — 줄 단추 슬롯이 `canEdit` 을 보지 않는다(위 「줄의 값으로 갈리지 않는다」와 짝).
    const rowActions = sliceBetween(codeOf(slotsSource), "renderRowActions={(row) =>", "renderFileBadges=");
    assert.equal(rowActions.includes("canEdit"), false, "[Excel 보기]가 수정 권한으로 갈린다");

    // 통로 — 폴더 안을 읽는 그 통로의 문턱이 quotes READ 다(WRITE 로 올리면 보기 권한자가 막힌다).
    const entries = codeOf(read("src/app/api/quotes/[id]/archive-folder/entries/route.ts"));
    assert.ok(entries.includes('hasPermission(actingUser, "quotes", "READ")'), "폴더 목록 통로가 READ 가 아니다");
    assert.equal(entries.includes('"quotes", "WRITE"'), false, "폴더 목록 통로가 쓰기 권한을 요구한다");

    // 그 통로를 부르는 쪽도 그 주소 하나다 — 다른 문턱의 통로로 갈아타지 않았다.
    assert.ok(
      codeOf(read("src/components/quotes/quote-archive-folder-entries.ts")).includes(
        "`/api/quotes/${encodeURIComponent(quoteId)}/archive-folder/entries`"
      ),
      "[Excel 보기]가 다른 통로를 본다"
    );
  });

  /**
   * ==========================================================================
   * 🔴 조각 PO 3j — [미리보기 · PDF] 는 **이 사이트의 주소**로 간다
   * ==========================================================================
   * 이 단추는 A/S 의 `PreviewLink`(저쪽 QuoteListScreen.tsx — 2026-09-28 실측)를 그대로
   * 옮긴 것이고 **다른 것은 `href` 하나뿐**이다. 그래서 여기서 재는 것은 둘이다.
   *
   *  ㉠ **같아 보이는가** — 글자(`미리보기 · PDF`)와 상자 모양(className)이 저쪽과 한
   *     글자다. 🔴 `dark:` 스타일도 그대로다. 이 사이트에 다크 모드가 없어 안 켜지지만,
   *     지우면 두 사이트가 같아 보이지 않는다(2026-09-28 사용자 결정).
   *  ㉡ 🔴 **수리 건을 싣지 않는가** — 저쪽은 주소를 `quotePrintHref({ quoteId,
   *     repairCaseId })` 로 짓는다. 그 함수를 베껴 오면 「돌아가기는 시스템을 건너가지
   *     않는다」(2026-09-28 원칙)가 깨지고, 실린 수리 건은 이 사이트에 없는 화면으로
   *     사람을 보낸다. **이 단언이 그 자물쇠다** — 이웃한 「수리 건 몫(Ⓐ)의 이름이 이
   *     저장소 어디에도 없다」와 같은 것을 지키되, 여기서는 **이 링크 한 조각**만 본다.
   * ==========================================================================
   */
  test("🔴 조각 PO 3j — 미리보기 주소는 `/quotes/{id}/print` 한 줄이다. 수리 건을 싣지 않는다", () => {
    const slots = flat(slotsSource);
    const previewSource = sliceBetween(slotsSource, "function QuotePreviewLink(", "\n}\n");
    const preview = flat(previewSource);
    // 🔴 **주석을 뺀 코드만** 보는 자리가 아래 ㉡ 이다 — 이 조각의 머리말이 저쪽의 함수
    //    이름(`quotePrintHref`)을 **안 쓰기로 한 것**으로 그대로 적어 두었다.
    const previewCode = codeOf(previewSource);

    // ㉠ 같아 보이는가 — 주소만 다르고 나머지는 저쪽과 한 글자다.
    assert.ok(
      preview.includes("href={`/quotes/${row.id}/print`}"),
      "미리보기 주소가 이 사이트의 인쇄 화면(`/quotes/{id}/print`)이 아니다"
    );
    assert.ok(preview.includes("미리보기 · PDF"), "미리보기 단추의 글자가 A/S 와 다르다");
    assert.ok(
      preview.includes(
        'className="inline-block rounded-md border border-zinc-300 px-2 py-1 text-xs ' +
          'text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 ' +
          'dark:hover:bg-zinc-800"'
      ),
      "미리보기 단추의 상자 모양이 A/S 와 다르다 — dark: 스타일도 그대로 둔다"
    );
    // 같은 사이트 안 주소다 — 저쪽과 같이 next/link 로 그린다.
    assert.ok(preview.includes("<Link"), "미리보기를 next/link 로 그리지 않는다");
    assert.ok(slots.includes('import Link from "next/link";'), "next/link 를 들여오지 않는다");

    // ㉡ 🔴 **수리 건을 싣지 않는다.** 이것이 저쪽에서 안 베껴 온 몫의 자물쇠다.
    for (const forbidden of ["quotePrintHref", "repairCaseId"]) {
      assert.equal(
        previewCode.includes(forbidden),
        false,
        `미리보기 주소가 ${forbidden} 로 지어진다 — 수리 건을 싣는 주소는 이 사이트에 없는 화면으로 간다`
      );
    }

    // 🔴 앱 양식이 없는 종류에는 **아예 안 선다**(null). 이웃한 받기는 같은 조건에서
    //    꺼진 단추와 까닭을 그리는데 **그것을 흉내 내지 않는다** — 저쪽이 그렇게 갈라
    //    두었다(받기는 「왜 못 받는지」를 말해야 하는 자리, 미리보기는 조용히 빠지는 자리).
    assert.ok(
      previewCode.includes("if (!canRenderQuoteDocument(row)) return null;"),
      "양식 없는 종류에서 미리보기가 빠지지 않는다"
    );
    assert.equal(
      previewCode.includes("disabled"),
      false,
      "미리보기가 꺼진 단추를 그린다 — 받기와 갈라 둔 자리다"
    );
    assert.equal(
      previewCode.includes("UnavailableDownload"),
      false,
      "미리보기가 받기의 꺼진 단추 조각을 쓴다 — 저쪽은 그 둘을 갈라 두었다"
    );

    // 🔴 그 주소에 실제로 화면이 있어야 한다 — 없는 곳으로 보내는 링크는 3a 가 막던 그것이다.
    assert.equal(
      existsSync(fileURLToPath(new URL("src/app/(app)/quotes/[id]/print/page.tsx", repoUrl))),
      true,
      "미리보기 링크가 가리키는 화면이 없다"
    );
  });

  /**
   * ==========================================================================
   * 🔴 단추 칸은 **모든 줄에서 같다** — 재는 방법이 2026-10-07 에 바뀌었다
   * ==========================================================================
   * ⚠️ 여기 있던 시험은 **그때의 기록**이라 뜻을 옮겨 적는다. 2026-09-22 눈 확인에서
   * 받을 수 없는 줄의 단추 자리에 「엑셀 전용」 곁말을 넣었더니 글자 폭이 단추와 달라
   * **그 두 줄만 [삭제] 가 밀려** 목록이 들쭉날쭉했다. 그래서 받기 자리를 **켜진 것과
   * 꺼진 것이 같은 상자 모양**(`ROW_ACTION_CLASS`)으로 맞췄고, 그것을 쟀다.
   *
   * 🔴 **그 상자 모양은 받기와 함께 사라졌다**(2026-10-07 — 받기 단추 셋이 다 빠졌다).
   * 지키려는 것은 그대로이므로 **지금 맞는 방법으로** 잰다: 이제 그 칸에 서는 것은
   * [미리보기 · PDF] 와 [Excel 보기] 둘뿐이고, 🔴 **[Excel 보기]는 줄의 값으로 갈리지
   * 않는다** — 모든 줄에 같은 단추가 선다(Windows 가 아니면 모든 줄에서 함께 빠진다).
   * ==========================================================================
   */
  test("🔴 2026-10-07 — [Excel 보기]는 줄의 값으로 갈리지 않는다. 칸이 들쭉날쭉해지지 않는다", () => {
    const buttonCode = codeOf(read("src/components/quotes/QuoteArchiveExcelOpenButton.tsx"));

    // 🔴 누르기 전에 아는 척하지 않는다 — 사람이 손으로 넣어 둔 엑셀이 있을 수 있고,
    //    공유폴더 사정(꺼짐 · 폴더 없음)은 눌러 보기 전에 알 수 없다.
    for (const branching of ["canRenderQuoteDocument", "isExcelOnly", "hasExcel", "canEdit"]) {
      assert.equal(buttonCode.includes(branching), false, `[Excel 보기]가 줄의 값으로 갈린다: ${branching}`);
    }
    // 🔴 안 그리는 갈래는 **Windows 가 아닐 때 하나**다 — 그때는 모든 줄에서 함께 빠진다.
    //    단추 조각 자체(Control)에는 안 그리는 갈래가 아예 없다.
    assert.ok(buttonCode.includes("if (!isWindows) return null;"), buttonCode);
    const control = sliceBetween(
      buttonCode,
      "export function QuoteArchiveExcelOpenControl(",
      "export default function QuoteArchiveExcelOpenButton("
    );
    assert.equal(control.includes("return null;"), false, "단추 조각이 줄에 따라 스스로 빠진다");

    // 🔴 곁말은 **앱 양식이 없는 종류에만** 선다. 그 줄에는 [미리보기 · PDF]도 없으므로
    //    칸이 통째로 비지 않게 자리를 지킨다(두 조각이 **같은 함수** 하나를 본다).
    const preview = codeOf(sliceBetween(slotsSource, "function QuotePreviewLink(", "\n}\n"));
    const note = codeOf(sliceBetween(slotsSource, "function DocumentUnsupportedNote(", "\n}\n"));
    assert.ok(preview.includes("if (!canRenderQuoteDocument(row)) return null;"), preview);
    assert.ok(note.includes("if (canRenderQuoteDocument(row)) return null;"), note);
  });

  /**
   * ==========================================================================
   * 🔴 조각 3d-5 — 날 JSON 이 뜨던 줄은 **팝업**으로 까닭을 말한다
   * ==========================================================================
   * 2026-09-23 사용자가 본 것: 엑셀 전용인데 엑셀이 안 붙은 줄의 [견적서 받기]를
   * 눌렀더니 브라우저 창에 거절 JSON 이 날것으로 떴다(평범한 `<a>` 라 그 주소로
   * 이동해 404 본문을 그대로 그린 것이다). 요구는 「우리가 항상 쓰는 팝업 스타일로
   * 알림」이었다.
   *
   * 🔴 여기서 지키는 것은 넷이다.
   *   ㉠ **받을 수 있는 줄은 건드리지 않는다** — 위 이웃 시험이 `<a>` 를 그대로 잰다.
   *   ㉡ 그 줄의 단추는 **꺼져 있지 않다** — 꺼진 단추는 눌리지 않아 팝업이 못 뜬다.
   *   ㉢ 팝업 문장과 딱지 곁말이 **한 글자**다.
   *   ㉣ 팝업이 **저절로 닫히지 않는다** — 이 저장소는 「팝업이 즉시 닫힘」으로 한 번
   *      고생했고, 까닭을 말하는 문장은 0.5초에 읽히지 않는다.
   * ==========================================================================
   */
  test("🔴 조각 3d-5 · 2026-10-07 — 「엑셀 없음」을 말하는 곳이 **왼쪽 칸의 딱지 하나**로 남았다", () => {
    // ⚠️ 🔴 **이 시험의 이름과 재는 곳이 2026-10-07 에 바뀌었다.** 그때까지는
    //    「엑셀이 없는 엑셀 전용 줄은 **눌리는 단추**이고, 누르면 팝업이 뜬다」였다 —
    //    그 단추가 [견적서 받기]였고(조각 3d-5), **받기와 함께 빠졌다**(사용자 지시 —
    //    받는 곳을 공유폴더 하나로 모은다).
    //
    // 🔴 **지키려는 것은 그대로다**: 붙은 엑셀이 없다는 사실을 화면이 **말해야 한다.**
    //    이제 그 말을 하는 곳은 왼쪽 「견적서」 칸의 호박색 딱지 하나뿐이므로,
    //    ㉢(팝업 문장 = 딱지 곁말)이 재던 **그 상수**를 딱지 쪽에서 잰다.
    // 🔴 그 팝업 단추가 정말 사라졌는지는 위 이웃 시험이 글자로 못 박는다.
    const slotsCode = codeOf(slotsSource);
    assert.equal(slotsCode.includes("ExcelMissingDownload"), false, "받기와 함께 뗀 팝업 단추가 남아 있다");

    const badgeRule = flat(sliceBetween(filesSource, "export function quoteListFileBadges(", "\n}\n"));
    assert.ok(badgeRule.includes("title: QUOTE_EXCEL_MISSING_NOTICE"), "딱지가 그 상수를 쓰지 않는다");
    // 🔴 딱지 슬롯은 **한 글자도 안 바뀌었다** — 이 조각이 가장 조심한 자리다.
    assert.ok(
      flat(slotsSource).includes("renderFileBadges={(row) => <QuoteFileBadges row={row} />}"),
      "딱지 슬롯이 바뀌었다 — 「엑셀 없음」을 말하는 마지막 자리다"
    );

    // 🔴 **서버 문장을 화면이 끌어다 쓰지 않는다.** 화면 문장은 딱지 쪽 상수 하나다.
    //    `QUOTE_EXCEL_MISSING_MESSAGE`(api/quotes/[id]/xlsx/download-source.ts — A/S 와
    //    바이트 동일)는 **받기를 거절하는 말**(「다시 받아 주세요」)이라 쓰임 자체가 다르고,
    //    그 파일은 저쪽과 바이트가 같아야 해서 여기 사정으로 고칠 수도 없다.
    assert.equal(
      slotsCode.includes("QUOTE_EXCEL_MISSING_MESSAGE"),
      false,
      "서버의 거절 문장을 목록 화면이 그대로 보이고 있다 — 화면 문장은 딱지와 한 글자여야 한다"
    );
    const notice = sliceBetween(filesSource, "export const QUOTE_EXCEL_MISSING_NOTICE =", ";");
    // 🔴 **조각 3d-4 — 문장이 저쪽 말로 돌아왔다.** 그 전까지 이 자리에는 「A/S 관리
    //    시스템에서 붙여 주세요」를 요구하고 「견적서 수정 화면」이라는 낱말을 **막는**
    //    단언이 있었고, 그 곁말이 푸는 조건을 스스로 못 박아 두었다 — 「이 줄이 걸리는
    //    날이 붙이는 칸을 가져온 날이다. 그때는 이 사이트에서 붙일 수 있으므로 문장이
    //    저쪽 말로 돌아가고, 이 단언을 지운다.」 3d-4 가 그 칸을 세웠으므로 지웠다.
    assert.ok(
      notice.includes("견적서 수정 화면에서 붙여 주세요"),
      "붙일 수 있는 곳(이 사이트의 견적서 수정 화면)을 가리키지 않는다"
    );
  });

  /**
   * ==========================================================================
   * 🔴 조각 3d-4 — 위에서 지운 단언의 **대신**이다
   * ==========================================================================
   * 바로 위 문장은 이제 「견적서 **수정 화면에서** 붙여 주세요」라고 말한다. 그 말이
   * 참이려면 **그 화면에 붙이는 칸이 실제로 서야 한다.** 화면을 렌더해 볼 수 없는
   * 자리(서버 액션 · `server-only` 사슬)라 원본을 글자로 읽어 사슬을 따라간다:
   *
   *     수정 화면 page.tsx → 칸 조회 → 폼의 attachmentSlots → 첨부 구역 → 두 칸
   *
   * 🔴 한 마디라도 끊기면 **화면이 거짓말을 하기 시작한다** — 목록의 딱지와 팝업은
   * 「수정 화면에서 붙이라」고 하는데 그 화면에는 칸이 없는 상태다. 옛 단언이 막던
   * 것이 바로 그 상태였고, 이 시험이 그 자리를 이어받는다.
   *
   * ⚠️ 위는 **그때(3d-4)의 기록**이고 **그 사슬은 지금도 그대로 잰다.**
   * 🔴 **조각 PO 3k 가 그 사슬의 마지막 마디를 바꿨다**(2026-09-28): 첨부 구역을
   * 그릴지 가르던 조건(`attachmentSlots !== null ?`)이 **없어졌다** — 저쪽처럼
   * **조건 없이** 그리므로 **새 견적서 화면에도 칸이 선다.**
   *
   * 🔴 그래서 이 시험의 ② 가 늘었다. 새 견적서 화면의 칸이 거짓말을 하지 않는 까닭은
   * 폼의 handleSubmit 이 「만든 직후 올리기」를 하기 때문이고, 그것이 빠지면 3d-4 가
   * 두려워한 **「고른 파일이 [저장] 때 말없이 사라지는」** 상태로 되돌아간다. 아래
   * ②-ㄴ 이 그것을 잰다 — 부른다는 것과, 🔴 **`setCreatedQuote` 가 그보다 앞**이라는
   * 차례까지. 뒤집히면 올리다 실패했을 때 같은 견적서가 **두 장**이 된다.
   * ==========================================================================
   */
  test("🔴 조각 3d-4 · PO 3k — 그 문장이 가리키는 붙이는 칸이 선다. 새 견적서 화면에도 서고, 고른 파일은 만든 직후 올라간다", () => {
    const page = codeOf(detailPageSource);
    const form = codeOf(editFormSource);
    const section = codeOf(sectionSource);

    // ① 수정 화면이 칸을 읽어 폼에 넘긴다.
    assert.ok(page.includes("listQuoteAttachmentSlots(quote.id)"), "수정 화면이 첨부 칸을 읽지 않는다");
    assert.ok(page.includes("attachmentSlots={attachmentSlots}"), "읽은 칸을 폼에 넘기지 않는다");

    // ②-ㄱ 폼이 첨부 구역을 그리고, 넘겨받은 칸을 컨트롤러의 `serverSlots` 로 잇는다.
    //
    // ⚠️ 여기 있던 단언 한 줄은 **그때의 기록**이라 지우지 않고 옮겨 적는다:
    //
    //     assert.ok(form.includes("attachmentSlots !== null ?"),
    //       "첨부 구역을 그릴지 가르는 조건이 attachmentSlots 가 아니다");
    //
    // 🔴 **풀었다**(2026-09-28 · 조각 PO 3k). 그 조건의 전제는 「새 견적서 화면에서
    //    고른 파일은 [저장] 때 말없이 사라진다」였고, 그 배선이 이제 왔다(②-ㄴ).
    //    🔴 **약하게 하지 않고 긍정 단언으로 갈았다** — 3i 가 `intakeHref`,
    //    3j 가 `renderRowActions` 에서 한 방식과 같다. 조건이 없어져도 **사슬은
    //    여전히 이어진다**: 수정 화면이 칸을 읽어 폼에 넘기고(①), 폼이 그것을
    //    컨트롤러의 `serverSlots` 로 넘긴다(바로 아래).
    assert.ok(
      form.includes("<QuoteAttachmentsSection controller={attachments}"),
      "편집 폼이 첨부 구역을 그리지 않는다"
    );
    assert.ok(
      form.includes("serverSlots: attachmentSlots,"),
      "폼이 넘겨받은 칸을 컨트롤러의 serverSlots 로 잇지 않는다 — 수정 화면의 붙은 파일이 칸에 안 뜬다"
    );
    assert.ok(form.includes("attachmentSlots = null,"), "프롭의 기본값이 null 이 아니다");

    // 🔴 **조건 없이 그린다** — 이 한 줄이 「새 견적서 화면에도 칸이 선다」를 만든다.
    //    되살리는 순간 그 화면의 칸이 사라지고, 팝업에서 고른 엑셀도 갈 곳을 잃는다.
    assert.equal(
      form.includes("attachmentSlots !== null ?"),
      false,
      "첨부 구역이 다시 조건부다 — 저쪽은 조건 없이 그리고, 그래야 새 견적서 화면에도 칸이 선다"
    );
    // 그 화면이 폼을 그리고, 🔴 **서버 칸은 넘기지 않는다**(새 장에는 붙어 있는 것이 없다).
    const newPage = codeOf(newPageSource);
    assert.ok(newPage.includes("<QuoteEditForm"), "새 견적서 화면이 그 폼을 그리지 않는다");
    assert.equal(
      newPage.includes("attachmentSlots"),
      false,
      "새 견적서 화면이 서버 칸을 넘긴다 — 아직 붙어 있는 것이 없는 화면이다"
    );

    // ②-ㄴ 🔴 **이 조각의 핵심** — 새 견적서 화면의 칸이 거짓말을 하지 않는 까닭.
    //    [저장]이 견적서를 만든 **직후** 들고 있던 파일을 올린다.
    const submit = codeOf(sliceBetween(editFormSource, "async function handleSubmit(", "const disabled ="));
    const createdAt = submit.indexOf("setCreatedQuote({ id: result.id, version: result.version })");
    const uploadAt = submit.indexOf("attachments.uploadQueuedAfterCreate(result.id");
    assert.ok(
      uploadAt >= 0,
      "handleSubmit 이 uploadQueuedAfterCreate 를 부르지 않는다 — 새 견적서 화면에서 고른 파일이 [저장] 때 말없이 사라진다"
    );
    assert.ok(createdAt >= 0, "만든 장을 setCreatedQuote 로 기억하지 않는다");
    // 🔴 **차례가 곧 안전장치다.** 올리기가 먼저면, 올리다 실패했을 때 다음 [저장]이
    //    다시 **만들기**가 되어 같은 견적서가 두 장 생긴다.
    assert.ok(
      createdAt < uploadAt,
      "setCreatedQuote 가 uploadQueuedAfterCreate 보다 뒤다 — 올리다 실패하면 같은 견적서가 두 장이 된다"
    );
    // 🔴 하나라도 못 올리면 **목록으로 넘기지 않는다** — 견적서는 이미 저장됐고,
    //    칸이 못 올린 파일을 까닭과 함께 들고 [다시 올리기]를 내밀어야 한다.
    assert.ok(
      submit.includes(
        "if (upload.failures.length > 0) { setAttachmentNotice(createdWithAttachmentFailuresText(upload.total, upload.failures)); return; }"
      ),
      "못 올린 것이 있어도 목록으로 넘어간다 — 그 파일을 다시 올릴 길이 화면에서 사라진다"
    );
    assert.ok(
      submit.indexOf("upload.failures.length > 0") <
        submit.indexOf('showSavePopup({ message: "견적서를 등록했습니다.'),
      "올리기 결과를 보기 전에 목록으로 넘어간다"
    );
    // 🔴 그 자리에 머문 장은 **저장된 장**이다 — 훅의 quoteId 가 `savedQuote?.id` 라야
    //    [다시 올리기]가 실제로 올라간다(retry 는 quoteId 가 null 이면 아무 일도 안 한다).
    assert.ok(
      form.includes("const savedQuote = quote ? { id: quote.id, version: quote.version } : createdQuote;"),
      "방금 만든 장을 저장된 장으로 보지 않는다 — 다음 [저장]이 같은 견적서를 또 만든다"
    );
    assert.ok(
      form.includes("quoteId: savedQuote?.id ?? null,"),
      "훅이 방금 만든 장의 id 를 못 받는다 — 못 올린 파일의 [다시 올리기]가 말없이 아무 일도 하지 않는다"
    );

    // ③ 구역이 두 칸을 그리고, 지우기는 서버 액션으로 간다.
    assert.ok(section.includes("<QuoteAttachmentSlotsView"), "첨부 구역이 두 칸을 그리지 않는다");
    assert.ok(section.includes("await softDeleteAttachmentAction({"), "지우기가 서버 액션을 부르지 않는다");
    assert.ok(section.includes("await uploadQuoteAttachment("), "올리기 통로를 부르지 않는다");

    // ④ 칸이 [파일 올리기] · [보기] · [내려받기] · [바꾸기] · [지우기]를 실제로 세운다 —
    //    문장이 약속하는 일이 그것이다.
    //
    // 🔴 여기서 **주소 짓는 함수의 이름을 글자로 적지 않는다.** 이웃 시험
    //    (quote-attachment-files.test.ts)이 `src/` 를 훑어 「그 주소를 짓는 곳은 칸
    //    조각 하나뿐」을 재는데, 그 이름을 여기 적으면 이 시험 파일이 **짓는 곳으로
    //    세어진다**(2026-09-28 실측으로 걸렸다). 눈에 보이는 이름과 콜백으로 잰다.
    const card = flat(sliceBetween(partsSource, "export function QuoteAttachmentSlotCard(", "두 칸"));
    for (const mark of [
      'label="파일 올리기"',
      "> 보기 </a>",
      // 새 탭에서 연다 — 이 화면 안에 끼워 보여 주지 않는다.
      'target="_blank" rel="noopener noreferrer"',
      "> 내려받기 </a>",
      'label="바꾸기"',
      "onClick={onRequestDelete}",
    ]) {
      assert.ok(card.includes(mark), `칸에 '${mark}' 가 없다 — 「수정 화면에서 붙여 주세요」가 거짓이 된다`);
    }
  });

  test("🔴 조각 3d-5 — 알림 팝업은 사람이 닫는다. 저절로 닫히지 않는다", () => {
    // 🔴 common/SavePopup.tsx 를 쓰지 않은 까닭이 이것이다 — 그쪽은 성공 전용이고
    //    `SAVE_POPUP_VISIBLE_MS`(0.5초) 뒤 저절로 닫힌다. 까닭을 말하는 문장은 그
    //    시간에 읽히지 않는다.
    const popup = codeOf(popupSource);
    assert.ok(popupSource.startsWith('"use client";'), "팝업이 클라이언트 조각이 아니다");
    assert.ok(popup.includes("dialog.showModal()"), "이 저장소의 팝업 방식(<dialog> + showModal)이 아니다");
    assert.equal(/setTimeout|setInterval/.test(popup), false, "팝업이 시간이 지나면 저절로 닫힌다");
    assert.ok(popup.includes("onClose()"), "사람이 닫을 길이 없다");
    assert.ok(popup.includes("확인"), "닫는 단추가 없다");
    // Esc 도 같은 길을 거친다 — 창만 닫히고 부르는 쪽은 열려 있다고 믿으면, 같은 줄을
    // 다시 눌러도 아무 일도 일어나지 않는다.
    assert.ok(popup.includes("event.preventDefault();"), "Esc 가 부르는 쪽을 거치지 않는다");
  });

  test("🔴 조각 3d-0 — 왼쪽 칸의 파일 딱지는 **셋**이다(엑셀 전용 · 결재 PDF · 엑셀 없음)", () => {
    // 위 금지 목록에서 `renderFileBadges=` 를 뺀 자리를 메운다.
    const slots = flat(slotsSource);
    assert.ok(
      slots.includes("renderFileBadges={(row) => <QuoteFileBadges row={row} />}"),
      "파일 딱지 슬롯이 채워지지 않았거나 모양이 다르다"
    );
    // 🔴 그리는 조각과 규칙은 **A/S 와 같은 이름 · 같은 자리**다(조각 3d·4 가 대조한다).
    assert.ok(
      slots.includes('import { QuoteFileBadges } from "./QuoteAttachmentParts"'),
      "딱지 조각을 A/S 와 같은 자리에서 가져오지 않는다"
    );
    // 🔴 끝 표지가 `"\n}\n"` 인 까닭 — 받는 줄이 여러 줄짜리 타입이라 **signature 의 닫는
    //    괄호**(`}): QuoteListFileBadge[] {`)도 줄 첫머리의 `}` 다. `"\n}"` 로 자르면 몸통
    //    전체가 잘려 나가고, 아래 단언들이 빈 글자를 보며 통과하지 못한다.
    const badgeRule = flat(sliceBetween(filesSource, "export function quoteListFileBadges(", "\n}\n"));

    // 🔴 **딱지 셋이 각각 제 조건으로 붙는다**(조각 3d-0). 지키는 것은 「어느 줄에
    //    무엇이 붙는가」다 — 여기가 흐려지면 사람이 같은 견적서를 다른 것으로 본다.
    //     · 「엑셀 전용」  — `isExcelOnly` 인 줄
    //     · 「결재 PDF」   — 붙어 있는 줄이면 **일반 견적서 줄에도** 붙는다
    //     · 「엑셀 없음」  — 엑셀 전용인데 엑셀이 안 붙은 줄만
    assert.ok(badgeRule.includes('key: "EXCEL_ONLY"'), "엑셀 전용 딱지가 없다");
    assert.ok(badgeRule.includes('key: "SIGNED_PDF"'), "결재 PDF 딱지가 없다");
    assert.ok(badgeRule.includes('key: "EXCEL_MISSING"'), "엑셀 없음 딱지가 없다");
    assert.ok(badgeRule.includes("if (row.hasSignedPdf) {"), "결재 PDF 딱지가 붙은 파일을 보지 않는다");
    assert.ok(
      badgeRule.includes("if (row.isExcelOnly && !row.hasExcel) {"),
      "「엑셀 없음」이 '엑셀 전용인데 엑셀이 없다' 말고 다른 조건으로 붙는다"
    );
    // 🔴 **일찍 돌아가는 줄이 없다** — `if (!row.isExcelOnly) return [];` 가 남아 있으면
    //    일반 견적서 줄의 「결재 PDF」가 통째로 사라진다(실측 1줄).
    assert.equal(
      badgeRule.includes("if (!row.isExcelOnly) return [];"),
      false,
      "일반 견적서 줄에서 딱지를 모두 버리고 돌아간다 — 결재 PDF 가 안 붙는다"
    );

    // 🔴 **규칙이 첨부를 세는 값을 받는다.** 두 사이트가 같은 attachments 표를 보므로,
    //    PO 에 붙이는 칸이 오기 전에도 A/S 에서 붙인 파일이 이 목록에 잡힌다.
    assert.ok(
      flat(filesSource).includes(
        "export function quoteListFileBadges(row: { isExcelOnly: boolean; hasSignedPdf: boolean; hasExcel: boolean; })"
      ),
      "딱지 규칙이 첨부를 세는 값(hasSignedPdf · hasExcel)을 받지 않는다"
    );

    // 🔴 그리고 **첨부 사슬을 값으로 끌고 오지 않는다** — 파일마다 따로 잰다(아래 표).
    //    🔴 **주석을 뺀 코드만** 본다: 세 파일의 머리말이 아직 오지 않은 조각의 파일
    //    이름을 그대로 적어 두고 있어, 원본을 그대로 훑으면 그 설명이 걸린다(시험이
    //    주석을 고치라고 요구하게 된다).
    //
    // ── 🔴 2026-09-28(조각 3d-3d) — 곁말을 고치고 두 칸을 풀었다 ─────────
    // 여기 있던 말은 「**이 사이트에는 그 파일이 아예 없다**(3d)」였다. 🔴 **이미
    // 거짓이다**: `db/queries/attachments.ts` 는 조각 3d-2 에 왔고 3d-3b 가 156줄로
    // 키웠으며, `domain/attachment-allowlist.ts`(3d-1b) · `domain/attachment-path.ts` ·
    // `storage/storage-adapter.ts` 도 전부 와 있다.
    //
    // 🔴 **막는 것은 「파일이 있느냐」가 아니라 「화면이 그것을 값으로 끄느냐」다.**
    // 지키려는 것은 둘이다:
    //   ㉠ **목록이 첨부를 세러 서버로 내려가지 않는다.** 목록 줄은 `hasSignedPdf` ·
    //      `hasExcel` 을 이미 싣고 있다(db/queries/quotes.ts 의
    //      `loadAttachmentFlagsByQuoteId`). 화면이 따로 조회를 붙이면 N+1 과 「두 곳이
    //      다른 답을 하는」 길이 생긴다.
    //   ㉡ **클라이언트 조각이 `server-only` 사슬을 브라우저로 끌지 않는다.**
    //      `db/queries/attachments.ts` 의 첫 줄이 `import "server-only"` 다.
    //      `attachment-path.ts` 는 `node:path`, `storage-adapter` 는 디스크 쓰기다.
    //
    // 🔴 **조각 3d-3d 가 `quote-attachment-files.ts` 의 두 칸을 풀었다** —
    // `queries/attachments`(🔴 **타입 전용으로만**) · `attachment-allowlist`. 그 파일이
    // 이제 **칸 정의 · 사전 검사**를 하는데, 그 재료(분류별 확장자 · 20MB)를 따로 적으면
    // 화면은 받는데 서버가 거절하는(또는 그 반대의) 날이 온다 — **같은 정본을 봐야
    // 한다.** 🔴 지금의 글자 금지는 **타입 전용과 값 import 를 구별하지 못하므로**,
    // 푼 자리는 아래 이웃 시험이 **더 강한 긍정 단언**으로 메운다. 나머지 **열 칸은
    // 그대로 금지**다.
    const chainFence = [
      { name: "QuoteListSlots", source: slotsSource, forbidden: ATTACHMENT_CHAINS },
      { name: "QuoteAttachmentParts", source: partsSource, forbidden: ATTACHMENT_CHAINS },
      // 🔴 푼 둘(`queries/attachments` · `attachment-allowlist`)은 아래 이웃 시험이 잰다.
      { name: "quote-attachment-files", source: filesSource, forbidden: ["attachment-path", "storage-adapter"] },
    ] as const;
    for (const { name, source, forbidden } of chainFence) {
      for (const chain of forbidden) {
        assert.equal(codeOf(source).includes(chain), false, `${name} 이 첨부 사슬을 끌고 왔다: ${chain}`);
      }
    }
  });

  /**
   * ==========================================================================
   * 🔴 조각 3d-3d — 푼 두 칸을 **더 강한 긍정 단언**으로 메운다
   * ==========================================================================
   * 위 표에서 `quote-attachment-files.ts` 의 `queries/attachments` ·
   * `attachment-allowlist` 를 뺀 자리다. 금지 목록으로는 더 이상 잴 수 없으니
   * **무엇을 어떻게 들여오는지를 이름으로 못 박는다**(3c-1 이 new/page.tsx 에서,
   * 3c-2 가 받기 링크에서 한 방식과 같다).
   *
   * 🔴 글자 금지가 못 하던 구별을 여기서 한다 — **`import type` 은 컴파일할 때
   * 지워진다.** 그래서 `server-only` 가 브라우저 묶음으로 새지 않는다. 값 import 로
   * 바뀌는 날 ㉠ 이 걸린다.
   * ==========================================================================
   */
  test("🔴 조각 3d-3d — 첨부 조회는 **타입 전용 한 줄**, 허용목록은 **정해진 이름만**", () => {
    const code = codeOf(filesSource);

    // ㉠ 🔴 DB 조회는 **타입 전용**으로만 들여온다. 값으로 들여오면 그 파일 첫 줄의
    //    `import "server-only"` 가 화면 묶음까지 따라온다.
    assert.ok(
      code.includes(
        'import type { QuoteAttachmentSlotFile, QuoteAttachmentSlots } from "@/lib/db/queries/attachments";'
      ),
      "첨부 조회를 타입 전용(import type)으로 들여오지 않는다"
    );

    // ㉡ 그리고 **그 한 줄뿐**이다 — 값 import 가 슬쩍 끼는 것을 막는다.
    assert.equal(
      code.split('from "@/lib/db/queries/attachments"').length - 1,
      1,
      "첨부 조회를 들여오는 줄이 둘 이상이다 — 값 import 가 끼었는지 보라"
    );

    // ㉢ 허용목록에서 들여오는 이름은 **실제로 쓰는 다섯 그대로**다. 늘어나는 날은
    //    화면이 서버의 판정을 흉내 내기 시작한 날이다.
    const allowlistNames = sliceBetween(filesSource, "import {", 'from "@/lib/domain/attachment-allowlist";')
      .replace("import {", "")
      .replace("}", "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== "");
    assert.deepEqual(
      allowlistNames,
      [
        "CATEGORY_EXTENSION_ALLOWLIST",
        "MAX_ATTACHMENT_SIZE_BYTES",
        "getAllowedMimeTypesForExtension",
        "isExtensionAllowedForCategory",
        "normalizeFileExtension",
      ],
      "허용목록에서 들여오는 이름이 정해진 목록과 다르다"
    );

    // ㉣ 🔴 **목록이 첨부를 세러 내려가지 않는다**(위 ㉠ 의 약속). 조회 함수의 이름이
    //    세 파일 어디에도 없다 — 글자 금지를 푼 파일에도 이 단언은 그대로 걸린다.
    for (const [name, source] of [
      ["QuoteListSlots", slotsSource],
      ["quote-attachment-files", filesSource],
      ["QuoteAttachmentParts", partsSource],
    ] as const) {
      for (const query of [
        "listQuoteAttachmentSlots",
        "listLiveQuoteAttachments",
        "getQuoteAttachmentUploadTarget",
      ]) {
        assert.equal(
          codeOf(source).includes(query),
          false,
          `${name} 이 첨부를 세러 서버 조회를 부른다: ${query} — 목록 줄이 이미 싣는 값이다`
        );
      }
    }
  });

  test("🔴 슬롯을 안 주면 요약 줄은 링크가 아니라 글자다 — 목록은 그래도 읽힌다", () => {
    const summary = flat(sliceBetween(listSource, "function SummaryLine(", "function DeleteButton("));
    assert.ok(summary.includes("const href = rowHref?.(row) ?? null;"), "줄 링크 주소를 슬롯에서 구하지 않는다");
    assert.ok(summary.includes("if (href === null) {"), "주소가 없을 때의 갈래가 없다");
    // 링크가 아닐 때도 같은 글자를 그대로 보인다 — 이 줄이 어느 견적서인지 가리는
    // 유일한 글자라, 흐리거나 감추면 목록을 못 읽는다.
    assert.ok(summary.includes("{row.summaryLine}"), "링크가 아닐 때 요약 줄이 사라진다");
  });

  test("🔴 표와 카드가 **같은 슬롯**을 받는다 — 창 폭에 따라 보이는 것이 달라지지 않게", () => {
    const screen = flat(sliceBetween(listSource, "<ResponsiveList", "/>\n      )}"));
    const tableProps = sliceBetween(screen, "<QuoteTable", "/>");
    const cardProps = sliceBetween(screen, "<QuoteCardList", "/>");
    for (const props of [tableProps, cardProps]) {
      for (const slot of [
        "rowHref={rowHref}",
        "intakeHref={intakeHref}",
        "renderFileBadges={renderFileBadges}",
        "renderRowActions={renderRowActions}",
      ]) {
        assert.ok(props.includes(slot), `한쪽에만 ${slot} 이 넘어간다: ${props}`);
      }
    }
  });
});

/**
 * ============================================================================
 * 휴지통 — 다른 휴지통과 같은 루틴 (2026-09-11 사용자 결정)
 * ============================================================================
 * 자료의 규칙(무엇이 함께 지워지고 무엇이 연결만 풀리는가, 첨부가 함께 오가는가)은
 * A/S 의 통합 시험이 실제 DB 로 본다. 여기서 지키는 것은 화면 쪽 약속이다.
 * ============================================================================
 */
describe("휴지통 — 만료 배지 · 완전 삭제", () => {
  const trashListSource = sliceBetween(listSource, "function QuoteTrashList(", "function formatDeletedAt(");

  test("🔴 휴지통의 줄마다 만료 배지와 [완전 삭제] 가 선다", () => {
    const body = flat(trashListSource);
    assert.ok(
      body.includes("{row.deletedAt !== null && <MasterDataTrashRetentionBadge deletedAt={row.deletedAt} />}"),
      "휴지통 줄에 만료 배지가 없다"
    );
    assert.ok(body.includes("onClick={() => onPermanentDelete(row)}"), "휴지통 줄에 [완전 삭제] 가 없다");
    assert.ok(body.includes("onClick={() => onRestore(row)}"), "휴지통 줄에서 [되살리기] 가 사라졌다");
  });

  test("휴지통 안내는 보관 일수를 판정 모듈에서 가져온다 — 숫자를 따로 적지 않는다", () => {
    assert.ok(
      flat(trashListSource).includes(
        "삭제한 지 {MASTER_DATA_TRASH_RETENTION_DAYS}일이 지나면 자동으로 완전히 삭제됩니다."
      ),
      "휴지통 안내가 보관 일수를 말하지 않는다"
    );
  });

  test("🔴 옛 문장(자동 완전 삭제 없음)이 남아 있지 않고, 보내기 창은 기본 보관 문장을 쓴다", () => {
    assert.equal(listSource.includes("자동으로 완전히 삭제되지 않습니다"), false, "사실이 아닌 옛 문장이 남아 있다");
    const deleteDialog = flat(sliceBetween(listSource, "<MasterDataDeleteDialog", "/>"));
    assert.equal(deleteDialog.includes("retentionNote="), false, "보내기 창이 기본 보관 문장(15일)을 덮는다");
    // 기본 문장 자체가 15일 뒤 자동 완전 삭제를 말한다 — 창 원본에서 그대로 확인한다.
    assert.ok(flat(dialogsSource).includes("15일이 지나면 자동으로 완전히 삭제"), "공용 창의 기본 보관 문장이 바뀌었다");
  });

  test("🔴 완전 삭제 창은 완전 삭제 액션으로 이어진다 — 확인 창을 거치고 confirm() 을 쓰지 않는다", () => {
    const dialog = flat(sliceBetween(listSource, "<MasterDataPermanentDeleteDialog", "/>\n    </div>"));
    assert.ok(dialog.includes("onConfirm={() => void confirmPurge()}"), "완전 삭제 창이 confirmPurge 를 부르지 않는다");
    const confirmPurge = flat(sliceBetween(listSource, "async function confirmPurge()", "const filtered = useMemo("));
    assert.ok(
      confirmPurge.includes("await trashActions.permanentlyDeleteQuote({"),
      "confirmPurge 가 완전 삭제 액션을 부르지 않는다"
    );
    assert.equal(/\bconfirm\s*\(/.test(listSource), false, "브라우저 confirm() 을 부른다");
  });

  test("되살리기 창은 견적서에 맞는 문장을 넘기고, 공용 창의 기본 문장은 한 글자도 바뀌지 않았다", () => {
    const restoreDialog = flat(sliceBetween(listSource, "<MasterDataRestoreDialog", "/>\n\n"));
    assert.ok(restoreDialog.includes("restoreNote="), "되살리기 창이 견적서 문장을 넘기지 않는다");
    assert.ok(
      dialogsSource.includes(
        "{restoreNote ?? <>복원하면 목록에 다시 나타나고, 접수·편집 화면에서도 다시 고를 수 있게 됩니다.</>}"
      ),
      "공용 되살리기 창의 기본 문장이 바뀌었다 — 다른 휴지통 화면의 문구가 달라진다"
    );
  });

  test("🔴 완전 삭제 액션은 휴지통 관문(quotes MANAGE)을 먼저 지나고, 빈 사유를 막는다", () => {
    const gate = flat(
      sliceBetween(actionSource, "async function resolveDeletingUser()", "export async function deleteQuoteAction(")
    );
    assert.ok(gate.includes('hasPermission(actingUser, "quotes", "MANAGE")'), "휴지통 관문이 MANAGE 가 아니다");

    const body = flat(
      sliceBetween(actionSource, "export async function permanentlyDeleteQuoteAction(", "} catch (err) {")
    );
    const gateAt = body.indexOf("await resolveDeletingUser()");
    const validateAt = body.indexOf("isValidQuoteId(");
    const reasonAt = body.indexOf('if (reason === "")');
    const mutationAt = body.indexOf("await permanentlyDeleteQuote({");
    assert.ok(gateAt >= 0, "완전 삭제 액션이 관문을 부르지 않는다");
    assert.ok(validateAt > gateAt, "완전 삭제 액션이 관문보다 검증을 먼저 한다");
    assert.ok(reasonAt > gateAt && mutationAt > reasonAt, "빈 사유를 거르기 전에 지운다");
  });

  test("🔴 세 액션 모두 같은 관문을 지난다 — 하나라도 빠지면 그 통로만 열린다", () => {
    for (const name of ["deleteQuoteAction", "restoreQuoteAction", "permanentlyDeleteQuoteAction"]) {
      const body = flat(sliceBetween(actionSource, `export async function ${name}(`, "} catch (err) {"));
      assert.ok(body.includes("await resolveDeletingUser()"), `${name} 이 휴지통 관문을 부르지 않는다`);
    }
  });
});

describe("page.tsx — 관문이 먼저다", () => {
  test("🔴 가드 → 권한 → 조회 차례가 그대로다", () => {
    const body = flat(pageSource);
    const order = [
      'await requireAreaAccessForCurrentUser("quotes");',
      'hasPermission(user, "quotes", "MANAGE")',
      "listQuotes()",
    ].map((marker) => {
      const at = body.indexOf(marker);
      assert.ok(at >= 0, `원본에서 '${marker}' 를 찾지 못했다`);
      return at;
    });
    for (let i = 1; i < order.length; i += 1) {
      assert.ok(order[i] > order[i - 1], "권한 검사·조회 순서가 바뀌었다");
    }
  });

  test("휴지통의 줄은 지울 수 있는 세션에만 실어 보낸다", () => {
    const body = flat(pageSource);
    assert.ok(body.includes('hasPermission(user, "quotes", "MANAGE")'), "canDelete 가 MANAGE 판정이 아니다");
    assert.ok(
      body.includes("canDelete ? listDeletedQuotes() : Promise.resolve([])"),
      "휴지통 조회가 canDelete 로 감싸여 있지 않다"
    );
  });
});

/**
 * ============================================================================
 * 🔴 새 견적서 화면(3b-2)도 **제 관문을 따로 지난다**
 * ============================================================================
 * 목록이 [새 견적서] 를 감추는 것은 막은 것이 아니다 — 주소를 직접 입력하면 그대로
 * 들어와진다. 저장은 `createQuoteAction` 이 세션부터 다시 보지만, 그때는 이미 폼을
 * 다 채운 뒤다. 수정 화면(`[id]/page.tsx`)과 **같은 두 줄**이어야 하는 자리다.
 * ============================================================================
 */
describe("새 견적서 화면 — 쓰기 권한이 없으면 들어올 수 없다", () => {
  test("🔴 영역 가드 → 쓰기 권한 → 조회 차례다. 권한이 없으면 목록으로 돌려보낸다", () => {
    const body = flat(newPageSource);
    const order = [
      'await requireAreaAccessForCurrentUser("quotes");',
      'if (!(await hasPermission(user, "quotes", "WRITE"))) redirect("/quotes");',
      // 조각 3b-3 뒤쪽 절반이 부품 고르개의 두 목록을 더하면서 조회가 셋이 되었고,
      // 서로를 쓰지 않으므로 **함께** 기다린다. 🔴 재는 것은 그대로다 — 조회가
      // 관문 **뒤**에 있는가.
      "await Promise.all([ listRepairLabor(),",
    ].map((marker) => {
      const at = body.indexOf(marker);
      assert.ok(at >= 0, `원본에서 '${marker}' 를 찾지 못했다`);
      return at;
    });
    for (let i = 1; i < order.length; i += 1) {
      assert.ok(order[i] > order[i - 1], "권한 검사·조회 순서가 바뀌었다");
    }
  });

  test("🔴 빈 폼으로 연다 — quote={null} 이 「새로 만들기」다", () => {
    assert.ok(flat(newPageSource).includes("quote={null}"), "폼이 만들기 모드로 열리지 않는다");
  });

  test("🔴 아직 오지 않은 조각의 사슬을 끌고 오지 않는다 — 팝업 · 첨부", () => {
    // 이 화면이 A/S 판을 그대로 베끼면 아직 오지 않은 조각이 통째로 딸려 온다.
    // 🔴 **들여오는 줄만** 본다 — 머리말 주석은 뺀 것들을 이름으로 적어 두고 있다.
    //
    // 🔴 `queries/inventory` 는 2026-09-22(조각 3b-3 뒤쪽 절반)에 **이 목록에서
    //    빠졌다** — 부품 고르개가 들어와 이 화면이 실제로 그 조회를 부른다. 그 자리는
    //    빈 채로 두지 않았다: 무엇을 들여오는지(공용 묶음의 고르개 · 가벼운 조회 둘)와
    //    무엇을 들여오지 않는지(무거운 `getPartList`)를
    //    components/quotes/quote-part-picker-wiring.test.ts 가 못 박는다.
    //
    // 🔴 `quote-template` 과 `lib/xlsx/` 도 2026-09-22(**조각 3c-1**)에 이 목록에서
    //    빠졌다 — 이 화면이 이제 **정말로 둘 다 들여온다.** 양식의 작업 내역
    //    기본값(`storage/quote-template`)과 케이블 줄 수 상한
    //    (`xlsx/cable-quote-template`)이 그것이고, 둘 다 `node:fs` 를 끌고 와
    //    **서버 컴포넌트인 이 페이지만** 읽을 수 있다. 그 자리도 빈 채로 두지
    //    않았다 — 아래 시험이 **들여오는 것이 그 둘뿐임**을 거꾸로 못 박는다.
    //
    // 🔴 `quote-template` 은 애초에 **부분 일치라 위험한 이름**이기도 했다. 이
    //    저장소에는 `lib/domain/quote-template-variant.ts` 가 있고 그것은 화면도
    //    쓰는 순수 규칙이다 — 누가 그것을 이 페이지에 들여오는 날 엉뚱하게
    //    터졌을 것이다. 남은 넷은 그런 위험이 없음을 확인했다(2026-09-22):
    //    `quote-new-start` 만 실재 파일과 겹치고 그 파일이 **바로 막으려는 그것**이다.
    //
    // ── 🔴 2026-09-28(조각 3e-3) — **한 칸을 풀었다**: `quote-new-link` ────
    // 이 화면이 이제 **정말로 그것을 들여온다.** 목록의 [새 견적서]가 팝업을 띄우고,
    // 팝업이 고른 두 값(견적서 종류 · 엑셀 전용)을 주소에 실어 이 화면을 연다 —
    // 이 화면은 `parseNewQuoteStart` 로 그 둘을 되읽는다. 그 사슬(엑셀 읽개 · 통로 ·
    // 칸 채우기)은 조각 3e-1·3e-2 가 이미 다 깔았다.
    //
    // 🔴 **남은 셋은 그대로 금지다**:
    //   · `NewQuoteDialog`    — 팝업을 그리는 곳은 **목록 쪽**이다(QuoteListSlots 의
    //     `NewQuoteControl`). 작성 화면이 창을 또 띄울 까닭이 없다.
    //   · `quote-new-start`   — 처음 상태를 셈하는 것은 **폼**이다(QuoteEditForm 의
    //     `newQuoteStart`). 이 화면은 두 값을 읽어 넘기기만 한다 — 여기서 셈하면
    //     폼을 채우는 길이 둘이 된다.
    //   · `queries/attachments` — **새 견적서 화면에 첨부 칸을 세우는 것은 아직 아니다.**
    //     「만든 직후 올리기」(폼 handleSubmit 의 그 자리)가 없어, 칸만 세우면 고른
    //     파일이 [저장] 때 말없이 사라진다(3d-4 가 일부러 안 세웠다).
    //     ⚠️ 그 까닭은 **그때의 기록**이다 — 🔴 **조각 PO 3k 가 새 견적서 화면에도
    //     칸을 세웠다**(2026-09-28). 🔴 **그래도 이 금지는 그대로다**: 까닭이 바뀌었을
    //     뿐이다. 아직 만들지도 않은 견적서에는 **붙어 있는 파일이 있을 수 없으므로**
    //     이 화면은 서버 칸을 읽을 일이 없다(`attachmentSlots` 를 안 넘긴다 — 위
    //     「3d-4 · PO 3k」 시험이 그것을 잰다). 읽기 시작하면 id 도 없이 무엇을
    //     물을지부터 없다.
    //
    // 🔴 푼 자리는 아래 이웃 시험이 **긍정 단언**으로 메운다 — 무엇을 들여오는지,
    //    그리고 🔴 **수리 건 몫(Ⓐ)의 이름이 저장소 어디에도 없는지**까지.
    const imports = flat(sliceBetween(newPageSource, 'import type { Metadata }', "export const metadata"));
    for (const chain of [
      "NewQuoteDialog",
      "quote-new-start",
      "queries/attachments",
    ]) {
      assert.equal(imports.includes(chain), false, `${chain} — 아직 오지 않은 조각을 끌고 왔다`);
    }
  });

  /**
   * ==========================================================================
   * 🔴 조각 3e-3 — 푼 한 칸(`quote-new-link`)을 **긍정 단언**으로 메운다
   * ==========================================================================
   * 금지 목록으로는 더 이상 잴 수 없으니 **무엇을 들여오는지를 이름으로 못 박는다**
   * (3c-1 이 이 화면에서, 3d-3d 가 첨부 칸에서 한 방식과 같다).
   *
   * 🔴 **둘째 단언이 더 중요하다.** 그 파일에서 안 가져온 몫(Ⓐ — 수리 건 ↔ 견적서
   * 오가기)이 짓는 주소는 `/repair-cases/{id}/quotes` 인데 **이 사이트에 그 경로가
   * 없다.** 그 이름이 어디선가 살아나는 날, 목록이나 폼이 **눌러도 아무 데도 없는
   * 링크**를 내밀게 된다. 2026-09-28 사용자 원칙 — 「돌아가기는 시스템을 건너가지
   * 않는다: A/S 에서 만들면 A/S 의 그 건 견적서 탭으로, **PO 에서 만들면 PO 의
   * 견적서 목록으로**」.
   * ==========================================================================
   */
  test("🔴 조각 3e-3 — 팝업의 두 값만 읽는다. 저장 뒤 나가는 곳은 **이 사이트의 목록**이다", () => {
    const imports = flat(sliceBetween(newPageSource, 'import type { Metadata }', "export const metadata"));

    // ㉠ 들여오는 것은 되읽개 하나와 그 모양뿐이다 — 주소를 **짓는** 함수는 없다.
    assert.ok(
      imports.includes(
        'import { parseNewQuoteStart, type SearchParamsInput } from "@/lib/domain/quote-new-link";'
      ),
      "팝업의 두 값을 되읽는 줄이 사라졌거나 모양이 다르다"
    );
    assert.equal(
      flat(newPageSource).split('from "@/lib/domain/quote-new-link"').length - 1,
      1,
      "quote-new-link 를 들여오는 줄이 둘 이상이다"
    );

    // ㉡ 읽은 두 값은 폼의 처음 값으로만 간다.
    const call = flat(sliceBetween(newPageSource, "<QuoteEditForm", "/>\n  );"));
    assert.ok(call.includes("initialKind={start.kind}"), call);
    assert.ok(call.includes("initialExcelOnly={start.excelOnly}"), call);

    // ㉢ 🔴 **돌아갈 곳을 지어 넘기지 않는다** — 폼의 `returnHref ?? "/quotes"` 가 곧
    //    이 사이트의 견적서 목록이다. 넘기기 시작하면 그 값이 어디서 왔는지가 문제가 된다.
    assert.equal(call.includes("returnHref="), false, "새 견적서 화면이 돌아갈 곳을 지어 넘긴다");
    assert.equal(
      flat(editFormSource).includes('showSavePopup({ message: "견적서를 등록했습니다.", redirectTo: returnHref ?? "/quotes" });'),
      true,
      "저장 뒤 나가는 곳이 이 사이트의 견적서 목록이 아니다"
    );
  });

  test("🔴 조각 3e-3 — 수리 건 몫(Ⓐ)의 이름이 **이 저장소 어디에도** 없다", () => {
    // 🔴 `quote-new-link.ts` 에서 **일부러 안 가져온** 이름들이다(그 파일 머리말).
    //    그것들이 짓는 주소는 `/repair-cases/{id}/quotes` 이고, 이 사이트에는 그 경로가
    //    없다(app/(app) 아래는 domestic-orders · quotes · repair-labor · no-access 넷).
    //    🔴 **머리말이 「안 가져왔다」고 이름을 적어 두므로 주석을 뺀 코드만 본다.**
    const sources = [
      ["quote-new-link", read("src/lib/domain/quote-new-link.ts")],
      ["NewQuoteDialog", read("src/components/quotes/NewQuoteDialog.tsx")],
      ["QuoteListSlots", slotsSource],
      ["quotes/page.tsx", pageSource],
      ["quotes/new/page.tsx", newPageSource],
      ["QuoteEditForm", editFormSource],
      ["quotes/[id]/page.tsx", detailPageSource],
    ] as const;
    for (const [name, source] of sources) {
      const code = codeOf(source);
      for (const forbidden of [
        "newQuoteHrefForRepairCase",
        "parseNewQuoteLink",
        "returnHrefForNewQuote",
        "trustedLinkedRepairCaseId",
        "returnHrefForEditQuote",
        // 🔴 2026-09-28(**조각 PO 3j**)에 늘었다. 목록에 [미리보기 · PDF] 를 세우면서
        //    저쪽의 `PreviewLink` 를 옮겼는데, 그 링크가 주소를 짓는 함수가 이것이다 —
        //    **수리 건을 싣는다.** 옮기면서 `href` 만 이 사이트의 것으로 갈았고, 그
        //    이름이 언젠가 따라 들어오지 않도록 여기에 못 박는다(그 조각 자체를 잰
        //    단언은 위 「미리보기 주소는 `/quotes/{id}/print` 한 줄이다」).
        "quotePrintHref",
        "returnHrefForQuotePrint",
        "repairCaseDetailHrefs",
      ]) {
        assert.equal(code.includes(forbidden), false, `${name} 이 없는 수리 건 화면의 이름을 쓴다: ${forbidden}`);
      }
      // 🔴 **주소로서의** `/repair-cases` — 따옴표 · 역따옴표로 열리는 글자만 본다.
      //    이 저장소에는 `@/components/repair-cases/…`(A/S 에서 함께 옮겨 온 편집 칸
      //    조각들)가 있고 그것은 **모듈 경로**다 — 사람이 눌러 가는 주소가 아니다.
      assert.equal(
        /["'`]\/repair-cases/.test(code),
        false,
        `${name} 이 없는 수리 건 화면으로 가는 주소를 짓는다`
      );
    }
    // 🔴 그 경로가 정말 없다 — 위 금지가 「아직 안 만들었을 뿐」이 아님을 함께 잰다.
    assert.equal(
      existsSync(fileURLToPath(new URL("src/app/(app)/repair-cases", repoUrl))),
      false,
      "수리 건 경로가 생겼다 — 위 금지를 다시 재야 한다"
    );
  });

  /**
   * ⚠️ 🔴 **조각 3f 가 여기를 고쳤다**(2026-09-28). 아래 「없는 것」 셋 가운데
   * `readAllQuoteTemplateHeaders` 가 **왔다** — 폼에 `printHeaders` 프롭이 생겨
   * [미리보기 · PDF] 가 그 값을 쓴다. 그래서 그 이름을 **금지에서 「있어야 하는 것」으로
   * 옮겼다**(방향을 뒤집었지 지운 것이 아니다 — 이제 사라지면 미리보기가 빈 머리말로
   * 그려지므로 여전히 소리가 난다).
   * 🔴 **나머지 둘(`quote-workbook` · `quote-issue`)의 금지는 그대로다.**
   */
  test("🔴 엑셀 사슬에서 들여오는 것은 **셋**이다 — 발행은 아직 아니다", () => {
    // 위 시험에서 `quote-template` · `lib/xlsx/` 를 뺀 자리를 메운다(조각 3c-1).
    // 금지 목록으로는 더 이상 잴 수 없으니 **들여오는 것을 이름으로 못 박는다.**
    const imports = flat(sliceBetween(newPageSource, 'import type { Metadata }', "export const metadata"));

    // 있는 것 — 이 둘이 사라지면 종류를 바꿔도 조사 · 통전 칸이 안 채워지고,
    // 케이블 줄 수 상한이 화면에 다시 박히게 된다.
    for (const needed of [
      'readAllQuoteTemplateHeaders, readAllQuoteWorkSectionDefaults } from "@/lib/storage/quote-template"',
      'CABLE_QUOTE_MAX_LINES } from "@/lib/xlsx/cable-quote-template"',
    ]) {
      assert.ok(imports.includes(needed), `${needed} — 3c-1 · 3f 가 배선한 것이 사라졌다`);
    }

    // 🔴 없는 것 — 다음 조각들이다.
    //  · `readAllQuoteTemplateHeaders` : **조각 3f(미리보기)**. 저쪽에서 그 값을 쓰는
    //    곳은 미리보기 한 줄(`printHeaders`)뿐이고 이 사이트의 폼에는 그 프롭이 아예
    //    없다 — 읽으면 양식 다섯을 더 열고도 아무도 보지 않는다.
    //    ⚠️ 그때의 기록이다 — 🔴 **조각 3f 가 왔다**(2026-09-28). 위 「있는 것」으로
    //    옮겼다.
    //  · `quote-workbook` : 2026-09-22(조각 3c-2)에 왔지만 **받기 통로**(api/quotes/[id]/
    //    xlsx)의 것이다 — 새 견적서 화면이 워크북을 만들 일은 없다.
    //  · `quote-issue` : **조각 3c-3**(발행). 아직 이 저장소에 없다.
    //    ⚠️ 그 마지막 줄은 **그때의 기록**이다. 조각 3e-2 가
    //    `components/quotes/quote-issue-messages.ts` **하나만** 들여왔다(곁 파일
    //    quote-excel-autofill.ts 가 알림 줄의 타입 하나를 쓴다 — 그 파일 머리말).
    //    발행 자체는 여전히 없고, 🔴 **금지는 그대로다** — 이 글자는 부분 일치라
    //    `quote-issue-messages` 도 걸린다. 새 견적서 화면이 발행 알림 문장을 끌고
    //    올 까닭이 없으므로 **그것이 맞는 상태**다. 3c-3 이 오는 날 다시 잰다.
    for (const notYet of ["quote-workbook", "quote-issue"]) {
      assert.equal(imports.includes(notYet), false, `${notYet} — 아직 오지 않은 조각을 끌고 왔다`);
    }
  });
});

/**
 * ============================================================================
 * 🔴 서버에서 건너가는 **요소 슬롯**에는 key 를 붙인다 (2026-09-28)
 * ============================================================================
 * 목록을 열 때마다 개발 오버레이에 이 콘솔 오류가 떴다:
 *
 *     Each child in a list should have a unique "key" prop.
 *     Check the render method of `QuoteListScreen`. It was passed a child from
 *     QuotesPage.
 *
 * 🔴 **화면 쪽에 key 없는 배열이 있어서가 아니다.** 그 자리는
 * `{canEdit && newQuoteControl}` 한 줄이고(QuoteListScreen.tsx:310), 줄을 그리는
 * `rows.map(` 세 곳은 전부 `key={row.id}` 를 갖고 있다. 코드를 읽어서는 안 나온다.
 *
 * ── 실제로 재어 본 것 (브라우저에서) ────────────────────────────────────
 * 머리 줄 `<div>` 의 React fiber 에서 children 을 꺼내 보니 둘이었고, 둘째가
 * 이랬다:
 *
 *     { $$typeof: "react.lazy", _store: { validated: 1 },
 *       _payload: { status: "fulfilled",
 *                   value: { owner: "QuotesPage", key: null,
 *                            _store: { validated: 0 } } } }
 *
 * 🔴 **page.tsx 는 서버 컴포넌트다.** 거기서 만든 요소는 RSC 꾸러미에 실려 건너오고,
 * 브라우저의 Flight 해독기는 그 요소가 기다릴 것이 있으면 **`react.lazy` 껍데기에
 * 싸서** 내놓는다. React 의 dev 검사는 정적 형제(`jsxs`)를 훑을 때 **껍데기만**
 * 「봤다」고 표시하는데(validated: 1), 화해 단계의 `warnOnInvalidKey` 는 `react.lazy`
 * 를 만나면 **껍데기를 벗겨 속의 요소**를 본다. 속의 요소는 표시가 안 된 채(0) key 도
 * 없어서 경고가 난다.
 *
 * 그래서 고칠 곳은 **요소를 만드는 자리**다 — 서브모듈(vendor/dss-core)은 손댈 것이
 * 없다. key 는 RSC 꾸러미에 그대로 실려 건너간다.
 *
 * ── 🔴 왜 「전부 key 를 붙여라」로 적지 않는가 ──────────────────────────
 * 이 경고는 받는 쪽이 그 요소를 **여럿 중 하나로** 놓을 때만 난다. 혼자 놓이는
 * 자리(아래 다섯)는 지금 경고가 없다 — /quotes 와 /quotes/{id} 를 띄워 콘솔로
 * 확인했다(2026-09-28). 그러니 여기서는 **키 없는 것의 목록을 못 박는다**: 새로
 * 생기거나 [새 견적서] 것이 되돌아가면 이 시험이 터지고, 그때 「그 자리가 배열인가」를
 * 사람이 한 번 보게 된다.
 * ============================================================================
 */
describe("🔴 서버 컴포넌트가 프롭으로 건네는 요소 — key", () => {
  /**
   * `이름={<Tag …>}` 에서 **여는 태그만** 잘라 낸다.
   *
   * 여는 태그의 끝은 「중괄호·따옴표 밖의 첫 `>`」다 — `prop={a > b}` 나 문자열 속의
   * `>` 에 걸리지 않게 손으로 훑는다. 닫는 태그까지 볼 까닭은 없다(key 는 여는
   * 태그에만 적는다).
   */
  const elementPropOpenTags = (code: string) => {
    const found: { prop: string; open: string }[] = [];
    const opener = /\b([A-Za-z][\w]*)\s*=\s*\{\s*</g;
    let match: RegExpExecArray | null;
    while ((match = opener.exec(code)) !== null) {
      const start = opener.lastIndex - 1;
      let depth = 0;
      let quote: string | null = null;
      let end = -1;
      for (let i = start + 1; i < code.length; i += 1) {
        const ch = code[i];
        if (quote !== null) {
          if (ch === quote) quote = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
          quote = ch;
          continue;
        }
        if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
        else if (ch === ">" && depth === 0) {
          end = i;
          break;
        }
      }
      if (end >= 0) found.push({ prop: match[1], open: code.slice(start, end + 1) });
    }
    return found;
  };

  /** 주석을 벗긴 원본. 🔴 `"use client"` 판정도 이것으로 한다 — page.tsx 의 머리말이 그 낱말을 **설명으로** 적어 두었다. */
  const withoutComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

  const hasKeyProp = (openTag: string) => /\bkey\s*=/.test(openTag);

  test("🔴 [새 견적서] 슬롯에 key 가 붙어 있다", () => {
    const slots = elementPropOpenTags(withoutComments(pageSource)).filter(
      (found) => found.prop === "newQuoteControl"
    );
    assert.equal(slots.length, 1, "page.tsx 에서 newQuoteControl 슬롯을 찾지 못했다");
    assert.ok(
      hasKeyProp(slots[0].open),
      "newQuoteControl 요소에 key 가 없다 — 목록을 열면 개발 오버레이에 " +
        '\'Each child in a list should have a unique "key" prop\' 이 다시 뜬다 ' +
        "(까닭은 이 묶음 머리말)"
    );
  });

  test("🔴 서버 컴포넌트가 건네는 요소 가운데 key 없는 것은 **다섯**이다", () => {
    const keyless: string[] = [];
    let scanned = 0;
    const walk = (relativeDir: string) => {
      for (const entry of readdirSync(fileURLToPath(new URL(relativeDir, repoUrl)), {
        withFileTypes: true,
      })) {
        const relativePath = `${relativeDir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(relativePath);
          continue;
        }
        // 시험 파일은 화면이 아니다 — 앱이 그리지 않으므로 이 경고가 날 자리가 없다.
        if (!/\.tsx$/.test(entry.name) || /\.test\.tsx$/.test(entry.name)) continue;
        const code = withoutComments(read(relativePath));
        // 🔴 `"use client"` 가 맨 앞에 선 파일은 **클라이언트**다 — 그 안에서 만든
        //    요소는 꾸러미를 건너지 않아 lazy 껍데기가 씌워지지 않는다.
        if (/^\s*["']use client["']/.test(code)) continue;
        scanned += 1;
        for (const found of elementPropOpenTags(code)) {
          if (!hasKeyProp(found.open)) keyless.push(`${relativePath} · ${found.prop}`);
        }
      }
    };
    walk("src");

    // 🔴 **아무것도 안 훑고 통과하는 길을 막는다**(quote-attachment-files.test.ts 와 같은 이유).
    assert.ok(scanned > 15, `훑은 서버 파일이 ${scanned}개뿐이다 — 걷는 길이 끊겼는지 보라`);

    keyless.sort();
    assert.deepEqual(keyless, [
      // 다섯 다 **혼자 놓이는 자리**다(메뉴바 · 화면 메뉴 · 알림 종 · 편집 폼 · 결재 칸).
      // 지금은 경고가 나지 않는다 — 2026-09-28 에 두 화면을 띄워 콘솔로 확인했다.
      // 🔴 여기에 하나가 늘면 **그 자리가 여럿 중 하나인지** 먼저 보라.
      "src/app/(app)/layout.tsx · notificationBell",
      "src/app/(app)/layout.tsx · screenNav",
      "src/app/(app)/layout.tsx · serviceMenu",
      "src/app/(app)/quotes/[id]/page.tsx · approvalPanel",
      "src/app/(app)/quotes/[id]/page.tsx · editForm",
    ]);
  });
});
