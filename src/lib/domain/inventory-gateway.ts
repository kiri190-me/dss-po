/**
 * ============================================================================
 * 재고 관리에서 받아 온 것을 **어떻게 읽는가** — 순수 규칙 (DB 도 망도 여기서 만지지 않는다)
 * ============================================================================
 * 2026-10-17. 이 사이트(PO/내자)는 A/S 관리 시스템과 **같은 DB** 를 본다. 그래서 견적서의
 * 부품 고르개가 A/S 의 부품 표(`parts`)를 **곧바로 읽어** 왔다. 그런데 2026-10 에 부품
 * 마스터가 **재고 관리 시스템**으로 옮겨 갔고(2026-10-02 결정), 그 뒤로 새로 등록된 부품이
 * 이 사이트의 고르개에 **뜨지 않는다** — 옛 부품은 그대로 보이므로 고장으로 보이지 않는다.
 *
 * 그 통로를 여는 짝이 이 파일과 `src/lib/server/inventory-gateway.ts` 다. 실제로 망을 타는
 * 일은 저쪽이 하고, 여기에는 **받아 온 것을 어떻게 읽는가**만 둔다 — 그래야 아래 판정에 DB 도
 * 망도 없는 시험이 붙는다. A/S 가 2026-10-15~16 에 같은 가름으로 먼저 끝냈고, 이 파일은 그
 * 저장소의 같은 이름 파일에서 **읽는 쪽만** 옮겨 온 것이다.
 *
 * ── 🔴 「못 받아 왔다」와 「하나도 없다」는 다른 말이다 ─────────────────────
 * 이 파일이 존재하는 이유가 그 한 줄이다. 주소가 없든, 늦든, 401 이든, 본문을 못 읽든
 * 전부 **「못 받아 왔다」**(`unreachable`)다. 어느 하나라도 빈 목록으로 바꾸면 화면이
 * **「재고에 부품이 하나도 없다」**고 거짓말한다 — 사람은 고를 부품이 없어진 줄 알고 손으로
 * 적거나, 「이 건에 나간 부품이 없다」를 믿고 견적서에서 부품 줄을 통째로 뺀다. 그래서
 * 받아 온 결과를 성공/실패로 **구별해서** 들고 다닌다(`InventoryResult`).
 *
 * 반대쪽도 똑같이 지킨다: 통로가 200 으로 **빈 목록**을 돌려주는 것은 「그런 것이 없다」는
 * **사실**이고 응답을 못 읽은 것은 **모름**이다. 아래 `parse*` 들이 둘을 가른다 — 모양이
 * 아니면 `null`(부르는 쪽이 `unreachable` 로 바꾼다), 모양이면 빈 배열 그대로.
 *
 * ── 🔴 상태 글자는 저쪽이 준 것을 그대로 쓴다 ────────────────────────────
 * `status.label` 은 **재고 관리 화면에 뜨는 글자 그대로**다(저쪽 API.md 4-7절). 여기서
 * 코드값을 보고 한글을 다시 지어내지 않는다 — 두 화면이 다른 말을 하면 같은 신청이 다른
 * 일로 보이고, 저쪽이 말을 바꾸는 날 이쪽만 옛말을 한다. 「마감」은 상태값이 아니라
 * `closed` 칸이다.
 *
 * ── 🔴 이 사이트는 재고 관리에 **아무것도 쓰지 않는다** ──────────────────
 * A/S 에는 수리 건 상세의 「부품 요청」 칸이 있어 신청을 올리고 거두지만, 이 사이트에는 그
 * 화면이 없다. 그래서 A/S 의 같은 이름 파일에서 **올리는 줄의 모양 검사 · 거두기 판정 ·
 * 화면 모양 변환**은 옮기지 않았다. 여기 있는 것은 전부 **읽는 쪽**이다.
 *
 * ── 🔴 소유를 고르지 않는다 ──────────────────────────────────────────────
 * 재고 관리에서는 **소유가 다르면 부품 번호가 다르다**. 번호를 고르는 순간 소유가 정해지므로
 * 소유는 **보여 주기만** 하는 값이다(A/S 옛 표의 소유구분 고르개와 다른 점이다).
 * ============================================================================
 */

/* 부품 고르개가 받는 줄의 모양. 🔴 **형만 빌린다** — 이 파일은 순수하게 남는다(고르개 쪽
   `part-picker-rows.ts` 도 react 도 DB 도 물지 않는 형 선언뿐이다). 아래 toPartPickerRows
   가 그 모양으로 옮긴다. */
import type { PartPickerPriceRow, PartPickerRow } from "@dss/core/ui/inventory/part-picker-rows";
/* 🔴 **칸에 값이 들어 있는가를 재는 자(`-` 는 값이 아니다)는 한 벌이어야 한다.** 고르개도
   이 파일도 같은 칸을 보고 「있다/없다」를 말하는데 자가 둘이면, 한쪽은 고를 수 있다고 그리고
   다른 쪽은 비었다고 말한다. 그래서 형 곁에 있는 그 함수를 **빌려 쓴다** — 그 파일은 react 도
   DB 도 물지 않는 순수 모듈이라 이 파일이 순수하게 남는다. */
/* 🔴 **보이는 차례를 적는 자리도 한 곳이다.** 고객사 품명 · 품명 · 품명2 · 교산 품번 · 도번의
   차례와 이름표는 저 파일의 `PART_FIELD_ORDER` · `PART_FIELD_LABELS` 가 쥔다 — 여기서 다시
   적으면 언젠가 갈린다. 두 사이트가 같은 묶음을 쓰는 까닭이 그것이다. */
import { partFieldEntries, partFieldValue } from "@dss/core/ui/inventory/part-picker-rows";

/** 못 받아 온 까닭. 🔴 전부 **「없다」가 아니라 「모른다」**다. */
export type InventoryUnreachableReason =
  | "not_configured"
  | "timeout"
  | "unauthorized"
  | "api_closed"
  | "error";

/**
 * 받아 온 것. 🔴 성공과 실패를 **구별해서** 들고 다닌다(머리말).
 *
 * 🔵 `{ status: "ok"; value: [] }` 와 `{ status: "unreachable" }` 는 **다른 값**이다. 화면은
 *    앞은 「없습니다」로, 뒤는 「불러오지 못했습니다」로 그린다.
 */
export type InventoryResult<T> =
  | { status: "ok"; value: T }
  | { status: "unreachable"; reason: InventoryUnreachableReason };

/**
 * 못 받아 온 까닭을 사람 말로. 🔴 다섯 다 **「재고에 없습니다」라고 말하지 않는다** —
 * 모르는 것을 없는 것처럼 적으면 사람이 멀쩡한 재고를 두고 다른 길을 찾는다.
 *
 * 🔴 **글자를 A/S 와 한 글자도 다르게 적지 않는다.** 같은 두 시스템이 서로를 못 부를 때의
 * 말이라, 양쪽 화면이 다른 말을 하면 같은 사고가 다른 일로 보인다.
 */
export const INVENTORY_UNREACHABLE_MESSAGES: Record<InventoryUnreachableReason, string> = {
  not_configured: "재고 관리 통로가 아직 연결되지 않았습니다(주소나 토큰이 설정되지 않았습니다).",
  timeout: "재고 관리가 응답하지 않습니다.",
  unauthorized: "재고 관리가 토큰을 받지 않았습니다. 양쪽 토큰 값을 맞춰야 합니다.",
  api_closed: "재고 관리 쪽에서 통로가 닫혀 있습니다(저쪽 토큰이 설정되지 않았습니다).",
  error: "재고 관리에서 불러오지 못했습니다.",
};

export function inventoryUnreachableMessage(reason: InventoryUnreachableReason): string {
  return INVENTORY_UNREACHABLE_MESSAGES[reason];
}

// ---------------------------------------------------------------------------
// 유상 · 무상
// ---------------------------------------------------------------------------

/**
 * 반출 신청 한 줄이 유상인가 무상인가. 🔴 **기본값이 없다** — 저쪽 통로도 빠지거나 모르는
 * 값이면 400 으로 거절한다(저쪽 API.md 4-2절). 청구에 걸리는 값이라 한쪽으로 채워 주지 않는다.
 *
 * 🔵 이 사이트는 신청을 **올리지 않고 읽기만** 한다. 그래도 코드와 글자를 들고 있는 까닭은
 *    받아 온 신청 줄을 사람에게 보일 때 같은 말(유상 · 무상)을 써야 하기 때문이다.
 */
export const CHARGE_TYPES = ["PAID", "FREE"] as const;
export type ChargeType = (typeof CHARGE_TYPES)[number];

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  PAID: "유상",
  FREE: "무상",
};

export function isChargeType(value: unknown): value is ChargeType {
  return value === "PAID" || value === "FREE";
}

// ---------------------------------------------------------------------------
// 부품 목록 (`GET /api/v1/parts`)
// ---------------------------------------------------------------------------

/**
 * 재고 관리의 부품 한 줄. 🔴 **바깥에서 부품을 가리키는 값은 `no`** 다(UUID 가 아니다).
 *
 * 🔵 `owner` 와 `note` 를 함께 들고 다니는 까닭: 같은 품명·도번·소유인 부품이 여러 묶음 있고
 *    (저쪽 API.md 2절), 품명만 보이면 똑같은 줄이 둘 뜬다. 구분 글자는 **비고**에 있다.
 *    🔴 그 둘은 **고르개로 넘어가지 않는다** — 떼어 내는 자리는 아래 `toPartPickerRow` 다.
 */
export type InventoryPart = {
  no: number;
  name: string;
  name2: string;
  customerName: string;
  kyosanPartNo: string;
  drawingNo: string;
  quantity: number;
  note: string;
  /** 🔴 **보여 주기만 한다.** 번호를 고르는 순간 정해지는 값이지 고르는 값이 아니다(머리말). */
  owner: { code: string; label: string };
  /**
   * 견적가(언제나 원). 🔴 **`null` 은 「아직 정하지 않았다」이고 `0`(무상)과 다르다** —
   * 저쪽 API.md 2절이 그 둘을 갈라 적어 두었다. `?? 0` 으로 뭉개면 정하지 않은 부품이
   * 0원으로 청구되고, 받은 사람은 무상으로 약속받은 것으로 읽는다.
   */
  quotePrice: number | null;
  /** O/H 견적가(원). 같은 규칙이고, 🔴 없을 때 **견적가로 때우지 않는다**(아래 고르개 쪽). */
  overhaulQuotePrice: number | null;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function codeLabel(value: unknown): { code: string; label: string } {
  if (!value || typeof value !== "object") return { code: "", label: "" };
  const o = value as { code?: unknown; label?: unknown; name?: unknown };
  return { code: str(o.code), label: str(o.label) || str(o.name) };
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

/**
 * 금액 한 칸. 🔴 **`0` 과 「없음」을 가른다** — 숫자면 그대로(0 도 값이다), 숫자가 아니면
 * (빠졌거나 `null` 이거나 글자면) 「정하지 않았다」다. `|| null` 꼴을 쓰면 무상으로 정해 둔
 * `0` 이 「안 정함」으로 뒤집힌다(저쪽 API.md 2절이 둘 다 못 박았다).
 */
function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 통로 응답(JSON) → 부품 목록. **모양이 아니면 `null`** 이다(머리말).
 *
 * 번호나 품명이 빈 줄은 **버린다** — 고르개에 올려 봐야 가리킬 수 없다.
 * 🔵 칸 이름이 바뀌면 이 함수 하나만 고친다.
 */
export function parseInventoryPartsResponse(json: unknown): InventoryPart[] | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const raw = (json as { parts?: unknown }).parts;
  if (!Array.isArray(raw)) return null;

  const parts: InventoryPart[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const no = positiveInt(o.no);
    const name = str(o.name);
    if (no === null || name === "") continue;
    parts.push({
      no,
      name,
      name2: str(o.name2),
      customerName: str(o.customerName),
      kyosanPartNo: str(o.kyosanPartNo),
      drawingNo: str(o.drawingNo),
      quantity: typeof o.quantity === "number" && Number.isFinite(o.quantity) ? o.quantity : 0,
      note: typeof o.note === "string" ? o.note : "",
      owner: codeLabel(o.owner),
      // 🔴 `?? 0` 도 `|| null` 도 쓰지 않는다 — 가르는 일은 money 한 곳에서 한다.
      quotePrice: money(o.quotePrice),
      overhaulQuotePrice: money(o.overhaulQuotePrice),
    });
  }
  return parts;
}

/** 비고의 **첫 줄**. 같은 품명이 여럿일 때 사람이 가르는 단서다(저쪽 API.md 2절). */
export function inventoryPartNoteFirstLine(part: Pick<InventoryPart, "note">): string {
  return part.note.split(/\r?\n/, 1)[0]?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// 부품 한 줄에 **그 부품의 모든 것**을 보인다
// ---------------------------------------------------------------------------

/**
 * ============================================================================
 * 「값이 있는 것만」 — 🔴 `-` 는 값이 아니다
 * ============================================================================
 * 그 부품을 가리키는 이름이 다섯이다(고객사 품명 · 품명 · 품명2 · 교산 품번 · 도번). 그대로
 * 다 적으면 줄이 길어져 **아무것도 안 읽히는** 쪽으로 망가진다. 그래서 거는 조건이 둘이다 —
 *
 *  ㉠ 🔴 **빈 칸은 그리지 않는다.** 「교산 품번 없음 · 도번 없음」이 줄줄이 적히면 정작 있는
 *     값이 묻힌다. 이 자료는 엑셀에서 넘어와 **빈칸 대신 `-` 가 적힌 줄이 많아서**, 다듬은
 *     글자가 비었는가만 봐서는 모자라다 — `-` 만 적힌 칸도 **없는 칸**으로 센다
 *     (`@dss/core` 의 `partFieldValue`. 재고 관리도 같은 자를 쓴다 — 저쪽 `DASH_ONLY`).
 *  ㉡ **이름표를 단다.** `KY-7788 · DWG-1001` 처럼 값만 이으면 어느 것이 교산 품번이고 어느
 *     것이 도번인지 모른다. 사람이 그 둘을 서로 다른 데 쓰므로 한 글자씩 붙여 둔다.
 *
 * 🔵 **그리는 모양은 화면이 정한다.** 여기서는 「무엇을 · 어떤 이름표로 · 어떤 차례로」까지만
 *    정하고, 줄을 어떻게 나눌지는 부르는 화면이 정한다 — 그 덕에 이 규칙에 React 가 없는
 *    시험이 붙는다.
 * ============================================================================
 */
export type InventoryPartLabel = { label: string; value: string };

/**
 * 그 부품의 **고객사 품명**. 없으면 빈 글자다 — 🔴 `-` 만 적힌 칸도 없는 것으로 센다(위 ㉠).
 *
 * 🔴 **우리 품명으로 때우지 않는다.** 이 값이 비었는지가 견적서에서 **고객사 이름으로** 고를
 *    수 있는지를 가른다(고르개의 `canPickPartOption`). 때우면 빈 이름이 서류에 찍힌다.
 */
export function inventoryPartCustomerName(part: Pick<InventoryPart, "customerName">): string {
  return partFieldValue(part.customerName);
}

/**
 * 품명 곁에 적는 **나머지 이름들** — 교산 품번 · 도번. 값이 있는 것만 차례대로.
 *
 * 🔵 품명과 품명2 가 빠져 있는 까닭: 그 둘은 줄의 **머리**라 화면이 맨 앞에 따로 그린다
 *    (`품명 · 품명2`). 고객사 품명도 빠져 있다 — 견적서에서 고를 이름이 될 수 있는 값이라
 *    화면이 제 줄에 따로 그린다(위 `inventoryPartCustomerName`).
 */
export function inventoryPartIdLabels(
  part: Pick<InventoryPart, "kyosanPartNo" | "drawingNo">
): InventoryPartLabel[] {
  /* 🔴 **차례도 이름표도 여기서 짓지 않는다** — `PART_FIELD_ORDER` 가 정한 그대로다.
     🔵 넘기지 않은 칸은 빈 값이라 저쪽이 알아서 뺀다 — 여기서 거를 것이 없다. */
  return partFieldEntries({
    kyosanPartNo: part.kyosanPartNo,
    drawingNo: part.drawingNo,
  }).map((entry) => ({ label: entry.label, value: entry.value }));
}

/** 품명2(규격). 🔴 여기도 `-` 는 없는 것이다 — 품명 뒤에 ` · -` 가 붙으면 읽는 눈을 뺏는다. */
export function inventoryPartSpec(part: Pick<InventoryPart, "name2">): string {
  return partFieldValue(part.name2);
}

/**
 * ============================================================================
 * 🔴 재고 수는 **「지금 이 순간」이 아니다**
 * ============================================================================
 * 이 수는 화면을 **열 때** 재고 관리에서 한 번 받아 온 값이다. 그 뒤로 다른 사람이 같은
 * 부품을 가져갔을 수 있고, 이 화면은 그것을 모른다(`router.refresh()` 가 돌기 전까지).
 *
 * 🔴 **숫자만 적으면 「지금 3개 있다」로 읽힌다.** 그 수를 믿고 수량을 정했다가 막상 나갈 때
 *    모자라면, 사람은 재고 관리가 틀렸다고 생각한다 — 틀린 것은 **이 화면이 그 수를 언제 잰
 *    것인지 말하지 않은 것**이다. 그래서 숫자 **바로 옆**에 적는다(칸 위 안내문에 한 번 적어
 *    두면 줄을 훑는 눈에는 안 닿는다).
 * 🔵 「현재 재고」라고 적지 않는 까닭도 같다 — 그것은 더 틀린 말이다.
 * ============================================================================
 */
export const INVENTORY_STOCK_AS_OF_NOTE = "불러온 때 기준";

/** 줄에 적는 재고 글자. 🔴 **언제 잰 값인지가 숫자에 붙어 있다**(위 머리말). */
export function inventoryStockText(part: Pick<InventoryPart, "quantity">): string {
  return `재고 ${part.quantity}개(${INVENTORY_STOCK_AS_OF_NOTE})`;
}

/**
 * 고객사 품명이 **비어 있을 때** 그 자리에 적는 말. 🔴 「없음」으로 끝내지 않고 **그래서
 * 무엇이 막히는지**까지 적는다 — 견적서에서 이 부품을 고객사 이름으로 고를 수 없는 까닭이
 * 바로 이 칸이다. 까닭 없이 「없음」만 적으면 담당자를 찾아다니게 된다.
 *
 * 🔵 **채워 넣는 길은 이 사이트에 없다.** 그 단추는 A/S 수리 건 상세에 있고, 이 사이트는
 *    재고 관리에 아무것도 쓰지 않는다(머리말).
 */
export const CUSTOMER_NAME_EMPTY_NOTICE = "고객사 품명 없음 — 견적서에서 이 부품을 고를 수 없습니다";

/**
 * 화면에서 거르기. 🔴 **저쪽 `q` 와 같은 규칙으로 잰다** — 품명 · 품명2 · 고객사 품명 ·
 * 교산 품번 · 도번에 낱말이 **모두** 들어 있는 줄(띄어쓰기로 여러 낱말, 저쪽 API.md 2절).
 *
 * 🔵 같은 규칙으로 적어 둔 까닭: 언젠가 `q` 를 서버에 넘기는 쪽으로 갈아타도 **나오는 줄이
 *    달라지지 않는다.** 규칙이 다르면 「재고 조회에서 되던 글자가 여기서는 안 된다」가 된다.
 *
 * 빈 글자는 **빈 목록**이다 — 수백 개를 통째로 펼쳐 놓지 않는다.
 */
export function filterInventoryParts(parts: readonly InventoryPart[], term: string): InventoryPart[] {
  const words = term.trim().toLowerCase().split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return [];
  return parts.filter((part) => {
    const haystack = [part.name, part.name2, part.customerName, part.kyosanPartNo, part.drawingNo]
      .join(" ")
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

// ---------------------------------------------------------------------------
// 부품 고르개로 넘기는 줄 — 견적서의 「부품 비용」
// ---------------------------------------------------------------------------

/**
 * ============================================================================
 * 재고 관리의 부품 → 부품 고르개가 받는 줄
 * ============================================================================
 * 고르개(`@dss/core/ui/inventory/part-picker.tsx`)는 **줄을 받아 그리기만** 한다. 그 줄을
 * 어디서 읽어 오는가가 이 조각이 바꾸려는 것이다 — 같은 DB 의 A/S 부품 표(`parts`)에서
 * **재고 관리 통로**로. 부품 마스터를 재고 관리 하나로 모으기로 한 2026-10-02 결정이고,
 * 그 표는 더 이상 새 부품을 받지 않는다(머리말의 그 결함).
 *
 * ── 🔴 **여기가 경계다** — 재고 · 소유 · 비고는 이 줄에 담지 않는다 ────────
 * `InventoryPart` 에는 수량 · 소유 · 비고가 들어 있다. 그 셋은 재고 담당의 정보라 견적서
 * 화면으로 **내보내지 않는다** — 화면에서 안 그리는 것으로는 모자라다. props 는 브라우저로
 * 그대로 나가므로, **여기서 떼어 내야** 안 나간다(고르개 머리말이 처음부터 못 박아 둔 그
 * 경계이고, 이 사이트가 지금 쓰는 조회 `db/queries/inventory.ts` 도 같은 까닭으로 재고를
 * 읽을 길 자체를 만들지 않았다).
 *
 * ── 🔴 `id` 는 **재고 관리의 부품 번호(No.)** 다 ─────────────────────────
 * 바깥에서 부품을 가리키는 값이 그것이다(저쪽 API.md 2절 — UUID 는 내주지 않는다). 글자로
 * 담는 까닭은 고르개의 열쇠가 글자이기 때문이고, 단가 줄의 열쇠(`partId`)도 같은 값이다.
 * 🔴 **이 값은 같은 DB 의 `parts.id` 가 아니다.** 그래서 폼이 이것을 `part_id`(FK)에 넣지
 *    않는다 — 넣으면 저장이 거절된다(validation 이 UUID 를 본다). 넣을 자리는 따로 있다
 *    (`quote_items.inventory_part_no`).
 * ============================================================================
 */
export function toPartPickerRows(parts: readonly InventoryPart[]): PartPickerRow[] {
  return parts.map(toPartPickerRow);
}

/**
 * 부품 **하나**를 옮긴다. 🔴 **경계를 긋는 자리는 여기 하나다** — 위 머리말의 셋(재고 ·
 * 소유 · 비고)을 떼어 내는 일이 이 함수에서만 일어나야, 줄을 하나씩 옮기는 쪽이 제 손으로
 * 칸을 적다가 **실수로 하나를 더 실어 보내는** 일이 생기지 않는다.
 */
export function toPartPickerRow(part: InventoryPart): PartPickerRow {
  return {
    id: String(part.no),
    partName: part.name,
    partSpec: part.name2,
    /** 🔴 고르개가 거르는 칸이자, 고객사에 나가는 서류에 쓰는 이름(저쪽 API.md 2절). */
    customerPartName: part.customerName,
    drawingNo: part.drawingNo,
    kyosanPartNo: part.kyosanPartNo,
  };
}

/**
 * 받아 온 결과를 **갈래째** 옮긴다. 🔴 **못 받아 온 것을 빈 목록으로 바꾸지 않는다** —
 * 바꾸면 화면이 「고를 부품이 하나도 없다」고 거짓말하고, 사람은 그 말을 믿고 손으로 적는
 * 대신 「부품이 없어졌다」고 생각한다(이 파일 머리말의 그 규칙 그대로다).
 */
export function toPartPickerOptions(
  result: InventoryResult<InventoryPart[]>
): InventoryResult<PartPickerRow[]> {
  return result.status === "ok" ? { status: "ok", value: toPartPickerRows(result.value) } : result;
}

/**
 * 단가 줄 — 고르면 **단가 칸까지 채우는** 데 쓴다.
 *
 * 🔴 **`null` 은 「정하지 않았다」라서 그대로 `null` 로 옮긴다.** 0 으로 채우면 그 부품이
 *    0원으로 청구되고, 빈칸과 달리 아무도 눈치채지 못한다. `0`(무상)은 `"0"` 으로 남는다.
 * 🔴 **둘 다 없는 부품은 아예 빼고 보낸다** — 고르개는 「줄이 없다 = 정하지 않았다」로 읽고
 *    단가 칸을 비워 둔다(고르개의 `partPickUnitPrice`). 수백 줄 중 단가가 있는 것만 실린다.
 * 🔵 숫자를 글자로 옮기는 까닭은 고르개가 DB 의 numeric(글자로 읽힌다)과 **같은 길**로
 *    다루기 때문이다 — `toPriceFieldValue` 가 소수점을 지워 칸에 넣는다.
 *
 * 🔴 **이 목록은 단가 칸이 있는 화면에만 넘긴다.** 금액을 다루지 않는 칸은 받지 않는다 —
 *    안 주면 고르개가 단가를 채우지 않는다(그 규약이 선택인 까닭).
 */
export function toPartPickerPriceRows(parts: readonly InventoryPart[]): PartPickerPriceRow[] {
  const rows: PartPickerPriceRow[] = [];
  for (const part of parts) {
    if (part.quotePrice === null && part.overhaulQuotePrice === null) continue;
    rows.push({
      partId: String(part.no),
      unitPrice: part.quotePrice === null ? null : String(part.quotePrice),
      overhaulUnitPrice: part.overhaulQuotePrice === null ? null : String(part.overhaulQuotePrice),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// O/H 부품 템플릿 (`GET /api/v1/oh-templates`)
// ---------------------------------------------------------------------------

export type InventoryOhTemplateItem = {
  displayOrder: number;
  /** 재고 마스터의 부품 번호. **`null` 이 정상이다** — 아래 `linked` */
  no: number | null;
  /** 템플릿에 적혀 있는 이름 그대로. 언제나 있다 — 안 이어진 줄에서 사람에게 보여 줄 이름이다. */
  name: string;
  /** 이어진 재고 부품의 **지금 품명**. 안 이어진 줄이면 `null`. 위 `name` 과 다를 수 있다. */
  partName: string | null;
  quantity: number;
  /**
   * 🔴 **재고 마스터에 이어져 있는가.** 거짓인 줄은 **담기지 않고 그 사실을 사람에게 알린다** —
   * 담은 줄만 보고 「다 담겼다」고 믿으면 정작 필요한 부품을 빠뜨린 채 견적서가 나간다
   * (저쪽 API.md 6-4절).
   */
  linked: boolean;
};

export type InventoryOhTemplate = {
  id: string;
  name: string;
  note: string;
  items: InventoryOhTemplateItem[];
};

/**
 * 통로 응답(JSON) → 템플릿. 모양이 아니면 `null`.
 *
 * 🔴 **「템플릿이 없다」(`template: null`)는 오류가 아니다**(저쪽 API.md 6-3절). 그래서
 *    돌려주는 값을 한 겹 싸서 「못 읽었다(`null`)」와 「이어 둔 템플릿이 없다
 *    (`{ template: null }`)」를 가른다.
 * 🔴 `linked` 는 번호가 있을 때만 참으로 본다. 저쪽은 둘이 언제나 같다고 적어 두었지만
 *    (6-4절), 그 약속이 깨지는 날 번호 `null` 인 줄을 이어진 것처럼 다루게 된다.
 */
export function parseInventoryOhTemplateResponse(
  json: unknown
): { template: InventoryOhTemplate | null } | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const raw = (json as { template?: unknown }).template;
  if (raw === null || raw === undefined) return { template: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return null;

  const o = raw as Record<string, unknown>;
  const rawItems = o.items;
  if (!Array.isArray(rawItems)) return null;

  const items: InventoryOhTemplateItem[] = [];
  for (const entry of rawItems) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const name = str(e.name);
    if (name === "") continue;
    const no = positiveInt(e.no);
    const quantity = positiveInt(e.quantity) ?? 1;
    items.push({
      displayOrder: typeof e.displayOrder === "number" ? e.displayOrder : items.length + 1,
      no,
      name,
      partName: str(e.partName) === "" ? null : str(e.partName),
      quantity,
      linked: e.linked === true && no !== null,
    });
  }

  return {
    template: {
      id: str(o.id),
      name: str(o.name),
      note: typeof o.note === "string" ? o.note : "",
      items,
    },
  };
}

// ---------------------------------------------------------------------------
// 그 수리 건에 나간 부품 (`GET /api/v1/stock-requests?intake=…`)
// ---------------------------------------------------------------------------

/**
 * 인수번호 모양: `D` + 숫자 6자리 (예 `D260701`).
 *
 * 🔴 **세 시스템이 같은 자로 잰다.** 2026-10-17 에 셋을 맞대어 보니 글자 그대로 같았다 —
 *   · A/S 관리 시스템  `src/lib/api/intake-lookup.ts` 의 `EXTERNAL_INTAKE_NUMBER_RE`
 *   · 재고 관리 시스템 `src/lib/stock/codes.ts` 의 `INTAKE_NUMBER_RE`
 *   · 그리고 이 상수.
 *   자가 갈리면 **한쪽이 400 이라 부르지도 못하는 번호를 다른 쪽은 받아들인다.** 그 어긋남은
 *   오류로 안 보이고 「저기서는 되던 번호가 여기서는 안 된다」로만 드러난다.
 *
 * ⚠️ **DB 의 CHECK 는 이보다 좁다 — 그런데 여기서 좁히지 않는다.**
 *    `@dss/core/schema/repair-cases.ts` 의 `repair_cases_intake_number_format` 은
 *    `^D[0-9]{2}(0[1-9]|1[0-2])[0-9]{2}$` 다(가운데 두 자리가 달이라 01~12).
 *    🔴 **일부러 넓게 둔 것이다** — 이 자가 맞추는 상대는 우리 DB 가 아니라 **저쪽 통로**이고,
 *    저쪽이 받는 모양이 `D` + 숫자 6자리다. 좁은 쪽에 걸리는 번호(예 `D269901`)는 그런 수리
 *    건이 애초에 없으므로 저쪽에서 **빈 목록으로 돌아온다** — 막아 주는 값이 없다.
 *    🔴 여기를 DB CHECK 로 좁히면 세 시스템의 자가 다시 갈린다. 「DB 랑 다르네」로 보고
 *    좁히지 말 것.
 */
export const INTAKE_NUMBER_RE = /^D\d{6}$/;

export type InventoryStockRequestLine = {
  /** 그 사이 재고 쪽에서 지워진 부품이면 `null` 이고 이름이 「(지워진 부품)」이다. */
  no: number | null;
  name: string;
  quantity: number;
  issued: number;
};

export type InventoryStockRequest = {
  /**
   * 🔴 **`null` 이면 재고 관리에서 직접 올린 신청이다**(A/S 쪽 요청 번호가 애초에 없다).
   * 그것도 그 수리 건에 나간 부품이라 **함께 보여 주되 그 사실이 보이게** 한다 —
   * 가려 내면 「이 건에 나간 부품」을 반만 보여 주게 된다(저쪽 API.md 4-7절).
   */
  requestKey: string | null;
  id: string;
  intakeNumber: string;
  /** 🔴 `label` 은 **저쪽 화면에 뜨는 글자 그대로** 쓴다(머리말). */
  status: { code: string; label: string };
  /** 마감 — 「준 것은 그대로 두고 남은 것만 접은」 것. 상태값이 아니라 이 칸으로 가른다. */
  closed: boolean;
  requestedAt: string;
  lines: InventoryStockRequestLine[];
  decision: { byName: string; at: string; note: string } | null;
  hold: { reason: string; byName: string; at: string } | null;
  /**
   * 올린 사람. 🔴 **가리는 값은 포털 번호(`sub`)뿐이다** — 이름은 겹친다(같은 이름이 둘이면
   * 남의 신청을 제 것으로 본다). 그래서 `sub` 이 없으면 통째로 `null` 이고, 그런 줄은
   * 「누가 올렸는지 모른다」로 다룬다.
   *
   * 🔴 **이 값은 서버에서만 본다.** 신원을 증명하는 값이라 화면 props 에 실으면 브라우저로
   *    그대로 나간다 — 화면으로 내려보낼 때는 떼어 내고 이름만 남긴다.
   */
  requester: { sub: string; name: string } | null;
};

function parseDecision(value: unknown): { byName: string; at: string; note: string } | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const at = str(o.at);
  if (at === "") return null;
  return { byName: str(o.byName), at, note: typeof o.note === "string" ? o.note : "" };
}

/**
 * 올린 사람. 🔴 **포털 번호가 없으면 통째로 `null`** 이다 — 이름만으로 사람을 가르지 않는다.
 * 같은 이름이 둘이면 남의 신청을 제 것으로 보게 되고, 그 오판 위에 무엇을 그리든 틀린다.
 */
function parseRequester(value: unknown): { sub: string; name: string } | null {
  if (!value || typeof value !== "object") return null;
  const o = value as { sub?: unknown; name?: unknown };
  const sub = str(o.sub);
  if (sub === "") return null;
  return { sub, name: str(o.name) };
}

function parseHold(value: unknown): { reason: string; byName: string; at: string } | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const at = str(o.at);
  if (at === "") return null;
  return { reason: typeof o.reason === "string" ? o.reason : "", byName: str(o.byName), at };
}

/**
 * 통로 응답(JSON) → 신청 목록. 모양이 아니면 `null`(머리말).
 *
 * 🔵 **차례를 다시 매기지 않는다.** 저쪽이 「신청한 시각이 늦은 것이 위」로 준다(저쪽
 *    API.md 4-7절). 여기서 또 정렬하면 저쪽이 차례를 고치는 날 두 규칙이 싸운다.
 * 🔵 `notFound` 는 읽지 않는다 — 인수번호로 물을 때는 **언제나 빈 목록**이고, 그 칸은 열쇠로
 *    물을 때만 뜻이 있다(저쪽 API.md 4-7절). 이 사이트는 열쇠를 저장하지 않으므로 열쇠로
 *    묻지 않는다.
 */
export function parseInventoryStockRequestsResponse(json: unknown): InventoryStockRequest[] | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const raw = (json as { requests?: unknown }).requests;
  if (!Array.isArray(raw)) return null;

  const requests: InventoryStockRequest[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = str(o.id);
    if (id === "") continue;

    const rawLines = Array.isArray(o.lines) ? o.lines : [];
    const lines: InventoryStockRequestLine[] = [];
    for (const entry of rawLines) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      lines.push({
        no: positiveInt(e.no),
        name: str(e.name),
        quantity: typeof e.quantity === "number" ? e.quantity : 0,
        issued: typeof e.issued === "number" ? e.issued : 0,
      });
    }

    const requestKey = str(o.requestKey);
    requests.push({
      requestKey: requestKey === "" ? null : requestKey,
      id,
      intakeNumber: str(o.intakeNumber),
      status: codeLabel(o.status),
      closed: o.closed === true,
      requestedAt: str(o.requestedAt),
      lines,
      decision: parseDecision(o.decision),
      hold: parseHold(o.hold),
      requester: parseRequester(o.requester),
    });
  }
  return requests;
}
