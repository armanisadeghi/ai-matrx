/**
 * A MENU-LOADED SHORTCUT CARRIES ITS WRITE POLICY AND TOOL BLOCK LIST.
 *
 * The break (found 2026-10-05): `mandate.context_menu_view` — the only door
 * menu-loaded runs read — never served `write_policies`, so the treatment's
 * per-target apply policies silently never reached a run launched from the
 * menu. The view now serves `write_policies` and `never_include_tools` per
 * item; this guard pins the client half on the exact item shape the view
 * emits: the record built from a menu item must carry both.
 */
jest.mock("../../../../host/db", () => ({ createClient: () => ({}) }));

import { shortcutRowToFrontend } from "../thunks";

const menuItem = {
  type: "agent_shortcut",
  id: "11111111-1111-1111-1111-111111111111",
  category_id: "22222222-2222-2222-2222-222222222222",
  label: "Clean up webpage content",
  description: null,
  icon_name: null,
  sort_order: 0,
  keyboard_shortcut: null,
  surface_name: null,
  value_mappings: null,
  scope_mappings: null,
  context_mappings: null,
  enabled_features: ["general"],
  display_mode: "inline",
  agent_id: "33333333-3333-3333-3333-333333333333",
  use_latest: true,
  is_active: true,
  mandate_key: "shortcut.clean_up_webpage_content",
  write_policies: { note_content: "ask" },
  never_include_tools: ["widget_text_patch"],
  user_id: null,
  organization_id: null,
  project_id: null,
  task_id: null,
  created_at: "",
  updated_at: "",
};

describe("a menu-loaded shortcut carries its write policy", () => {
  it("reads write_policies off the menu item", () => {
    const record = shortcutRowToFrontend(menuItem as never);
    expect(record.writePolicies).toEqual({ note_content: "ask" });
  });
  it("reads never_include_tools off the menu item", () => {
    const record = shortcutRowToFrontend(menuItem as never);
    expect(record.neverIncludeTools).toEqual(["widget_text_patch"]);
  });
  it("an item without them (the pre-fix view shape) carries none", () => {
    const { write_policies: _w, never_include_tools: _n, ...old } = menuItem;
    const record = shortcutRowToFrontend(old as never);
    expect(record.writePolicies ?? null).toBeNull();
    expect(record.neverIncludeTools ?? null).toBeNull();
  });
});
