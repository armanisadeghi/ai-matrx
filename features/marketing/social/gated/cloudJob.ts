/**
 * The cloud-browser capture job as the app sees it (GATED-CAPTURE.md §2 `cloud_browser`): the stage
 * the server writes at `metadata.social.cloud` on the job row, and the readiness answer. Pure.
 */

import type { CaptureHandoff } from "@/features/capture-ladder/types";

export type CloudStage =
  | "queued"
  | "starting"
  | "signing_in"
  | "waiting_for_you"
  | "needs_login"
  | "opening"
  | "capturing"
  | "landing"
  | "done"
  | "failed"
  | "cancelled";

const STAGES: readonly CloudStage[] = [
  "queued",
  "starting",
  "signing_in",
  "waiting_for_you",
  "needs_login",
  "opening",
  "capturing",
  "landing",
  "done",
  "failed",
  "cancelled",
];

const LABELS: Record<CloudStage, string> = {
  queued: "Queued",
  starting: "Starting browser",
  signing_in: "Signing in",
  waiting_for_you: "Waiting for you",
  needs_login: "Needs a saved login",
  opening: "Opening page",
  capturing: "Capturing",
  landing: "Saving",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

const TERMINAL: ReadonlySet<CloudStage> = new Set(["done", "failed", "cancelled", "needs_login"]);

export interface SavedLogin {
  itemId: string;
  name: string;
}

export interface CloudReadiness {
  supported: boolean;
  enabled: boolean;
  platformName: string;
  logins: SavedLogin[];
}

export interface CloudView {
  stage: CloudStage;
  label: string;
  /** The server's sentence for this stage (why it stopped, what to do), else null. */
  note: string | null;
  terminal: boolean;
  failed: boolean;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** The cloud stage on a job row, or null when the cloud browser never touched it. Pure. */
export function cloudView(row: Pick<CaptureHandoff, "metadata"> | null | undefined): CloudView | null {
  const social = row?.metadata?.["social"];
  if (!social || typeof social !== "object") return null;
  const cloud = (social as Record<string, unknown>)["cloud"];
  if (!cloud || typeof cloud !== "object") return null;
  const raw = (cloud as Record<string, unknown>)["stage"];
  const stage = STAGES.find((s) => s === raw);
  if (!stage) return null;
  return {
    stage,
    label: LABELS[stage],
    note: str((cloud as Record<string, unknown>)["note"]),
    terminal: TERMINAL.has(stage),
    failed: stage === "failed" || stage === "needs_login",
  };
}

export function parseReadiness(data: Record<string, unknown>): CloudReadiness {
  const logins = Array.isArray(data["logins"]) ? data["logins"] : [];
  return {
    supported: data["supported"] === true,
    enabled: data["enabled"] === true,
    platformName: str(data["platform_name"]) ?? str(data["platform"]) ?? "",
    logins: logins.flatMap((l): SavedLogin[] => {
      if (!l || typeof l !== "object") return [];
      const rec = l as Record<string, unknown>;
      const itemId = str(rec["item_id"]);
      return itemId ? [{ itemId, name: str(rec["display_name"]) ?? itemId }] : [];
    }),
  };
}
