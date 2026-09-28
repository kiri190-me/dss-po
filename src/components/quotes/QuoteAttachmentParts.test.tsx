import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ExcelOnlyClearLinesDialog,
  ExcelOnlySwitch,
  QuoteAttachmentDeleteDialog,
  QuoteAttachmentFilePicker,
  QuoteFileBadges,
} from "./QuoteAttachmentParts";
import type { QuoteAttachmentSlotFileView } from "./quote-attachment-files";

/**
 * ============================================================================
 * 견적서 파일 · 엑셀 전용 — 그리기 조각이 무엇을 그리는가
 * ============================================================================
 * 이 조각들은 서버 액션을 부르지 않아 `server-only` 사슬 없이 그려진다. 그래서
 * **실제로 렌더해 본다** — 목록 `components`(`npm run test:components`)에 있다.
 * 목록 `unit` 은 `--conditions=react-server` 로 돌아 `react-dom/server` 가 스스로
 * 막는다(scripts/test-lists/components.txt 머리말).
 *
 * 원본은 A/S 관리 시스템의 같은 이름 파일
 * (`RF_Service_System/src/components/quotes/QuoteAttachmentParts.test.tsx`, 278줄 —
 * 2026-09-28 실측)이고, **이 사이트에 와 있는 조각에 닿는 부분만** 가져왔다.
 *
 * ── 🔴 안 가져온 묶음 넷과 그 까닭 ──────────────────────────────────────
 * 「두 칸 — 저장된 견적서」 · 「빈 칸」 · 「새 견적서」 · 「엑셀 전용 안내 · 방금 한 일」은
 * 전부 `QuoteAttachmentSlotsView` 를 그린다. 그 구역과 그 안의 칸
 * (`QuoteAttachmentSlotCard`)은 **아직 오지 않았다** — 칸이 세우는 [보기] ·
 * [내려받기]가 이 사이트에 아직 없는 라우트를 가리켜, 조각 3d-3d 가 세운 울타리에
 * 걸린다. 까닭은 QuoteAttachmentParts.tsx 머리말의 「멈춘 자리」에 적어 두었다.
 *
 * 🔴 **그 묶음들을 미리 가져오지 않는다.** 그리는 조각이 없는데 시험만 있으면 목록에
 * 적히고도 import 에서 터지거나, 더 나쁘게는 껍데기만 통과한다.
 *
 * ── 하나 더한 것 ────────────────────────────────────────────────────────
 * 「파일 고르기 단추」 묶음은 A/S 에 없다. 저쪽에서는 그 단추가 칸 안에서만 서서 칸
 * 시험이 함께 재는데, 이 사이트에는 그 칸이 없어 **아무도 재지 않는 조각**이 된다.
 * ============================================================================
 */

const PDF_FILE: QuoteAttachmentSlotFileView = {
  id: "att-pdf",
  originalFileName: "DSS 2026-077 결재본.pdf",
  fileSize: 2048,
  uploadedAt: "2026-09-15T05:03:00.000Z",
  uploadedByName: "홍길동",
};

const EXCEL_FILE: QuoteAttachmentSlotFileView = {
  id: "att-xlsx",
  originalFileName: "DSS 2026-077 수기.xlsx",
  fileSize: 4096,
  uploadedAt: "2026-09-15T06:00:00.000Z",
  uploadedByName: null,
};

describe("파일 고르기 단추", () => {
  test("🔴 칸은 숨기고 단추만 보인다 — 받는 형식은 칸이 말하고, 하나만 받는다", () => {
    const html = renderToStaticMarkup(
      <QuoteAttachmentFilePicker
        accept=".pdf,application/pdf"
        label="파일 올리기"
        ariaLabel="결재 견적서 PDF 파일 올리기"
        disabled={false}
        onFile={() => {}}
      />
    );
    assert.ok(html.includes('type="file"') && html.includes("hidden"), html);
    assert.ok(html.includes('accept=".pdf,application/pdf"'), html);
    assert.ok(html.includes('aria-label="결재 견적서 PDF 파일 올리기"'), html);
    assert.ok(html.includes(">파일 올리기<"), html);
    // 칸마다 파일은 하나다 — 여러 개를 고를 수 있으면 칸이 말없이 첫 하나만 받는다.
    assert.equal(html.includes("multiple"), false, "파일을 여럿 고를 수 있다");
    // 🔴 폼 안에 서는 단추다 — type 이 없으면 누를 때 폼이 제출된다.
    assert.ok(html.includes('type="button"'), html);
  });

  test("꺼져 있으면 칸도 열 수 없다", () => {
    const html = renderToStaticMarkup(
      <QuoteAttachmentFilePicker
        accept=".xlsx"
        label="바꾸기"
        ariaLabel="수기 견적서 엑셀 바꾸기"
        disabled={true}
        onFile={() => {}}
      />
    );
    assert.ok(html.includes("disabled"), html);
  });
});

describe("지우기 확인 창", () => {
  test("🔴 첨부 휴지통으로 간다고 말하고, 무엇을 지우는지 보인다", () => {
    const html = renderToStaticMarkup(
      <QuoteAttachmentDeleteDialog
        category="SIGNED_QUOTE_PDF"
        file={PDF_FILE}
        isSubmitting={false}
        error={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    assert.ok(html.includes("「결재 견적서 PDF」 파일을 지우시겠습니까?"), html);
    assert.ok(html.includes("첨부 휴지통으로 옮깁니다"), html);
    assert.ok(html.includes("DSS 2026-077 결재본.pdf"), html);
    assert.ok(html.includes(">취소<") && html.includes(">지우기<"), html);
  });

  test("옮기는 중 · 실패 문장", () => {
    const html = renderToStaticMarkup(
      <QuoteAttachmentDeleteDialog
        category="QUOTE_EXCEL"
        file={EXCEL_FILE}
        isSubmitting={true}
        error="파일을 찾을 수 없습니다."
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    assert.ok(html.includes("옮기는 중..."), html);
    assert.ok(html.includes("파일을 찾을 수 없습니다."), html);
  });
});

describe("엑셀 전용 스위치 · 줄 비우기 확인", () => {
  test("스위치 — 체크 상태는 부르는 쪽의 값, 무엇이 달라지는지 적는다", () => {
    const on = renderToStaticMarkup(<ExcelOnlySwitch checked={true} disabled={false} onToggle={() => {}} />);
    const off = renderToStaticMarkup(<ExcelOnlySwitch checked={false} disabled={false} onToggle={() => {}} />);
    assert.ok(on.includes('checked=""'), on);
    assert.ok(!off.includes('checked=""'), off);
    assert.ok(on.includes("엑셀 전용 견적서"), on);
    assert.ok(on.includes("공급가액을 직접"), on);
    assert.ok(on.includes("[견적서 받기]"), on);
  });

  test("🔴 줄 비우기 확인 — 줄이 있으면 저장이 거절된다고, 무엇을 비우는지, 끄면 돌아온다고", () => {
    const html = renderToStaticMarkup(
      <ExcelOnlyClearLinesDialog
        counts={{ items: 2, workScopeLines: 3, repairTasks: 0 }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    assert.ok(html.includes("저장이 거절됩니다"), html);
    assert.ok(html.includes("부품 2줄 · 작업 내역 3줄"), html);
    assert.ok(!html.includes("수리 작업 0건"), "없는 줄을 센다");
    assert.ok(html.includes("비운 줄이 그대로 돌아옵니다"), html);
    assert.ok(html.includes(">줄을 비우고 켜기<") && html.includes(">취소<"), html);
    // 「저장하면 지워집니다」가 아니다 — 서버는 조용히 지우지 않고 거절한다.
    assert.ok(!html.includes("저장하면 품목 · 작업 줄이 지워집니다"), html);
  });
});

describe("목록 표시", () => {
  test("엑셀 전용 · 엑셀 없음 — 경고는 호박색, 설명은 마우스를 올리면", () => {
    const html = renderToStaticMarkup(
      <QuoteFileBadges row={{ isExcelOnly: true, hasSignedPdf: false, hasExcel: false }} />
    );
    assert.ok(html.includes(">엑셀 전용<"), html);
    assert.ok(html.includes(">엑셀 없음<"), html);
    assert.ok(html.includes("border-amber-300"), html);
    assert.ok(html.includes('title="엑셀 전용인데 수기 견적서 엑셀이 붙지 않아'), html);
  });

  test("결재 PDF 있음", () => {
    const html = renderToStaticMarkup(
      <QuoteFileBadges row={{ isExcelOnly: false, hasSignedPdf: true, hasExcel: false }} />
    );
    assert.equal(html.includes(">결재 PDF<"), true, html);
    assert.equal(html.includes("엑셀"), false, html);
  });

  test("붙일 것이 없으면 아무것도 그리지 않는다 — 일반 견적서 줄은 지금 그대로", () => {
    assert.equal(
      renderToStaticMarkup(<QuoteFileBadges row={{ isExcelOnly: false, hasSignedPdf: false, hasExcel: true }} />),
      ""
    );
  });
});
