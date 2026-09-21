/**
 * ============================================================================
 * 🔴 여기 있는 것은 **타입 하나**뿐이다 — 훅은 오지 않았다
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일에는 수리 건 구간 편집 폼 셋이 함께 쓰는 훅
 * (`useSectionEditSubmit`)이 있고, 그 훅은 `server/actions/update-repair-case.ts`
 * 와 `validation/repair-case-update-input.ts` 를 부른다. 그 둘은 **수리 건 상세
 * 화면의 것**이고 이 사이트에는 오지 않는다 — 끌고 오면 수리 건 수정 경로가
 * 통째로 딸려 와서, 이 저장소에 「아무도 열 수 없는 화면의 저장 액션」이 남는다.
 *
 * 내자 정리가 이 파일에서 실제로 쓰는 것은 **충돌 오류의 모양 하나**다
 * (DomesticOrderEditForm · DomesticOrderTextCell · DomesticOrderDueDatesCell ·
 * EditSectionActions 가 `type SectionEditConflictError` 만 가져간다).
 *
 * 🔴 **파일 이름과 경로를 A/S 와 똑같이 둔다.** 그래야 옮겨 온 네 파일의 import
 * 줄을 한 글자도 고치지 않아도 되고, 조각 4 에서 저쪽을 걷어낼 때 두 벌을 글자로
 * 대조할 수 있다(globals.css 의 `@custom-variant dark` 와 같은 판단).
 *
 * 🔴 아래 타입의 모양을 A/S 와 다르게 고치지 마라 — 같은 화면이 두 저장소에
 * 있는 동안(조각 4 전까지) 한쪽만 바뀌면 옮겨 심을 때 조용히 어긋난다.
 * ============================================================================
 */

/**
 * 충돌일 때의 오류 모양 — 메시지에 더해 **사용자가 방금 적어 둔 글**을 함께
 * 나른다. 평상시 오류는 지금까지처럼 메시지 문자열 하나다.
 *
 * 이 값을 EditSectionActions까지 전달하는 통로가 submitError인 이유: 편집 폼
 * 셋(과 상단 카드의 두 셀)은 submitError를 받아서 EditSectionActions에 그대로
 * 넘기기만 한다. 그래서 이 모양만 넓히면 폼을 하나도 고치지 않고 화면까지
 * 닿는다.
 */
export type SectionEditConflictError = {
  message: string;
  /** 보여 줄 자유 입력 내용. 보여 줄 것이 없으면 빈 문자열이다. */
  draftText: string;
};
