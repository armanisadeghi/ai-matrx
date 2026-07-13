/**
 * Agent edit access — the "can the agent change this slot?" wire contract.
 *
 * Guards the bug this replaced: a context slot the user marked agent-editable
 * had to actually come out the other side carrying `mutable: true`, and a
 * read-only one had to carry no mutation fields at all.
 */

import {
  applyAgentEditAccess,
  agentEditAccessChanged,
  decodeAgentEditAccess,
} from "@/features/agents/utils/agent-edit-access";
import { buildContextSlotFromItem } from "@/features/agents/utils/context-item-slot-mapping";
import type { ContextSlot } from "@/features/agents/types/agent-api-types";
import type { ContextItem } from "@/features/scope-system/redux/contextItemsSlice";

const ITEM = {
  id: "11111111-2222-3333-4444-555555555555",
  scope_type_id: "99999999-8888-7777-6666-555555555555",
  key: "Client Name",
  display_name: "Client Name",
  description: "The client this matter belongs to",
  value_type: "text",
} as unknown as ContextItem;

const BASE_SLOT: ContextSlot = { key: "client_name", type: "text" };

describe("decodeAgentEditAccess", () => {
  it("reads an absent mutable flag as read-only (the server default)", () => {
    expect(decodeAgentEditAccess(BASE_SLOT)).toEqual({
      access: "read_only",
      saveMode: "never",
    });
    expect(decodeAgentEditAccess(undefined).access).toBe("read_only");
  });

  it("reads a mutable slot as editable, carrying its save mode", () => {
    expect(
      decodeAgentEditAccess({ ...BASE_SLOT, mutable: true, persist: "auto" }),
    ).toEqual({ access: "editable", saveMode: "auto" });
  });

  it("defaults a mutable slot with no persist to conversation-only", () => {
    expect(
      decodeAgentEditAccess({ ...BASE_SLOT, mutable: true }).saveMode,
    ).toBe("never");
  });
});

describe("applyAgentEditAccess", () => {
  it("writes mutable + persist when the agent may edit", () => {
    const slot = applyAgentEditAccess(BASE_SLOT, {
      access: "editable",
      saveMode: "never",
    });
    expect(slot.mutable).toBe(true);
    expect(slot.persist).toBe("never");
  });

  it("strips the mutation fields entirely when read-only", () => {
    const editable = applyAgentEditAccess(BASE_SLOT, {
      access: "editable",
      saveMode: "auto",
    });
    const reverted = applyAgentEditAccess(editable, {
      access: "read_only",
      saveMode: "auto",
    });
    expect("mutable" in reverted).toBe(false);
    expect("persist" in reverted).toBe(false);
  });

  it("round-trips through decode", () => {
    const value = { access: "editable", saveMode: "client" } as const;
    expect(decodeAgentEditAccess(applyAgentEditAccess(BASE_SLOT, value))).toEqual(
      value,
    );
  });

  it("leaves every other field untouched", () => {
    const slot = applyAgentEditAccess(
      { ...BASE_SLOT, label: "Client", max_inline_chars: 800 },
      { access: "editable", saveMode: "never" },
    );
    expect(slot.key).toBe("client_name");
    expect(slot.label).toBe("Client");
    expect(slot.max_inline_chars).toBe(800);
  });
});

describe("agentEditAccessChanged", () => {
  const readOnly = { access: "read_only", saveMode: "never" } as const;

  it("detects an access flip", () => {
    expect(
      agentEditAccessChanged(readOnly, { access: "editable", saveMode: "never" }),
    ).toBe(true);
  });

  it("detects a save-mode change on an editable slot", () => {
    expect(
      agentEditAccessChanged(
        { access: "editable", saveMode: "never" },
        { access: "editable", saveMode: "client" },
      ),
    ).toBe(true);
  });

  it("ignores a save-mode difference on a read-only slot (it isn't stored)", () => {
    expect(
      agentEditAccessChanged(readOnly, { access: "read_only", saveMode: "auto" }),
    ).toBe(false);
  });
});

describe("buildContextSlotFromItem", () => {
  it("is read-only by default", () => {
    const slot = buildContextSlotFromItem(ITEM, { key: "client_name" });
    expect("mutable" in slot).toBe(false);
    expect(slot.source).toEqual({
      kind: "ctx_item",
      id: ITEM.id,
      scope_type_id: ITEM.scope_type_id,
      item_key: ITEM.key,
      on_missing: "empty",
    });
  });

  it("carries agent-editable through to the stored slot", () => {
    const slot = buildContextSlotFromItem(ITEM, {
      key: "client_name",
      access: "editable",
    });
    expect(slot.mutable).toBe(true);
    // Scope-bound slots have no server writeback handler — conversation-only.
    expect(slot.persist).toBe("never");
    expect(slot.source?.kind).toBe("ctx_item");
  });
});
