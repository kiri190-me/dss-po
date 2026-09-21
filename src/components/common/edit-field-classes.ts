/**
 * 편집 칸의 생김새 — 라벨 · 입력칸 · 오류 한 줄.
 *
 * 🔴 **A/S 관리 시스템의 `components/repair-cases/detail/edit/EditSectionActions.tsx`
 * 에서 이 세 상수만 떼어 왔다.** 그 파일은 이름이 repair-case 지만 실제로는
 * 작업 비용 화면과 견적서 폼이 **이 세 줄 때문에** 그것을 import 하고 있다
 * (설계서 PO_DOMESTIC_SPLIT_DESIGN.md F절의 「이름으로는 못 찾는 것들」).
 *
 * 그 파일의 나머지(저장·취소 단추 한 줄, 충돌 뒤 「지금 적어 두신 내용」 상자)는
 * **수리 건 구간 편집 전용**이고 `useSectionEditSubmit` 을 끌고 온다 — 이 사이트에
 * 없는 화면의 장치다. 그래서 파일째 베끼지 않고 세 줄만 가져와 이름을 사실대로 달았다.
 *
 * 🔴 **글자는 A/S 와 한 글자도 다르지 않다.** 옮겨 온 화면이 저쪽과 똑같이
 * 보여야 한다는 것이 이 조각의 조건이다(설계서 A절 — UI/UX 를 그대로 유지).
 */
export const editInputClass =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
export const editLabelClass = "text-xs text-zinc-500 dark:text-zinc-400";
export const editErrorClass = "mt-1 text-xs text-red-600 dark:text-red-400";
