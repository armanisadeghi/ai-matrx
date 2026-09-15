/**
 * Small, synchronous identity receipt storage for sandbox lifecycle work.
 * This is not server truth: it only lets the same authenticated actor reconnect
 * or retry the exact immutable operation after a reload.
 */
export type SandboxOperationKind = "stop" | "delete";
export type SandboxOperationObservation = "prepared" | "dispatched" | "accepted";

export interface SandboxOperationReceipt {
  schema_version: 1;
  row_id: string;
  operation_id: string;
  kind: SandboxOperationKind;
  /** Omitted legacy receipts are graceful by contract. */
  graceful?: boolean;
  observation: SandboxOperationObservation;
}

export interface ReceiptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

const PREFIX = "matrx.sandbox-operation.v1:auth:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function sandboxOperationReceiptKey(actorId: string, receipt: Pick<SandboxOperationReceipt, "row_id" | "operation_id">): string | null {
  if (!isUuid(actorId) || !isUuid(receipt.row_id) || !isUuid(receipt.operation_id)) return null;
  return `${PREFIX}${actorId}:${receipt.row_id}:${receipt.operation_id}`;
}

export function parseSandboxOperationReceipt(raw: string | null): SandboxOperationReceipt | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const receipt = value as Partial<SandboxOperationReceipt>;
    if (receipt.schema_version !== 1 || !isUuid(receipt.row_id) || !isUuid(receipt.operation_id)) return null;
    if (receipt.kind !== "stop" && receipt.kind !== "delete") return null;
    if (receipt.observation !== "prepared" && receipt.observation !== "dispatched" && receipt.observation !== "accepted") return null;
    return { ...receipt, graceful: receipt.graceful ?? true } as SandboxOperationReceipt;
  } catch {
    return null;
  }
}

/** Writes and immediately reads back the immutable receipt. */
export function writeSandboxOperationReceipt(storage: ReceiptStorage, actorId: string, receipt: SandboxOperationReceipt): boolean {
  const key = sandboxOperationReceiptKey(actorId, receipt);
  if (!key || !parseSandboxOperationReceipt(JSON.stringify(receipt))) return false;
  try {
    const existing = parseSandboxOperationReceipt(storage.getItem(key));
    // Observation advances, but the operation identity never does. In
    // particular, stop and delete must not be interchangeable at one key.
    if (existing && (existing.row_id !== receipt.row_id || existing.operation_id !== receipt.operation_id || existing.kind !== receipt.kind || (existing.graceful ?? true) !== (receipt.graceful ?? true))) return false;
    const encoded = JSON.stringify(receipt);
    storage.setItem(key, encoded);
    const readback = parseSandboxOperationReceipt(storage.getItem(key));
    return readback?.row_id === receipt.row_id && readback.operation_id === receipt.operation_id && readback.kind === receipt.kind && (readback.graceful ?? true) === (receipt.graceful ?? true) && readback.observation === receipt.observation;
  } catch {
    return false;
  }
}

/** Reads only the current actor namespace; no global storage enumeration leaks another actor's receipt. */
export function readSandboxOperationReceipts(storage: ReceiptStorage, actorId: string): SandboxOperationReceipt[] {
  if (!isUuid(actorId)) return [];
  const prefix = `${PREFIX}${actorId}:`;
  const receipts: SandboxOperationReceipt[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const receipt = parseSandboxOperationReceipt(storage.getItem(key));
    if (receipt && sandboxOperationReceiptKey(actorId, receipt) === key) receipts.push(receipt);
  }
  return receipts;
}
