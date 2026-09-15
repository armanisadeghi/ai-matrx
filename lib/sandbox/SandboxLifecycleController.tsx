"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { applyView, dismissView, type SandboxLifecycleView } from "@/lib/redux/slices/sandboxLifecycleSlice";
import { classifyDurableSandboxLifecycleResponse, createSandboxLifecycleOperationAdapter, type SandboxLifecycleOperationAdapter } from "@/lib/sandbox/lifecycle-operation";
import type { SandboxOperationReceipt } from "@/lib/durable-run/sandbox-operation-receipt";

const MAX_TRANSPORT_FAILURES = 3;
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;
const MAX_PENDING_POLLS = 23; // 1+2+4+8 then 19×15 seconds: five visible minutes.

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

/** One receipt gets one bounded observer. It never owns server work or retries POST on its own. */
export class SandboxLifecycleReceiptController {
  private stopped = false;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private pendingPolls = 0;
  private performing = false;
  private latestState: SandboxLifecycleView["state"] = "pending";

  constructor(private readonly options: {
    receipt: SandboxOperationReceipt;
    actorId: string;
    generation: number;
    isCurrent: () => boolean;
    adapter: SandboxLifecycleOperationAdapter;
    onView: (view: SandboxLifecycleView) => void;
    environment?: LifecycleControllerEnvironment;
  }) {}

  start(): void {
    const environment = this.options.environment ?? browserEnvironment;
    const resume = () => { if (!this.stopped && environment.visible() && environment.online()) void this.check(); };
    environment.addEventListener("focus", resume); environment.addEventListener("online", resume); environment.addEventListener("visibilitychange", resume);
    this.unsubscribe = () => { environment.removeEventListener("focus", resume); environment.removeEventListener("online", resume); environment.removeEventListener("visibilitychange", resume); };
    void this.check();
  }

  private unsubscribe: (() => void) | null = null;
  stop(): void { this.stopped = true; this.abort?.abort(); if (this.timer) clearTimeout(this.timer); this.unsubscribe?.(); this.unsubscribe = null; }

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
      const result = await classifyDurableSandboxLifecycleResponse(response, { row_id: this.options.receipt.row_id, operation_id: this.options.receipt.operation_id, kind: this.options.receipt.kind, sandbox_id: "" }, true);
      if (this.stopped || !this.options.isCurrent()) return;
      this.failures = 0;
      this.latestState = result.state;
      this.options.onView({ operation_id: this.options.receipt.operation_id, state: result.state, message: result.message, sandboxId: result.sandbox_id ?? null, action: result.state === "attention" ? "recover" : response.status === 404 ? "retry" : "check", dismissed: false });
      if (result.state === "pending") this.schedule();
    } catch (error) {
      if (this.stopped || !this.options.isCurrent() || (error instanceof DOMException && error.name === "AbortError")) return;
      this.failures += 1;
      if (this.failures >= MAX_TRANSPORT_FAILURES) {
        this.options.onView({ operation_id: this.options.receipt.operation_id, state: "unknown", message: "Could not confirm this sandbox operation; check status.", sandboxId: null, action: "check", dismissed: false });
        return;
      }
      this.schedule();
    } finally { this.performing = false; }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.pendingPolls >= MAX_PENDING_POLLS) {
      this.options.onView({ operation_id: this.options.receipt.operation_id, state: "pending", message: "Still in progress; automatic status checks paused. Check status.", sandboxId: null, action: "check", dismissed: false });
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
      const result = await classifyDurableSandboxLifecycleResponse(response, { row_id: this.options.receipt.row_id, operation_id: this.options.receipt.operation_id, kind: this.options.receipt.kind, sandbox_id: "" }, method === "admit" || this.options.receipt.observation !== "prepared");
      if (this.stopped || !this.options.isCurrent()) return;
      this.latestState = result.state;
      this.options.onView({ operation_id: this.options.receipt.operation_id, state: result.state, message: result.message, sandboxId: result.sandbox_id ?? null, action: result.state === "attention" ? "recover" : result.state === "unknown" && method === "admit" ? "retry" : "check", dismissed: false });
      if (result.state === "pending") this.schedule();
    } catch { if (!this.stopped && this.options.isCurrent()) this.options.onView({ operation_id: this.options.receipt.operation_id, state: "unknown", message: "Could not confirm this sandbox operation; check status.", sandboxId: null, action: method === "admit" ? "retry" : "check", dismissed: false }); }
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
  current.current = { actorId: lifecycle.actorId, generation: lifecycle.generation };
  const controllers = useRef<Map<string, SandboxLifecycleReceiptController>>(new Map());
  const toastIds = useRef<Map<string, string | number>>(new Map());
  useEffect(() => {
    for (const controller of controllers.current.values()) controller.stop();
    controllers.current.clear();
    for (const id of toastIds.current.values()) toast.dismiss(id);
    toastIds.current.clear();
    if (!lifecycle.actorId) return;
    const actorId = lifecycle.actorId; const generation = lifecycle.generation;
    for (const receipt of lifecycle.receipts) {
      const adapter = createSandboxLifecycleOperationAdapter(fetch, {
        admission: (item) => `/api/sandbox/${item.row_id}/lifecycle-operations`,
        status: (item) => `/api/sandbox/${item.row_id}/lifecycle-operations/${item.operation_id}`,
        recovery: (item) => `/api/sandbox/${item.row_id}/lifecycle-operations/${item.operation_id}/recover`,
      });
      const controller = new SandboxLifecycleReceiptController({ receipt, actorId, generation, adapter, isCurrent: () => current.current.actorId === actorId && current.current.generation === generation, onView: (view) => dispatch(applyView({ actorId, generation, view })) });
      controllers.current.set(receipt.operation_id, controller); controller.start();
    }
    return () => { for (const controller of controllers.current.values()) controller.stop(); controllers.current.clear(); };
  }, [dispatch, lifecycle.actorId, lifecycle.generation, lifecycle.receipts]);

  useEffect(() => {
    if (!lifecycle.actorId) return;
    for (const view of lifecycle.views) {
      if (view.dismissed) { const id = toastIds.current.get(view.operation_id); if (id !== undefined) toast.dismiss(id); toastIds.current.delete(view.operation_id); continue; }
      const currentToast = toastIds.current.get(view.operation_id);
      const controller = controllers.current.get(view.operation_id);
      const action = view.action === "recover" ? { label: "Recover", onClick: () => void controller?.recover() } : view.action === "retry" ? { label: "Retry request", onClick: () => void controller?.retry() } : { label: "Check status", onClick: () => void controller?.check(true) };
      const emit = view.state === "success" ? toast.success : view.state === "failure" ? toast.error : toast.warning;
      toastIds.current.set(view.operation_id, emit(view.message, { id: currentToast, duration: Infinity, action, onDismiss: () => dispatch(dismissView({ actorId: lifecycle.actorId!, generation: lifecycle.generation, operationId: view.operation_id })) }));
    }
  }, [dispatch, lifecycle.actorId, lifecycle.generation, lifecycle.views]);
  return null;
}
