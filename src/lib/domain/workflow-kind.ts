/**
 * 장비의 **종류** — 매쳐 · 제너레이터 · Total Controller.
 *
 * 🔴 A/S 관리 시스템의 `lib/domain/workflow-kind.ts` 에서 **종류 축만** 떼어 왔다.
 * 그 파일에는 종류와 유·무상으로 `workflow_type` 을 만드는 함수
 * (`workflowKindOf` · `deriveWorkflowType`)가 함께 있는데, 그것은 **A/S 접수와 수리
 * 건 상세**의 일이고 이 사이트에는 그 화면이 없다. 가져오면 `domain/types.ts`
 * (405줄의 워크플로 타입 사전)가 통째로 딸려 온다.
 *
 * 🔴 **값은 DB 의 `workflow_kind` 축 그대로다.** `repair_labor_settings` ·
 * `repair_task_catalog` · `power_test_tasks` 의 `equipment_kind` 가 이 값을 쓴다
 * (vendor/dss-core 의 repair-labor.ts). 여기서 글자를 바꾸면 저장이 DB 에서 터진다.
 *
 * 2026-08-19: 유·무상이 붙지 않은 레거시 workflowType "MATCHER"(Matcher (기존
 * 이력))가 없어지면서, 매쳐도 제너레이터·Total Controller 와 완전히 같은 규칙이
 * 되었다 — 종류에 유·무상을 붙여 workflowType 을 만든다. 종류 축의 "MATCHER" 는
 * 그대로다(그것이 곧 "매쳐"라는 종류이며, 없어진 것은 workflowType 쪽이다).
 */
export const WORKFLOW_KIND_CODES = ["MATCHER", "GENERATOR", "TOTAL_CONTROLLER"] as const;
export type WorkflowKind = (typeof WORKFLOW_KIND_CODES)[number];

export const workflowKindLabels: Record<WorkflowKind, string> = {
  MATCHER: "매쳐",
  GENERATOR: "제너레이터",
  TOTAL_CONTROLLER: "Total Controller (T/C)",
};
