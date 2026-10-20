/**
 * ============================================================================
 * 🔴 「보이는 알림 지우기 n건」 — 묶음이 그리는 것을 **그려 봐서** 확인한다
 * ============================================================================
 * 2026-10-20 에 @dss/ui 가 이 단추를 그리기 시작했다(그쪽 1210d11). 이 사이트가
 * 하는 일은 둘뿐이다 — 서브모듈 포인터를 올리는 것과 `onDismissAll` 에 **열쇠를
 * 미리 묶은 서버 액션**을 넘기는 것(lib/auth/notification-dismissal.test.ts 8절).
 *
 * 여기서 지키는 것 셋:
 *  1. 🔴 **안 넘기면 마크업이 한 글자도 늘지 않는다.** 포인터만 올라간 상태가
 *     예전과 같아야, 넘기는 조각과 올리는 조각을 따로 되돌릴 수 있다.
 *  2. 🔴 **적히는 수와 보내는 열쇠 수가 같다.** 묶음은 그릴 수 없는 주소의 줄을
 *     빼고 세므로, 사이트도 같은 기준으로 열쇠를 모아야 한다 — 어긋나면 「3건」을
 *     눌렀는데 4건이 지워진다.
 *  3. 🔴 **그릴 줄이 없으면 단추도 없다** — 눌러도 아무 일 없는 단추를 두지 않는다.
 *
 * 🔴 이 시험이 목록 components 에 있는 까닭: 종을 **실제로 렌더해** 본다.
 *    목록 unit 은 `--conditions=react-server` 라 `react-dom/server` 가 스스로
 *    막힌다(scripts/test-lists/components.txt 머리말).
 * ============================================================================
 */
import assert from "node:assert/strict";
import test from "node:test";

import { NotificationBell, type NotificationBellItem } from "@dss/ui";
import { renderToStaticMarkup } from "react-dom/server";

import { visibleNotificationKeys } from "@/lib/auth/notification-keys";

/** 종에 그릴 줄 하나. 🔴 값은 전부 가짜다 — 실제 고객사·건 번호를 넣지 않는다. */
function bellRow(overrides: Partial<NotificationBellItem> = {}): NotificationBellItem {
  return {
    key: "rf-service-system:APPROVAL:1",
    sourceId: "rf-service-system",
    sourceName: "DSS A/S 관리 시스템",
    id: "APPROVAL:1",
    kind: "APPROVAL",
    kindLabel: "결재 대기",
    subject: "RF-2026-0001",
    detail: "아무개가 올렸습니다",
    href: "http://192.168.1.132:3000/repair-cases/1",
    ...overrides,
  };
}

/** 종이 실제로 내놓는 HTML. 묶음이 약속한 것을 글자로 확인한다. */
function bellMarkup(props: Parameters<typeof NotificationBell>[0]): string {
  return renderToStaticMarkup(NotificationBell(props));
}

/* ── 1. 🔴 넘기기 **전후** — 포인터만으로는 아무것도 안 바뀐다 ────────── */

test("🔴 onDismissAll 을 안 넘기면 마크업이 한 글자도 늘지 않는다", () => {
  const items = [bellRow({ key: "a" }), bellRow({ key: "b", href: "/quotes/2" })];
  const 안넘겼을때 = bellMarkup({ items, count: 2, onDismiss: () => {} });

  assert.equal(
    안넘겼을때.includes("dss-bell__dismissall"),
    false,
    "🔴 안 넘겼는데 일괄 단추가 섰다 — 묶음의 약속이 깨졌다",
  );
  assert.equal(안넘겼을때.includes("dss-bell__dismissrow"), false);
  // 줄마다 서는 ✕ 는 그대로다(이 조각이 더하기만 했다는 뜻).
  assert.equal(안넘겼을때.match(/dss-bell__dismiss"/g)?.length, 2);
});

test("🔴 넘기면 목록 **안**에 단추가 서고, 줄마다 서는 ✕ 는 그대로다", () => {
  const items = [bellRow({ key: "a" }), bellRow({ key: "b", href: "/quotes/2" })];
  const 넘겼을때 = bellMarkup({
    items,
    count: 2,
    onDismiss: () => {},
    onDismissAll: () => {},
  });

  assert.match(
    넘겼을때,
    /<li class="dss-bell__dismissrow"><button type="button" class="dss-bell__dismissall">보이는 알림 지우기 2건<\/button><\/li><\/ul>/,
    "🔴 일괄 단추가 목록 맨 아래에 서지 않는다 — 묶음 포인터가 옛 커밋일 수 있다",
  );
  assert.equal(넘겼을때.match(/dss-bell__dismiss"/g)?.length, 2, "줄마다 서는 ✕ 가 달라졌다");
  // 🔴 폼 안에 앉은 사이트에서 누르는 순간 폼이 보내지면 안 된다.
  assert.match(넘겼을때, /<button type="button" class="dss-bell__dismissall">/);
});

/* ── 2. 🔴 적히는 수 = 보내는 열쇠 수 ─────────────────────────────────── */

test("🔴 단추에 적히는 수와 보내는 열쇠 수가 같다 — 둘이 어긋나면 사람에게 거짓말이다", () => {
  const items = [
    bellRow({ key: "a" }),
    bellRow({ key: "나쁜줄", href: "javascript:alert(1)" }),
    bellRow({ key: "b", href: "/quotes/2" }),
  ];
  const keys = visibleNotificationKeys(items);
  const markup = bellMarkup({ items, count: 9, onDismissAll: () => {} });

  assert.equal(keys.length, 2);
  assert.ok(
    markup.includes(`보이는 알림 지우기 ${keys.length}건`),
    `🔴 단추의 수가 보내는 열쇠 수와 다르다: ${markup.slice(markup.indexOf("보이는 알림"), markup.indexOf("보이는 알림") + 40)}`,
  );
});

/* ── 3. 🔴 죽은 단추를 두지 않는다 ────────────────────────────────────── */

test("🔴 그릴 줄이 하나도 없으면 단추도 없다 — 눌러도 아무 일 없는 단추를 두지 않는다", () => {
  // 이 사이트는 빈 종을 아예 안 그리므로(종 자체가 null) 그 선을 함께 못 박는다.
  assert.equal(NotificationBell({ items: [], count: 0, onDismissAll: () => {} }), null);
  const 빈종 = bellMarkup({
    items: [],
    count: 0,
    showWhenEmpty: true,
    emptyLabel: "알림이 없습니다",
    onDismissAll: () => {},
  });
  assert.equal(빈종.includes("dss-bell__dismissall"), false);
});
