import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { AttachmentPathError } from "@/lib/domain/attachment-path";
import {
  createLocalFileSystemStorageAdapter,
  getAttachmentStorage,
  resolveUploadsRoot,
} from "@/lib/storage/local-fs-adapter";
import { AttachmentNotStoredError, type StorageAdapter } from "@/lib/storage/storage-adapter";

/**
 * ============================================================================
 * 🔴 저장소에서 **읽는 쪽**만 — 견적서 받기가 파일에 닿는 유일한 길 (조각 3d-2)
 * ============================================================================
 * `local-fs-adapter.ts` 는 A/S 에서 **통째로** 가져왔다(쓰기 쪽도 함께). 그런데 저쪽에는
 * 이 파일의 단위 시험이 없다 — 붙이기 · 내려받기 통로를 실제 DB 와 디스크로 도는 통합
 * 시험이 대신 덮고 있고, 그 통합 시험은 **이 사이트에 아직 없다**(붙이는 칸이 3d-3 ·
 * 3d-4 것이다). 그래서 **읽는 쪽만 여기서 새로 잰다.**
 *
 * ── 🔴 무엇을 잡는 장치인가 ─────────────────────────────────────────────
 * 이 조각이 새로 만든 위험은 「**요청이 디스크의 파일을 연다**」 하나다. 그 길에서
 * 틀릴 수 있는 것이 셋이고, 셋을 그대로 잰다:
 *
 *   ① 붙어 있는 파일을 **그대로** 돌려주는가        → 바이트가 같은가
 *   ② 저장 루트 **밖**을 가리키는 값을 막는가        → DB 행을 그대로 믿지 않는다
 *   ③ 없는 파일을 **조용히 빈 것으로** 주지 않는가   → 던져야 한다
 *
 * 그리고 `UPLOADS_DIR` — 이 값이 없거나 엉뚱하면 **받기가 통째로 실패한다.** 없으면
 * 조용한 기본값으로 넘어가지 않고 던지는지를 마지막 묶음이 본다. 🔴 그것이 「설정이
 * 빠진 환경에서 한동안 잘 돌다가 배포 뒤에야 드러나는」 길을 막는 유일한 장치다.
 *
 * ── 임시 폴더는 반드시 치운다 ───────────────────────────────────────────
 * `after` 가 만든 폴더를 통째로 지운다. 남기면 시험을 돌릴 때마다 OS 임시 폴더에
 * 찌꺼기가 쌓이고, 다음 사람이 그것을 실제 첨부로 오해한다.
 *
 * 🔴 **쓰는 쪽(writeTemp · commit · discard · sweepTemp)은 재지 않는다.** 부르는 곳이
 * 아직 없다 — 붙이기(3d-3)가 오는 날 그 조각이 제 시험을 들고 온다.
 * ============================================================================
 */

/** 저장 경로 규칙(attachment-path.ts)을 지키는 값 — 소문자 · `/` 뿐 · 알려진 첫 마디. */
const QUOTE_ID = "7d3f0c1e-0000-4000-8000-000000000001";
const ATTACHMENT_ID = "7d3f0c1e-0000-4000-8000-0000000000a2";
const STORED_PATH = `quotes/${QUOTE_ID}/${ATTACHMENT_ID}.xlsx`;

/** 엑셀 파일의 앞머리 — 실제로 내려가는 것이 `PK\x03\x04` 로 시작하는 바이트다. */
const CONTENT = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0xff, 0x00, 0x41]);

let root = "";
let outsideFile = "";
let storage: StorageAdapter;
const originalUploadsDir = process.env.UPLOADS_DIR;

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

describe("로컬 디스크 저장소 — 읽는 쪽", () => {
  before(async () => {
    // mkdtemp 가 만든 자리 **안에** 루트를 둔다 — 치울 때 형제 파일까지 한 번에 지운다.
    const workspace = await mkdtemp(path.join(tmpdir(), "dss-po-uploads-"));
    root = path.join(workspace, "uploads");
    await mkdir(path.join(root, "quotes", QUOTE_ID), { recursive: true });
    await writeFile(path.join(root, STORED_PATH), CONTENT);

    // 🔴 루트 **밖**에 실제로 존재하는 파일. ② 가 「없어서 막힌 것」이 아님을 보인다.
    outsideFile = path.join(workspace, "outside.xlsx");
    await writeFile(outsideFile, Buffer.from("남의 파일"));

    storage = createLocalFileSystemStorageAdapter(root);
  });

  after(async () => {
    // 🔴 임시 폴더를 반드시 치운다(위 머리말).
    if (root) await rm(path.dirname(root), { recursive: true, force: true });
    if (originalUploadsDir === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = originalUploadsDir;
  });

  test("① 붙어 있는 파일을 바이트 그대로 흘려보낸다 — 크기도 내용도 같다", async () => {
    const bytes = await readAll(await storage.read(STORED_PATH));
    assert.equal(bytes.byteLength, CONTENT.byteLength);
    assert.deepEqual(bytes, CONTENT, "내려간 바이트가 디스크의 파일과 다르다");
    assert.equal(await storage.exists(STORED_PATH), true);
  });

  test("② 🔴 저장 루트 밖을 가리키는 값은 읽지 않는다 — DB 행도 그대로 믿지 않는다", async () => {
    // 위 outsideFile 은 **실재한다.** 그런데도 아래 어느 모양으로도 열리지 않는다.
    for (const escape of [
      `quotes/${QUOTE_ID}/../../outside.xlsx`,
      "../outside.xlsx",
      "/etc/passwd",
      "c:/windows/win.ini",
      `quotes\\${QUOTE_ID}\\${ATTACHMENT_ID}.xlsx`,
      // 알려진 첫 마디가 아니다(repair-cases · product-models · quotes 셋뿐).
      `customers/${QUOTE_ID}/${ATTACHMENT_ID}.xlsx`,
      // 대문자가 섞이면 NAS(Linux)로 옮긴 뒤 그 파일만 안 열린다.
      `quotes/${QUOTE_ID.toUpperCase()}/${ATTACHMENT_ID}.xlsx`,
      "",
    ]) {
      await assert.rejects(
        () => storage.read(escape),
        (error: unknown) => error instanceof AttachmentPathError,
        `루트 밖(또는 규칙 밖) 경로를 열었다: ${escape || "(빈 값)"}`
      );
    }
    // 🔴 `exists` 도 같은 문을 쓴다 — 「있는지」만 알려 주는 구멍을 두지 않는다.
    await assert.rejects(() => storage.exists("../outside.xlsx"), AttachmentPathError);
  });

  test("③ 없는 파일은 던진다 — 조용히 빈 파일을 내려주지 않는다", async () => {
    const missing = `quotes/${QUOTE_ID}/7d3f0c1e-0000-4000-8000-0000000000b3.xlsx`;
    assert.equal(await storage.exists(missing), false);
    await assert.rejects(
      () => storage.read(missing),
      (error: unknown) => error instanceof AttachmentNotStoredError,
      "없는 파일인데 다른 오류이거나 통과했다"
    );
  });

  test("🔴 UPLOADS_DIR 이 없으면 던진다 — 조용한 기본값으로 넘어가지 않는다", () => {
    delete process.env.UPLOADS_DIR;
    assert.throws(() => resolveUploadsRoot(), /UPLOADS_DIR/);
    assert.throws(() => getAttachmentStorage(), /UPLOADS_DIR/);

    process.env.UPLOADS_DIR = "   ";
    assert.throws(() => resolveUploadsRoot(), /UPLOADS_DIR/, "공백만 적힌 값을 받아들인다");
  });

  test("🔴 UPLOADS_DIR 을 부르는 시점에 읽고, 그 루트의 파일을 연다", async () => {
    process.env.UPLOADS_DIR = root;
    // 절대 경로로 눕힌다 — 상대 경로로 적어도 프로세스의 현재 폴더에 휘둘리지 않는다.
    assert.equal(resolveUploadsRoot(), path.resolve(root));

    // 🔴 업무 코드가 쓰는 길(getAttachmentStorage)로도 같은 파일이 열린다. 받기 통로가
    //    엉뚱한 루트를 보고 있으면 여기서 드러난다.
    const bytes = await readAll(await getAttachmentStorage().read(STORED_PATH));
    assert.deepEqual(bytes, CONTENT);
  });
});
