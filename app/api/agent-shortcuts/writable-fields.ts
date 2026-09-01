// app/api/agent-shortcuts/writable-fields.ts
//
// 🚨 THE ONE WRITABLE-FIELD LIST FOR THE SHORTCUT REST ROUTES — AND THE END OF
// THE SILENT DROP (FIX-11c, W11-1).
//
// ── THE DEFECT ───────────────────────────────────────────────────────────────
// Both routes filtered the request body through a hand-kept allow-list and
// **threw away anything not on it, without a word**. Four fields the client
// sends were never on either list — and by `git log -S` never had been:
//
//   · `value_mappings`  — the variable/context bindings. THE feature.
//   · `write_policies`  — what the agent may change on the surface.
//   · `surface_name`    — WHERE the shortcut appears at all.
//   · `json_extraction` — the structured-output config.
//
// So editing a shortcut's mappings answered **200 OK** with the row's OLD
// `value_mappings`, the client wrote that unchanged value straight back into
// Redux, and on reload the person's work had reverted to "Agent Default". A
// walker reproduced it twice. Nothing anywhere said a field had been dropped:
// not the route, not the response, not the console. The write LOOKED like it
// worked, which is the worst version of this.
//
// Note the create path never had the bug — `createShortcut` inserts straight to
// the table through `agentShortcutToInsert`. It was the REST update alone, which
// is exactly the kind of gap a hand-kept list produces and nothing detects.
//
// ── THE CLASS, WHICH IS THE ALLOW-LIST ITSELF ────────────────────────────────
// Adding four names would fix today and guarantee tomorrow's repeat: the next
// column added to `shortcutToApiBody` vanishes the same silent way. So the
// picker no longer DROPS — it REFUSES, naming every key it does not accept, and
// the routes answer 400. A field the client believed it stored can never again
// be quietly discarded behind a 200.
//
// Guard: `app/api/agent-shortcuts/__tests__/no-silent-field-drop.test.ts` drives
// the REAL client body builder with a full record and fails on any key this
// file does not accept — so the two sides cannot drift again.

import { SHORTCUT_WRITE_POLICIES_ON_TREATMENT } from "@/lib/supabase/shortcutStorage";

/** Columns a client may write on a shortcut, create and update alike. */
const WRITABLE_FIELDS = [
  "category_id",
  "label",
  "description",
  "icon_name",
  "keyboard_shortcut",
  "sort_order",
  "scope_mappings",
  "context_mappings",
  "enabled_features",
  "agent_id",
  "agent_version_id",
  "use_latest",
  "is_active",
  "created_by",
  "organization_id",
  // project/task scoping is platform.associations edges, not columns
  // ── The four that were silently dropped (W11-1) ──
  "surface_name",
  "value_mappings",
  "json_extraction",
  // AgentExecutionConfig bundle
  "display_mode",
  "show_variable_panel",
  "variables_panel_style",
  "auto_run",
  "allow_chat",
  "show_definition_messages",
  "show_definition_message_content",
  "hide_reasoning",
  "hide_tool_results",
  "show_pre_execution_gate",
  "pre_execution_message",
  "bypass_gate_seconds",
  "default_user_input",
  "default_variables",
  "context_overrides",
  "llm_overrides",
] as const;

/**
 * The full accepted set.
 *
 * `write_policies` is a real writable column ONLY after the storage cutover,
 * where a policy is treatment and the compat view exposes it through its own
 * INSTEAD OF trigger. Before the cutover it rides nested inside
 * `value_mappings` and naming it here would be a write to a column that does
 * not exist — so it is admitted by the same flag the converters read, never by
 * a second opinion about which era we are in.
 */
export function acceptedShortcutFields(options?: {
  allowId?: boolean;
}): ReadonlySet<string> {
  const accepted = new Set<string>(WRITABLE_FIELDS);
  if (SHORTCUT_WRITE_POLICIES_ON_TREATMENT) accepted.add("write_policies");
  if (options?.allowId) accepted.add("id");
  return accepted;
}

export interface PickedShortcutFields {
  payload: Record<string, unknown>;
  /** Keys the caller sent that this route will not write — never dropped. */
  rejected: string[];
}

/**
 * Split a request body into what will be written and what will NOT be.
 *
 * 🚨 It does not drop. Every key the caller sent is either in `payload` or
 * named in `rejected`, and the routes turn a non-empty `rejected` into a 400
 * that says which fields and that NOTHING was written. A caller is never told
 * "OK" about a field that went nowhere.
 */
export function pickWritableShortcutFields(
  body: Record<string, unknown>,
  options?: { allowId?: boolean },
): PickedShortcutFields {
  const accepted = acceptedShortcutFields(options);
  const payload: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const key of Object.keys(body)) {
    if (accepted.has(key)) payload[key] = body[key];
    else rejected.push(key);
  }
  return { payload, rejected };
}

/** The refusal, in words, for a body carrying fields this route cannot write. */
export function rejectedFieldsMessage(rejected: readonly string[]): string {
  const names = rejected.map((k) => `"${k}"`).join(", ");
  return rejected.length === 1
    ? `This request carries a field this route cannot write — ${names} — so nothing was saved. Either it is not a shortcut field, or it needs adding to the writable list (app/api/agent-shortcuts/writable-fields.ts). Silently ignoring it is how a save reports success and changes nothing.`
    : `This request carries ${rejected.length} fields this route cannot write — ${names} — so nothing was saved. Either they are not shortcut fields, or they need adding to the writable list (app/api/agent-shortcuts/writable-fields.ts). Silently ignoring them is how a save reports success and changes nothing.`;
}
