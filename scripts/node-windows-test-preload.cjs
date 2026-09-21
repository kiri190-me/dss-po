// Node 24 가 Windows 에서 메모리 압박이 높을 때 uv_os_get_passwd 를 ENOMEM 으로
// 실패시키는 일이 있다. tsx 는 사용자별 캐시 폴더 이름을 지을 때만 그 값을 쓰므로,
// 안정적인 값을 하나 끼워 넣어 우회한다.
//
// 🔴 시험 도구 안에만 둔다. 앱 코드는 이 파일을 싣지 않는다 — 운영에서 프로세스
//    사용자를 0 으로 보이게 하는 것은 이 우회가 노리는 바가 아니다.
//
// NODE_OPTIONS 에 제 자신을 다시 넣는 까닭: 시험이 띄우는 **자식 프로세스**도 같은
// 우회가 필요하기 때문이다(자식은 부모의 --require 를 물려받지 않는다).
//
// 본보기: RF_Service_System/scripts/node-windows-test-preload.cjs — 같은 Windows ·
// 같은 Node 24 · 같은 tsx 라 글자 그대로 가져왔다.
if (process.platform === "win32" && typeof process.geteuid !== "function") {
  Object.defineProperty(process, "geteuid", {
    configurable: true,
    value: () => 0,
  });

  const preloadOption = `--require=${JSON.stringify(__filename)}`;
  const existingOptions = process.env.NODE_OPTIONS?.trim();
  if (!existingOptions?.includes(__filename)) {
    process.env.NODE_OPTIONS = existingOptions
      ? `${existingOptions} ${preloadOption}`
      : preloadOption;
  }
}
