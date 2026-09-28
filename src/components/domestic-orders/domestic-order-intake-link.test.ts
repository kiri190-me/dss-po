import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * ============================================================================
 * 내자 정리의 **인수번호 링크** — A/S 로 건너간다 (조각 PO 3i, 2026-09-28)
 * ============================================================================
 * 이 링크는 2026-09-28 까지 `next/link` 로 `/repair-cases/{id}` 를 지었고, **이
 * 사이트에는 그 경로가 없어** 누르면 PO 의 404 가 떴다. 이제 서버가 설정에서 읽어
 * 내려보낸 A/S 기준 주소로 **절대 주소**를 짓는다(lib/domain/as-app-link.ts).
 *
 * 여기서 지키는 것은 화면 쪽 약속 넷이다:
 *  · 주소를 못 지으면(설정 없음 · 연결 없음) **링크를 만들지 않는다** — 글자만.
 *  · 주소를 짓는 규칙은 **공용 함수 한 벌**이다(내자와 견적서 목록이 같은 것을 쓴다).
 *  · 다른 사이트로 나가므로 `next/link` 가 아니라 평범한 `<a>` 이고, **같은 탭**이다.
 *  · 🔴 `relative` 와 `stopPropagation` 이 그대로다 — 둘 다 **고장의 기록**이 달린
 *    자리다(sr-only 가 페이지를 굴리는 일 · 줄 전체가 수정 폼을 여는 일).
 *
 * ── 왜 렌더하지 않고 원본을 읽는가 ──────────────────────────────────────
 * 이 화면은 서버 액션을 import 하는 클라이언트 컴포넌트라, 그 사슬 끝의
 * `server-only` 때문에 react-server 조건 없이 도는 test:components 에서는 import
 * 자체가 던진다. 이웃 둘(domestic-order-trash.test.ts ·
 * domestic-order-inline-cells.test.ts)과 같은 방법이다.
 *
 * 🔴 **주소를 짓는 규칙 자체는 값으로 잰다** — lib/domain/as-app-link.test.ts.
 * ============================================================================
 */

const repoUrl = new URL("../../../", import.meta.url);
const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, repoUrl), "utf8").replace(/\r\n/g, "\n");
/** 줄바꿈·들여쓰기 차이로 시험이 깨지지 않도록 공백을 하나로 접는다. */
const flat = (source: string) => source.replace(/\s+/g, " ");

const sliceBetween = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `원본에서 '${startMarker}' 를 찾지 못했다`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `원본에서 '${endMarker}' 를 찾지 못했다`);
  return source.slice(start, end);
};

const listScreen = read("src/components/domestic-orders/DomesticOrderListScreen.tsx");
const pageSource = read("src/app/(app)/domestic-orders/page.tsx");
/** 링크 조각 하나만 — 파일 전체에 대고 보면 이웃 칸들의 글자가 섞인다. */
const link = flat(sliceBetween(listScreen, "function IntakeNumberLink(", "function CompletionToggle("));
/**
 * 주석을 뺀 코드.
 *
 * 🔴 이 조각의 곁말은 **안 쓰기로 한 것**(`next/link` · `target="_blank"`)을 이름으로
 * 적어 두고 까닭을 설명한다. 원본을 그대로 훑으면 그 설명이 금지 낱말로 걸려, 시험이
 * 주석을 지우라고 요구하게 된다(이 저장소의 다른 걷기들과 같은 규칙).
 */
const codeOf = (source: string) =>
  flat(source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " "));
const screenCode = codeOf(listScreen);

test("🔴 갈 곳을 모르면 링크를 만들지 않는다 — 갈래 둘 다 글자만 그린다", () => {
  // ① 그 줄에 수리 건 연결이 없다(전부터 있던 갈래).
  assert.ok(
    link.includes("if (row.repairCaseId === null) return <>{label}</>;"),
    "연결 없는 줄이 글자로 그려지지 않는다"
  );
  // ② 🔴 A/S 주소 설정이 없거나 값이 엉뚱하다(조각 PO 3i 가 더한 갈래).
  assert.ok(
    link.includes("const href = buildRepairCaseUrl(asAppBaseUrl, row.repairCaseId);"),
    "A/S 주소를 공용 규칙으로 짓지 않는다"
  );
  assert.ok(link.includes("if (href === null) return <>{label}</>;"), "주소를 못 지었는데 링크를 그린다");
  // 🔴 두 갈래 **다** 지난 뒤에야 <a> 가 나온다.
  const anchorAt = link.indexOf("<a href={href}");
  assert.ok(anchorAt > link.indexOf("if (href === null)"), "판정보다 링크가 앞에 있다");
});

test("🔴 주소를 짓는 규칙은 한 벌이다 — 이 화면이 문자열을 이어 붙이지 않는다", () => {
  assert.ok(
    flat(listScreen).includes('import { buildRepairCaseUrl } from "@/lib/domain/as-app-link";'),
    "공용 규칙을 들여오지 않는다"
  );
  // 🔴 주소를 손으로 짓는 자리가 없다 — 견적서 목록(QuoteListSlots)과 갈라지는 날을 막는다.
  assert.equal(
    /["'`][^"'`]*\/repair-cases/.test(screenCode),
    false,
    "화면이 수리 건 주소를 직접 짓고 있다 — 규칙은 as-app-link.ts 한 곳이다"
  );
});

test("🔴 다른 사이트로 나간다 — next/link 가 아니라 <a>, 그리고 같은 탭이다", () => {
  assert.equal(screenCode.includes("next/link"), false, "이 화면이 next/link 를 들여온다");
  assert.equal(screenCode.includes("<Link"), false, "이 화면이 <Link> 로 그린다");
  assert.equal(link.includes('target="_blank"'), false, "새 탭에서 연다 — A/S 의 같은 링크와 다르다");
});

test("🔴 relative 와 stopPropagation 을 그대로 둔다 — 둘 다 고장의 기록이 달린 자리다", () => {
  // sr-only 가 position:absolute 라, 기준 조상이 없으면 페이지가 표 아래로 굴러간다.
  assert.ok(link.includes('<span className="sr-only"> 수리 건 상세로 이동</span>'), "곁말이 사라졌다");
  assert.ok(link.includes('className="relative text-blue-700'), "relative 가 빠졌다 — 페이지가 굴러간다");
  // 줄 아무 데나 누르면 수정 폼이 열린다 — 막지 않으면 넘어가면서 폼도 함께 열린다.
  assert.ok(link.includes("onClick={(event) => event.stopPropagation()}"), "클릭이 줄 전체로 새어 나간다");
});

test("🔴 기준 주소는 서버가 내려보낸다 — 표와 카드 두 곳 다 같은 값을 쓴다", () => {
  assert.ok(
    flat(pageSource).includes("asAppBaseUrl={env.asAppBaseUrl}"),
    "page.tsx 가 A/S 기준 주소를 내려보내지 않는다"
  );
  assert.ok(flat(pageSource).includes('import { env } from "@/lib/env";'), "page.tsx 가 설정을 읽지 않는다");
  // 🔴 좁은 화면(카드)에서도 같은 링크다 — 한쪽만 고쳐지면 같은 자료가 다른 화면처럼 읽힌다.
  assert.equal(
    screenCode.split("<IntakeNumberLink row={row} asAppBaseUrl={asAppBaseUrl} />").length - 1,
    2,
    "인수번호 링크를 그리는 곳이 표와 카드 둘이 아니다"
  );
  // 🔴 **없어도 돌아야 한다** — 설정이 빠진 서버에서 화면이 죽지 않는다.
  assert.ok(flat(listScreen).includes("asAppBaseUrl?: string | null;"), "기준 주소 없이도 그려지는 프롭이 아니다");
  assert.ok(
    flat(read("src/lib/env.ts")).includes("get asAppBaseUrl(): string | null {"),
    "설정 getter 가 없거나 없을 때 null 을 돌려주지 않는다"
  );
});
