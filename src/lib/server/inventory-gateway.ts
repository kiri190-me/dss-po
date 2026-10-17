import "server-only";
import {
  INTAKE_NUMBER_RE,
  parseInventoryOhTemplateResponse,
  parseInventoryPartsResponse,
  parseInventoryStockRequestsResponse,
  type InventoryOhTemplate,
  type InventoryPart,
  type InventoryResult,
  type InventoryStockRequest,
  type InventoryUnreachableReason,
} from "@/lib/domain/inventory-gateway";

/**
 * ============================================================================
 * 재고 관리를 부르는 자리 — `{INVENTORY_API_BASE_URL}/api/v1/…`
 * ============================================================================
 * 2026-10-17. 이 사이트(PO/내자)가 재고 관리를 두드리는 통로 전부가 여기 모인다.
 * **시간 제한을 걸고, 실패를 삼켜 뜻 있는 결과로 바꾸고, 응답 모양을 맞추는 자리를 한 곳으로
 * 모은다.** 받아 온 것을 어떻게 읽는가는 전부 `src/lib/domain/inventory-gateway.ts`(순수)에
 * 있고, 여기는 망과 설정만 다룬다. A/S 관리 시스템의 같은 이름 파일에서 **읽는 쪽만** 옮겨
 * 왔다(저쪽은 올리기·거두기·고객사 품명 채우기까지 갖고 있다).
 *
 * ── 🔴 실패는 전부 unreachable 이다 — 빈 목록으로 바꾸지 않는다 ───────────
 * 주소가 없든, 늦든, 401 이든, 본문을 못 읽든 전부 「못 받아 왔다」다. 어느 하나라도
 * `{ status: "ok", value: [] }` 로 바꾸면 화면이 **「재고에 부품이 하나도 없다」**고
 * 거짓말하고, 사람은 그 말을 믿고 고를 수 있는 부품을 손으로 적거나 「부품이 없어졌다」고
 * 생각한다. 그 갈림의 까닭은 순수 쪽 머리말에 있다.
 *
 * ── 🔴 **읽기뿐이다. 재고 관리에 아무것도 쓰지 않는다** ──────────────────
 * 이 사이트에는 부품 요청(반출 신청) 화면이 없다 — 그 화면은 A/S 수리 건 상세에 있다.
 * 그래서 쓰는 통로를 **하나도 옮기지 않았고**, 토큰을 고르는 자리도 두지 않았다. 저쪽
 * A/S 가 `tokenFor` 로 읽기·쓰기 토큰을 가르는 까닭(같은 주소라도 하는 일이 다르면 토큰이
 * 다르다, 저쪽 API.md 1절)은 여기에 해당하지 않는다 — 🔴 **읽는 토큰 `INVENTORY_API_TOKEN`
 * 하나만 읽는다.** `INVENTORY_WRITE_TOKEN` 은 이 사이트가 알 필요가 없는 값이고, 알면
 * 언젠가 쓰게 된다.
 *
 * ── 🔴 DB 에는 아무것도 적지 않는다 ─────────────────────────────────────
 * 이 모듈은 같은 DB(dss_as)를 한 줄도 건드리지 않는다. 재고에 관한 것을 제 표에 저장하지
 * 않으므로, 되읽을 때 아는 값은 언제나 **인수번호**뿐이다.
 * ============================================================================
 */

/**
 * 🔴 **환경변수를 읽는 자리는 이 파일뿐이다.** 부를 때마다 읽으므로 시험이 `process.env` 를
 * 갈아 끼울 수 있다 — 중앙 `env` 객체에 담아 두면 처음 한 번 읽고 굳는다.
 */
function baseUrl(): string {
  return (process.env.INVENTORY_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
}

/** 🔴 읽는 토큰 하나뿐이다(머리말). 쓰는 토큰은 이 사이트가 갖지 않는다. */
function readToken(): string {
  return (process.env.INVENTORY_API_TOKEN ?? "").trim();
}

/**
 * 🔵 **사람을 재고 관리 시스템으로 보낼 주소.** 설정이 비어 있으면 `null` 이다.
 *
 * 통로 주소와 **같은 값**을 쓴다 — 저쪽은 한 앱이고 통로가 그 아래 `/api/v1/…` 에
 * 붙어 있어서(저쪽 API.md) 뿌리가 곧 사람이 여는 화면이다. 주소를 하나 더 두지 않은 까닭은
 * 두 벌이면 언젠가 한쪽만 바뀌기 때문이고, 그때 **화면의 링크만 조용히 엉뚱한 곳**을
 * 가리킨다(통로는 멀쩡해 아무도 못 알아챈다).
 *
 * 🔴 **설정이 없으면 링크를 만들지 않는다.** 없는 주소로 보내면 사람은 「재고 관리가
 *    고장났다」로 읽는다 — 부르는 쪽이 `null` 을 보고 글만 그리는 편이 사실에 가깝다.
 * 🔴 운영에서 이 값이 **컨테이너 안에서만 닿는 주소**로 잡히면 브라우저에서는 열리지
 *    않는다. 그때 고칠 자리는 이 함수가 아니라 환경변수다.
 */
export function inventorySiteUrl(): string | null {
  const base = baseUrl();
  return base === "" ? null : base;
}

/** 읽기는 화면을 여는 길목이라 짧게 끊는다. */
const READ_TIMEOUT_MS = 5000;

type InventoryCall =
  | { ok: true; json: unknown }
  /** 못 받아 왔다 — 화면은 「없다」가 아니라 「모른다」로 그린다. */
  | { ok: false; kind: "unreachable"; reason: InventoryUnreachableReason }
  /** 보낸 값이 틀렸다(400). 저쪽이 적어 준 까닭이 그대로 들어 있다. */
  | { ok: false; kind: "rejected"; message: string };

function errorMessageFrom(json: unknown): string {
  if (json && typeof json === "object") {
    const message = (json as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") return message.trim();
  }
  return "";
}

/**
 * 통로 하나를 두드린다. **부르는 통로 전부가 이 함수를 지난다.**
 *
 * 🔴 토큰이 없으면 **부르지 않는다**(`not_configured`). 토큰 없이 두드려 401 을 받는 것과
 *    설정이 빠진 것은 고치는 길이 다르다 — 앞은 값을 맞추는 일이고, 뒤는 값을 넣는 일이다.
 * 🔵 **GET 뿐이다.** 메서드도 본문도 받지 않는다 — 이 사이트는 재고 관리에 아무것도 쓰지
 *    않으므로, 쓸 수 있는 자리를 아예 만들지 않는다(머리말).
 */
async function callInventory(
  path: string,
  options: { timeoutMs?: number } = {}
): Promise<InventoryCall> {
  const base = baseUrl();
  const token = readToken();
  if (base === "" || token === "") return { ok: false, kind: "unreachable", reason: "not_configured" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeoutMs ?? READ_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
      cache: "no-store",
    });

    if (res.status === 401) {
      console.error("[inventory] 토큰이 맞지 않습니다", { path });
      return { ok: false, kind: "unreachable", reason: "unauthorized" };
    }
    if (res.status === 503) {
      console.error("[inventory] 저쪽 통로가 닫혀 있습니다", { path });
      return { ok: false, kind: "unreachable", reason: "api_closed" };
    }
    if (res.status === 400) {
      const message = errorMessageFrom(await res.json().catch(() => null));
      console.error("[inventory] 보낸 값을 거절했습니다", { path, message });
      return { ok: false, kind: "rejected", message: message || "재고 관리가 요청을 받지 않았습니다." };
    }
    /**
     * 🔴 **그 밖의 4xx 도 까닭이 적혀 있으면 그 글자를 살린다.** 저쪽이 거절을 갈라 각각
     * 다른 말로 돌려주는 자리가 있고, 그 셋이 400 으로만 온다는 보장이 없다(404·403·409 가
     * 자연스럽다). 여기서 뭉개면 사람은 모든 경우에 똑같이 「불러오지 못했습니다」만 본다.
     * 🔵 까닭이 없는 4xx(통로가 아직 안 열려 404 HTML 이 오는 경우가 그렇다)는 거절이 아니라
     *    **「못 받아 왔다」**로 접는다 — 고치는 길이 값을 맞추는 일이 아니라 통로를 여는 일이다.
     */
    if (res.status > 400 && res.status < 500) {
      const message = errorMessageFrom(await res.json().catch(() => null));
      console.error("[inventory] 응답", res.status, { path, message });
      if (message !== "") return { ok: false, kind: "rejected", message };
      return { ok: false, kind: "unreachable", reason: "error" };
    }
    if (!res.ok) {
      console.error("[inventory] 응답", res.status, { path });
      return { ok: false, kind: "unreachable", reason: "error" };
    }

    return { ok: true, json: await res.json() };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    console.error("[inventory] 실패:", path, aborted ? "시간 초과" : e instanceof Error ? e.message : e);
    return { ok: false, kind: "unreachable", reason: aborted ? "timeout" : "error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 읽는 통로의 공통 마무리. 🔴 **못 읽은 본문도 「못 받아 왔다」**다 — 빈 목록으로 바꾸면
 * 화면이 「하나도 없다」고 거짓말한다(머리말). 읽기에서 400 이 오는 것은 우리 쪽 결함이라
 * 로그를 남기고 역시 「못 받아 왔다」로 접는다(사람에게 「없다」고 말하지 않는다).
 *
 * `parse` 는 **모양이 아니면 `null`** 을 돌려준다. 🔵 「없음」을 정상으로 돌려줘야 하는
 * 통로(O/H 템플릿)는 `null` 을 한 겹 싸서 넘긴다 — 그래야 「못 읽었다」와 섞이지 않는다.
 */
function finishRead<T>(call: InventoryCall, parse: (json: unknown) => T | null, label: string): InventoryResult<T> {
  if (!call.ok) {
    if (call.kind === "rejected") {
      console.error(`[inventory] ${label}: 읽기 요청이 거절되었습니다 —`, call.message);
      return { status: "unreachable", reason: "error" };
    }
    return { status: "unreachable", reason: call.reason };
  }
  const value = parse(call.json);
  if (value === null) {
    console.error(`[inventory] ${label}: 응답 모양을 읽지 못했습니다.`);
    return { status: "unreachable", reason: "error" };
  }
  return { status: "ok", value };
}

/**
 * 부품 목록 — `GET /api/v1/parts`
 *
 * 🔵 **통째로 받아 화면에서 거른다.** `q` 를 붙여 서버에서 찾는 길도 있지만(저쪽 API.md 2절),
 *    쓰지 않는다:
 *     ① 부품이 **수백 개**라 한 번에 받아도 작다(저쪽이 쪽 나누기를 두지 않은 까닭이 그것이다).
 *     ② 글자를 칠 때마다 통로를 부르면 **한 글자에 왕복 한 번**이다 — 사내망이라도 느리고,
 *        지우고 다시 치는 동안 응답이 뒤섞여 **방금 지운 글자의 결과**가 떠 있는 일이 생긴다.
 *     ③ 거르는 규칙을 순수 함수로 두면(`filterInventoryParts`) 시험이 망 없이 덮는다.
 *    🔴 거르는 규칙은 저쪽 `q` 와 **같은 잣대**로 적어 두었다 — 언젠가 서버에서 찾는 쪽으로
 *    갈아타도 나오는 줄이 달라지지 않는다. 부품이 수천 개가 되는 날 그때 갈아타면 된다.
 */
export async function fetchInventoryParts(): Promise<InventoryResult<InventoryPart[]>> {
  const call = await callInventory("/api/v1/parts");
  return finishRead(call, parseInventoryPartsResponse, "부품 목록");
}

/**
 * 이 장비의 O/H 부품 템플릿 — `GET /api/v1/oh-templates?modelId=…`
 *
 * 🔴 열쇠는 **`product_models.id`** 다(저쪽 API.md 6-1절). 모델 이름으로는 찾지 않는다.
 * 🔴 **이어 둔 템플릿이 없으면 `value: null` 이고 오류가 아니다.** 「없다」와 「못 받아 왔다」를
 *    가르는 자리가 바로 여기다 — 뭉개면 저쪽이 꺼진 동안 화면이 「O/H 템플릿이 없는 기종」인
 *    척한다. 그래서 파서의 답을 `{ template }` 로 **싸서** `finishRead` 에 넘긴다.
 */
export async function fetchInventoryOhTemplate(
  modelId: string
): Promise<InventoryResult<InventoryOhTemplate | null>> {
  const call = await callInventory(`/api/v1/oh-templates?modelId=${encodeURIComponent(modelId)}`);
  const boxed = finishRead(call, parseInventoryOhTemplateResponse, "O/H 템플릿");
  return boxed.status === "ok" ? { status: "ok", value: boxed.value.template } : boxed;
}

/**
 * 이 수리 건에 올라간 반출 신청 — `GET /api/v1/stock-requests?intake=…`
 *
 * 🔴 **인수번호로 묻는다.** 이 사이트는 재고에 관한 것을 제 표에 저장하지 않으므로 요청
 *    번호(`requestKey`)가 어디에도 남지 않는다 — 언제나 아는 값은 인수번호뿐이다(저쪽
 *    API.md 4-7절이 그 길을 낸 까닭이다). 🔵 그 대신 **누가 올렸든** 그 건의 신청이 전부
 *    온다(재고 관리 화면에서 직접 올린 것까지). 그것이 「이 건에 무엇이 나갔나」의 뜻이다.
 *
 * 🔴 **두드리기 전에 모양을 잰다.** 모양이 틀리면 저쪽이 400 으로 돌려보내므로 미리 가른다 —
 *    자는 순수 쪽 `INTAKE_NUMBER_RE` 한 곳에 있고, 세 시스템이 같은 것을 쓴다(그 머리말).
 *    🔴 **그래도 「없다」로 바꾸지는 않는다** — 모양이 틀린 건에 신청이 없다고 말할 근거가
 *    없다. 여기서 빈 목록을 돌려주면 화면이 「이 건에 나간 부품이 없다」고 거짓말하고,
 *    사람은 그 말을 믿고 같은 부품을 견적서에 또 올린다.
 */
export async function fetchInventoryStockRequestsByIntake(
  intakeNumber: string
): Promise<InventoryResult<InventoryStockRequest[]>> {
  const n = intakeNumber.trim().toUpperCase();
  if (!INTAKE_NUMBER_RE.test(n)) {
    console.error("[inventory] 인수번호 모양이 아닙니다:", n);
    return { status: "unreachable", reason: "error" };
  }
  const call = await callInventory(`/api/v1/stock-requests?intake=${encodeURIComponent(n)}`);
  return finishRead(call, parseInventoryStockRequestsResponse, "반출 신청 목록");
}
