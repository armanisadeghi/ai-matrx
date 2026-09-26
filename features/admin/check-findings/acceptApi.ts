/**
 * features/admin/check-findings/acceptApi.ts — the one-click Mark OK call.
 *
 * React → Python directly (CLAUDE.md data flow: work the client cannot do). The server
 * (aidream `POST /admin/checks/accept`, super admin only — `aidream/api/routers/admin_checks.py`)
 * commits the accept to the check's OWN allowlist on main with the same adapter the
 * `findings accept` CLI uses, and records "landing" on the item until the next run confirms it.
 */

import { apiPost } from "@/lib/api/typed-client";
import { BackendApiError } from "@/lib/api/errors";

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
      /** `refused`: nothing was written. `failed`: the accept was claimed and could not land (recorded on the item). */
      kind: "refused" | "failed" | "unreachable";
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
      const kind = error.code === "accept_refused" ? "refused" : error.code === "accept_failed" ? "failed" : "unreachable";
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
