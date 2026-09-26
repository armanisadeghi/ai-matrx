/**
 * features/admin/check-findings/acceptApi.ts — the one-click Mark OK call.
 *
 * React → Python directly (CLAUDE.md data flow: work the client cannot do). The server
 * (aidream `POST /admin/checks/accept`, super admin only — `aidream/api/routers/admin_checks.py`)
 * commits the accept to the check's OWN allowlist on main with the same adapter the
 * `findings accept` CLI uses, and records "landing" on the item until the next run confirms it.
 */

import { apiGet, apiPost } from "@/lib/api/typed-client";
import { BackendApiError } from "@/lib/api/errors";
import type { AcceptInfo } from "./model";

export type AcceptOutcome =
  | {
      ok: true;
      status: "landed" | "already_accepted" | "already_landed" | "in_flight" | "already_on_main";
      message: string;
      commitUrl: string | null;
      files: string[];
    }
  | {
      ok: false;
      /**
       * `refused`: nothing was written. `failed`: the accept was claimed and did not land or did not
       * take (recorded on the item; the message and remedy say whether anything reached main).
       * `error`: the server stopped before committing anything (`accept_error`). `unreachable`: no
       * answer at all.
       */
      kind: "refused" | "failed" | "error" | "unreachable";
      message: string;
      remedy: string | null;
    };

function remedyOf(details: unknown): string | null {
  if (details != null && typeof details === "object" && "remedy" in details) {
    const remedy = details.remedy;
    return typeof remedy === "string" ? remedy : null;
  }
  return null;
}

export async function markFindingOk(itemId: string, reason: string): Promise<AcceptOutcome> {
  try {
    const { data } = await apiPost("/admin/checks/accept", { item_id: itemId, reason });
    return {
      ok: true,
      status: data.status,
      message: data.message,
      commitUrl: data.commit_url ?? null,
      files: data.files ?? [],
    };
  } catch (error) {
    if (error instanceof BackendApiError) {
      const kind =
        error.code === "accept_refused"
          ? "refused"
          : error.code === "accept_failed"
            ? "failed"
            : error.status != null && error.status > 0
              ? "error"
              : "unreachable";
      return { ok: false, kind, message: error.detail || error.userMessage, remedy: remedyOf(error.details) };
    }
    return {
      ok: false,
      kind: "unreachable",
      message: error instanceof Error ? error.message : String(error),
      remedy: "The server did not answer. Nothing is known to have been written — reload the page to see the finding's state, then try again or use the copy-command.",
    };
  }
}

/**
 * aidream's accept adapters (`GET /admin/checks/accept-adapters`, the server's findings REGISTRY),
 * keyed by check id. `null` when the list could not be read — the page then keeps Mark OK (the
 * server still refuses a check with no adapter by name) rather than hide a real accept.
 */
export async function fetchAidreamAcceptAdapters(): Promise<Record<string, AcceptInfo> | null> {
  try {
    const { data } = await apiGet("/admin/checks/accept-adapters");
    return Object.fromEntries(
      data.checks.map((c) => [c.id, { files: c.accept ? c.files ?? [] : null, noAccept: c.accept ? null : (c.no_accept ?? null) }]),
    );
  } catch (error) {
    console.warn("[check-findings] could not read aidream's accept adapters; Mark OK stays and the server refuses by name", error);
    return null;
  }
}
