import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import DomesticOrderCompletionReleaseDialog from "./DomesticOrderCompletionReleaseDialog";

/**
 * ============================================================================
 * [완료 해제] 확인 창 — **실제로 그려 보고 글자로 잰다** (2026-10-18)
 * ============================================================================
 * 🔴 이 창이 있는 이유는 **한 번의 클릭으로 해제되지 않게** 하는 것이다(사용자 요청).
 * 해제는 그 줄에 붙은 수리 건의 **출하 완료까지 되돌리는** 조작이고, 되돌린 건을 다시
 * 출하 완료로 넘기려면 **수리 검수 승인부터 다시** 받아야 한다 — 그 두 가지가 창에
 * 적혀 있지 않으면 창을 띄운 보람이 없다.
 *
 * 🔵 창은 **붙었든 아니든 언제나 뜬다.** 다만 붙지 않은 줄에서 「수리 건도 되돌아간다」고
 * 겁주지 않는다 — 일어나지 않을 일을 경고하면 다음부터 그 경고를 안 읽는다.
 *
 * `showModal()` 은 효과(useEffect)에서 부르므로 정적 렌더에서는 돌지 않는다. 여기서
 * 재는 것은 **무슨 글자가 어떤 조건에 서는가**다.
 * ============================================================================
 */

const INTAKE = "D950101-01";

function render(props: Partial<Parameters<typeof DomesticOrderCompletionReleaseDialog>[0]> = {}) {
  return renderToStaticMarkup(
    <DomesticOrderCompletionReleaseDialog
      isOpen
      intakeNumber={INTAKE}
      hasLinkedRepairCase
      isSubmitting={false}
      onConfirm={() => {}}
      onCancel={() => {}}
      {...props}
    />
  );
}

describe("수리 건이 붙은 줄", () => {
  const html = render();

  test("🔴 출하 완료도 함께 되돌린다고 말한다", () => {
    assert.ok(html.includes("그 출하 완료도 함께 되돌립니다"), html);
    assert.ok(html.includes("실제 출하일이 지워집니다"), html);
  });

  test("🔴 다시 넘기려면 수리 검수 승인부터 다시 받아야 한다고 말한다", () => {
    assert.ok(html.includes("되돌린 건을 다시 출하 완료로 넘기려면 수리 검수 승인부터 다시 받아야 합니다."), html);
  });

  test("어느 줄인지 알아볼 단서를 준다", () => {
    assert.ok(html.includes(`연결된 수리 건: ${INTAKE}`), html);
  });

  test("인수번호가 없어도 빈 칸으로 두지 않는다", () => {
    assert.ok(render({ intakeNumber: null }).includes("연결된 수리 건: 인수번호 없음"));
  });
});

describe("수리 건이 붙지 않은 줄", () => {
  const html = render({ hasLinkedRepairCase: false, intakeNumber: null });

  test("이 줄만 풀린다고 말한다", () => {
    assert.ok(html.includes("이 줄에는 연결된 수리 건이 없어 내자 정리의 완료 표시만 풀립니다."), html);
  });

  test("🔴 일어나지 않을 일을 경고하지 않는다", () => {
    assert.ok(!html.includes("함께 되돌립니다"), html);
    assert.ok(!html.includes("수리 검수 승인"), html);
  });
});

describe("단추", () => {
  test("[취소]와 [완료 해제] 둘뿐이다 — 주 단추의 글자가 그 일을 말한다", () => {
    const html = render();
    assert.ok(html.includes(">취소</button>"), html);
    assert.ok(html.includes(">완료 해제</button>"), html);
  });

  test("🔴 전송 중에는 둘 다 눌리지 않고, 주 단추가 그 사실을 말한다", () => {
    const html = render({ isSubmitting: true });
    assert.equal((html.match(/disabled=""/g) ?? []).length, 2, html);
    assert.ok(html.includes("해제 중..."), html);
    assert.ok(html.includes('aria-busy="true"'), html);
  });
});

describe("제목", () => {
  test("무엇을 묻는지 한 줄로 말한다", () => {
    assert.ok(render().includes("이 줄의 완료 표시를 풀까요?"));
  });
});
