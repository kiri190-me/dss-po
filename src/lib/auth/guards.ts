/**
 * 권한 판정은 여기서만 한다.
 *
 * 클라이언트가 보낸 사용자 ID·역할은 절대 믿지 않는다.
 * 폼 필드·쿼리스트링·요청 본문에 담겨 온 값으로 권한을 판정하지 않는다.
 * 화면에서 버튼을 숨기는 것은 UI 편의일 뿐이고, 실제 차단은 반드시 서버에서 한다.
 *
 * 🔴 지금 여기 있는 것은 **로그인 여부**뿐이다. 「이 사람이 내자를 고칠 수
 *    있는가」 같은 기능별 판정은 A/S 와 같은 role_permissions 표를 읽어야 하고
 *    (vendor/dss-core 의 role-permissions.ts), 그 규칙은 화면을 옮겨 오는
 *    조각에서 그 화면과 **함께** 가져온다. 미리 흉내 낸 역할 검사를 여기
 *    두지 않는 이유가 그것이다 — A/S 의 판정과 어긋난 것이 하나라도 남으면
 *    두 사이트가 같은 자료에 다른 대답을 하게 된다(설계서 G절 조각 1~3).
 */
import { redirect } from "next/navigation";

import { RETURN_TO_FALLBACK, safeReturnTo } from "./return-to";
import type { PoUser } from "./session";
import { getSessionUser } from "./session";

/**
 * 로그인 후 돌아갈 주소의 판정은 auth/return-to.ts 한 곳이 갖는다.
 *
 * 이 파일이 갖지 않는 이유: 그 판정은 import 가 하나도 없는 순수 함수여야
 * 시험할 수 있는데, 이 파일은 next/navigation 과 세션(→ DB)을 끌고 온다.
 * 여기서 다시 내보내는 것은 부르는 쪽(로그인 통로·로그인 화면)이 「로그인
 * 문지기」 한 곳만 알면 되게 하려는 것이다.
 */
export { RETURN_TO_FALLBACK, RETURN_TO_MAX_LENGTH, safeReturnTo } from "./return-to";

/**
 * 로그인 필수. 없으면 포털로 곧장 보낸다.
 *
 * `/login` 화면을 거치지 않는 이유: 이 사이트에는 자체 로그인이 없어서 그
 * 화면에 있는 것이라고는 "포털로 가세요" 버튼 하나뿐이다. 포털 앱 런처에서
 * 타일을 눌러 들어온 사람은 방금 포털에서 왔는데 포털로 가라는 화면을 다시
 * 보게 되고, 그 버튼을 눌러도 이미 로그인된 포털을 그대로 통과해 돌아온다.
 * 아무것도 묻지 않는 화면이라면 보여줄 이유가 없다.
 *
 * `/login` 은 남는다 — 로그인이 **거절됐을 때** 이유를 보여줄 자리가 필요하고,
 * 거기서는 자동으로 다시 보내지 않는다(그러면 무한 왕복이 된다).
 */
export async function requireSession(returnTo?: string): Promise<PoUser> {
  const user = await getSessionUser();
  if (!user) {
    // 🔴 여기까지 온 값은 무엇이든 safeReturnTo 를 거친다. 부르는 쪽이 주소를
    // 어디서 얻었든(화면·알림 링크·손으로 친 주소) 믿지 않는다.
    const target = safeReturnTo(returnTo);
    redirect(
      target === RETURN_TO_FALLBACK
        ? "/api/auth/sso/start"
        : `/api/auth/sso/start?returnTo=${encodeURIComponent(target)}`,
    );
  }
  return user;
}
