import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
const actionSource = read("src/lib/server/actions/quotes.ts");
const dialogsSource = read("vendor/dss-core/src/ui/common/master-data-trash-dialogs.tsx");

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

  test("🔴 조각 3b-2 — [새 견적서] 는 작성 화면으로 간다. 팝업을 거치지 않는다", () => {
    // 🔴 **page.tsx 에서** 넘긴다 — 이 슬롯은 ReactNode 라 서버 경계를 넘는다.
    // 함수 슬롯 넷(위 묶음)과 갈리는 자리라, 어느 파일에서 왔는지까지 본다.
    const call = flat(sliceBetween(pageSource, "<QuoteListSlots", "/>\n  );"));
    assert.ok(call.includes("newQuoteControl="), "[새 견적서] 자리가 비어 있다");
    assert.ok(call.includes('href="/quotes/new"'), "[새 견적서] 가 작성 화면을 가리키지 않는다");
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
    // 🔴 인수번호가 가는 곳(수리 건 상세)은 **A/S 의 화면**이다. 사이트를 건너가는
    // 주소를 이 사이트가 지어내지 않는다 — 조각 4·5 에서 정한다.
    assert.equal(both.includes("intakeHref="), false, "수리 건 상세 주소를 이 사이트가 지어내고 있다");
  });

  test("🔴 조각 3c-2 — 줄마다 [견적서 받기] 링크가 선다. 엑셀 전용 줄에는 링크 대신 곁말이다", () => {
    // 위 시험에서 `renderRowActions=` 를 뺀 자리를 메운다 — 금지 목록으로는 더 이상
    // 잴 수 없으니 **무엇이 걸렸는지를 이름으로 못 박는다**(3c-1 이 new/page.tsx 에서
    // 한 방식과 같다).
    const slots = flat(slotsSource);

    // 🔴 함수 슬롯이라 **QuoteListSlots 에서** 건다 — page.tsx 에서 넘기면 화면이 죽는다.
    assert.ok(
      slots.includes("renderRowActions={(row) => <QuoteDownloadLink row={row} />}"),
      "받기 슬롯이 채워지지 않았거나 모양이 다르다"
    );

    // 🔴 그 주소에 실제로 통로가 있어야 한다 — 없는 곳으로 보내는 링크는 3a 가 막던 그것이다.
    assert.equal(
      existsSync(fileURLToPath(new URL("src/app/api/quotes/[id]/xlsx/route.ts", repoUrl))),
      true,
      "받기 링크가 가리키는 통로가 없다"
    );

    const link = flat(sliceBetween(slotsSource, "function QuoteDownloadLink(", "/** 화면이 받는 프롭에서"));

    // 🔴 **평범한 링크 하나**다. `download` 도 fetch 도 쓰지 않는다 — 파일 이름은 서버가
    //    Content-Disposition 으로 정한다(domain/quote-file-name.ts). 클라이언트가 이름을
    //    정하면 화면마다 다른 이름으로 저장되는 날이 온다.
    assert.ok(link.includes("href={`/api/quotes/${row.id}/xlsx`}"), "받기 링크의 주소가 다르다");
    // 🔴 `<a>` 의 속성만 본다 — 주석에도 그 낱말이 나온다(파일 이름 규칙을 가리킨다).
    const anchor = sliceBetween(link, "<a href={`/api/quotes", ">");
    assert.equal(anchor.includes("download"), false, "클라이언트가 파일 이름을 정하고 있다");
    assert.equal(link.includes("fetch("), false, "링크가 아니라 fetch 로 받고 있다");

    // 🔴 **권한으로 갈리지 않는다** — 그 통로의 문턱은 `quotes` READ 라 수정 권한자도
    //    같은 링크로 받는다. A/S 는 수정 권한자에게 여기서 발행 단추를 보이는데 그것은
    //    조각 3c-3 의 것이다(그 단추가 오면 이 단언이 깨지고, 그때 뜻을 다시 적는다).
    assert.equal(link.includes("canEdit"), false, "받기 링크가 canEdit 으로 갈린다");

    // 🔴 엑셀 전용 줄 — 링크 대신 **꺼진 단추**다. 문장은 **통로가 돌려주는 그 하나**다.
    assert.ok(link.includes("if (row.isExcelOnly) {"), "엑셀 전용 갈래가 없다 — 눌러서 실패하는 단추가 선다");
    assert.ok(
      link.includes("<UnavailableDownload reason={QUOTE_EXCEL_ONLY_DOWNLOAD_MESSAGE} />"),
      "엑셀 전용 줄이 통로와 같은 문장을 쓰지 않는다"
    );
    // 🔴 「양식 없는 종류」 갈래도 **같은 모양**이다 — 셋이 제각각이면 다음 사람이 어느
    //    것이 옳은지 모른다(지금 걸리는 종류는 없다).
    assert.ok(
      link.includes("<UnavailableDownload reason={QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE} />"),
      "양식 없는 종류 갈래가 다른 모양이다"
    );
  });

  test("🔴 조각 3c-2(눈 확인 뒤) — 단추 칸은 **모든 줄에서 같다**. 못 받는 줄은 흐린 단추다", () => {
    // 🔴 처음에는 받을 수 없는 줄의 단추 자리에 「엑셀 전용」 곁말을 넣었는데, 글자 폭이
    //    단추와 달라 **그 두 줄만 [삭제] 가 밀려** 목록이 들쭉날쭉했다(2026-09-22 눈
    //    확인). A/S 는 딱지를 왼쪽 칸에 두고 단추 칸은 모든 줄이 같다.
    const slots = flat(slotsSource);
    const unavailable = flat(sliceBetween(slotsSource, "function UnavailableDownload(", "function QuoteDownloadLink("));

    // 🔴 상자 모양을 **켜진 것과 꺼진 것이 같은 값**으로 쓴다 — 칸이 흔들리지 않는 근거다.
    assert.ok(slots.includes("const ROW_ACTION_CLASS ="), "받기 자리의 상자 모양이 한 곳에 없다");
    assert.ok(unavailable.includes("${ROW_ACTION_CLASS}"), "꺼진 단추가 다른 상자 모양을 쓴다");
    assert.ok(
      flat(sliceBetween(slotsSource, "<a", "</a>")).includes("${ROW_ACTION_CLASS}"),
      "받기 링크가 다른 상자 모양을 쓴다"
    );
    // 이름도 같다 — 같은 자리에 다른 낱말이 서면 칸 폭이 달라진다.
    assert.ok(unavailable.includes("견적서 받기"), "꺼진 단추의 이름이 다르다");
    assert.ok(flat(sliceBetween(slotsSource, "<a", "</a>")).includes("견적서 받기"), "받기 링크의 이름이 다르다");

    // 🔴 정말로 **꺼져 있다**(눌러서 실패하는 단추가 아니다). 흐리게 하는 방식은 이
    //    저장소의 관행 그대로다 — `disabled:` 짝과 곁말(title).
    assert.ok(unavailable.includes("disabled"), "꺼진 단추가 실제로 꺼져 있지 않다");
    assert.ok(
      unavailable.includes("disabled:cursor-not-allowed disabled:opacity-50"),
      "흐리게 하는 방식이 이 저장소의 관행과 다르다"
    );
    // 🔴 곁말은 감싼 span 에도 단다 — 꺼진 단추는 제 title 을 못 띄우는 브라우저가 있다.
    assert.equal(unavailable.split("title={reason}").length - 1, 2, "곁말이 한 곳에만 있다");
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

    // 🔴 그리고 **첨부 조회를 들여오지 않는다** — 이 사이트에는 그 파일이 아예 없다(3d).
    //    🔴 **주석을 뺀 코드만** 본다: 세 파일의 머리말이 「이 저장소에는 아직
    //    `queries/attachments.ts` 도 없다」고 적어 두고 있어, 원본을 그대로 훑으면 그
    //    설명이 걸린다(시험이 주석을 고치라고 요구하게 된다).
    for (const chain of ["queries/attachments", "attachment-allowlist", "attachment-path", "storage-adapter"]) {
      for (const [name, source] of [
        ["QuoteListSlots", slotsSource],
        ["quote-attachment-files", filesSource],
        ["QuoteAttachmentParts", partsSource],
      ] as const) {
        assert.equal(codeOf(source).includes(chain), false, `${name} 이 첨부 사슬을 끌고 왔다: ${chain}`);
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
    const imports = flat(sliceBetween(newPageSource, 'import type { Metadata }', "export const metadata"));
    for (const chain of [
      "NewQuoteDialog",
      "quote-new-link",
      "quote-new-start",
      "queries/attachments",
    ]) {
      assert.equal(imports.includes(chain), false, `${chain} — 아직 오지 않은 조각을 끌고 왔다`);
    }
  });

  test("🔴 엑셀 사슬에서 들여오는 것은 **둘뿐**이다 — 발행 · 미리보기는 아직 아니다", () => {
    // 위 시험에서 `quote-template` · `lib/xlsx/` 를 뺀 자리를 메운다(조각 3c-1).
    // 금지 목록으로는 더 이상 잴 수 없으니 **들여오는 것을 이름으로 못 박는다.**
    const imports = flat(sliceBetween(newPageSource, 'import type { Metadata }', "export const metadata"));

    // 있는 것 — 이 둘이 사라지면 종류를 바꿔도 조사 · 통전 칸이 안 채워지고,
    // 케이블 줄 수 상한이 화면에 다시 박히게 된다.
    for (const needed of [
      'readAllQuoteWorkSectionDefaults } from "@/lib/storage/quote-template"',
      'CABLE_QUOTE_MAX_LINES } from "@/lib/xlsx/cable-quote-template"',
    ]) {
      assert.ok(imports.includes(needed), `${needed} — 3c-1 이 배선한 것이 사라졌다`);
    }

    // 🔴 없는 것 — 다음 조각들이다.
    //  · `readAllQuoteTemplateHeaders` : **조각 3f(미리보기)**. 저쪽에서 그 값을 쓰는
    //    곳은 미리보기 한 줄(`printHeaders`)뿐이고 이 사이트의 폼에는 그 프롭이 아예
    //    없다 — 읽으면 양식 다섯을 더 열고도 아무도 보지 않는다.
    //  · `quote-workbook` : 2026-09-22(조각 3c-2)에 왔지만 **받기 통로**(api/quotes/[id]/
    //    xlsx)의 것이다 — 새 견적서 화면이 워크북을 만들 일은 없다.
    //  · `quote-issue` : **조각 3c-3**(발행). 아직 이 저장소에 없다.
    for (const notYet of ["readAllQuoteTemplateHeaders", "quote-workbook", "quote-issue"]) {
      assert.equal(imports.includes(notYet), false, `${notYet} — 아직 오지 않은 조각을 끌고 왔다`);
    }
  });
});
