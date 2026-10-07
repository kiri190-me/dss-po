import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import QuoteEditTabs from "./QuoteEditTabs";
import QuoteApprovalStatusBadge from "./QuoteApprovalStatusBadge";
import QuoteApprovalHistory from "./QuoteApprovalHistory";
import QuoteApprovalDialog from "./QuoteApprovalDialog";
/**
 * 🔴 이 import 자체가 시험이다 — 문구를 모아 둔 파일이 무언가를 물기 시작하면
 * (`server-only` 사슬 끝, "use client", 화면 라이브러리) 이 시험 파일이
 * **여기서** 죽는다. 그 파일 머리말이 약속한 그대로다.
 */
import {
  QUOTE_APPROVAL_DOES_NOT_BLOCK_ISSUE_NOTICE,
  QUOTE_APPROVAL_EMPTY_HISTORY_TEXT,
  QUOTE_APPROVAL_MENU_HINT,
  QUOTE_APPROVAL_OUTDATED_NOTICE,
  QUOTE_APPROVAL_REASON_REQUIRED_MESSAGE,
  QUOTE_APPROVAL_ROUTE_MISSING_NOTICE,
  QUOTE_APPROVAL_STATE_DESCRIPTIONS,
  QUOTE_APPROVAL_STATE_LABELS,
} from "./quote-approval-texts";
import { QUOTE_APPROVAL_STATES } from "@/lib/domain/quote-approval-rules";
import type { QuoteApprovalRecordRow } from "@/lib/db/queries/quote-approvals";
import type { ShipmentApprovalRouteStepList } from "@/lib/db/queries/shipment-approval-routes";

/**
 * ============================================================================
 * [견적서 결재] 탭 — 못 박아 두는 것들 (조각 PO 결재-C, 2026-09-28)
 * ============================================================================
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/components/quotes/quote-approval-screen.test.tsx` —
 * 2026-09-28 실측 399줄)이다. 이 사이트의 사실로 바꾼 자리는 묶음마다 곁말로
 * 적어 두었고, 🔴 **단언을 약하게 만든 자리는 없다** — 저쪽이 발행 단추로 재던
 * 것을 이 사이트에서 그 자리를 대신하는 길([견적서 받기])로 옮겨 잰다.
 *
 * 사고가 났을 때 되돌리기 가장 비싼 것부터 다섯이다.
 *
 *  1) 🔴 **탭을 바꿔도 편집 폼이 떼어지지 않는다.** 떼어지면 사람이 한참 적어
 *     넣던 품목·금액이 통째로 사라진다. 눈으로는 「탭이 잘 도네」로만 보여서
 *     결함이 오래 숨는다.
 *  2) 🔴 **`APPROVED_OUTDATED` 가 「승인됨」과 다르게 보인다.** 그 상태가 있는
 *     이유가 「승인받은 뒤 금액을 바꿔도 승인이 살아 있는 것처럼 보이는 일」을
 *     막는 것이다.
 *  3) 🔴 **결재는 아무 문도 잠그지 않는다**(2026-09-18 사용자 결정).
 *  4) 결재선이 없을 때 **무엇을 해야 하는지** 말한다. 반려에는 사유가 필요하다.
 *  5) 🔴 **화면과 서버가 같은 메뉴를 가리킨다.** 결재선 설정은 A/S 에서만 하므로
 *     (2026-09-28 사용자 결정) 두 자리 다 그 사실을 말해야 한다 — 한 자리만
 *     고치면 눌러 보기 전과 누른 뒤가 서로 다른 메뉴를 가리킨다.
 *
 * ── 왜 어떤 것은 렌더하고 어떤 것은 원본을 읽는가 ──────────────────────────
 * QuoteEditTabs·배지·이력·확인 창은 순수해서(타입 말고 실제로 물고 있는 것이
 * 없다) 그대로 렌더해 검사한다. 반대로 QuoteApprovalPanel 은 **서버 액션을 직접
 * import 하는 클라이언트 컴포넌트**라, 그 사슬 끝의 `server-only` 때문에
 * react-server 조건 없이 도는 test:components 에서는 import 자체가 던진다.
 * 그래서 이 저장소의 이웃 시험(quote-list-screen-source.test.ts ·
 * quote-excel-autofill-screens.test.tsx)과 같은 방법으로 원본을 글자로 읽어
 * 확인한다 — 그 관례는 quote-approval-texts.ts:12-17 에도 적혀 있다.
 *
 * 🔴 이 파일은 `scripts/test-lists/components.txt` 에 적는다(`unit.txt` 가
 * 아니다) — `renderToStaticMarkup` 은 `--conditions=react-server` 에서 스스로
 * 막힌다(그 목록 파일 머리말).
 * ============================================================================
 */

const repoUrl = new URL("../../../", import.meta.url);
/** CRLF 로 받아 둔 저장소에서도 줄바꿈 표지가 맞도록 LF 로 맞춘다. */
const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, repoUrl), "utf8").replace(/\r\n/g, "\n");

/** 줄바꿈·들여쓰기 차이로 시험이 깨지지 않도록 공백을 하나로 접는다. */
const flat = (source: string) => source.replace(/\s+/g, " ");

/**
 * 주석을 뺀 코드. 🔴 「가져오지 않았는지」·「말하지 않는지」를 재는 단언에
 * 필요하다 — 이 저장소의 머리말들은 **저쪽 말과 아직 오지 않은 조각의 이름**을
 * 그대로 적어 두고 「여기에는 없다」고 설명한다(이웃 시험이 세운 방식과 같다).
 */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

const tabsSource = read("src/components/quotes/QuoteEditTabs.tsx");
const panelSource = read("src/components/quotes/QuoteApprovalPanel.tsx");
const textsSource = read("src/components/quotes/quote-approval-texts.ts");
const editFormSource = read("src/components/quotes/QuoteEditForm.tsx");
/**
 * 🔴 **수정 권한자의 [견적서 받기](발행) 단추** — 조각 3e-3 때는 이 파일 안의
 * 결과 줄 조각 하나뿐이었고, 🔴 **조각 3c-3 이 단추 본체를 더했다**(2026-09-28).
 * 이 파일이 결재를 보기 시작하는 날이 곧 발행이 결재에 묶이기 시작하는 날이다.
 */
const issueButtonSource = read("src/components/quotes/QuoteIssueButton.tsx");
/** 🔴 단추가 부르는 곳 — 발행 통로(POST …/issue)를 부르는 자리는 이 파일 하나다. */
const issueDownloadSource = read("src/components/quotes/quote-issue-download.ts");
/** 🔴 보기 권한자가 파일을 받는 길 — 목록 줄의 [견적서 받기] 링크(GET …/xlsx). */
const listSlotsSource = read("src/components/quotes/QuoteListSlots.tsx");
/** 🔴 보기 권한자의 받기 링크가 사는 자리 — 2026-10-07 에 목록에서 여기로 옮겨 잰다. */
const printViewSource = read("src/components/quotes/QuotePrintView.tsx");
const editPageSource = read("src/app/(app)/quotes/[id]/page.tsx");
const newPageSource = read("src/app/(app)/quotes/new/page.tsx");
/** 🔴 서버가 눌렀을 때 돌려주는 거절 문구가 있는 자리(조각 결재-B 가 깔았다). */
const mutationSource = read("src/lib/db/mutations/quote-approvals.ts");

/** 화면을 그리는 마지막 return 문만 잘라낸다 — 함수 안의 이른 return 은 걸리지 않는다. */
const renderBlock = (source: string) => source.slice(source.indexOf("  return ("));

function approvalRecord(overrides: Partial<QuoteApprovalRecordRow> = {}): QuoteApprovalRecordRow {
  return {
    id: "quote-approval-1",
    status: "REQUESTED",
    requestedByUserId: "user-1",
    requestedByName: "홍길동",
    requestedAt: "2026-09-18T01:00:00.000Z",
    requestReason: "금액 확인 부탁드립니다",
    assignedApproverUserId: null,
    assignedApproverName: null,
    routeId: null,
    routeStepOrder: null,
    decidedByUserId: null,
    decidedByName: null,
    decidedAt: null,
    decisionReason: null,
    quoteVersionAtRequest: 3,
    ...overrides,
  };
}

/** 판 하나 — 단계 순서는 이름 순서대로 1부터 매긴다. */
function route(routeId: string, approverNames: string[]): ShipmentApprovalRouteStepList {
  return {
    routeId,
    steps: approverNames.map((approverName, index) => ({
      stepOrder: index + 1,
      approverUserId: `approver-${index + 1}`,
      approverName,
    })),
  };
}

describe("🔴 탭을 바꿔도 편집 폼이 떼어지지 않는다", () => {
  const markup = renderToStaticMarkup(
    <QuoteEditTabs editForm={<p>편집폼이있던자리</p>} approvalPanel={<p>결재화면이있던자리</p>} />
  );

  test("첫 화면에서 두 칸이 **동시에** 그려진다 — 감춰진 쪽도 DOM 에 있다", () => {
    assert.ok(markup.includes("편집폼이있던자리"), "편집 폼이 그려지지 않았다");
    assert.ok(
      markup.includes("결재화면이있던자리"),
      "결재 화면이 DOM 에 없다 — 갈라 그리면 탭을 오갈 때 적던 내용이 날아간다"
    );
  });

  test("지금 탭만 보이고 나머지 칸은 hidden 이다", () => {
    assert.match(
      markup,
      /<div id="quote-tab-panel-approval"[^>]*hidden[^>]*>/,
      "안 보이는 칸이 감춰져 있지 않다"
    );
    assert.doesNotMatch(
      markup,
      /<div id="quote-tab-panel-edit"[^>]*hidden[^>]*>/,
      "지금 보고 있는 칸이 감춰져 있다"
    );
  });

  test("🔴 두 칸이 조건 없이 그려진다 — 삼항·&& 로 감싸면 떼어진다", () => {
    const block = renderBlock(tabsSource);
    for (const slot of ["{editForm}", "{approvalPanel}"]) {
      const line = block.split("\n").find((one) => one.includes(slot));
      assert.ok(line, `원본에서 ${slot} 를 찾지 못했다`);
      assert.equal(
        line.trim(),
        slot,
        `${slot} 가 조건 안에 들어갔다 — 탭을 바꾸면 그 컴포넌트가 떼어져 적던 내용이 사라진다`
      );
    }
  });

  test("🔴 감추는 장치가 그대로 있다 — hidden 속성과 class 둘 다", () => {
    const flattened = flat(tabsSource);
    assert.ok(flattened.includes('hidden={tab !== "edit"}'));
    assert.ok(flattened.includes('hidden={tab !== "approval"}'));
    // 브라우저 기본 스타일의 [hidden] 은 배치용 class 하나에 진다 — 실제로
    // 감추는 것은 이 class 다. 둘 중 하나만 남기지 않는다.
    assert.ok(flattened.includes('className={tab === "edit" ? undefined : "hidden"}'));
    assert.ok(flattened.includes('className={tab === "approval" ? undefined : "hidden"}'));
  });

  test("⚠️ 그렇게 만든 까닭이 파일에 적혀 있다 — 지우면 다음 사람이 이 사고를 되살린다", () => {
    assert.match(tabsSource, /언마운트/);
    assert.match(tabsSource, /안 보이는 걸 왜 그려 두지/);
  });

  test("껍데기는 편집 폼도 결재 화면도 import 하지 않는다 — 서버가 그려 넘긴다", () => {
    assert.doesNotMatch(tabsSource, /from "\.\/QuoteEditForm"/);
    assert.doesNotMatch(tabsSource, /from "\.\/QuoteApprovalPanel"/);
  });

  /**
   * 🔴 이 사이트에서 더한 단언 — **페이지가 두 화면을 다 넘긴다.**
   * 위 단언들은 껍데기가 받은 것을 안 버리는지만 본다. 페이지가 `approvalPanel`
   * 을 안 넘기면 껍데기는 멀쩡한데 탭만 빈 채로 열린다.
   */
  test("🔴 수정 화면이 두 칸을 다 채워 넘긴다", () => {
    const call = flat(codeOf(editPageSource));
    assert.ok(call.includes("<QuoteEditTabs editForm={ <QuoteEditForm"), call.slice(0, 400));
    assert.ok(call.includes("} approvalPanel={ <QuoteApprovalPanel"), "결재 칸이 비어 있다");
  });
});

describe("🔴 APPROVED_OUTDATED 는 「승인됨」과 다르게 보인다", () => {
  test("다섯 상태의 이름표가 서로 다르다", () => {
    const labels = QUOTE_APPROVAL_STATES.map((state) => QUOTE_APPROVAL_STATE_LABELS[state]);
    assert.equal(new Set(labels).size, labels.length, "같은 이름표를 쓰는 상태가 있다");
  });

  test("이름표와 설명이 승인됨과 갈라진다", () => {
    assert.notEqual(
      QUOTE_APPROVAL_STATE_LABELS.APPROVED,
      QUOTE_APPROVAL_STATE_LABELS.APPROVED_OUTDATED
    );
    assert.notEqual(
      QUOTE_APPROVAL_STATE_DESCRIPTIONS.APPROVED,
      QUOTE_APPROVAL_STATE_DESCRIPTIONS.APPROVED_OUTDATED
    );
  });

  test("배지가 「승인 완료」 글자도 그 색도 쓰지 않는다", () => {
    const approved = renderToStaticMarkup(<QuoteApprovalStatusBadge state="APPROVED" />);
    const outdated = renderToStaticMarkup(<QuoteApprovalStatusBadge state="APPROVED_OUTDATED" />);

    assert.ok(approved.includes(QUOTE_APPROVAL_STATE_LABELS.APPROVED));
    assert.ok(
      !outdated.includes(QUOTE_APPROVAL_STATE_LABELS.APPROVED),
      "낡은 승인이 「승인 완료」로 읽힌다"
    );
    // 색만으로 가르지 않지만, 색까지 같으면 한눈에 구분되지 않는다.
    assert.ok(approved.includes("green"));
    assert.ok(!outdated.includes("green"), "낡은 승인이 승인 완료와 같은 초록으로 보인다");
  });

  test("까닭까지 적어 준다 — 이력에는 「승인」 줄이 그대로 남아 있기 때문이다", () => {
    assert.match(QUOTE_APPROVAL_OUTDATED_NOTICE, /수정/);
    assert.match(QUOTE_APPROVAL_OUTDATED_NOTICE, /다시/);
    assert.ok(
      flat(panelSource).includes('{state === "APPROVED_OUTDATED" && ('),
      "결재 화면이 그 안내를 그리지 않는다"
    );
    assert.ok(flat(panelSource).includes("{QUOTE_APPROVAL_OUTDATED_NOTICE}"));
  });

  test("그 상태에서는 다시 올릴 수 있다 — 승인이 살아 있을 때만 닫힌다", () => {
    const flattened = flat(panelSource);
    assert.ok(
      flattened.includes('"NOT_REQUESTED", "REJECTED", "APPROVED_OUTDATED",'),
      "다시 올릴 수 있는 상태 목록이 바뀌었다"
    );
  });
});

/**
 * ============================================================================
 * 🔴 결재는 **아무 문도 잠그지 않는다** (2026-09-18 사용자 결정)
 * ============================================================================
 * 저쪽 묶음의 이름은 「발행은 결재 상태에 잠기지 않는다」이고, 재는 것이
 * [견적서 받기] **발행 단추**였다. 🔴 **이 사이트에 발행은 아직 없다**(조각
 * 3c-3) — 그러니 단추를 잴 수 없다. 대신 **그 자리를 지금 대신하는 길**을 잰다:
 *
 *   · 편집 폼 · 목록 슬롯([견적서 받기] 링크) · 발행 알림 줄 조각이 결재를 모른다
 *   · 페이지가 편집 폼에 결재 값을 한 톨도 넘기지 않는다
 *
 * 🔴 **반대 방향은 조각 결재-B 가 이미 잰다** — 결재 쪽이 발행 통로를 안 부르는
 * 것(db/mutations/quote-approvals-invariants.test.ts 의 ⑤)과, 받기 통로가 결재
 * 표를 안 읽는 것(domain/quote-approval-rules.test.ts). 여기는 **화면 쪽**이다.
 * ============================================================================
 */
describe("🔴 결재는 아무 문도 잠그지 않는다 — 화면 쪽", () => {
  test("편집 폼이 결재를 아예 모른다", () => {
    assert.doesNotMatch(editFormSource, /quote-approvals?/i);
    assert.doesNotMatch(editFormSource, /QuoteApproval/);
  });

  test("🔴 파일이 나가는 길([견적서 받기])도 결재를 보지 않는다", () => {
    // 목록 줄의 받기 링크(GET …/xlsx)와 발행 단추(POST …/issue) 둘 다.
    assert.doesNotMatch(listSlotsSource, /approval/i);
    assert.doesNotMatch(issueButtonSource, /approval/i);
  });

  /**
   * 🔴 조각 3c-3 이 더한 묶음 — **발행 단추가 실제로 섰다.**
   * 저쪽 시험의 「[견적서 받기] 단추의 조건이 그대로다」가 이 사이트에도 설 수 있게
   * 되었다(그 전에는 단추가 없어 뺐다). 조건이 둘뿐임을 글자로 재는 것이 요점이다 —
   * 결재 상태가 끼어들면 여기서 걸린다.
   */
  test("[견적서 받기] 단추의 조건이 그대로다 — 저장 여부와 문서 종류 둘뿐", () => {
    assert.ok(
      flat(editFormSource).includes("{savedQuote && canGetDocument && ( <QuoteIssueButton"),
      "발행 단추의 조건이 바뀌었다 — 결재 상태가 끼어들지 않았는지 확인할 것"
    );
  });

  test("페이지가 편집 폼에 결재 값을 넘기지 않는다", () => {
    const editFormProps = flat(editPageSource).slice(
      flat(editPageSource).indexOf("<QuoteEditForm"),
      flat(editPageSource).indexOf("/> } approvalPanel=")
    );
    assert.ok(editFormProps.length > 0, "페이지에서 편집 폼 자리를 찾지 못했다");
    assert.doesNotMatch(editFormProps, /approval/i);
  });

  test("결재 탭 맨 위가 그 사실을 사람에게도 말한다", () => {
    // 🔴 저쪽 문장의 뜻을 한 글자도 줄이지 않았다 — 「기록일 뿐」과 「발행을
    //    비롯해 아무 문도 안 잠근다」 둘 다 문장에 남아 있어야 한다.
    assert.match(QUOTE_APPROVAL_DOES_NOT_BLOCK_ISSUE_NOTICE, /발행/);
    assert.match(QUOTE_APPROVAL_DOES_NOT_BLOCK_ISSUE_NOTICE, /기록/);
    assert.match(QUOTE_APPROVAL_DOES_NOT_BLOCK_ISSUE_NOTICE, /상관없이/);
    assert.ok(flat(panelSource).includes("{QUOTE_APPROVAL_DOES_NOT_BLOCK_ISSUE_NOTICE}"));
  });

  /**
   * ⚠️ 이 묶음은 **뒤집혔다**(조각 3c-3, 2026-09-28).
   *
   * 결재-C 때 이 자리가 재던 것은 「화면이 **이 사이트에 없는 일**(발행)을 할 수
   * 있다고 말하지 않는다」였다. 🔴 **이제 발행이 있다** — 그래서 재는 것이
   * 뒤집힌다: 두 문장이 저쪽 말(발행)로 돌아왔고, **그 말이 가리키는 길이 실제로
   * 있는가**를 본다. 문장만 되돌리고 단추를 안 세우면 여기서 걸린다.
   */
  test("🔴 화면이 말하는 일이 실제로 되는 일이다 — 발행 · 받기 둘 다 길이 있다", () => {
    // 저쪽 글자 그대로다 — 「[견적서 수정] 탭에서 그대로 발행할 수 있습니다」.
    assert.match(QUOTE_APPROVAL_DOES_NOT_BLOCK_ISSUE_NOTICE, /발행할 수 있습니다/);
    assert.match(QUOTE_APPROVAL_DOES_NOT_BLOCK_ISSUE_NOTICE, /\[견적서 수정\] 탭/);
    assert.match(QUOTE_APPROVAL_ROUTE_MISSING_NOTICE, /견적서 발행은 그대로 됩니다/);

    // 🔴 그 탭에 발행 단추가 실제로 있다 — 없으면 위 두 문장이 거짓이 된다.
    assert.ok(
      flat(editFormSource).includes("{savedQuote && canGetDocument && ( <QuoteIssueButton"),
      "[견적서 수정] 탭의 발행 단추가 사라졌다 — 위 문장이 거짓이 된다"
    );
    // 그리고 그 단추가 부르는 통로가 있다.
    assert.ok(
      flat(issueDownloadSource).includes("return `/api/quotes/${encodeURIComponent(quoteId)}/issue`;"),
      "발행 통로를 부르는 자리가 사라졌다"
    );
    // 보기 권한자의 받기 링크(GET …/xlsx)도 그대로다 — 발행과 다른 길이다.
    //
    // ⚠️ 🔴 **읽는 파일이 2026-10-07 에 바뀌었다.** 그때까지는 **목록**(QuoteListSlots)의
    //    줄마다 선 그 링크를 봤는데, 🔴 **목록의 [견적서 받기]가 빠졌다**(사용자 지시 —
    //    받는 곳을 사내 공유폴더 하나로 모은다. A/S 가 2026-10-06 에 먼저 했다).
    //    🔴 **재는 뜻은 그대로다**: 보기 권한자가 발행과 **다른 길**로 파일을 받을 수
    //    있는가. 그 길은 이제 **인쇄 미리보기 화면**의 같은 링크다(QuotePrintView —
    //    수정 권한자에게는 발행 단추, 보기 권한자에게는 이 링크다).
    assert.ok(
      flat(printViewSource).includes("href={`/api/quotes/${quoteId}/xlsx`}"),
      "[견적서 받기] 링크가 사라졌다 — 보기 권한자가 파일을 받을 길이 없다"
    );
  });
});

describe("🔴 결재선이 없으면 무엇을 해야 하는지 말한다", () => {
  test("고칠 자리와 고칠 사람이 문장에 있다", () => {
    assert.match(QUOTE_APPROVAL_ROUTE_MISSING_NOTICE, /사용자 관리/);
    assert.match(QUOTE_APPROVAL_ROUTE_MISSING_NOTICE, /승인 절차/);
    assert.match(QUOTE_APPROVAL_ROUTE_MISSING_NOTICE, /견적서 승인/);
    assert.match(QUOTE_APPROVAL_ROUTE_MISSING_NOTICE, /관리자/);
    // 🔴 그 사이에도 견적서는 그대로 고치고 받을 수 있다 — 이 말이 없으면 안내가
    //    「견적서가 통째로 막혔다」로 읽힌다(저쪽은 「발행은 그대로」로 적는다).
    assert.match(QUOTE_APPROVAL_ROUTE_MISSING_NOTICE, /그대로 됩니다/);
  });

  test("누르기 전에 그린다 — 눌러서 실패하게 두지 않는다", () => {
    const flattened = flat(panelSource);
    assert.ok(flattened.includes("{!isRouteConfigured && ("));
    assert.ok(flattened.includes("{QUOTE_APPROVAL_ROUTE_MISSING_NOTICE}"));
    assert.ok(
      flattened.includes("const canRequest = isRouteConfigured && REQUESTABLE_STATES.includes(state);"),
      "결재선이 없는데도 올리기 단추가 나온다"
    );
  });

  test("판정을 화면에 새로 적지 않는다 — 도메인 함수 하나를 페이지가 부른다", () => {
    assert.ok(flat(editPageSource).includes("isRouteConfigured={isQuoteApprovalRouteInForce("));
  });

  test("서버가 거절한 이유를 삼키지 않는다", () => {
    assert.ok(
      flat(panelSource).includes("setErrorMessage(result.message);"),
      "서버가 돌려준 안내(결재선 없음 등)가 화면에 남지 않는다"
    );
  });
});

/**
 * ============================================================================
 * 🔴 **안내문 두 자리가 같은 메뉴를 가리킨다** (이 사이트에서 더한 묶음)
 * ============================================================================
 * 2026-09-28 사용자 결정 — **결재선 설정은 A/S 에서만 한다.** 그래서 이 사이트의
 * 화면도 서버도 「고치러 갈 곳」으로 **A/S 의 메뉴**를 말해야 한다. A/S 에서
 * 그대로 옮겨 오면 두 자리 다 「[사용자 관리 > 승인 절차]」라고만 적혀 있는데,
 * 🔴 **PO 에는 그런 메뉴가 없다** — 사람이 PO 메뉴를 뒤지다 못 찾는다.
 *
 * 재는 것 셋:
 *   ㉠ 화면 문장이 그 힌트를 그대로 쓴다.
 *   ㉡ 🔴 **서버 응답에도 같은 글자가 있다**(눌렀을 때 돌아오는 말).
 *   ㉢ 🔴 **「사용자 관리」가 나오는 자리는 전부 그 힌트 안**이다 — 한 자리만
 *      고치고 나머지를 두면 이 단언이 걸린다.
 * ============================================================================
 */
describe("🔴 화면과 서버가 같은 메뉴를 가리킨다 — 결재선 설정은 A/S 에서만", () => {
  test("㉠ 힌트가 A/S 를 가리킨다 — PO 메뉴를 뒤지게 하지 않는다", () => {
    assert.match(QUOTE_APPROVAL_MENU_HINT, /A\/S/);
    assert.match(QUOTE_APPROVAL_MENU_HINT, /사용자 관리 > 승인 절차/);
    assert.ok(
      QUOTE_APPROVAL_ROUTE_MISSING_NOTICE.includes(QUOTE_APPROVAL_MENU_HINT),
      "화면 안내가 그 힌트를 쓰지 않는다"
    );
  });

  test("㉡ 🔴 서버가 돌려주는 거절 문구에도 **같은 글자**가 들어 있다", () => {
    const code = codeOf(mutationSource);
    assert.ok(
      code.includes("ROUTE_NOT_CONFIGURED"),
      "서버의 거절 갈래가 사라졌다 — 잴 대상이 없다"
    );
    assert.ok(
      code.includes(QUOTE_APPROVAL_MENU_HINT),
      `🔴 서버 응답이 화면과 다른 메뉴를 가리킨다. 화면: ${QUOTE_APPROVAL_MENU_HINT}`
    );
  });

  test("㉢ 🔴 「사용자 관리」가 나오는 자리는 **전부** 그 힌트 안이다", () => {
    const hintHits = (source: string) => source.split(QUOTE_APPROVAL_MENU_HINT).length - 1;
    const menuHits = (source: string) => source.split("사용자 관리").length - 1;

    for (const [name, source] of [
      ["quote-approval-texts.ts", codeOf(textsSource)],
      ["QuoteApprovalPanel.tsx", codeOf(panelSource)],
      ["mutations/quote-approvals.ts", codeOf(mutationSource)],
    ] as const) {
      assert.equal(
        menuHits(source),
        hintHits(source),
        `${name} 이 A/S 표시 없이 그 메뉴 이름을 말한다 — 이 사이트에 없는 메뉴다`
      );
    }
  });

  test("🔴 결재선을 **만드는** 단추를 이 화면이 내밀지 않는다 — 설정은 A/S 에서만", () => {
    const code = codeOf(panelSource);
    for (const forbidden of ["결재선 만들기", "승인 절차 만들기", "결재선 설정", "href="]) {
      assert.equal(
        code.includes(forbidden),
        false,
        `결재 탭이 결재선을 고치러 가는 길을 내민다: ${forbidden}`
      );
    }
  });
});

describe("반려에는 사유가 필요하다", () => {
  const dialogProps = {
    isOpen: true,
    title: "견적서 반려",
    isSubmitting: false,
    onConfirm: () => {},
    onCancel: () => {},
  };

  test("반려 창은 사유 칸을 필수로 표시한다", () => {
    const required = renderToStaticMarkup(<QuoteApprovalDialog {...dialogProps} requireReason />);
    assert.ok(required.includes("*"), "필수 표시가 없다");
    assert.ok(!required.includes("(선택)"), "필수인데 선택으로 보인다");
  });

  test("올리기·승인 창에서는 선택이다", () => {
    const optional = renderToStaticMarkup(
      <QuoteApprovalDialog {...dialogProps} title="견적서 승인" requireReason={false} />
    );
    assert.ok(optional.includes("(선택)"));
  });

  test("필수를 켜는 자리가 반려 하나뿐이다", () => {
    assert.ok(flat(panelSource).includes('requireReason={dialogState === "REJECTED"}'));
    assert.match(QUOTE_APPROVAL_REASON_REQUIRED_MESSAGE, /사유/);
  });
});

describe("결재 이력", () => {
  test("한 줄도 없으면 그렇게 말한다", () => {
    const markup = renderToStaticMarkup(<QuoteApprovalHistory records={[]} />);
    assert.ok(markup.includes(QUOTE_APPROVAL_EMPTY_HISTORY_TEXT));
  });

  test("누가 언제 무엇을 했고 무슨 말을 남겼나가 남는다", () => {
    const markup = renderToStaticMarkup(
      <QuoteApprovalHistory
        records={[
          approvalRecord({
            id: "a2",
            status: "REJECTED",
            decidedByUserId: "user-2",
            decidedByName: "김도윤",
            decidedAt: "2026-09-18T02:00:00.000Z",
            decisionReason: "부품 단가가 다릅니다",
          }),
        ]}
      />
    );
    assert.ok(markup.includes("홍길동"));
    assert.ok(markup.includes("김도윤"));
    assert.ok(markup.includes("금액 확인 부탁드립니다"));
    assert.ok(markup.includes("부품 단가가 다릅니다"));
    assert.ok(markup.includes("반려"));
  });

  test("🔴 단계 수는 **그 줄에 적힌 판**으로 센다", () => {
    const markup = renderToStaticMarkup(
      <QuoteApprovalHistory
        records={[
          approvalRecord({
            routeId: "route-old",
            routeStepOrder: 2,
            assignedApproverUserId: "approver-2",
            assignedApproverName: "김도윤",
          }),
        ]}
        routeSteps={[
          route("route-old", ["박하늘", "김도윤"]),
          route("route-new", ["박하늘", "김도윤", "최희만", "이서준"]),
        ]}
      />
    );
    assert.ok(markup.includes("결재선 2/2단계"), "현재 판으로 세면 아직 사람이 더 남은 것처럼 보인다");
    assert.ok(!markup.includes("2/4단계"));
  });

  test("최고관리자가 남의 차례를 대신 처리하면 그 표시가 남는다", () => {
    const markup = renderToStaticMarkup(
      <QuoteApprovalHistory
        records={[
          approvalRecord({
            status: "APPROVED",
            assignedApproverUserId: "approver-2",
            assignedApproverName: "김도윤",
            decidedByUserId: "super-admin",
            decidedByName: "최희만",
            decidedAt: "2026-09-18T03:00:00.000Z",
          }),
        ]}
      />
    );
    assert.ok(markup.includes("지정자 대신 처리"));
  });
});

describe("결재 탭이 놓인 자리", () => {
  test("🔴 새 견적서 화면에는 결재 탭이 없다 — 아직 걸 대상이 없다", () => {
    assert.doesNotMatch(newPageSource, /QuoteEditTabs/);
    assert.doesNotMatch(newPageSource, /QuoteApprovalPanel/);
    assert.match(newPageSource, /<QuoteEditForm/);
  });

  test("저장된 견적서 화면은 껍데기를 거쳐 두 화면을 그린다", () => {
    assert.match(editPageSource, /<QuoteEditTabs/);
    assert.match(editPageSource, /<QuoteApprovalPanel/);
  });

  test("상태 판정은 서버가 한다 — 화면이 판 번호를 다시 견주지 않는다", () => {
    assert.ok(flat(editPageSource).includes("state={approvalProgress?.state ?? \"NOT_REQUESTED\"}"));
    // 부르는 자리(괄호)만 본다 — 머리말이 그 함수를 **가리키는** 것은 오히려
    // 있어야 할 글자다(판정이 어디에 있는지 다음 사람이 찾아갈 실마리다).
    assert.doesNotMatch(panelSource, /resolveQuoteApprovalState\(/);
    assert.doesNotMatch(panelSource, /isApprovalForCurrentQuote\(/);
    // 판 번호 자체가 이 화면에 내려오지 않는다 — 없는 값으로는 견줄 수 없다.
    assert.doesNotMatch(panelSource, /currentQuoteVersion/);
  });

  test("지정 관문 판정을 화면에 새로 적지 않는다 — 서버와 같은 함수를 부른다", () => {
    assert.match(panelSource, /mayDecideAssignedApproval/);
    assert.match(panelSource, /from "@\/lib\/auth\/approval-assignment"/);
  });
});
