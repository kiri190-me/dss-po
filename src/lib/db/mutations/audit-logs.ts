import { auditLogs } from "@dss/core/schema";
import { db } from "@/lib/db";

// A/S 관리 시스템의 같은 이름 파일에서 그대로 가져왔다. 🔴 **감사 표는 두 사이트가
// 함께 쓴다** — 같은 dss_as 의 `audit_logs` 한 표다(설계서 D절). 이 사이트에서 남긴
// 줄도 A/S 의 감사 화면에서 그대로 보인다. 그래야 "작업 비용을 누가 언제 바꿨나"에
// 답하는 자리가 하나로 남는다.
//
// 저쪽과 마찬가지로 "server-only" 를 여기 붙이지 않는다 — 이 파일은 언제나 이미
// server-only 인 mutation 파일 안에서만 불리고, 그 사슬 어딘가에 그 표시가 있으면
// 브라우저 묶음으로 새지 않는다.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * General-purpose insert for the append-only audit_logs table
 * (DATABASE_DESIGN.md §9). `actorUserId: null` is how a system-initiated
 * action (no human actor — e.g. the automatic flowchart-purge sweep) is
 * represented; never a fake/placeholder user row. Takes an already-open
 * transaction — this table is always written inside the same transaction
 * as the action it's recording, never as a separate follow-up write.
 */
export async function insertAuditLog(
  tx: Tx,
  row: {
    actorUserId: string | null;
    actionType:
      | "LOGIN"
      | "CREATE"
      | "UPDATE"
      | "SOFT_DELETE"
      | "RESTORE"
      | "STATUS_CHANGE"
      | "FILE_UPLOAD"
      | "FILE_DOWNLOAD"
      | "FILE_DELETE"
      | "EXCEL_IMPORT"
      | "EXCEL_EXPORT"
      | "APPROVE"
      | "APPROVAL_CANCEL"
      | "ACCOUNT_LOCK"
      | "ACCOUNT_DEACTIVATE"
      | "PURGE";
    targetEntity: string;
    targetRecordId: string;
    previousValue?: unknown;
    newValue?: unknown;
    sessionId?: string | null;
    sourceIp?: string | null;
  }
): Promise<void> {
  await tx.insert(auditLogs).values({
    actorUserId: row.actorUserId,
    actionType: row.actionType,
    targetEntity: row.targetEntity,
    targetRecordId: row.targetRecordId,
    previousValue: row.previousValue ?? null,
    newValue: row.newValue ?? null,
    sessionId: row.sessionId ?? null,
    sourceIp: row.sourceIp ?? null,
  });
}
