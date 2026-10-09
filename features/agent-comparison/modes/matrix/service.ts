/**
 * Matrix Battle data layer.
 *
 * READS + the set row's setup go DIRECTLY to Supabase (RLS-scoped). COMPUTE
 * (run cells, cancel) goes to the aidream endpoints through `callApi`, so the
 * server choice (including an admin's localhost override), auth and the
 * organization header are the app's one normal path.
 *
 * 🚨 Cells are server-owned: this module never writes a
 * `cmp_comparison_entries` row except to archive it with its battle.
 */

import type { AppDispatch } from "@/lib/redux/store";
import { callApi, type ApiCallConfig, type ApiCallError } from "@/lib/api/call-api";
import type { paths } from "@ai-matrx/agents/generated/api-types";
import { createClient } from "@/utils/supabase/client";
import type { ComparisonEntryRow } from "../../types";

const db = () => createClient().schema("agent");

/**
 * 🚨 LOCAL PATH LITERALS — become `satisfies keyof paths` once `pnpm sync-types`
 * picks the routes up from a deployed server (the aidream half ships in
 * parallel; `MANDATE_DEFAULT_HOLDER_PATH` precedent).
 */
export const MATRIX_RUN_PATH = "/agent-battles/{set_id}/run" as keyof paths;
export const MATRIX_CANCEL_PATH = "/agent-battles/{set_id}/cancel" as keyof paths;

export async function listMatrixEntries(setId: string): Promise<ComparisonEntryRow[]> {
  const { data, error } = await db()
    .from("cmp_comparison_entries")
    .select("*")
    .eq("comparison_set_id", setId)
    .is("deleted_at", null)
    .order("display_order", { ascending: true });
  if (error) throw new Error(`Could not read the cells: ${error.message}`);
  return (data ?? []) as ComparisonEntryRow[];
}

export interface MatrixRunBody {
  cells: { row_id: string; column_id: string; repeat: number }[] | null;
  scope: "all" | "unfinished";
}

export interface MatrixCallOutcome {
  error: string | null;
  /** Server events carrying an error, read off the stream. */
  streamErrors: string[];
}

function streamErrorsIn(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const ev = JSON.parse(trimmed) as { event?: unknown; type?: unknown; data?: unknown };
      const kind = String(ev.event ?? ev.type ?? "");
      if (kind === "error") {
        const data = (ev.data ?? {}) as { message?: unknown; user_message?: unknown };
        out.push(String(data.user_message ?? data.message ?? "The server reported an error."));
      }
    } catch {
      // Not a JSON event line — the stream protocol owns framing.
    }
  }
  return out;
}

/**
 * Run cells on the server. Resolves when the server's stream ends; the cells
 * themselves are read from the database by the page's poll, so a closed tab
 * loses nothing.
 */
export async function runMatrixCells(
  dispatch: AppDispatch,
  setId: string,
  organizationId: string,
  body: MatrixRunBody,
): Promise<MatrixCallOutcome> {
  const captured: { text: string } = { text: "" };
  const config: ApiCallConfig<typeof MATRIX_RUN_PATH, "POST"> = {
    path: MATRIX_RUN_PATH,
    method: "POST",
    pathParams: { set_id: setId } as never,
    body: body as never,
    stream: true,
    scopeOverrides: { organization_id: organizationId },
    consumeStream: async (response: Response) => {
      captured.text = await response.text();
    },
  };
  const result = await dispatch(callApi(config));
  if (result.error) {
    return {
      error: describeCallError(result.error, "Could not start the run."),
      streamErrors: [],
    };
  }
  return { error: null, streamErrors: streamErrorsIn(captured.text) };
}

export async function cancelMatrixRun(
  dispatch: AppDispatch,
  setId: string,
  organizationId: string,
): Promise<MatrixCallOutcome> {
  const config: ApiCallConfig<typeof MATRIX_CANCEL_PATH, "POST"> = {
    path: MATRIX_CANCEL_PATH,
    method: "POST",
    pathParams: { set_id: setId } as never,
    body: {} as never,
    scopeOverrides: { organization_id: organizationId },
  };
  const result = await dispatch(callApi(config));
  if (result.error) {
    return { error: describeCallError(result.error, "Could not cancel the run."), streamErrors: [] };
  }
  return { error: null, streamErrors: [] };
}

function describeCallError(err: ApiCallError, fallback: string): string {
  const parts: string[] = [];
  if (typeof err.status === "number" && err.status > 0) parts.push(`HTTP ${err.status}`);
  parts.push(err.message || fallback);
  return parts.join(" · ");
}

/** Archive every cell row of a battle (delete means archive). */
export async function archiveMatrixEntries(setId: string): Promise<void> {
  const { error } = await db()
    .from("cmp_comparison_entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("comparison_set_id", setId)
    .is("deleted_at", null);
  if (error) throw new Error(`Could not archive the cells: ${error.message}`);
}
