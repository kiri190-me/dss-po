import "server-only";

import { env } from "@/lib/env";

/**
 * ============================================================================
 * A/S 관리 시스템을 부르는 자리 — `{AS_APP_BASE_URL}/api/v1/…`
 * ============================================================================
 * 2026-10-18. 이 사이트(PO/내자)가 A/S 관리 시스템에 **쓰는** 통로가 여기 모인다.
 * 모양은 이웃한 `src/lib/server/inventory-gateway.ts` 를 그대로 따른다 — 시간 제한을
 * 걸고, 실패를 삼켜 뜻 있는 결과로 바꾸고, 응답 모양을 맞추는 자리를 한 곳으로 모은다.
 *
 * ── 🔴 왜 통로인가 — 규칙을 베끼지 않기 위해서다 ────────────────────────
 * 내자 정리의 [완료 처리]/[완료 해제]는 2026-10-18 부터 **그 줄에 붙은 수리 건의 출하
 * 완료까지** 함께 움직인다. 그 판정(최종 출하 승인 확인 · 되돌리기 · 두 mutation 의
 * 차례)은 A/S 의 서비스 둘이 쥐고 있다(저쪽 `server/services/complete-domestic-order.ts`
 * · `release-domestic-order.ts`). 🔴 **이 저장소로 베끼면 규칙이 두 벌이 되어 한쪽만
 * 고쳐지는 날이 온다.** 그래서 PO 는 A/S 가 연 통로를 HTTP 로 부르고, 업무 규칙은 한 줄도
 * 이 파일에 없다. 약속은 저쪽 `API_FOR_INTERNAL_SYSTEMS.md` 1-2절 · 4-2절이다.
 *
 * ── 🔴 이 사이트는 A/S 와 **같은 DB** 를 본다 — 그래도 통로를 쓴다 ───────
 * `domestic_orders` 에 직접 쓸 수는 있다(실제로 다른 액션들이 그렇게 한다). 하지만 수리
 * 건 쪽(`repair_cases` · `workflow_*`)의 규칙은 여기 없다. 반쪽만 쓰면 두 화면이 같은 줄을
 * 보면서 **어느 쪽에서 눌렀느냐에 따라 결과가 달라진다** — 그것이 이 통로가 생긴 까닭이다.
 *
 * ── 주소는 **하나뿐이다** ───────────────────────────────────────────────
 * 🔵 통로 주소를 따로 두지 않고 `env.asAppBaseUrl`(`AS_APP_BASE_URL`)을 그대로 쓴다.
 *    저쪽은 한 앱이고 통로가 그 아래 `/api/v1/…` 에 붙어 있어서(저쪽 API 문서 5절) 뿌리가
 *    곧 사람이 여는 화면이다. 두 벌이면 언젠가 한쪽만 바뀌고, 그때 **통로만 조용히 엉뚱한
 *    곳**을 두드린다. 이웃 `inventory-gateway.ts` 도 같은 판단으로 주소를 하나만 둔다.
 *    🔴 그래서 **이 파일이 새로 읽는 환경변수는 `AS_WRITE_TOKEN` 하나뿐**이고, 그것을
 *    읽는 자리도 여기 한 곳이다(부를 때마다 읽으므로 시험이 갈아 끼울 수 있다 —
 *    `env` 쪽도 getter 라 같은 성질이다).
 *
 * ── 🔴 토큰은 **읽기 토큰과 다른 값**이다 ───────────────────────────────
 * 저쪽은 읽기(`AS_API_TOKEN`)와 쓰기(`AS_WRITE_TOKEN`)를 가른다. 가르는 것은 부르는 쪽이
 * 아니라 **하는 일**이다 — 읽기 토큰 하나로 쓰기까지 열면 그 토큰을 가진 모든 시스템이
 * 내자 줄을 완료 처리할 수 있게 된다(저쪽 1-2절). 이 사이트는 A/S 에서 읽어 올 것이 없어
 * 읽기 토큰을 아예 갖지 않는다.
 *
 * ── 🔴 「설정되지 않았다」와 「응답하지 않는다」를 가른다 ────────────────
 * 고치는 길이 다르다 — 앞은 **값을 넣는 일**이고 뒤는 **저쪽 앱을 보는 일**이다. 뭉개 두면
 * 설정이 빠진 서버에서 사람이 A/S 를 들여다보며 하루를 쓴다(이 저장소에서 실제로 한 번
 * 헤맸다). 그래서 설정이 비면 **부르지 않고** `not_configured` 로 돌아온다.
 * ============================================================================
 */

/**
 * 못 부른 까닭. 🔴 전부 **「안 됐다」가 아니라 「우리가 못 닿았다」**다 — 저쪽이 업무
 * 규칙으로 거절한 것(`rejected`)과 섞이면 사람에게 할 말이 달라진다.
 */
export type AsGatewayUnreachableReason =
  /** 주소나 토큰이 없다 — 두드리지도 않았다. */
  | "not_configured"
  /** 시간 안에 답이 오지 않았다. */
  | "timeout"
  /** 저쪽이 토큰을 받지 않았다(401). 양쪽 값이 어긋나 있다. */
  | "unauthorized"
  /** 저쪽에 토큰이 설정되지 않아 통로가 닫혀 있다(503 `api_closed`). */
  | "api_closed"
  /** 그 밖의 실패 — 망·5xx·모르는 응답. */
  | "error"
  /** 🔴 답은 왔는데(200) 모양을 읽지 못했다. **바뀌었는지 알 수 없다**는 뜻이다. */
  | "unreadable_result";

/**
 * 저쪽이 **업무 규칙으로** 거절했을 때의 코드(저쪽 4-2절). 🔴 번호가 아니라 **이 코드**가
 * 진짜 구분이다 — `CONFLICT` 와 `SHIPMENT_COMPLETION_BLOCKED` 가 같은 409 다. 🔴 그리고
 * **`message` 글자를 비교해 가르지 않는다** — 막힌 까닭마다 문장이 다르다.
 */
export const AS_COMPLETION_REJECT_CODES = [
  "VALIDATION_ERROR",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  /** 🔵 수리 건이 막혀 **내자 줄도 안 바뀌었다.** `message` 는 사람에게 그대로 보여 줄 글이다. */
  "SHIPMENT_COMPLETION_BLOCKED",
  "DATABASE_UNAVAILABLE",
] as const;

export type AsCompletionRejectCode = (typeof AS_COMPLETION_REJECT_CODES)[number];

export type AsCompletionResult =
  | {
      ok: true;
      id: string;
      version: number;
      /** 이번 누름으로 수리 건까지 함께 출하 완료됐는가. */
      repairCaseShipmentCompleted: boolean;
      /** 이번 누름으로 수리 건의 출하 완료까지 되돌렸는가. */
      repairCaseShipmentReverted: boolean;
    }
  /** 저쪽이 업무 규칙으로 거절했다 — **아무것도 바뀌지 않았다**. */
  | { ok: false; kind: "rejected"; code: AsCompletionRejectCode; message: string }
  /** 우리가 저쪽에 닿지 못했다. */
  | { ok: false; kind: "unreachable"; reason: AsGatewayUnreachableReason };

/**
 * 못 닿은 까닭을 사람 말로. 🔴 여섯 다 **「완료되었습니다」라고 말하지 않는다.**
 *
 * 🔴 말투를 이웃 `domain/inventory-gateway.ts` 의 `INVENTORY_UNREACHABLE_MESSAGES` 와
 * 맞춰 두었다 — 같은 사내 시스템끼리 서로를 못 부를 때의 말이라, 화면마다 다른 말을 하면
 * 같은 사고가 다른 일로 보인다.
 */
export const AS_GATEWAY_UNREACHABLE_MESSAGES: Record<AsGatewayUnreachableReason, string> = {
  not_configured: "A/S 관리 시스템 통로가 아직 연결되지 않았습니다(주소나 토큰이 설정되지 않았습니다).",
  timeout: "A/S 관리 시스템이 응답하지 않습니다.",
  unauthorized: "A/S 관리 시스템이 토큰을 받지 않았습니다. 양쪽 토큰 값을 맞춰야 합니다.",
  api_closed: "A/S 관리 시스템 쪽에서 통로가 닫혀 있습니다(저쪽 토큰이 설정되지 않았습니다).",
  error: "A/S 관리 시스템과 통신하지 못했습니다.",
  unreadable_result: "A/S 관리 시스템의 답을 읽지 못했습니다.",
};

/**
 * 🔴 **「확실히 안 바뀌었다」와 「바뀌었는지 모른다」는 다른 말이다.**
 *
 * 쓰는 통로라 이 가름이 읽기보다 중요하다. 두드리지도 않았거나(`not_configured`) 저쪽
 * 문지기가 먼저 막았으면(`unauthorized` · `api_closed`) 저쪽은 아무 일도 하지 않았다 —
 * 그때는 「내자 줄도 그대로입니다」라고 **단언해도 된다**.
 *
 * 그러나 시간이 초과됐거나 답을 못 읽었으면 **저쪽은 이미 저장했을 수 있다.** 그때
 * 「그대로입니다」라고 말하면 사람은 다시 누르고, 그 사이 남이 고쳐 둔 것과 엉킨다.
 * 모르는 것은 모른다고 적고 **새로고침해 확인**하라고 말한다.
 */
const AS_COMPLETION_OUTCOME_KNOWN: Record<AsGatewayUnreachableReason, boolean> = {
  not_configured: true,
  unauthorized: true,
  api_closed: true,
  timeout: false,
  error: false,
  unreadable_result: false,
};

/**
 * 화면에 그대로 뜨는 한 줄. `completed` 는 **누른 단추**다(완료 처리 ↔ 완료 해제) —
 * 서버가 쓰는 까닭은 하나지만 사람에게 할 말은 둘로 갈린다.
 */
export function asCompletionUnreachableMessage(
  reason: AsGatewayUnreachableReason,
  completed: boolean
): string {
  const what = completed ? "완료 처리" : "완료 해제";
  const head = AS_GATEWAY_UNREACHABLE_MESSAGES[reason];
  return AS_COMPLETION_OUTCOME_KNOWN[reason]
    ? `${head} ${what}를 하지 못했고, 내자 정리의 완료 표시도 그대로입니다.`
    : `${head} ${what}가 되었는지 알 수 없습니다. 목록을 새로고침해 확인해 주세요.`;
}

/**
 * 🔴 **쓰기는 읽기보다 길게 끊는다.** 이웃 통로의 읽기는 5초다(화면을 여는 길목이라 짧게
 * 끊는 편이 낫다). 여기는 저쪽이 트랜잭션 둘을 돌리는 자리라 그만큼 여유를 준다 — 짧게
 * 끊으면 **저쪽은 저장했는데 이쪽은 실패로 읽는** 어긋남이 늘어난다.
 */
const WRITE_TIMEOUT_MS = 10_000;

function writeToken(): string {
  return (process.env.AS_WRITE_TOKEN ?? "").trim();
}

function unreachable(reason: AsGatewayUnreachableReason): AsCompletionResult {
  return { ok: false, kind: "unreachable", reason };
}

function isRejectCode(value: unknown): value is AsCompletionRejectCode {
  return (AS_COMPLETION_REJECT_CODES as readonly string[]).includes(value as string);
}

/**
 * 성공 응답의 모양을 **잰 뒤에** 쓴다(저쪽 4-2절의 200 본문). 🔴 모양이 아니면 `null` 이고
 * 부르는 쪽이 `unreadable_result` 로 바꾼다 — 비어 있는 값으로 채워 「완료됐다」고 말하지
 * 않는다. 🔵 수리 건 두 칸은 **없으면 `false`** 로 읽는다. 저쪽이 언젠가 칸을 더 보내거나
 * 덜 보내도 「수리 건까지 움직였다」로 **기울지는 않게** 한다 — 성공 문구가 그 값으로 갈린다.
 */
function parseCompletionSuccess(json: unknown): AsCompletionResult | null {
  if (typeof json !== "object" || json === null) return null;
  const body = json as Record<string, unknown>;
  if (body.ok !== true) return null;
  if (typeof body.id !== "string" || body.id === "") return null;
  if (typeof body.version !== "number" || !Number.isFinite(body.version)) return null;
  return {
    ok: true,
    id: body.id,
    version: body.version,
    repairCaseShipmentCompleted: body.repairCaseShipmentCompleted === true,
    repairCaseShipmentReverted: body.repairCaseShipmentReverted === true,
  };
}

/**
 * 업무 거절의 모양(저쪽 4-2절의 4xx·503 본문). 🔴 **`code` 가 아는 값이고 `message` 에
 * 글자가 있을 때만** 거절로 읽는다 — 통로가 아직 안 열려 404 HTML 이 오는 경우처럼 까닭이
 * 없는 응답을 거절로 접으면, 사람은 **업무 규칙이 막았다**고 읽고 엉뚱한 곳을 고친다.
 */
function parseCompletionRejection(
  json: unknown
): { ok: false; kind: "rejected"; code: AsCompletionRejectCode; message: string } | null {
  if (typeof json !== "object" || json === null) return null;
  const body = json as Record<string, unknown>;
  if (body.ok !== false) return null;
  if (!isRejectCode(body.code)) return null;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message === "") return null;
  return { ok: false, kind: "rejected", code: body.code, message };
}

/**
 * 내자 줄 완료 처리 · 완료 해제 — `POST /api/v1/domestic-orders/{id}/completion`
 *
 * 🔴 **`requesterSub` 는 포털 쪽 사용자 id(`users.sso_subject`)다.** 이 사이트의
 *    `users.id` 를 보내면 저쪽이 사람을 못 찾아 403 이 된다(저쪽 4-2절). 어디서 얻는지는
 *    부르는 쪽(`server/actions/domestic-orders.ts`)에 적어 두었다.
 * 🔴 **자격은 저쪽에서도 다시 본다.** 토큰은 「어느 시스템이 보냈나」까지만 말하고, 「누가
 *    눌렀나」는 저쪽이 `sub` 로 사람을 되짚어 직접 확인한다. 그래도 이 사이트의 권한 관문을
 *    그대로 두는 까닭은, PO 화면이 아무에게나 열려서는 안 되기 때문이다.
 *
 * 🔴 **로그에 `message` 를 적지 않는다.** 저쪽이 돌려주는 문장은 사람에게 보여 줄 글이고
 *    줄을 가리키는 말이 섞일 수 있다. 남기는 것은 번호와 코드뿐이다(이 표의 자유 입력 칸에
 *    사람 이름이 섞이는 것과 같은 까닭 — actions/domestic-orders.ts 의 runEachTrashItem).
 */
export async function setAsDomesticOrderCompletion(params: {
  id: string;
  expectedVersion: number;
  completed: boolean;
  requesterSub: string;
}): Promise<AsCompletionResult> {
  const base = env.asAppBaseUrl ?? "";
  const token = writeToken();
  // 🔴 설정이 비면 **부르지 않는다**(머리말). 토큰 없이 두드려 401 을 받는 것과 값이
  //    빠진 것은 고치는 길이 다르다.
  if (base === "" || token === "" || params.requesterSub.trim() === "") {
    console.error("[as-gateway] 내자 완료 통로 설정이 비어 있습니다.", {
      hasBase: base !== "",
      hasToken: token !== "",
      hasRequester: params.requesterSub.trim() !== "",
    });
    return unreachable("not_configured");
  }

  const path = `/api/v1/domestic-orders/${encodeURIComponent(params.id)}/completion`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WRITE_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        completed: params.completed,
        expectedVersion: params.expectedVersion,
        requester: { sub: params.requesterSub.trim() },
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });

    // 🔴 401 의 몸통에는 `ok` 칸이 **없다**(저쪽 1절). 아래 거절 읽기로 보내면 모양이
    //    맞지 않아 「모르는 실패」가 되므로 여기서 먼저 가른다 — 토큰이 어긋났다는 것은
    //    사람이 고칠 수 있는 분명한 까닭이다.
    if (res.status === 401) {
      console.error("[as-gateway] 토큰이 맞지 않습니다.");
      return unreachable("unauthorized");
    }

    const json = await res.json().catch(() => null);

    if (res.ok) {
      const parsed = parseCompletionSuccess(json);
      if (parsed === null) {
        console.error("[as-gateway] 성공 응답의 모양을 읽지 못했습니다.", { status: res.status });
        return unreachable("unreadable_result");
      }
      return parsed;
    }

    const rejected = parseCompletionRejection(json);
    if (rejected !== null) {
      // 코드만 남긴다(머리말).
      console.error("[as-gateway] 저쪽이 거절했습니다.", { status: res.status, code: rejected.code });
      return rejected;
    }

    // 🔵 `{ error: "api_closed" }` — 저쪽에 토큰이 설정되지 않아 통로가 닫혀 있다.
    //    위 거절 모양이 아니므로 여기서 받는다.
    if (res.status === 503) {
      console.error("[as-gateway] 저쪽 통로가 닫혀 있습니다.");
      return unreachable("api_closed");
    }

    console.error("[as-gateway] 모르는 응답입니다.", { status: res.status });
    return unreachable("error");
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    console.error("[as-gateway] 실패:", aborted ? "시간 초과" : e instanceof Error ? e.message : e);
    return unreachable(aborted ? "timeout" : "error");
  } finally {
    clearTimeout(timer);
  }
}
