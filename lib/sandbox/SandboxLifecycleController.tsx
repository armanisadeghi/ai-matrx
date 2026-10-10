"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { applyView, dismissView, type SandboxLifecycleView } from "@/lib/redux/slices/sandboxLifecycleSlice";
import { classifyDurableSandboxLifecycleResponse, createSandboxLifecycleOperationAdapter, type DurableLifecycleResult, type SandboxLifecycleOperationAdapter } from "@/lib/sandbox/lifecycle-operation";
import type { SandboxOperationReceipt } from "@/lib/durable-run/sandbox-operation-receipt";
import { notifyComputeTargetsChanged } from "@/hooks/sandbox/use-compute-targets";

const MAX_TRANSPORT_FAILURES = 3;
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;
const MAX_PENDING_POLLS = 23; // 1+2+4+8 then 19×15 seconds: five visible minutes.

function isTerminalState(state: SandboxLifecycleView["state"]): boolean {
  return state === "success" || state === "failure" || state === "refused";
}

function receiptIdentity(receipt: SandboxOperationReceipt): string {
  return `${receipt.row_id}:${receipt.operation_id}:${receipt.kind}:${receipt.graceful ?? true}`;
}

export type LifecycleControllerEnvironment = {
  visible: () => boolean;
  online: () => boolean;
  addEventListener: (name: "focus" | "online" | "visibilitychange", listener: () => void) => void;
  removeEventListener: (name: "focus" | "online" | "visibilitychange", listener: () => void) => void;
};

const browserEnvironment: LifecycleControllerEnvironment = {
  visible: () => document.visibilityState === "visible",
  online: () => navigator.onLine,
  addEventListener: (name, listener) => window.addEventListener(name, listener),
  removeEventListener: (name, listener) => window.removeEventListener(name, listener),
};


/**
 * THE RECEIPT IS NOT THE ONLY WITNESS. The orchestrator's operation receipt can be unreadable
 * (404 after it ages out, a 502 through the proxy, a dropped poll) while the box itself did stop —
 * and "Could not confirm … check status" then contradicts what the person can see. The sandbox row
 * is the second witness: `stopped` or `shutting_down` means the stop took.
 */
const STOP_CONFIRMED_STATUSES = new Set(["stopped", "shutting_down"]);
const CONFIRM_STOP_ATTEMPTS = 6;
const CONFIRM_STOP_DELAY_MS = 2_000;

async function readInstanceStatusFromApi(rowId: string, signal?: AbortSignal): Promise<string | null> {
  const response = await fetch(`/api/sandbox/${rowId}`, { signal });
  if (!response.ok) return null;
  const body: unknown = await response.json();
  const status = (body as { instance?: { status?: unknown } } | null)?.instance?.status;
  return typeof status === "string" ? status : null;
}

/** One receipt gets one bounded observer. It never owns server work or retries POST on its own. */
export class SandboxLifecycleReceiptController {
  private stopped = false;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private pendingPolls = 0;
  private performing = false;
  private latestState: SandboxLifecycleView["state"] = "pending";
  private firstStatusResult = true;
  private latestSandboxId: string | null = null;

  constructor(private readonly options: {
    receipt: SandboxOperationReceipt;
    actorId: string;
    generation: number;
    isCurrent: () => boolean;
    adapter: SandboxLifecycleOperationAdapter;
    onView: (view: SandboxLifecycleView) => void;
    environment?: LifecycleControllerEnvironment;
    silenceInitialTerminal?: boolean;
    /** Reads the sandbox row's own status (default: GET /api/sandbox/<row>). Null = could not read. */
    readInstanceStatus?: (rowId: string, signal?: AbortSignal) => Promise<string | null>;
    /** Pause between instance-status reads while confirming a stop. */
    confirmDelayMs?: number;
  }) {}

  start(): void {
    const environment = this.options.environment ?? browserEnvironment;
    const resume = () => { if (!this.stopped && environment.visible() && environment.online()) void this.check(); };
    environment.addEventListener("focus", resume); environment.addEventListener("online", resume); environment.addEventListener("visibilitychange", resume);
    this.unsubscribe = () => { environment.removeEventListener("focus", resume); environment.removeEventListener("online", resume); environment.removeEventListener("visibilitychange", resume); };
    void this.check();
  }

  private unsubscribe: (() => void) | null = null;
  stop(): void { this.stopped = true; this.abort?.abort(); if (this.timer) clearTimeout(this.timer); this.timer = null; this.unsubscribe?.(); this.unsubscribe = null; }

  async check(manual = false): Promise<void> {
    const environment = this.options.environment ?? browserEnvironment;
    if (this.stopped || !this.options.isCurrent() || !environment.visible() || !environment.online()) return;
    if (this.performing) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (manual) this.pendingPolls = 0;
    this.performing = true; this.abort = new AbortController();
    try {
      const response = await this.options.adapter.status(this.options.receipt, this.abort.signal);
      if (this.stopped || !this.options.isCurrent()) return;
      // GET status is never a first admission: a conflict cannot prove refusal.
      const classified = await classifyDurableSandboxLifecycleResponse(response, { row_id: this.options.receipt.row_id, operation_id: this.options.receipt.operation_id, kind: this.options.receipt.kind, graceful: this.options.receipt.graceful ?? true, sandbox_id: "" }, true);
      if (this.stopped || !this.options.isCurrent()) return;
      const result = await this.confirmedOrUnknown(classified);
      if (this.stopped || !this.options.isCurrent()) return;
      this.failures = 0;
      this.latestState = result.state;
      this.latestSandboxId = result.sandbox_id ?? this.latestSandboxId;
      const terminal = isTerminalState(result.state);
      const silenceTerminal = this.firstStatusResult && this.options.silenceInitialTerminal === true && terminal;
      this.firstStatusResult = false;
      this.options.onView({ operation_id: this.options.receipt.operation_id, state: result.state, message: result.message, sandboxId: this.latestSandboxId, action: terminal ? null : result.state === "attention" ? "recover" : response.status === 404 ? "retry" : "check", dismissed: silenceTerminal });
      if (terminal) { this.stop(); return; }
      if (result.state === "pending") this.schedule();
    } catch (error) {
      if (this.stopped || !this.options.isCurrent() || (error instanceof DOMException && error.name === "AbortError")) return;
      this.failures += 1;
      if (this.failures >= MAX_TRANSPORT_FAILURES) {
        if (await this.confirmStopFromInstance()) {
          if (this.stopped || !this.options.isCurrent()) return;
          this.latestState = "success";
          this.options.onView({ operation_id: this.options.receipt.operation_id, state: "success", message: "Stopped.", sandboxId: this.latestSandboxId, action: null, dismissed: false });
          this.stop();
          return;
        }
        if (this.stopped || !this.options.isCurrent()) return;
        this.options.onView({ operation_id: this.options.receipt.operation_id, state: "unknown", message: "Could not confirm this sandbox operation; check status.", sandboxId: null, action: "check", dismissed: false });
        return;
      }
      this.schedule();
    } finally { this.performing = false; }
  }


  /** True only when the sandbox row itself shows the stop took; false when it cannot be confirmed. */
  private async confirmStopFromInstance(): Promise<boolean> {
    if (this.options.receipt.kind !== "stop") return false;
    const read = this.options.readInstanceStatus ?? readInstanceStatusFromApi;
    const delay = this.options.confirmDelayMs ?? CONFIRM_STOP_DELAY_MS;
    for (let attempt = 0; attempt < CONFIRM_STOP_ATTEMPTS; attempt += 1) {
      if (this.stopped || !this.options.isCurrent()) return false;
      try {
        const status = await read(this.options.receipt.row_id, this.abort?.signal);
        if (status !== null && STOP_CONFIRMED_STATUSES.has(status)) return true;
      } catch {
        // A failed read is "not confirmed yet"; the loop is bounded and the warning stays honest.
      }
      if (attempt < CONFIRM_STOP_ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return false;
  }

  private async confirmedOrUnknown(result: DurableLifecycleResult): Promise<DurableLifecycleResult> {
    if (result.state !== "unknown" || !(await this.confirmStopFromInstance())) return result;
    return { state: "success", message: "Stopped.", sandbox_id: result.sandbox_id };
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.pendingPolls >= MAX_PENDING_POLLS) {
      this.options.onView({ operation_id: this.options.receipt.operation_id, state: "pending", message: "Still in progress; automatic status checks paused. Check status.", sandboxId: this.latestSandboxId, action: "check", dismissed: false });
      return;
    }
    const delay = BACKOFF_MS[Math.min(this.pendingPolls++, BACKOFF_MS.length - 1)];
    this.timer = setTimeout(() => { this.timer = null; void this.check(); }, delay);
  }

  async retry(): Promise<void> { await this.perform("admit"); }
  async recover(): Promise<void> { if (this.latestState === "attention") await this.perform("recover"); }
  private async perform(method: "admit" | "recover"): Promise<void> {
    if (this.stopped || !this.options.isCurrent() || this.performing) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.performing = true;
    this.abort?.abort(); this.abort = new AbortController();
    try {
      const response = await this.options.adapter[method](this.options.receipt, this.abort.signal);
      if (this.stopped || !this.options.isCurrent()) return;
      const classified = await classifyDurableSandboxLifecycleResponse(response, { row_id: this.options.receipt.row_id, operation_id: this.options.receipt.operation_id, kind: this.options.receipt.kind, graceful: this.options.receipt.graceful ?? true, sandbox_id: "" }, method === "admit" || this.options.receipt.observation !== "prepared");
      if (this.stopped || !this.options.isCurrent()) return;
      const result = await this.confirmedOrUnknown(classified);
      if (this.stopped || !this.options.isCurrent()) return;
      this.latestState = result.state;
      const terminal = isTerminalState(result.state);
      this.options.onView({ operation_id: this.options.receipt.operation_id, state: result.state, message: result.message, sandboxId: result.sandbox_id ?? null, action: terminal ? null : result.state === "attention" ? "recover" : result.state === "unknown" && method === "admit" ? "retry" : "check", dismissed: false });
      if (terminal) { this.stop(); return; }
      if (result.state === "pending") this.schedule();
    } catch {
      if (this.stopped || !this.options.isCurrent()) return;
      if (await this.confirmStopFromInstance()) {
        if (this.stopped || !this.options.isCurrent()) return;
        this.latestState = "success";
        this.options.onView({ operation_id: this.options.receipt.operation_id, state: "success", message: "Stopped.", sandboxId: null, action: null, dismissed: false });
        this.stop();
        return;
      }
      if (!this.stopped && this.options.isCurrent()) this.options.onView({ operation_id: this.options.receipt.operation_id, state: "unknown", message: "Could not confirm this sandbox operation; check status.", sandboxId: null, action: method === "admit" ? "retry" : "check", dismissed: false }); }
    finally { this.performing = false; }
  }
}

/**
 * Inactive until the owning sandbox surface mounts it. It only reconnects
 * validated receipts; old stop/delete callers remain deliberately untouched.
 */
export function SandboxLifecycleController() {
  const dispatch = useAppDispatch();
  const lifecycle = useAppSelector((state) => state.sandboxLifecycle);
  const current = useRef({ actorId: lifecycle.actorId, generation: lifecycle.generation });
  const controllers = useRef<Map<string, SandboxLifecycleReceiptController>>(new Map());
  const controllerReceiptKeys = useRef<Map<string, string>>(new Map());
  const toastIds = useRef<Map<string, string | number>>(new Map());
  const toastSignatures = useRef<Map<string, string>>(new Map());
  const notifiedTerminalSuccesses = useRef(new Set<string>());
  useEffect(() => { current.current = { actorId: lifecycle.actorId, generation: lifecycle.generation }; }, [lifecycle.actorId, lifecycle.generation]);

  // Actor generations own controller and notification identity. Receipt-list
  // updates reconcile below and must never reset unrelated observers.
  useEffect(() => {
    for (const controller of controllers.current.values()) controller.stop();
    controllers.current.clear();
    controllerReceiptKeys.current.clear();
    for (const id of toastIds.current.values()) toast.dismiss(id);
    toastIds.current.clear();
    toastSignatures.current.clear();
    notifiedTerminalSuccesses.current.clear();
    return () => {
      for (const controller of controllers.current.values()) controller.stop();
      controllers.current.clear();
      controllerReceiptKeys.current.clear();
      for (const id of toastIds.current.values()) toast.dismiss(id);
      toastIds.current.clear();
      toastSignatures.current.clear();
      notifiedTerminalSuccesses.current.clear();
    };
  }, [lifecycle.actorId, lifecycle.generation]);

  useEffect(() => {
    if (!lifecycle.actorId) return;
    const actorId = lifecycle.actorId; const generation = lifecycle.generation;
    const desired = new Map(lifecycle.receipts.map((receipt) => [receipt.operation_id, receipt]));
    for (const [operationId, controller] of controllers.current) {
      const next = desired.get(operationId);
      if (next && controllerReceiptKeys.current.get(operationId) === receiptIdentity(next)) continue;
      controller.stop();
      controllers.current.delete(operationId);
      controllerReceiptKeys.current.delete(operationId);
      const toastId = toastIds.current.get(operationId);
      if (toastId !== undefined) toast.dismiss(toastId);
      toastIds.current.delete(operationId);
      toastSignatures.current.delete(operationId);
    }
    for (const receipt of lifecycle.receipts) {
      if (controllers.current.has(receipt.operation_id)) continue;
      const adapter = createSandboxLifecycleOperationAdapter(fetch, {
        admission: (item) => `/api/sandbox/${item.row_id}/lifecycle-operations`,
        status: (item) => `/api/sandbox/${item.row_id}/lifecycle-operations/${item.operation_id}`,
        recovery: (item) => `/api/sandbox/${item.row_id}/lifecycle-operations/${item.operation_id}/recover`,
      });
      const restored = lifecycle.views.find((view) => view.operation_id === receipt.operation_id)?.restored === true;
      const controller = new SandboxLifecycleReceiptController({ receipt, actorId, generation, adapter, silenceInitialTerminal: restored, isCurrent: () => current.current.actorId === actorId && current.current.generation === generation, onView: (view) => { dispatch(applyView({ actorId, generation, view })); if (view.state === "success" && !notifiedTerminalSuccesses.current.has(view.operation_id)) { notifiedTerminalSuccesses.current.add(view.operation_id); notifyComputeTargetsChanged(); } } });
      controllers.current.set(receipt.operation_id, controller);
      controllerReceiptKeys.current.set(receipt.operation_id, receiptIdentity(receipt));
      controller.start();
    }
  }, [dispatch, lifecycle.actorId, lifecycle.generation, lifecycle.receipts, lifecycle.views]);

  useEffect(() => {
    if (!lifecycle.actorId) return;
    const actorId = lifecycle.actorId;
    const generation = lifecycle.generation;
    const receiptIds = new Set(lifecycle.receipts.map((receipt) => receipt.operation_id));
    for (const view of lifecycle.views) {
      if (view.dismissed || !receiptIds.has(view.operation_id)) { const id = toastIds.current.get(view.operation_id); if (id !== undefined) toast.dismiss(id); toastIds.current.delete(view.operation_id); toastSignatures.current.delete(view.operation_id); continue; }
      const currentToast = toastIds.current.get(view.operation_id);
      const signature = JSON.stringify([view.state, view.message, view.sandboxId, view.action]);
      if (currentToast !== undefined && toastSignatures.current.get(view.operation_id) === signature) continue;
      const controller = controllers.current.get(view.operation_id);
      const terminal = isTerminalState(view.state);
      const action = view.action === "recover" ? { label: "Recover", onClick: () => void controller?.recover() } : view.action === "retry" ? { label: "Retry request", onClick: () => void controller?.retry() } : view.action === "check" ? { label: "Check status", onClick: () => void controller?.check(true) } : undefined;
      const emit = view.state === "success" ? toast.success : view.state === "failure" ? toast.error : toast.warning;
      toastIds.current.set(view.operation_id, emit(view.message, { id: currentToast, duration: terminal ? undefined : Infinity, action, onDismiss: () => dispatch(dismissView({ actorId, generation, operationId: view.operation_id })) }));
      toastSignatures.current.set(view.operation_id, signature);
    }
  }, [dispatch, lifecycle.actorId, lifecycle.generation, lifecycle.receipts, lifecycle.views]);
  return null;
}
