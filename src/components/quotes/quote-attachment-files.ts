import {
  CATEGORY_EXTENSION_ALLOWLIST,
  MAX_ATTACHMENT_SIZE_BYTES,
  getAllowedMimeTypesForExtension,
  isExtensionAllowedForCategory,
  normalizeFileExtension,
} from "@/lib/domain/attachment-allowlist";
import {
  QUOTE_ATTACHMENT_SLOT_CATEGORIES,
  attachmentCategoryLabels,
  type QuoteAttachmentSlotCategory,
} from "@/lib/domain/attachment-category";
import { formatBytes } from "@/lib/domain/image-shrink";
import type { QuoteAttachmentSlotFile, QuoteAttachmentSlots } from "@/lib/db/queries/attachments";

/**
 * ============================================================================
 * 견적서 파일(결재 PDF · 수기 엑셀) · 엑셀 전용 — 화면의 순수 도우미 (조각 3d-3d)
 * ============================================================================
 * DOM 도 fetch 도 서버 액션도 만지지 않는다 — 시험이 브라우저 없이 전부 돌린다.
 * 올리기 자체는 quote-attachment-upload.ts 가 한다(같은 조각에 함께 왔다).
 * 그리기(파일 칸 · 끌어놓기 · 지우기 확인 창)는 **조각 3d-3f**, 편집 화면에 잇는
 * 배선은 **조각 3d-4** 가 했다 — 🔴 **2026-09-28 부터 견적서 수정 화면에 실제로
 * 그려진다**(QuoteAttachmentsSection.tsx). 미리보기 넷은 **조각 3f** 가 맨 끝에
 * 되돌려 놓았다(같은 날).
 *
 * 🔴 **여기의 판정은 편의일 뿐이다.** 형식 · 크기는 올리기 통로
 * (api/quotes/[id]/attachments/route.ts — 조각 3d-3b 에 왔다)가 다시 본다. 20MB 를 다
 * 보내고 거절당하기 전에 알려 주려는 것이다. 판정의 재료도 그 통로와 같은 것을 부른다
 * (분류 허용목록 · 20MB). 여기에 확장자를 따로 적으면 화면은 받는데 서버가 거절하는
 * (또는 그 반대의) 날이 온다.
 *
 * 🔴 파일 이름은 사람이 붙인 것이라 고객사 이름이 섞일 수 있다. 화면에 보이는 것 말고는
 * 어디로도 내보내지 않는다 — console 에도 싣지 않는다.
 *
 * ── 🔴 DB 타입은 **타입 전용**으로 들여온다 ─────────────────────────────
 * 위 마지막 줄이 `import type` 인 것은 실수가 아니다. `@/lib/db/queries/attachments`
 * 는 첫 줄이 `import "server-only"` 라 **값으로 들여오면 그 사슬이 브라우저 묶음까지
 * 따라온다.** 타입 전용 import 는 컴파일할 때 통째로 지워지므로 그 일이 없다.
 * 🔴 **이 파일에서 그 경로를 값으로 들여오지 마라** — 곁의 시험
 * (quote-list-screen-source.test.ts)이 「`import type` 으로만 · 정확히 한 줄」을
 * 글자로 잰다.
 *
 * ── 🔴 주소 짓는 둘 — 라우트가 왔다 (조각 3d-4) ─────────────────────────
 * `quoteAttachmentViewUrl` · `quoteAttachmentDownloadUrl` 이 짓는
 * `/api/attachments/[id]/download` 라우트가 **2026-09-28 에 들어왔다.** 그 전까지는
 * 「화면에 걸면 죽은 링크」라 시험이 부르는 곳이 없음을 훑어 못 박고 있었다. 지금
 * 지키는 것은 뜻이 바뀌었다 — **부르는 곳이 칸 조각 하나뿐이고, 라우트가 실재한다**
 * (아래 「주소」 절의 곁말과 quote-attachment-files.test.ts 의 같은 이름 시험).
 *
 * ── A/S 와 같은 이름 · 같은 자리 ────────────────────────────────────────
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/components/quotes/quote-attachment-files.ts`, 488줄)이다.
 * 🔴 **가져오지 않은 것은 셋뿐**이고 셋 다 까닭이 있다:
 *   · `quoteListAmountNote` — **공용 묶음에 이미 있다**
 *     (vendor/dss-core/src/ui/quotes/quote-list-rows.ts). 여기 다시 적으면 두 벌이 된다.
 *   · 미리보기 넷(`QuotePrintSignedPdf` · `excelOnlyPrintAttachments` ·
 *     `signedPdfForPreview` · `EXCEL_ONLY_NO_SIGNED_PDF_TEXT`) — **조각 3f**(미리보기).
 *     ⚠️ **그 넷이 2026-09-28 에 왔다**(조각 3f). 이 파일 맨 끝의 「미리보기 넷」
 *     머리말 아래가 그것이고, 저쪽 455~488줄과 바이트가 같다. 위 줄은 그때의 기록이다.
 *     🔴 **이제 안 가져온 것은 `quoteListAmountNote` 하나**다.
 *   · 🔴 `QUOTE_EXCEL_MISSING_NOTICE` — **조각 3d-4 에서 A/S 문장으로 돌아왔다**
 *     (2026-09-28). 이 자리에 「붙이는 칸이 실제로 서는 날의 몫」이라 적혀 있던 그것이고,
 *     그날이 왔다. 상수 자체는 남는다 — 딱지와 팝업이 한 글자를 써야 하기 때문이다
 *     (아래 그 상수의 머리말).
 *
 * 🔴 **나머지는 한 글자도 고치지 않았다** — 조각 4 에서 두 벌을 글자로 대조한다.
 * 이름이나 자리를 옮기면 그 대조가 짝을 잃는다.
 * ============================================================================
 */

// ────────────────────────────────────────────────── 칸 정의

export type QuoteAttachmentSlotDefinition = {
  category: QuoteAttachmentSlotCategory;
  /** 칸 이름 — 분류 이름표 그대로(「결재 견적서 PDF」 · 「수기 견적서 엑셀」). */
  label: string;
  /** 받는 확장자 — 분류 허용목록(attachment-allowlist.ts) 그대로. */
  extensions: readonly string[];
  /** 파일 고르기 칸의 accept — 확장자와 그 MIME. */
  accept: string;
  /** 브라우저가 새 탭에서 페이지 안으로 여는 형식인가 — PDF 만(받기 통로의 inline 목록). */
  viewableInBrowser: boolean;
};

/**
 * 형식이 틀렸을 때의 까닭 — 올리기 통로의 415 문구(SLOT_EXTENSION_HINTS)와 같은 말이다.
 * 사람이 화면에서 먼저 보든 서버에서 받든 같은 문장을 읽는다.
 */
const FORMAT_REJECTIONS: Record<QuoteAttachmentSlotCategory, string> = {
  SIGNED_QUOTE_PDF: "결재 견적서는 PDF 로만 올릴 수 있습니다",
  QUOTE_EXCEL: "수기 견적서는 엑셀(xlsx · xls)로만 올릴 수 있습니다",
};

function slotDefinition(category: QuoteAttachmentSlotCategory): QuoteAttachmentSlotDefinition {
  const extensions = CATEGORY_EXTENSION_ALLOWLIST[category] ?? [];
  const accept = [
    ...extensions.map((extension) => `.${extension}`),
    ...extensions.flatMap((extension) => getAllowedMimeTypesForExtension(extension)),
  ].join(",");
  return {
    category,
    label: attachmentCategoryLabels[category],
    extensions,
    accept,
    viewableInBrowser: extensions.length > 0 && extensions.every((extension) => extension === "pdf"),
  };
}

/** 화면의 칸 차례 — QUOTE_ATTACHMENT_SLOT_CATEGORIES 의 차례가 곧 이것이다. */
export const QUOTE_ATTACHMENT_SLOTS: readonly QuoteAttachmentSlotDefinition[] =
  QUOTE_ATTACHMENT_SLOT_CATEGORIES.map(slotDefinition);

export function quoteAttachmentSlotLabel(category: QuoteAttachmentSlotCategory): string {
  return attachmentCategoryLabels[category];
}

// ────────────────────────────────────────────────── 한 파일 사전 검사

function formatMegabytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)}MB`;
}

/**
 * 보내기 전에 거른다. 틀리면 사람이 읽을 까닭, 맞으면 null.
 *
 * 순서는 스크린샷 · 파일 화면과 같다 — 형식 → 빈 파일 → 크기. 형식은 **이름의 확장자**로
 * 본다(서버도 그렇게 본다). 이름만 바꾼 파일은 서버의 앞머리 바이트 대조가 막는다.
 */
export function checkQuoteAttachmentFile(
  file: { name: string; size: number },
  category: QuoteAttachmentSlotCategory
): string | null {
  const extension = normalizeFileExtension(file.name);
  if (!extension || !isExtensionAllowedForCategory(extension, category)) {
    return FORMAT_REJECTIONS[category];
  }
  if (file.size === 0) return "빈 파일은 올릴 수 없습니다";
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return `${formatMegabytes(MAX_ATTACHMENT_SIZE_BYTES)}를 넘습니다 (${formatMegabytes(file.size)})`;
  }
  return null;
}

// ────────────────────────────────────────────────── 주소

/** 올리기 통로. 본문은 파일 바이트 그대로이고 이름 · 칸은 쿼리 문자열이다(multipart 아님). */
export function quoteAttachmentUploadUrl(
  quoteId: string,
  category: QuoteAttachmentSlotCategory,
  fileName: string
): string {
  const query = new URLSearchParams({ fileName, category });
  return `/api/quotes/${encodeURIComponent(quoteId)}/attachments?${query.toString()}`;
}

/**
 * ============================================================================
 * 🔴 아래 둘이 가리키는 라우트가 **왔다** (조각 3d-4, 2026-09-28)
 * ============================================================================
 * `/api/attachments/[id]/download` — `src/app/api/attachments/[id]/download/route.ts`
 * 다. A/S 에서 방어를 하나도 빼지 않고 가져왔고(세션 · 두 겹 권한 · 악성코드 검사 ·
 * 견적서 휴지통 · 저장 루트 밖 거부 · FILE_DOWNLOAD 감사), 인증만 이 사이트 식
 * (`getSessionUser()` 한 걸음)으로 접었다.
 *
 * 🔴 **조각 3d-3d 가 여기 적어 둔 것은 「그 전까지 이 둘을 화면에 걸지 마라 — 누르면
 * 404 가 뜨는 링크가 된다」였고, 곁의 시험이 그것을 훑어 막고 있었다.** 그 울타리는
 * 의도대로 작동했다: 3d-3f 가 칸을 가져오려다 걸려 멈췄고, 사람이 **라우트가 함께
 * 왔는지**를 보게 되었다.
 *
 * 이제 전제가 사라졌으므로 시험의 **뜻을 바꿨다**(지우지 않았다):
 *   · 라우트 파일이 **실제로 있다**
 *   · 이 둘을 부르는 곳은 **칸 조각(QuoteAttachmentParts.tsx) 하나뿐**이다
 * 두 번째가 값진 쪽이다 — 주소를 화면 여기저기서 짓기 시작하면, 라우트의 질의값
 * (`?view=full`)이 바뀌는 날 고칠 자리가 코드 전체를 훑어야 나오는 질문이 된다.
 * ============================================================================
 */

/** 보기 — 받기 통로가 PDF 를 페이지 안(inline)으로 내준다(inline-view.ts 의 view=full). */
export function quoteAttachmentViewUrl(attachmentId: string): string {
  return `/api/attachments/${encodeURIComponent(attachmentId)}/download?view=full`;
}

/** 내려받기 — 첨부로 내려가고 감사(FILE_DOWNLOAD)가 남는다. */
export function quoteAttachmentDownloadUrl(attachmentId: string): string {
  return `/api/attachments/${encodeURIComponent(attachmentId)}/download`;
}

// ────────────────────────────────────────────────── 칸에 보이는 파일

/**
 * 칸에 그리는 파일. 서버 칸 조회(QuoteAttachmentSlotFile)와 같되 **올린 사람이 비어 있을
 * 수 있다** — 방금 올린 파일은 올리기 통로의 응답만 들고 있고, 그 응답에는 이름이 없다.
 */
export type QuoteAttachmentSlotFileView = Omit<QuoteAttachmentSlotFile, "uploadedByName"> & {
  uploadedByName: string | null;
};

/** 칸마다 이 화면에서 방금 한 일 — 서버가 다시 그려 오기 전까지 화면이 들고 있는다. */
export type QuoteSlotLocalChange =
  | { kind: "uploaded"; file: QuoteAttachmentSlotFileView }
  | { kind: "deleted"; attachmentId: string };

export type QuoteSlotLocalChanges = Partial<Record<QuoteAttachmentSlotCategory, QuoteSlotLocalChange>>;

function timeOf(iso: string): number {
  const parsed = new Date(iso).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * 칸에 지금 그릴 파일 — 서버가 준 칸과 이 화면에서 방금 한 일을 맞춘다.
 *
 *  · 방금 올렸다: 서버가 **같은 파일**을 돌려주면 서버 것(올린 사람 이름이 있다), 아직
 *    옛 것을 주면 방금 올린 것. 서버 쪽이 **더 나중에 올린 다른 파일**이면 그것이 이긴다 —
 *    그 사이 다른 사람이 칸을 바꿨다.
 *  · 방금 지웠다: 서버가 아직 그 파일을 주면 빈 칸, 다른 파일을 주면 그 파일.
 *
 * 새 견적서(서버 칸이 없다)는 방금 올린 것만으로 그린다.
 */
export function resolveQuoteSlotFile(
  server: QuoteAttachmentSlotFile | null | undefined,
  local: QuoteSlotLocalChange | undefined
): QuoteAttachmentSlotFileView | null {
  const serverFile = server ?? null;
  if (!local) return serverFile;
  if (local.kind === "deleted") {
    return serverFile && serverFile.id === local.attachmentId ? null : serverFile;
  }
  if (serverFile && (serverFile.id === local.file.id || timeOf(serverFile.uploadedAt) > timeOf(local.file.uploadedAt))) {
    return serverFile;
  }
  return local.file;
}

export type ResolvedQuoteSlots = Record<QuoteAttachmentSlotCategory, QuoteAttachmentSlotFileView | null>;

export function resolveQuoteSlots(
  serverSlots: QuoteAttachmentSlots | null,
  localChanges: QuoteSlotLocalChanges
): ResolvedQuoteSlots {
  const resolved = {} as ResolvedQuoteSlots;
  for (const category of QUOTE_ATTACHMENT_SLOT_CATEGORIES) {
    resolved[category] = resolveQuoteSlotFile(serverSlots?.[category], localChanges[category]);
  }
  return resolved;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 올린 때 — `YYYY-MM-DD HH:mm`(KST). 한국은 서머타임이 없어 +9 시간을 더해 UTC 로 읽는다. */
export function formatQuoteAttachmentUploadedAt(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const kst = new Date(parsed.getTime() + KST_OFFSET_MS);
  return (
    `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())} ` +
    `${pad2(kst.getUTCHours())}:${pad2(kst.getUTCMinutes())}`
  );
}

/** 칸의 둘째 줄 — `크기 · 올린 때 · 올린 사람`. 방금 올려 이름을 모르면 「방금 올림」. */
export function describeQuoteAttachmentFile(file: QuoteAttachmentSlotFileView): string {
  return [
    formatBytes(file.fileSize),
    formatQuoteAttachmentUploadedAt(file.uploadedAt),
    file.uploadedByName ?? "방금 올림",
  ].join(" · ");
}

export function formatPendingFileSize(bytes: number): string {
  return formatBytes(bytes);
}

// ────────────────────────────────────────────────── 들고 있는 파일(새 견적서 · 실패한 것)

/**
 * 칸마다 들고 있는 파일 — **아직 올리지 않았다.** 새 견적서는 id 가 없어 [저장] 뒤에
 * 올리고, 수정 화면에서는 올리기에 실패한 파일을 [다시 올리기]까지 들고 있는다.
 */
export type PendingQuoteAttachments<F> = Partial<Record<QuoteAttachmentSlotCategory, F>>;

/** 한 칸의 파일을 바꾸거나(`file`) 뺀다(`null`). 다른 칸은 그대로다 — 새 객체를 돌려준다. */
export function withPendingQuoteAttachment<F>(
  pending: PendingQuoteAttachments<F>,
  category: QuoteAttachmentSlotCategory,
  file: F | null
): PendingQuoteAttachments<F> {
  const next = { ...pending };
  if (file === null) delete next[category];
  else next[category] = file;
  return next;
}

/** 올릴 차례 — 칸 차례(결재 PDF → 엑셀) 그대로. 비어 있는 칸은 건너뛴다. */
export function pendingQuoteAttachmentQueue<F>(
  pending: PendingQuoteAttachments<F>
): { category: QuoteAttachmentSlotCategory; file: F }[] {
  const queue: { category: QuoteAttachmentSlotCategory; file: F }[] = [];
  for (const category of QUOTE_ATTACHMENT_SLOT_CATEGORIES) {
    const file = pending[category];
    if (file !== undefined) queue.push({ category, file });
  }
  return queue;
}

// ────────────────────────────────────────────────── 문구

/** 수정 화면 — 파일은 [저장]과 따로 바로 반영된다(견적서 칸이 아니다). */
export const QUOTE_ATTACHMENT_SAVED_NOTE =
  "파일은 견적서 칸이 아니라서 올리기 · 바꾸기 · 지우기가 [저장]을 누르지 않아도 바로 반영됩니다. 다시 올리면 새 파일로 바뀌고 옛 파일은 첨부 휴지통으로 갑니다.";

/** 새 견적서 — 아직 id 가 없어 들고만 있다가 [저장] 뒤에 올린다. */
export const QUOTE_ATTACHMENT_PENDING_NOTE =
  "새 견적서는 아직 저장 전이라 고른 파일을 들고만 있습니다 — [저장]을 누르면 견적서를 만든 뒤 차례로 올립니다.";

export type QuoteAttachmentUploadFailure = {
  category: QuoteAttachmentSlotCategory;
  fileName: string;
  reason: string;
};

/**
 * `칸(이름): 까닭 · …`. 서버 문구는 마침표로 끝나므로 끝의 마침표를 떼어 잇는다 — 그대로
 * 두면 문장 안에서 「넘습니다. · …」, 끝에서 「넘습니다..」가 된다.
 */
export function formatQuoteAttachmentFailures(failures: readonly QuoteAttachmentUploadFailure[]): string {
  return failures
    .map(
      (failure) =>
        `${quoteAttachmentSlotLabel(failure.category)}(${failure.fileName}): ${failure.reason.trim().replace(/\.+$/, "")}`
    )
    .join(" · ");
}

/** 「파일 올리는 중 1/2…」 — `current` 는 지금 보내는 파일의 차례(1부터). */
export function quoteAttachmentUploadProgressText(current: number, total: number): string {
  return `파일 올리는 중 ${current}/${total}…`;
}

/**
 * 새 견적서는 저장됐는데 파일 일부를 못 올렸을 때. **견적서는 이미 있다** — 목록으로 넘기지
 * 않고 이 화면에 머물러 무엇을 왜 못 올렸는지와 다시 올리는 길을 알린다.
 */
export function createdWithAttachmentFailuresText(
  total: number,
  failures: readonly QuoteAttachmentUploadFailure[]
): string {
  return (
    `견적서는 등록됐습니다. 파일 ${total}개 중 ${failures.length}개를 올리지 못했습니다 — ` +
    `${formatQuoteAttachmentFailures(failures)}. 아래 「견적서 파일」 칸에서 [다시 올리기]를 눌러 주세요.`
  );
}

/** 수정 화면에서 한 칸을 올린 뒤. 칸 교체로 옛 파일이 밀려났으면 그렇다고 말한다. */
export function quoteAttachmentUploadedText(category: QuoteAttachmentSlotCategory, replaced: boolean): string {
  const label = quoteAttachmentSlotLabel(category);
  return replaced
    ? `「${label}」 파일을 바꿨습니다 — 옛 파일은 첨부 휴지통으로 옮겼습니다.`
    : `「${label}」 파일을 올렸습니다.`;
}

/** 지우기 확인 창의 두 줄. */
export function quoteAttachmentDeleteText(category: QuoteAttachmentSlotCategory): { title: string; body: string } {
  return {
    title: `「${quoteAttachmentSlotLabel(category)}」 파일을 지우시겠습니까?`,
    body: "첨부 휴지통으로 옮깁니다. [저장]을 누르지 않아도 바로 반영되고, 칸은 비어 새 파일을 올릴 수 있습니다.",
  };
}

export function quoteAttachmentDeletedText(category: QuoteAttachmentSlotCategory): string {
  return `「${quoteAttachmentSlotLabel(category)}」 파일을 첨부 휴지통으로 옮겼습니다.`;
}

// ────────────────────────────────────────────────── 엑셀 전용

/**
 * 엑셀 전용 견적서에 **있으면 안 되는 줄**의 수 — 서버 규칙(validation/quote-input.ts 의
 * quoteExcelOnlyFieldErrors)이 세는 그대로다. 줄이 하나라도 있으면 저장이 거절된다.
 *
 * 세는 법은 저장이 거르는 법과 같다: 부품 줄은 품명이나 단가가 적힌 줄(collectFields 가
 * 통째로 빈 줄을 보내지 않는다), 작업 내역은 글자가 있는 줄(검증이 빈 줄을 버린다), 수리
 * 작업은 저장될 그 목록의 줄 수.
 */
export type QuoteLineCounts = { items: number; workScopeLines: number; repairTasks: number };

export function countQuoteLinesForExcelOnly(input: {
  items: readonly { partNameText: string; unitPrice: string }[];
  workScopeTexts: readonly string[];
  repairTaskCount: number;
}): QuoteLineCounts {
  return {
    items: input.items.filter((row) => row.partNameText.trim() !== "" || row.unitPrice.trim() !== "").length,
    workScopeLines: input.workScopeTexts.filter((text) => text.trim() !== "").length,
    repairTasks: input.repairTaskCount,
  };
}

export function hasQuoteLines(counts: QuoteLineCounts): boolean {
  return counts.items + counts.workScopeLines + counts.repairTasks > 0;
}

/** 「부품 2줄 · 작업 내역 5줄 · 수리 작업 1건」 — 0 인 것은 뺀다. */
export function describeQuoteLineCounts(counts: QuoteLineCounts): string {
  const parts: string[] = [];
  if (counts.items > 0) parts.push(`부품 ${counts.items}줄`);
  if (counts.workScopeLines > 0) parts.push(`작업 내역 ${counts.workScopeLines}줄`);
  if (counts.repairTasks > 0) parts.push(`수리 작업 ${counts.repairTasks}건`);
  return parts.join(" · ");
}

/**
 * 엑셀 전용 스위치를 눌렀을 때 할 일 — `T` 는 화면이 들고 있는 줄 묶음(부품 · 작업 내역 ·
 * 손댐 표시 · 고른 수리 작업)이다.
 *
 *  · **켜는데 줄이 있고 아직 묻지 않았다** → 묻는다. 서버는 줄이 있는 엑셀 전용 장을
 *    거절하므로(조용히 지우지 않는다) 켜려면 비워야 한다 — 그 사실을 켜는 순간에 알린다.
 *  · **켠다** → 지금 줄을 `stash` 에 넣고 빈 묶음(`cleared`)으로 바꾼다. 줄이 없어도
 *    넣는다 — 빈 묶음은 「손댄 것」으로 표시돼 양식 기본값이 몰래 다시 채우지 않는다.
 *  · **끈다** → 넣어 둔 줄을 그대로 돌려놓는다(저장 전까지 되돌릴 수 있다). 넣어 둔 것이
 *    없으면(처음부터 엑셀 전용이던 장) 줄은 그대로다.
 */
export type ExcelOnlyTogglePlan<T> =
  | { kind: "ASK_TO_CLEAR"; counts: QuoteLineCounts }
  | { kind: "APPLY"; isExcelOnly: boolean; /** 바꿔 넣을 줄 — null 이면 그대로 둔다. */ lines: T | null; stash: T | null };

export function planExcelOnlyToggle<T>(params: {
  turnOn: boolean;
  counts: QuoteLineCounts;
  confirmedClear: boolean;
  current: T;
  cleared: T;
  stash: T | null;
}): ExcelOnlyTogglePlan<T> {
  if (params.turnOn) {
    if (hasQuoteLines(params.counts) && !params.confirmedClear) {
      return { kind: "ASK_TO_CLEAR", counts: params.counts };
    }
    return { kind: "APPLY", isExcelOnly: true, lines: params.cleared, stash: params.current };
  }
  return { kind: "APPLY", isExcelOnly: false, lines: params.stash, stash: null };
}

/**
 * 엑셀 칸이 차 있거나(서버) 새 견적서가 들고 있는가 — 들고 있으면 [저장] 뒤에 올라가므로
 * 비었다고 알리지 않는다. 수정 화면에서 **올리지 못하고 들고 있는** 파일은 세지 않는다.
 */
export function isQuoteExcelAttachedOrQueued(params: {
  isNewQuote: boolean;
  excelSlot: QuoteAttachmentSlotFileView | null;
  hasPendingExcel: boolean;
}): boolean {
  return params.excelSlot !== null || (params.isNewQuote && params.hasPendingExcel);
}

/**
 * 엑셀 전용인데 엑셀이 없을 때의 안내 — 저장은 된다(새 견적서는 저장한 뒤에야 올릴 수
 * 있다). 다만 그 장의 [견적서 받기]가 내줄 파일이 없으므로 눈에 띄게 알린다.
 */
export function excelOnlyMissingExcelNotice(params: { isExcelOnly: boolean; excelAttachedOrQueued: boolean }): string | null {
  if (!params.isExcelOnly || params.excelAttachedOrQueued) return null;
  return "수기 견적서 엑셀을 붙여 주세요 — 엑셀 전용 견적서의 [견적서 받기]는 붙인 엑셀을 내려줍니다. 붙이기 전에는 받을 파일이 없습니다(저장은 됩니다).";
}

// ────────────────────────────────────────────────── 목록 표시

/**
 * 목록 한 줄에 붙는 파일 딱지. 🔴 **모양(키 · 이름 · 색조)은 A/S 의 같은 타입 그대로**다
 * (저쪽 `QuoteListFileBadge`) — 두 사이트의 같은 줄이 다른 딱지를 달면 사람이 같은
 * 견적서를 다른 것으로 본다.
 */
export type QuoteListFileBadge = {
  key: "EXCEL_ONLY" | "SIGNED_PDF" | "EXCEL_MISSING";
  label: string;
  /** 마우스를 올리면 뜨는 설명. */
  title: string;
  tone: "info" | "neutral" | "warning";
};

/**
 * ============================================================================
 * 목록 한 줄에 붙이는 표시 — **엑셀 전용 · 결재 PDF · 엑셀 없음** (3c-2 · 3d-0)
 * ============================================================================
 * 붙일 것이 없으면 **빈 배열**이다. 🔴 **일반 견적서 줄에도 「결재 PDF」가 붙는다** —
 * 그래서 「엑셀 전용이 아니면 일찍 돌아가는」 줄이 없다.
 *
 * ── 🔴 나머지 둘이 왜 이 사이트에서도 참인가 ─────────────────────────────
 * 이 사이트와 A/S 는 **같은 `attachments` 표**를 본다(같은 DB). 「결재 PDF」는 그 칸에
 * 파일이 붙어 있는지, 「엑셀 없음」은 엑셀 칸이 비었는지를 실제로 세는데, 그 값은
 * 목록 조회가 이미 싣는다(db/queries/quotes.ts 의 `loadAttachmentFlagsByQuoteId`).
 * 그래서 PO 에 붙이는 칸이 오기 전에도 **A/S 에서 붙인 파일이 그대로 잡힌다** —
 * 실측(2026-09-23)으로 13장 가운데 결재 PDF 1장 · 엑셀 전용인데 엑셀 없음 5장.
 *
 * ── 🔴 이름과 색조는 A/S 와 같고, 이제 곁말 **하나만** 다르다 (3d-2) ─────
 * 딱지 이름 셋과 색조(`info` · `neutral` · `warning`)는 저쪽 그대로다 — 두 사이트의
 * 같은 줄이 다른 딱지를 달면 사람이 같은 견적서를 다른 것으로 본다.
 *
 *  · **「엑셀 전용」** — 🔴 **저쪽 문장으로 돌아왔다**(조각 3d-2). 그 문장이 말하는
 *    「[견적서 받기]가 붙인 엑셀을 내려줍니다」가 이제 **이 사이트에서도 참**이다 —
 *    받기 통로가 갈라져 붙어 있는 엑셀을 그대로 흘려보낸다
 *    (api/quotes/[id]/xlsx/route.ts 의 6번 갈래). 3c-2 가 쓰던 「이 사이트에서는 받을
 *    수 없다」 문장과 그 상수 파일(domain/quote-excel-only-download.ts)은 사라졌다.
 *  · **「엑셀 없음」** — 🔴 **저쪽 문장으로 돌아왔다**(조각 3d-4, 2026-09-28). 그 전까지
 *    이 자리는 「이 사이트에는 아직 파일을 붙이는 칸이 없어, A/S 관리 시스템에서 붙여
 *    주세요」였다 — 붙이는 칸이 서지 않았으므로 저쪽 문장(「견적서 **수정 화면에서
 *    붙여 주세요**」)을 그대로 쓰면 화면이 거짓말을 하고 사람이 없는 칸을 찾아 헤맸다.
 *    🔴 **이제 그 칸이 선다** — `/quotes/{id}` 의 「견적서 파일」 구역
 *    (QuoteAttachmentsSection). 그래서 문장이 저쪽 말로 돌아갔다.
 *
 * 「결재 PDF」 곁말은 사실을 말할 뿐이라 처음부터 저쪽 그대로다.
 * ============================================================================
 */

/**
 * ============================================================================
 * 🔴 「엑셀 없음」의 말 — **딱지와 팝업이 한 글자를 쓴다** (조각 3d-5)
 * ============================================================================
 * 이 문장이 상수로 나온 까닭은 2026-09-23 에 **쓰는 자리가 둘이 되었기** 때문이다:
 *   · 목록 왼쪽 칸의 「엑셀 없음」 딱지 곁말(아래 딱지 규칙)
 *   · 그 줄의 [견적서 받기]를 눌렀을 때 뜨는 알림 팝업
 *     (components/quotes/QuoteListSlots.tsx → common/NoticePopup.tsx)
 * 같은 사실을 두 곳에 따로 적으면 한쪽만 고쳐지는 날이 오고, 그때 사람은 마우스를
 * 올렸을 때와 눌렀을 때 **다른 말**을 듣는다.
 *
 * ── 🔴 저쪽 문장으로 돌아왔다 (조각 3d-4, 2026-09-28) ───────────────────
 * 그 전까지 이 값은 「이 사이트에는 아직 파일을 붙이는 칸이 없어, **A/S 관리
 * 시스템에서** 붙여 주세요」였다. 까닭은 사실이었다 — 붙이는 칸이 없었다. 곁의
 * 시험(quote-list-screen-source.test.ts)이 「견적서 수정 화면」이라는 낱말이 여기
 * 들어오지 못하게 막으면서, 그 자리에 **푸는 조건**을 못 박아 두었다:
 * 「이 줄이 걸리는 날이 **붙이는 칸을 가져온 날**이다 — 그때는 이 사이트에서 붙일 수
 * 있으므로 문장이 저쪽 말로 돌아가고, 이 단언을 지운다.」
 *
 * 🔴 **그날이 왔다.** `/quotes/{id}` 의 「견적서 파일」 구역에서 결재 PDF · 수기 엑셀을
 * 실제로 붙이고 · 바꾸고 · 지울 수 있다(QuoteAttachmentsSection). 그래서 값을 저쪽
 * 문장으로 되돌리고 그 단언을 지웠다. 대신 세운 것은 **더 강한 쪽**이다 — 「그 문장이
 * 가리키는 칸이 실제로 화면에 선다」를 원본을 읽어 잰다(같은 시험).
 *
 * ── 🔴 그래도 서버 문장을 화면이 끌어다 쓰지 않는다 ─────────────────────
 * 통로(api/quotes/[id]/xlsx)가 거절하며 내놓는 `QUOTE_EXCEL_MISSING_MESSAGE`
 * (download-source.ts — A/S 와 바이트 동일)도 이제 같은 곳을 가리킨다. 그래도 화면은
 * 제 상수를 쓴다: 위 「딱지와 팝업이 한 글자」 때문이다. 서버 문장은 **받기를 거절하는
 * 말**(「다시 받아 주세요」)이고 이 문장은 **목록에서 알려 주는 말**이라 쓰임이 다르며,
 * 서버 쪽 파일은 저쪽과 바이트가 같아야 해서 여기 사정으로 고칠 수 없다.
 * ============================================================================
 */
export const QUOTE_EXCEL_MISSING_NOTICE =
  "엑셀 전용인데 수기 견적서 엑셀이 붙지 않아 [견적서 받기]가 내줄 파일이 없습니다. 견적서 수정 화면에서 붙여 주세요.";

export function quoteListFileBadges(row: {
  isExcelOnly: boolean;
  hasSignedPdf: boolean;
  hasExcel: boolean;
}): QuoteListFileBadge[] {
  const badges: QuoteListFileBadge[] = [];
  if (row.isExcelOnly) {
    badges.push({
      key: "EXCEL_ONLY",
      label: "엑셀 전용",
      title: "품목 없이 손으로 만든 엑셀이 곧 보낸 견적서입니다 — [견적서 받기]가 붙인 엑셀을 내려줍니다.",
      tone: "info",
    });
  }
  if (row.hasSignedPdf) {
    badges.push({ key: "SIGNED_PDF", label: "결재 PDF", title: "결재 견적서 PDF 가 붙어 있습니다.", tone: "neutral" });
  }
  if (row.isExcelOnly && !row.hasExcel) {
    badges.push({
      key: "EXCEL_MISSING",
      label: "엑셀 없음",
      title: QUOTE_EXCEL_MISSING_NOTICE,
      tone: "warning",
    });
  }
  return badges;
}

/**
 * ============================================================================
 * 🔴 미리보기 넷 — 조각 3f 가 되돌려 놓았다 (2026-09-28)
 * ============================================================================
 * 위 머리말의 「미리보기 넷(`QuotePrintSignedPdf` · `excelOnlyPrintAttachments` ·
 * `signedPdfForPreview` · `EXCEL_ONLY_NO_SIGNED_PDF_TEXT`) — **조각 3f**(미리보기)」가
 * 기다리던 자리다. 🔴 **그 넷이 여기 다 왔다** — 아래 코드는 저쪽(A/S
 * `quote-attachment-files.ts` 455~488줄)과 **한 바이트도 다르지 않다.**
 *
 * ⚠️ 앞 조각(3c-3b)이 `QuoteAttachmentsSection.tsx` 머리말에 「안 가져온 것은 이제
 * 하나다 — signedPdfForPreview」라고 적어 두었는데, **실측으로는 넷이었다**(조각 3f
 * 시작 때 확인, 2026-09-28). 그 곁말도 함께 고쳤다.
 *
 * 네 이름이 쓰이는 곳:
 *   · `QuotePrintSignedPdf`           — 미리보기가 보일 결재 PDF 의 모양
 *   · `excelOnlyPrintAttachments`     — 인쇄 화면(`quotes/[id]/print/page.tsx`, 서버)
 *   · `signedPdfForPreview`           — 편집 폼의 겹쳐 뜬 미리보기(`QuoteEditForm.tsx`)
 *   · `EXCEL_ONLY_NO_SIGNED_PDF_TEXT` — 결재 PDF 가 없을 때의 문장(`QuotePrintView.tsx`)
 * ============================================================================
 */

// ────────────────────────────────────────────────── 미리보기(엑셀 전용)

/** 미리보기가 보일 결재 PDF — 올라가 있는 것, 또는 새 견적서가 들고 있는 것. */
export type QuotePrintSignedPdf =
  | { kind: "saved"; id: string; originalFileName: string }
  | { kind: "pending"; fileName: string };

/** 인쇄 화면(서버)이 칸 조회에서 미리보기에 넘길 두 값을 고른다. */
export function excelOnlyPrintAttachments(slots: QuoteAttachmentSlots): {
  signedPdf: QuotePrintSignedPdf | null;
  hasExcel: boolean;
} {
  const pdf = slots.SIGNED_QUOTE_PDF;
  return {
    signedPdf: pdf ? { kind: "saved", id: pdf.id, originalFileName: pdf.originalFileName } : null,
    hasExcel: slots.QUOTE_EXCEL !== null,
  };
}

/** 편집 화면의 겹쳐 뜬 미리보기가 넘길 결재 PDF — 올라간 것이 먼저, 없으면 새 견적서가 든 것. */
export function signedPdfForPreview(params: {
  isNewQuote: boolean;
  slot: QuoteAttachmentSlotFileView | null;
  pendingFileName: string | null;
}): QuotePrintSignedPdf | null {
  if (params.slot) return { kind: "saved", id: params.slot.id, originalFileName: params.slot.originalFileName };
  if (params.isNewQuote && params.pendingFileName !== null) return { kind: "pending", fileName: params.pendingFileName };
  return null;
}

/** 엑셀 전용 미리보기에 결재 PDF 가 없을 때의 문장 — 사용자 결정(2026-09-15) 그대로. */
export const EXCEL_ONLY_NO_SIGNED_PDF_TEXT = "결재 PDF 가 아직 없습니다 — [견적서 받기]로 붙인 엑셀을 받으세요";
