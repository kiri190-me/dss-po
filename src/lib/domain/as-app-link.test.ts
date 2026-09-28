import { test } from "node:test";
import assert from "node:assert/strict";

import { buildRepairCaseUrl } from "./as-app-link";

/**
 * ============================================================================
 * A/S 로 건너가는 인수번호 링크 — **못 만들면 안 만든다** (조각 PO 3i)
 * ============================================================================
 * 이 판정이 틀리는 방향은 둘이고 둘 다 조용하다:
 *  · 지나치게 너그러우면 설정이 빠진 서버에서 **404 로 가는 링크**가 목록 줄마다 선다.
 *  · 지나치게 까다로우면 멀쩡한 줄의 링크가 **말없이 사라진다.**
 * 그래서 「무엇이 null 이고 무엇이 주소가 되는가」를 값으로 못 박는다.
 *
 * 🔴 `env.asAppBaseUrl` 은 여기서 재지 않는다 — process.env 에 매달려 있어 이 목록
 * (환경변수도 DB 도 없는 unit)에서 부를 것이 아니다. 그래서 판정만 이 파일로 꺼냈다.
 * ============================================================================
 */

const ID = "11111111-2222-3333-4444-555555555555";

test("주소를 만든다 — 기준 주소 뒤에 /repair-cases/{id} 를 잇는다", () => {
  assert.equal(
    buildRepairCaseUrl("http://192.168.0.10:3000", ID),
    `http://192.168.0.10:3000/repair-cases/${ID}`,
  );
  assert.equal(
    buildRepairCaseUrl("https://as.example.invalid", ID),
    `https://as.example.invalid/repair-cases/${ID}`,
  );
  // 하위 경로 뒤에 붙어 있어도 그대로 잇는다(리버스 프록시가 앞에 설 수 있다).
  assert.equal(
    buildRepairCaseUrl("https://dss.example.invalid/as", ID),
    `https://dss.example.invalid/as/repair-cases/${ID}`,
  );
});

test("🔴 끝의 슬래시가 있어도 `//` 가 되지 않는다", () => {
  for (const base of ["http://192.168.0.10:3000/", "http://192.168.0.10:3000//"]) {
    assert.equal(
      buildRepairCaseUrl(base, ID),
      `http://192.168.0.10:3000/repair-cases/${ID}`,
      base,
    );
  }
});

test("🔴 기준 주소가 없으면 null 이다 — 그때 화면은 글자만 그린다", () => {
  for (const base of [null, "", "   ", "\t\n"]) {
    assert.equal(buildRepairCaseUrl(base, ID), null, JSON.stringify(base));
  }
});

test("🔴 http(s) 가 아닌 기준 주소는 없는 셈 친다 — 이상한 주소를 만들지 않는다", () => {
  for (const base of [
    "javascript:alert(1)", // 링크가 되면 곤란한 값
    "//192.168.0.10:3000", // 스킴 없는 상대 주소
    "192.168.0.10:3000",
    "ftp://192.168.0.10",
    "data:text/html,<b>x</b>",
    "/repair-cases", // 이 사이트 안의 경로 — 여기엔 그 화면이 없다
    "auto:3000", // 안 풀린 채로 들어온 값(env 가 풀어 주지 못했다는 뜻)
    "http:/192.168.0.10", // 슬래시 하나가 빠졌다
    "http://", // 호스트가 없다
  ]) {
    assert.equal(buildRepairCaseUrl(base, ID), null, base);
  }
});

test("스킴의 대소문자는 가리지 않는다 — 주소 문법에서 같은 값이다", () => {
  assert.equal(buildRepairCaseUrl("HTTP://192.168.0.10:3000", ID), `HTTP://192.168.0.10:3000/repair-cases/${ID}`);
  assert.equal(buildRepairCaseUrl("Https://as.example.invalid", ID), `Https://as.example.invalid/repair-cases/${ID}`);
});

test("🔴 수리 건 연결이 없으면 null 이다 — 갈 곳 없는 링크를 만들지 않는다", () => {
  for (const id of ["", "   "]) {
    assert.equal(buildRepairCaseUrl("http://192.168.0.10:3000", id), null, JSON.stringify(id));
  }
});

test("🔴 id 를 주소 문법으로 읽히게 두지 않는다 — 언제나 /repair-cases/ 아래다", () => {
  // UUID 는 한 글자도 달라지지 않는다(unreserved 문자뿐이다).
  assert.equal(
    buildRepairCaseUrl("http://as.invalid", ID),
    `http://as.invalid/repair-cases/${ID}`,
  );
  // 그 밖의 글자는 감싼다 — 감싸지 않으면 저쪽 사이트의 **다른 화면**을 가리킨다.
  for (const [id, encoded] of [
    ["a/b", "a%2Fb"],
    ["../admin", "..%2Fadmin"],
    ["a?next=/admin", "a%3Fnext%3D%2Fadmin"],
    ["a#top", "a%23top"],
    ["a b", "a%20b"],
    ["a%2F", "a%252F"],
  ] as const) {
    const url = buildRepairCaseUrl("http://as.invalid", id);
    assert.equal(url, `http://as.invalid/repair-cases/${encoded}`, id);
    // 🔴 무엇이 오든 그 경로 아래다 — 주소로 읽어도 호스트와 경로가 그대로다.
    const parsed = new URL(url as string);
    assert.equal(parsed.host, "as.invalid", id);
    assert.equal(parsed.search, "", id);
    assert.equal(parsed.hash, "", id);
    assert.ok(parsed.pathname.startsWith("/repair-cases/"), parsed.pathname);
  }
});
