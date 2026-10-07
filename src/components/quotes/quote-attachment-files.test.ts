import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  QUOTE_ATTACHMENT_SLOTS,
  QUOTE_EXCEL_MISSING_NOTICE,
  checkQuoteAttachmentFile,
  countQuoteLinesForExcelOnly,
  createdWithAttachmentFailuresText,
  describeQuoteAttachmentFile,
  describeQuoteLineCounts,
  excelOnlyMissingExcelNotice,
  formatQuoteAttachmentUploadedAt,
  hasQuoteLines,
  isQuoteExcelAttachedOrQueued,
  pendingQuoteAttachmentQueue,
  planExcelOnlyToggle,
  quoteAttachmentDeleteText,
  quoteAttachmentDownloadUrl,
  quoteAttachmentUploadedText,
  quoteAttachmentUploadProgressText,
  quoteAttachmentUploadUrl,
  quoteAttachmentViewUrl,
  quoteListFileBadges,
  resolveQuoteSlotFile,
  resolveQuoteSlots,
  withPendingQuoteAttachment,
  type QuoteAttachmentSlotFileView,
} from "./quote-attachment-files";

/**
 * ============================================================================
 * 견적서 파일 · 엑셀 전용 — 화면의 순수 도우미 (조각 3d-3d)
 * ============================================================================
 * 칸 정의 · 사전 검사 · 주소 · 칸 상태(서버 칸 + 방금 한 일) · 새 견적서의 대기 파일 ·
 * 문구 · 엑셀 전용 켜기/끄기와 줄 복원 · 목록 딱지 판정.
 *
 * 🔴 A/S 의 같은 이름 시험(473줄)에서 **옮겨 온 함수에 닿는 부분만** 가져왔다. 뺀 것
 * 셋은 이 사이트에 그 함수가 없어서다:
 *   · 「합계」 — `quoteSupplyAmountOf` 는 lib/domain/quote-list.ts 의 것이고 그 곁의
 *     시험(lib/domain/quote-list.test.ts)이 이미 덮는다.
 *   · 「금액 옆 괄호」 — `quoteListAmountNote` 는 **공용 묶음**에 있다
 *     (vendor/dss-core/src/ui/quotes/quote-list-rows.ts).
 *   · 「미리보기의 재료」 — `excelOnlyPrintAttachments` · `signedPdfForPreview` ·
 *     `EXCEL_ONLY_NO_SIGNED_PDF_TEXT` 는 **조각 3f**(미리보기)의 것이라 아직 안 왔다.
 *     ⚠️ 그때의 기록이다 — 🔴 **셋(정확히는 타입까지 넷)이 2026-09-28 에 왔다**
 *     (조각 3f). 🔴 **그 시험 묶음은 여기 안 가져왔다** — 저쪽에서 그 셋을 재는 것은
 *     이 파일이 아니라 조각 3f 가 함께 가져온 화면 시험들이다
 *     (`quote-print-excel-only.test.tsx` · `quote-print-excel-preview-screen.test.tsx` —
 *     components.txt). 두 벌로 재지 않는다.
 *
 * ── 🔴 왜 단위 목록(unit.txt)에서 도는가 ────────────────────────────────
 * 시험 대상이 `@/lib/db/queries/attachments`(첫 줄이 `import "server-only"`)에서
 * 타입 둘을 가져오지만 **`import type`** 이라 컴파일할 때 지워진다 — 그래서 그 사슬이
 * 실제로 실리지 않는다. 값으로 바꾸는 날 이 시험이 **여기서 먼저 터진다**(단위 목록은
 * `--conditions=react-server` 로 돌아 지금은 통과하지만, 그때는 화면 묶음에도 그 사슬이
 * 실린다 — 그것을 막는 글자 단언은 quote-list-screen-source.test.ts 에 있다).
 * ============================================================================
 */

const MB = 1024 * 1024;

const repoUrl = new URL("../../../", import.meta.url);
const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, repoUrl), "utf8").replace(/\r\n/g, "\n");

describe("칸 정의", () => {
  test("칸은 둘이고 차례는 결재 PDF → 수기 엑셀이다", () => {
    assert.deepEqual(
      QUOTE_ATTACHMENT_SLOTS.map((slot) => [slot.category, slot.label]),
      [
        ["SIGNED_QUOTE_PDF", "결재 견적서 PDF"],
        ["QUOTE_EXCEL", "수기 견적서 엑셀"],
      ]
    );
  });

  test("파일 고르기 칸의 accept 는 분류 허용목록의 확장자와 그 MIME 이다", () => {
    const [pdf, excel] = QUOTE_ATTACHMENT_SLOTS;
    assert.equal(pdf.accept, ".pdf,application/pdf");
    assert.equal(
      excel.accept,
      ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
    );
  });

  test("🔴 새 탭에서 페이지 안으로 보는 것은 PDF 칸뿐이다 — 엑셀은 내려받기만", () => {
    assert.deepEqual(
      QUOTE_ATTACHMENT_SLOTS.map((slot) => slot.viewableInBrowser),
      [true, false]
    );
  });
});

describe("사전 검사 — 확장자 · 빈 파일 · 20MB", () => {
  test("결재 PDF 칸은 pdf 만 받는다(대소문자 무관)", () => {
    assert.equal(checkQuoteAttachmentFile({ name: "결재본.pdf", size: 10 }, "SIGNED_QUOTE_PDF"), null);
    assert.equal(checkQuoteAttachmentFile({ name: "결재본.PDF", size: 10 }, "SIGNED_QUOTE_PDF"), null);
    for (const name of ["결재본.xlsx", "결재본.jpg", "결재본", "결재본.pdf.exe"]) {
      assert.equal(
        checkQuoteAttachmentFile({ name, size: 10 }, "SIGNED_QUOTE_PDF"),
        "결재 견적서는 PDF 로만 올릴 수 있습니다",
        name
      );
    }
  });

  test("수기 엑셀 칸은 xlsx · xls 만 받는다", () => {
    assert.equal(checkQuoteAttachmentFile({ name: "견적.xlsx", size: 10 }, "QUOTE_EXCEL"), null);
    assert.equal(checkQuoteAttachmentFile({ name: "견적.xls", size: 10 }, "QUOTE_EXCEL"), null);
    for (const name of ["견적.pdf", "견적.csv", "견적.xlsm"]) {
      assert.equal(
        checkQuoteAttachmentFile({ name, size: 10 }, "QUOTE_EXCEL"),
        "수기 견적서는 엑셀(xlsx · xls)로만 올릴 수 있습니다",
        name
      );
    }
  });

  test("🔴 형식 까닭은 올리기 통로의 415 문구와 같은 말이다 — 한쪽만 바뀌면 여기서 걸린다", () => {
    // 🔴 그 통로는 이 사이트에도 와 있다(조각 3d-3b). A/S 와 같은 대조를 그대로 건다.
    const route = read("src/app/api/quotes/[id]/attachments/route.ts");
    assert.ok(route.includes('SIGNED_QUOTE_PDF: "결재 견적서는 PDF 로만 올릴 수 있습니다"'));
    assert.ok(route.includes('QUOTE_EXCEL: "수기 견적서는 엑셀(xlsx · xls)로만 올릴 수 있습니다"'));
  });

  test("빈 파일과 20MB 초과는 보내기 전에 막는다 — 20MB 꼭 맞으면 통과", () => {
    assert.equal(checkQuoteAttachmentFile({ name: "a.pdf", size: 0 }, "SIGNED_QUOTE_PDF"), "빈 파일은 올릴 수 없습니다");
    assert.equal(checkQuoteAttachmentFile({ name: "a.pdf", size: 20 * MB }, "SIGNED_QUOTE_PDF"), null);
    assert.equal(
      checkQuoteAttachmentFile({ name: "a.xlsx", size: 20 * MB + 1 }, "QUOTE_EXCEL"),
      "20MB를 넘습니다 (20.0MB)"
    );
    assert.equal(checkQuoteAttachmentFile({ name: "a.xlsx", size: 31.5 * MB }, "QUOTE_EXCEL"), "20MB를 넘습니다 (31.5MB)");
  });

  test("형식이 먼저다 — 틀린 형식의 빈 파일은 형식 까닭으로 막힌다", () => {
    assert.equal(
      checkQuoteAttachmentFile({ name: "a.txt", size: 0 }, "SIGNED_QUOTE_PDF"),
      "결재 견적서는 PDF 로만 올릴 수 있습니다"
    );
  });
});

describe("주소", () => {
  test("올리기 — 이름 · 칸은 쿼리 문자열이고 한글 이름도 그대로 돌아온다", () => {
    const url = new URL(quoteAttachmentUploadUrl("q-1", "QUOTE_EXCEL", "견적 #1&2.xlsx"), "http://x");
    assert.equal(url.pathname, "/api/quotes/q-1/attachments");
    assert.equal(url.searchParams.get("fileName"), "견적 #1&2.xlsx");
    assert.equal(url.searchParams.get("category"), "QUOTE_EXCEL");
  });

  test("보기는 view=full(페이지 안), 내려받기는 view 없이(첨부 · 감사)", () => {
    assert.equal(quoteAttachmentViewUrl("a-1"), "/api/attachments/a-1/download?view=full");
    assert.equal(quoteAttachmentDownloadUrl("a-1"), "/api/attachments/a-1/download");
  });

  /**
   * ==========================================================================
   * 🔴 라우트가 왔다 — 울타리의 **뜻을 바꾼다**(지우지 않는다) (조각 3d-4)
   * ==========================================================================
   * 3d-3d 가 여기 세운 것은 「이 저장소의 **어느 파일도** 이 두 주소를 부르지
   * 않는다」였다. 까닭은 `/api/attachments/[id]/download` 라우트가 이 사이트에
   * **없었기** 때문이다 — 화면에 걸면 누르면 404 가 뜨는 링크가 섰다. 그 울타리는
   * 의도대로 작동했다: 조각 3d-3f 가 칸을 가져오려다 걸려 멈췄다.
   *
   * 🔴 **조각 3d-4 가 라우트를 함께 가져왔다**(2026-09-28). 그래서 옛 단언의 전제가
   * 사라졌다. 🔴 **그냥 지우면 보호가 줄어든다** — 그러면 아무나 아무 데서나 그 주소를
   * 짓기 시작해도 아무도 모른다. 그래서 **둘로 바꾼다**:
   *
   *   ㉠ **라우트가 실제로 있다.** 파일이 사라지는 날(또는 이름이 바뀌는 날) 칸의
   *      [보기] · [내려받기]가 조용히 죽은 링크가 된다 — 그것을 여기서 잡는다.
   *   ㉡ **부르는 곳은 칸 조각 하나뿐이다.** 주소를 화면 여기저기서 짓기 시작하면,
   *      질의값(`?view=full`)이 바뀌는 날 고칠 자리가 코드 전체를 훑어야 나오는
   *      질문이 된다. 지금 그 자리는 QuoteAttachmentParts.tsx 의
   *      `QuoteAttachmentSlotCard` 다.
   *
   * 🔴 훑는 곳은 `src/` 뿐이다. 서브모듈(vendor/dss-core)은 사이트 별칭(`@/…`)을 한
   * 줄도 쓰지 않아(quote-list-screen-source.test.ts 의 같은 단언) 이 파일에 닿을 길이
   * 없다.
   * ==========================================================================
   */
  test("🔴 ㉠ 두 주소가 가리키는 라우트가 실제로 있다", () => {
    for (const file of [
      "src/app/api/attachments/[id]/download/route.ts",
      // 무엇을 화면 안에서 열어 줄지 가르는 형제 파일 — `?view=full` 이 뜻을 갖는 자리다.
      "src/app/api/attachments/[id]/download/inline-view.ts",
    ]) {
      assert.ok(existsSync(fileURLToPath(new URL(file, repoUrl))), `${file} 이 없다 — 위 두 주소가 죽은 링크다`);
    }
  });

  /**
   * ⚠️ 🔴 **조각 3f 가 여기에 둘째 자리를 더했다**(2026-09-28) — `QuotePrintView.tsx`.
   * 엑셀 전용 견적서의 미리보기가 결재 PDF 를 [보기] · [받기]로 내밀기 때문이고,
   * **A/S 도 정확히 그 두 자리**다(저쪽 QuotePrintView 가 같은 두 함수를 부른다).
   *
   * 🔴 **울타리를 약하게 하지 않았다** — 늘린 것은 목록 하나이고 `deepEqual` 은 그대로다.
   * 🔴 재는 것도 그대로다: **주소를 손으로 짓는 곳이 없다.** 둘 다 이 파일의 두 함수를
   * 부르는 것이지 `/api/attachments/…` 를 제 손으로 적는 것이 아니다 — 셋째 자리가
   * 생기거나 누가 주소를 손으로 적으면 이 단언이 그날 터진다.
   */
  test("🔴 ㉡ 보기 · 내려받기 주소를 짓는 곳은 칸 조각과 미리보기 둘뿐이다", () => {
    const definition = "src/components/quotes/quote-attachment-files.ts";
    const self = "src/components/quotes/quote-attachment-files.test.ts";
    const callers: string[] = [];
    let scanned = 0;

    const walk = (relativeDir: string) => {
      for (const entry of readdirSync(fileURLToPath(new URL(relativeDir, repoUrl)), { withFileTypes: true })) {
        const relativePath = `${relativeDir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(relativePath);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        if (relativePath === definition || relativePath === self) continue;
        // 주석은 뺀다 — 이 저장소의 머리말들이 아직 오지 않은 것을 **이름으로** 적어 둔다.
        const code = read(relativePath)
          .replace(/\/\*[\s\S]*?\*\//g, " ")
          .replace(/^[ \t]*\/\/.*$/gm, " ");
        scanned += 1;
        if (/quoteAttachment(View|Download)Url/.test(code)) callers.push(relativePath);
      }
    };
    walk("src");

    // 🔴 **아무것도 안 훑고 통과하는 길을 막는다.** 훑는 곳이 비면 아래 단언은 언제나
    //    참이 되고, 이 시험은 도는 척만 한다 — 이 저장소가 「조용히 안 돈다」로 이미
    //    세 번 고생했다(scripts/run-test-list.mjs 머리말).
    assert.ok(scanned > 100, `훑은 파일이 ${scanned}개뿐이다 — 걷는 길이 끊겼는지 보라`);

    assert.deepEqual(
      callers,
      [
        "src/components/quotes/QuoteAttachmentParts.tsx",
        // 🔴 조각 3f — 엑셀 전용 미리보기가 결재 PDF 를 [보기] · [받기]로 내민다.
        "src/components/quotes/QuotePrintView.tsx",
      ],
      "보기 · 내려받기 주소를 짓는 곳이 그 둘 말고 또 생겼다 — 주소는 이 파일의 두 함수에서만 짓는다"
    );
    // 🔴 **주소를 손으로 적은 곳이 하나도 없다** — 위 목록은 「누가 부르나」이고,
    //    이것은 「제 손으로 짓지 않나」다. 둘이 같은 말이 아니다.
    //    🔴 주석은 위 걷기와 **같은 규칙으로** 뺀다 — 이 저장소의 머리말들이 주소를
    //    설명으로 적어 둔다(실제로 QuotePrintView 머리말에 그 글자가 있다).
    const previewCode = read("src/components/quotes/QuotePrintView.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^[ \t]*\/\/.*$/gm, " ");
    assert.equal(previewCode.includes("/api/attachments/"), false, "미리보기가 첨부 주소를 손으로 적는다");
  });
});

const SERVER_FILE = {
  id: "server-1",
  originalFileName: "결재.pdf",
  fileSize: 2048,
  uploadedAt: "2026-09-15T01:00:00.000Z",
  uploadedByName: "홍길동",
};

const JUST_UPLOADED: QuoteAttachmentSlotFileView = {
  id: "new-1",
  originalFileName: "새 결재.pdf",
  fileSize: 4096,
  uploadedAt: "2026-09-15T02:00:00.000Z",
  uploadedByName: null,
};

describe("칸 상태 — 서버 칸 + 방금 한 일", () => {
  test("방금 한 일이 없으면 서버 칸 그대로(없으면 빈 칸)", () => {
    assert.deepEqual(resolveQuoteSlotFile(SERVER_FILE, undefined), SERVER_FILE);
    assert.equal(resolveQuoteSlotFile(null, undefined), null);
    assert.equal(resolveQuoteSlotFile(undefined, undefined), null);
  });

  test("방금 올렸는데 서버가 아직 옛 파일을 주면 방금 올린 것을 그린다", () => {
    assert.deepEqual(resolveQuoteSlotFile(SERVER_FILE, { kind: "uploaded", file: JUST_UPLOADED }), JUST_UPLOADED);
    assert.deepEqual(resolveQuoteSlotFile(null, { kind: "uploaded", file: JUST_UPLOADED }), JUST_UPLOADED);
  });

  test("서버가 같은 파일을 주면 서버 것 — 올린 사람 이름이 채워진다", () => {
    const caughtUp = { ...JUST_UPLOADED, uploadedByName: "김담당" };
    assert.deepEqual(resolveQuoteSlotFile(caughtUp, { kind: "uploaded", file: JUST_UPLOADED }), caughtUp);
  });

  test("그 사이 다른 사람이 더 나중에 올렸으면 서버 것이 이긴다", () => {
    const newer = { ...SERVER_FILE, id: "server-2", uploadedAt: "2026-09-15T03:00:00.000Z" };
    assert.deepEqual(resolveQuoteSlotFile(newer, { kind: "uploaded", file: JUST_UPLOADED }), newer);
  });

  test("방금 지웠으면 서버가 아직 그 파일을 줘도 빈 칸, 다른 파일이면 그 파일", () => {
    assert.equal(resolveQuoteSlotFile(SERVER_FILE, { kind: "deleted", attachmentId: "server-1" }), null);
    const other = { ...SERVER_FILE, id: "server-9" };
    assert.deepEqual(resolveQuoteSlotFile(other, { kind: "deleted", attachmentId: "server-1" }), other);
    assert.equal(resolveQuoteSlotFile(null, { kind: "deleted", attachmentId: "server-1" }), null);
  });

  test("두 칸을 한 번에 — 새 견적서(서버 칸 없음)도 방금 올린 것으로 그린다", () => {
    assert.deepEqual(resolveQuoteSlots(null, {}), { SIGNED_QUOTE_PDF: null, QUOTE_EXCEL: null });
    assert.deepEqual(resolveQuoteSlots(null, { QUOTE_EXCEL: { kind: "uploaded", file: JUST_UPLOADED } }), {
      SIGNED_QUOTE_PDF: null,
      QUOTE_EXCEL: JUST_UPLOADED,
    });
    assert.deepEqual(
      resolveQuoteSlots({ SIGNED_QUOTE_PDF: SERVER_FILE, QUOTE_EXCEL: null }, {}),
      { SIGNED_QUOTE_PDF: SERVER_FILE, QUOTE_EXCEL: null }
    );
  });
});

describe("칸의 둘째 줄", () => {
  test("올린 때는 KST 로 — 자정을 넘기면 날짜가 넘어간다", () => {
    assert.equal(formatQuoteAttachmentUploadedAt("2026-09-15T05:03:00.000Z"), "2026-09-15 14:03");
    assert.equal(formatQuoteAttachmentUploadedAt("2026-09-15T15:30:00.000Z"), "2026-09-16 00:30");
    assert.equal(formatQuoteAttachmentUploadedAt("아무 글자"), "아무 글자");
  });

  test("크기 · 올린 때 · 올린 사람 — 방금 올려 이름을 모르면 「방금 올림」", () => {
    assert.equal(describeQuoteAttachmentFile({ ...SERVER_FILE }), "2.0 KB · 2026-09-15 10:00 · 홍길동");
    assert.equal(describeQuoteAttachmentFile(JUST_UPLOADED), "4.0 KB · 2026-09-15 11:00 · 방금 올림");
  });
});

describe("새 견적서의 대기 파일", () => {
  test("칸마다 하나 — 다시 고르면 바뀌고, 빼면 사라진다. 원본은 건드리지 않는다", () => {
    const empty = {};
    const one = withPendingQuoteAttachment<string>(empty, "QUOTE_EXCEL", "a.xlsx");
    assert.deepEqual(empty, {});
    assert.deepEqual(one, { QUOTE_EXCEL: "a.xlsx" });
    const replaced = withPendingQuoteAttachment(one, "QUOTE_EXCEL", "b.xlsx");
    assert.deepEqual(replaced, { QUOTE_EXCEL: "b.xlsx" });
    assert.deepEqual(withPendingQuoteAttachment(replaced, "QUOTE_EXCEL", null), {});
  });

  test("🔴 올릴 차례는 고른 순서가 아니라 칸 차례(결재 PDF → 엑셀)다", () => {
    let pending = withPendingQuoteAttachment<string>({}, "QUOTE_EXCEL", "a.xlsx");
    pending = withPendingQuoteAttachment(pending, "SIGNED_QUOTE_PDF", "b.pdf");
    assert.deepEqual(pendingQuoteAttachmentQueue(pending), [
      { category: "SIGNED_QUOTE_PDF", file: "b.pdf" },
      { category: "QUOTE_EXCEL", file: "a.xlsx" },
    ]);
    assert.deepEqual(pendingQuoteAttachmentQueue({}), []);
  });
});

describe("문구", () => {
  test("🔴 새 견적서 저장 뒤 실패 — 견적서는 등록됐다고, 무엇을 왜 못 올렸는지와 다시 올리는 길", () => {
    const text = createdWithAttachmentFailuresText(2, [
      { category: "QUOTE_EXCEL", fileName: "견적.xlsx", reason: "파일이 20MB를 넘습니다." },
    ]);
    assert.ok(text.startsWith("견적서는 등록됐습니다."), text);
    assert.ok(text.includes("파일 2개 중 1개를 올리지 못했습니다"), text);
    assert.ok(text.includes("수기 견적서 엑셀(견적.xlsx): 파일이 20MB를 넘습니다 · ") === false, text);
    assert.ok(text.includes("수기 견적서 엑셀(견적.xlsx): 파일이 20MB를 넘습니다."), "끝 마침표가 겹쳤다: " + text);
    assert.ok(text.includes("[다시 올리기]"), text);
  });

  test("진행 · 올린 뒤 · 바꾼 뒤", () => {
    assert.equal(quoteAttachmentUploadProgressText(1, 2), "파일 올리는 중 1/2…");
    assert.equal(quoteAttachmentUploadedText("SIGNED_QUOTE_PDF", false), "「결재 견적서 PDF」 파일을 올렸습니다.");
    assert.ok(quoteAttachmentUploadedText("QUOTE_EXCEL", true).includes("옛 파일은 첨부 휴지통으로"));
  });

  test("🔴 지우기 확인 — 첨부 휴지통으로 간다고, [저장]과 따로 바로 반영된다고 말한다", () => {
    const text = quoteAttachmentDeleteText("QUOTE_EXCEL");
    assert.equal(text.title, "「수기 견적서 엑셀」 파일을 지우시겠습니까?");
    assert.ok(text.body.includes("첨부 휴지통으로 옮깁니다"), text.body);
    assert.ok(text.body.includes("바로 반영"), text.body);
  });
});

describe("엑셀 전용 — 줄 세기", () => {
  test("저장이 거르는 빈 줄은 세지 않는다 — 서버가 세는 그대로", () => {
    const counts = countQuoteLinesForExcelOnly({
      items: [
        { partNameText: "", unitPrice: "" },
        { partNameText: "커넥터", unitPrice: "" },
        { partNameText: "  ", unitPrice: "1000" },
      ],
      workScopeTexts: ["외관검사", "   ", ""],
      repairTaskCount: 2,
    });
    assert.deepEqual(counts, { items: 2, workScopeLines: 1, repairTasks: 2 });
    assert.equal(hasQuoteLines(counts), true);
    assert.equal(describeQuoteLineCounts(counts), "부품 2줄 · 작업 내역 1줄 · 수리 작업 2건");
  });

  test("빈 첫 줄 하나뿐인 새 견적서는 줄이 없다", () => {
    const counts = countQuoteLinesForExcelOnly({
      items: [{ partNameText: "", unitPrice: "" }],
      workScopeTexts: [],
      repairTaskCount: 0,
    });
    assert.equal(hasQuoteLines(counts), false);
    assert.equal(describeQuoteLineCounts({ items: 0, workScopeLines: 3, repairTasks: 0 }), "작업 내역 3줄");
  });
});

describe("엑셀 전용 — 켜기 · 끄기와 줄 복원", () => {
  const CURRENT = { lines: ["부품 A", "외관검사"] };
  const CLEARED = { lines: [] as string[] };
  const WITH_LINES = { items: 1, workScopeLines: 1, repairTasks: 0 };
  const NO_LINES = { items: 0, workScopeLines: 0, repairTasks: 0 };

  test("🔴 줄이 있는데 아직 묻지 않았으면 켜지 않고 묻는다 — 줄 수를 들고", () => {
    const plan = planExcelOnlyToggle({
      turnOn: true,
      counts: WITH_LINES,
      confirmedClear: false,
      current: CURRENT,
      cleared: CLEARED,
      stash: null,
    });
    assert.deepEqual(plan, { kind: "ASK_TO_CLEAR", counts: WITH_LINES });
  });

  test("비우기를 고르면 켜고, 지금 줄은 넣어 두고 빈 묶음으로 바꾼다", () => {
    const plan = planExcelOnlyToggle({
      turnOn: true,
      counts: WITH_LINES,
      confirmedClear: true,
      current: CURRENT,
      cleared: CLEARED,
      stash: null,
    });
    assert.deepEqual(plan, { kind: "APPLY", isExcelOnly: true, lines: CLEARED, stash: CURRENT });
  });

  test("줄이 없으면 묻지 않고 켠다 — 그래도 지금 묶음은 넣어 둔다(손댐 표시를 돌려놓으려고)", () => {
    const plan = planExcelOnlyToggle({
      turnOn: true,
      counts: NO_LINES,
      confirmedClear: false,
      current: CURRENT,
      cleared: CLEARED,
      stash: null,
    });
    assert.deepEqual(plan, { kind: "APPLY", isExcelOnly: true, lines: CLEARED, stash: CURRENT });
  });

  test("🔴 끄면 넣어 둔 줄이 그대로 돌아온다 — 켜고 끄면 처음과 같은 묶음", () => {
    const on = planExcelOnlyToggle({
      turnOn: true,
      counts: WITH_LINES,
      confirmedClear: true,
      current: CURRENT,
      cleared: CLEARED,
      stash: null,
    });
    assert.equal(on.kind, "APPLY");
    const off = planExcelOnlyToggle({
      turnOn: false,
      counts: NO_LINES,
      confirmedClear: false,
      current: CLEARED,
      cleared: CLEARED,
      stash: on.kind === "APPLY" ? on.stash : null,
    });
    assert.deepEqual(off, { kind: "APPLY", isExcelOnly: false, lines: CURRENT, stash: null });
    assert.equal(off.kind === "APPLY" ? off.lines : null, CURRENT, "넣어 둔 바로 그 묶음이어야 한다");
  });

  test("처음부터 엑셀 전용이던 장을 끄면 줄은 그대로다(넣어 둔 것이 없다)", () => {
    const plan = planExcelOnlyToggle({
      turnOn: false,
      counts: NO_LINES,
      confirmedClear: false,
      current: CLEARED,
      cleared: CLEARED,
      stash: null,
    });
    assert.deepEqual(plan, { kind: "APPLY", isExcelOnly: false, lines: null, stash: null });
  });
});

describe("엑셀 전용 — 엑셀이 없다는 안내", () => {
  test("수정 화면: 엑셀 칸이 비었으면 안내한다 — 못 올리고 들고만 있는 파일은 세지 않는다", () => {
    const attached = isQuoteExcelAttachedOrQueued({ isNewQuote: false, excelSlot: null, hasPendingExcel: true });
    assert.equal(attached, false);
    const notice = excelOnlyMissingExcelNotice({ isExcelOnly: true, excelAttachedOrQueued: attached });
    assert.ok(notice?.startsWith("수기 견적서 엑셀을 붙여 주세요"), String(notice));
    assert.ok(notice?.includes("저장은 됩니다"), String(notice));
  });

  test("새 견적서: 엑셀을 골라 두었으면 [저장] 뒤에 올라가므로 안내하지 않는다", () => {
    const attached = isQuoteExcelAttachedOrQueued({ isNewQuote: true, excelSlot: null, hasPendingExcel: true });
    assert.equal(attached, true);
    assert.equal(excelOnlyMissingExcelNotice({ isExcelOnly: true, excelAttachedOrQueued: attached }), null);
  });

  test("엑셀 칸이 차 있거나 엑셀 전용이 아니면 안내가 없다", () => {
    assert.equal(
      isQuoteExcelAttachedOrQueued({ isNewQuote: false, excelSlot: JUST_UPLOADED, hasPendingExcel: false }),
      true
    );
    assert.equal(excelOnlyMissingExcelNotice({ isExcelOnly: false, excelAttachedOrQueued: false }), null);
  });
});

describe("목록 표시", () => {
  test("일반 견적서에 결재 PDF 가 없으면 아무것도 붙지 않는다(지금 그대로)", () => {
    assert.deepEqual(quoteListFileBadges({ isExcelOnly: false, hasSignedPdf: false, hasExcel: false }), []);
    // 일반 견적서에 엑셀이 붙어 있는 것은 따로 표시하지 않는다(받기는 앱 양식이다).
    assert.deepEqual(quoteListFileBadges({ isExcelOnly: false, hasSignedPdf: false, hasExcel: true }), []);
  });

  test("결재 PDF 가 있으면 「결재 PDF」", () => {
    assert.deepEqual(
      quoteListFileBadges({ isExcelOnly: false, hasSignedPdf: true, hasExcel: false }).map((badge) => badge.key),
      ["SIGNED_PDF"]
    );
  });

  test("🔴 엑셀 전용인데 엑셀이 없으면 「엑셀 전용」과 경고 「엑셀 없음」", () => {
    const badges = quoteListFileBadges({ isExcelOnly: true, hasSignedPdf: false, hasExcel: false });
    assert.deepEqual(
      badges.map((badge) => [badge.key, badge.label, badge.tone]),
      [
        ["EXCEL_ONLY", "엑셀 전용", "info"],
        ["EXCEL_MISSING", "엑셀 없음", "warning"],
      ]
    );
    // 🔴 2026-10-07 — 곁말이 **없어진 [견적서 받기]를 가리키지 않는다.** 그 장에 파일이
    //    없다는 사실과, 어디서 붙이는지를 말한다(엑셀 전용 장은 [저장]도 엑셀을 안 만든다).
    assert.ok(!badges[1].title.includes("견적서 받기"), badges[1].title);
    assert.ok(badges[1].title.includes("이 장에는 견적서 파일이 없습니다"), badges[1].title);
    assert.ok(badges[1].title.includes("견적서 수정 화면에서 붙여 주세요"), badges[1].title);
    // 🔴 곁말과 팝업이 **한 글자**다 — 그 약속은 quote-list-screen-source.test.ts 가
    //    팝업 쪽에서도 잰다.
    assert.equal(badges[1].title, QUOTE_EXCEL_MISSING_NOTICE);
  });

  test("엑셀 전용에 엑셀 · 결재 PDF 가 다 있으면 경고 없이 둘", () => {
    assert.deepEqual(
      quoteListFileBadges({ isExcelOnly: true, hasSignedPdf: true, hasExcel: true }).map((badge) => badge.key),
      ["EXCEL_ONLY", "SIGNED_PDF"]
    );
  });
});
