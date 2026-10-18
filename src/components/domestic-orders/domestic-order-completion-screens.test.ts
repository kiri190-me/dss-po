import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * ============================================================================
 * 내자 완료가 **수리 건까지** 움직인다 — 화면과 액션의 약속 (2026-10-18)
 * ============================================================================
 * 🔴 **규칙은 이 저장소에 없다.** 출하 완료 판정 · 최종 출하 승인 확인 · 되돌리기는
 * A/S 관리 시스템의 서비스가 쥐고 있고(저쪽 `server/services/complete-domestic-order.ts`
 * · `release-domestic-order.ts`), 이 사이트는 저쪽이 연 통로를 부를 뿐이다. 그 **통로
 * 자체**는 `lib/server/as-gateway.test.ts` 가 망 없이 덮는다. 여기서 지키는 것은 그
 * 바깥의 약속 셋이다.
 *
 *  1. 🔴 **액션이 규칙을 되가져오지 않는다** — mutation 을 곧장 부르지 않고 통로를
 *     부른다. 되돌아가면 같은 줄을 보는 두 화면의 결과가 다시 갈린다.
 *  2. 🔴 **`requester.sub` 는 포털 번호다**(`users.sso_subject`). 이 사이트의
 *     `users.id` 를 보내면 저쪽이 사람을 못 찾아 403 이고, 사람에게는 「권한이 없다」로
 *     보여 영문을 알 수 없다.
 *  3. 🔴 **화면이 코드로 가른다**(글자가 아니라). 그리고 막혔을 때 쓰는 것은 **읽어야
 *     닫히는 알림**이지 0.5초 뒤 사라지는 저장 팝업이 아니다.
 *
 * ── 왜 렌더하지 않고 원본을 읽는가 ──────────────────────────────────────
 * 목록 화면은 **서버 액션을 부르는 클라이언트 컴포넌트**라 이 러너에서 그릴 수 없다
 * (이 저장소의 관례 — components/quotes/quote-list-screen-source.test.ts 머리말).
 * 눈으로 보이는 글자 자체는 확인 창 쪽을 **실제로 그려** 본다
 * (DomesticOrderCompletionReleaseDialog.test.tsx — 목록 components).
 * ============================================================================
 */

const repoUrl = new URL("../../../", import.meta.url);
/** CRLF 로 받아 둔 저장소에서도 표지가 맞도록 LF 로 맞춘다. */
const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, repoUrl), "utf8").replace(/\r\n/g, "\n");
/** 줄바꿈·들여쓰기 차이로 시험이 깨지지 않도록 공백을 하나로 접는다. */
const flat = (source: string) => source.replace(/\s+/g, " ");

const screen = read("src/components/domestic-orders/DomesticOrderListScreen.tsx");
const action = read("src/lib/server/actions/domestic-orders.ts");
const dialog = read("src/components/domestic-orders/DomesticOrderCompletionReleaseDialog.tsx");

/** 주석을 뺀 코드. 머리말이 적어 둔 **이름**이 단언에 걸리지 않게 한다. */
const codeOnly = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

/** `function 이름(` 부터 열이 0 인 `}` 까지 — 그 함수만 떼어 본다. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} 을(를) 찾지 못했습니다.`);
  const end = source.indexOf("\n}\n", start);
  assert.notEqual(end, -1, `${name} 의 끝을 찾지 못했습니다.`);
  return source.slice(start, end);
}

/* ------------------------------------------------------------------------ */

describe("🔴 액션이 통로를 부른다 — 규칙을 이 저장소로 되가져오지 않는다", () => {
  const code = codeOnly(action);

  test("A/S 통로를 부른다", () => {
    assert.ok(code.includes("setAsDomesticOrderCompletion"), "통로를 부르지 않는다");
    assert.ok(flat(code).includes('from "@/lib/server/as-gateway"'), "통로 모듈을 들여오지 않는다");
  });

  test("🔴 setDomesticOrderCompletion mutation 을 **곧장 부르지 않는다**", () => {
    assert.ok(
      !code.includes("setDomesticOrderCompletion({"),
      "mutation 을 다시 직접 부르고 있다 — 그러면 수리 건이 함께 움직이지 않는다",
    );
    assert.ok(
      !code.includes("  setDomesticOrderCompletion,"),
      "mutation 을 다시 들여오고 있다",
    );
  });

  test("🔵 mutation 자체는 **지우지 않았다** — 지우는 것은 이 조각의 일이 아니다", () => {
    const mutation = read("src/lib/db/mutations/domestic-orders.ts");
    assert.ok(mutation.includes("export async function setDomesticOrderCompletion("), "mutation 이 사라졌다");
  });

  test("🔴 권한 관문을 그대로 둔다 — 저쪽이 다시 본다고 여기서 빼지 않는다", () => {
    const body = functionBody(code, "setDomesticOrderCompletionAction");
    assert.ok(body.includes("resolveAuthorizedActingUser()"), "관문이 사라졌다");
    const gate = body.indexOf("resolveAuthorizedActingUser()");
    const call = body.indexOf("setAsDomesticOrderCompletion");
    assert.ok(gate < call, "관문보다 통로 호출이 먼저다");
  });
});

describe("🔴 `requester.sub` 는 포털 번호다 — users.id 가 아니다", () => {
  const body = functionBody(codeOnly(action), "setDomesticOrderCompletionAction");

  test("ssoSubject 를 보낸다", () => {
    assert.ok(body.includes("ssoSubject"), "포털 번호를 읽지 않는다");
    assert.ok(flat(body).includes("requesterSub,"), "requesterSub 로 넘기지 않는다");
  });

  test("🔴 actingUser.id 를 requesterSub 로 보내지 않는다", () => {
    assert.ok(
      !/requesterSub:\s*auth\.actingUser\.id/.test(body),
      "이 사이트의 users.id 를 보내고 있다 — 저쪽이 사람을 못 찾아 403 이 된다",
    );
  });

  test("🔴 포털 번호가 비어 있으면 **보내기 전에** 가른다", () => {
    const guard = body.indexOf('requesterSub === ""');
    const call = body.indexOf("setAsDomesticOrderCompletion");
    assert.notEqual(guard, -1, "빈 포털 번호를 가르지 않는다");
    assert.ok(guard < call, "보낸 뒤에 가르고 있다");
    assert.ok(body.includes("NO_PORTAL_SUBJECT_MESSAGE"), "사람에게 할 말이 없다");
  });

  test("🔴 못 닿았을 때도 사람이 읽을 수 있는 말을 돌려준다", () => {
    assert.ok(body.includes("asCompletionUnreachableMessage"), "까닭을 사람 말로 바꾸지 않는다");
    assert.ok(body.includes('code: "AS_UNREACHABLE"'), "업무 거절과 같은 코드로 뭉개고 있다");
  });
});

describe("🔴 화면 — 코드로 가르고, 읽어야 닫히는 알림을 쓴다", () => {
  const code = codeOnly(screen);

  test("막힘은 **코드**로 가른다 — message 글자를 비교하지 않는다", () => {
    assert.ok(code.includes('result.code === "SHIPMENT_COMPLETION_BLOCKED"'), "코드로 가르지 않는다");
    assert.ok(
      !/result\.message\s*===/.test(code),
      "message 글자를 비교하고 있다 — 막히는 까닭마다 문장이 다르다",
    );
  });

  test("🔴 막혔을 때는 NoticePopup 이다 — showSavePopup 은 성공 전용이다", () => {
    const flatCode = flat(code);
    assert.ok(flatCode.includes("<NoticePopup title=\"완료 처리를 하지 못했습니다\""), "완료 처리 쪽 알림이 없다");
    assert.ok(flatCode.includes("<NoticePopup title=\"완료 해제를 하지 못했습니다\""), "완료 해제 쪽 알림이 없다");
    assert.ok(
      !/setShipmentBlockedReason[\s\S]{0,400}showSavePopup/.test(code),
      "막힘을 저장 팝업으로 띄우고 있다",
    );
  });

  test("🔴 브라우저 기본 창을 쓰지 않는다", () => {
    for (const banned of ["confirm(", "alert(", "window.confirm", "window.alert"]) {
      assert.ok(!code.includes(banned), `${banned} 을(를) 쓰고 있다`);
    }
  });

  test("🔴 알림과 확인 창은 표 칸(`<td>`) **밖**에서 그린다", () => {
    // 칸의 정렬 CSS(nowrap · text-right)를 물려받으면 글이 한쪽으로 쏠린다.
    // 🔵 목록 화면 **그 함수 안에서** 잰다 — 이 파일에는 휴지통 칸처럼 먼저 나오는
    //    다른 조각의 표도 있어서, 파일 전체의 첫 `<td` 로 재면 뜻이 달라진다.
    const main = functionBody(code, "DomesticOrderListScreen");
    const firstCell = main.indexOf("<td");
    assert.notEqual(firstCell, -1, "목록 화면에 표가 없다");
    for (const tag of ["<NoticePopup", "<DomesticOrderCompletionReleaseDialog"]) {
      const at = main.indexOf(tag);
      assert.notEqual(at, -1, `${tag} 이(가) 없다`);
      assert.ok(at < firstCell, `${tag} 이(가) 표 안에서 그려진다`);
    }
    const toggle = functionBody(code, "CompletionToggle");
    assert.ok(!toggle.includes("<NoticePopup"), "단추 안에서 알림을 그린다");
    assert.ok(!toggle.includes("<DomesticOrderCompletionReleaseDialog"), "단추 안에서 확인 창을 그린다");
  });
});

describe("🔴 [완료 해제]는 한 번의 클릭으로 되지 않는다", () => {
  const code = codeOnly(screen);
  const toggle = functionBody(code, "CompletionToggle");

  test("단추는 창을 열 뿐 아무것도 보내지 않는다", () => {
    assert.ok(toggle.includes("onRequestRelease(row)"), "확인 창을 열지 않는다");
    const ask = toggle.indexOf("onRequestRelease(row)");
    const send = toggle.indexOf("setDomesticOrderCompletionAction");
    assert.ok(ask < send, "묻기 전에 보내고 있다");
    assert.ok(flat(toggle).includes("completed: true,"), "단추가 해제까지 보내고 있다");
    assert.ok(!flat(toggle).includes("completed: !completed"), "단추가 양쪽을 모두 보내고 있다");
  });

  test("실제 요청은 확인 창을 가진 쪽이 보낸다", () => {
    assert.ok(code.includes("async function releaseCompletion()"), "해제를 보내는 자리가 없다");
    assert.ok(flat(code).includes("completed: false,"), "해제를 보내지 않는다");
  });

  test("전송 중에는 창이 닫히지 않는다", () => {
    assert.ok(flat(code).includes("if (!isReleasing) setReleaseTarget(null)"), "전송 중에도 닫힌다");
  });

  test("🔴 [완료 **처리**]에는 확인 창을 달지 않는다", () => {
    // 창을 여는 길은 `completed` 인 줄 하나뿐이다.
    assert.equal((toggle.match(/onRequestRelease\(/g) ?? []).length, 1);
    assert.ok(/if \(completed\) \{[\s\S]{0,200}onRequestRelease\(row\)/.test(toggle));
  });
});

describe("성공 문구가 두 갈래다 — 수리 건까지 움직였는가", () => {
  const flatCode = flat(codeOnly(screen));

  test("완료 처리", () => {
    assert.ok(flatCode.includes("result.repairCaseShipmentCompleted ? \"완료로 표시하고, 연결된 수리 건도 출하 완료로 처리했습니다.\" : \"완료로 표시했습니다.\""));
  });

  test("완료 해제", () => {
    assert.ok(flatCode.includes("result.repairCaseShipmentReverted ? \"완료 표시를 풀고, 연결된 수리 건의 출하 완료도 되돌렸습니다.\" : \"완료 표시를 풀었습니다.\""));
  });
});

describe("🔴 확인 창이 말해야 하는 것", () => {
  test("수리 건이 붙은 줄에서는 **함께 되돌아간다**고 말한다", () => {
    const flatDialog = flat(dialog);
    assert.ok(flatDialog.includes("그 출하 완료도 함께 되돌립니다"));
    assert.ok(flatDialog.includes("되돌린 건을 다시 출하 완료로 넘기려면 수리 검수 승인부터 다시 받아야 합니다."));
  });

  test("붙지 않은 줄에서는 이 줄만 풀린다고 말한다 — 일어나지 않을 일을 경고하지 않는다", () => {
    assert.ok(flat(dialog).includes("이 줄에는 연결된 수리 건이 없어 내자 정리의 완료 표시만 풀립니다."));
  });

  test("🔴 창이 제 상태를 갖지 않는다 — 열림 여부·전송 중은 부모의 것이다", () => {
    assert.ok(!codeOnly(dialog).includes("useState"), "창이 제 상태를 들고 있다");
  });
});

/* ------------------------------------------------------------------------ */

describe("🔴 쓰기 토큰을 읽는 자리는 통로 하나뿐이다", () => {
  /** `src` 아래 모든 소스 파일, 저장소 뿌리 기준 슬래시 경로로. */
  function walk(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, found);
      else if (/\.tsx?$/.test(entry)) found.push(full);
    }
    return found;
  }

  test("AS_WRITE_TOKEN 은 as-gateway.ts 에만 있다", () => {
    const root = fileURLToPath(repoUrl);
    const srcDir = path.join(root, "src");
    // 🔵 시험 파일은 뺀다 — 환경변수를 **갈아 끼우는** 자리라 읽는 자리가 아니다
    //    (이 파일도 그 낱말을 적고 있어 빼지 않으면 스스로에 걸린다).
    const hits = walk(srcDir)
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => readFileSync(file, "utf8").includes("AS_WRITE_TOKEN"))
      .map((file) => path.relative(root, file).split(path.sep).join("/"))
      .sort();

    assert.deepEqual(hits, ["src/lib/server/as-gateway.ts"], hits.join(" / "));
  });
});
