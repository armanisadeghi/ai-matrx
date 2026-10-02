/**
 * The inspector's ordered drill-down (lane CONTEXT-INSPECTOR-GUIDED): each step
 * clears the steps after it, the address round-trips, and the preview request
 * narrows with the depth — the SAME request for both sides of the compare.
 *
 * Lane CONTEXT-INSPECTOR-2: the request IS the server's `ContextSelection`. The
 * type step sends the type (the server expands it for both sides, no cap) —
 * red against lane 1, which sent the first 25 of the type's scope ids.
 */
import {
  chooseStep,
  EMPTY_SELECTION,
  parseSelection,
  previewRequest,
  selectionDepth,
  selectionSearch,
  agentSearch,
  parseAgent,
} from "./selection";

// Castellano & Reyes, LLP → Clients → Meridian Risk Services → Contact Phone
const ORG = "7cd12da2-2213-4378-8fba-a9e2dc4ea657";
const CLIENTS = "0b6f1c1e-6a1f-4c55-9d7e-1f2a3b4c5d6e";
const MERIDIAN = "3f0e2d1c-4b5a-4968-8776-5a4b3c2d1e0f";
const PHONE = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";
const GOLDEN_STATE = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("chooseStep", () => {
  it("clears every later step when an earlier one changes", () => {
    const full = { org: ORG, scopeType: CLIENTS, scope: MERIDIAN, item: PHONE };
    expect(chooseStep(full, "scopeType", GOLDEN_STATE)).toEqual({
      org: ORG,
      scopeType: GOLDEN_STATE,
      scope: null,
      item: null,
    });
    expect(chooseStep(full, "org", GOLDEN_STATE)).toEqual({
      org: GOLDEN_STATE,
      scopeType: null,
      scope: null,
      item: null,
    });
    expect(chooseStep(full, "item", GOLDEN_STATE)).toEqual({ ...full, item: GOLDEN_STATE });
  });

  it("choosing the same value again keeps the later steps", () => {
    const full = { org: ORG, scopeType: CLIENTS, scope: MERIDIAN, item: PHONE };
    expect(chooseStep(full, "scope", MERIDIAN)).toBe(full);
  });
});

describe("the address", () => {
  it("round-trips the four steps and keeps params it does not own", () => {
    const search = selectionSearch(
      { org: ORG, scopeType: CLIENTS, scope: MERIDIAN, item: null },
      "agent=5fd365ca-7d0e-4e1c-8b9b-a79131b38f20&item=" + PHONE,
    );
    const params = new URLSearchParams(search);
    expect(params.get("agent")).toBe("5fd365ca-7d0e-4e1c-8b9b-a79131b38f20");
    expect(params.get("item")).toBeNull();
    expect(parseSelection(search)).toEqual({ org: ORG, scopeType: CLIENTS, scope: MERIDIAN, item: null });
  });

  it("today's shared link — only ?scope= — parses as a scope with no depth yet", () => {
    const selection = parseSelection(`scope=${MERIDIAN}`);
    expect(selection).toEqual({ ...EMPTY_SELECTION, scope: MERIDIAN });
    expect(selectionDepth(selection)).toBeNull();
    expect(previewRequest(selection)).toBeNull();
  });

  it("ignores anything that is not an id", () => {
    expect(parseSelection("org=clients&scope=ai-matrx")).toEqual(EMPTY_SELECTION);
  });
});

describe("?agent= is set by the picker, and kept by every step", () => {
  const AGENT = "5fd365ca-7d0e-4e1c-8b9b-a79131b38f20";
  it("writes, reads and drops the agent without touching the selection", () => {
    const withAgent = agentSearch(AGENT, `org=${ORG}&scopeType=${CLIENTS}`);
    expect(parseAgent(withAgent)).toBe(AGENT);
    expect(parseSelection(withAgent)).toMatchObject({ org: ORG, scopeType: CLIENTS });
    expect(parseAgent(agentSearch(null, withAgent))).toBeNull();
    expect(parseAgent("agent=not-an-agent")).toBeNull();
  });
});

describe("previewRequest is the server's ContextSelection at every depth", () => {
  it("organization: the organization alone", () => {
    expect(previewRequest({ ...EMPTY_SELECTION, org: ORG })).toEqual({
      depth: "org",
      selection: { organization_id: ORG, scope_type_id: null, scope_id: null, context_item_id: null },
    });
  });

  it("scope type: the TYPE — never a list of its scope ids, so nothing can cap it", () => {
    const request = previewRequest({ ...EMPTY_SELECTION, org: ORG, scopeType: CLIENTS });
    expect(request).toEqual({
      depth: "scopeType",
      selection: { organization_id: ORG, scope_type_id: CLIENTS, scope_id: null, context_item_id: null },
    });
    expect(JSON.stringify(request)).not.toMatch(/scope_ids|scopeIds/);
  });

  it("scope: that one scope under its type; item: the same, with the item", () => {
    const scope = { org: ORG, scopeType: CLIENTS, scope: MERIDIAN, item: null };
    expect(previewRequest(scope)).toEqual({
      depth: "scope",
      selection: { organization_id: ORG, scope_type_id: CLIENTS, scope_id: MERIDIAN, context_item_id: null },
    });
    expect(previewRequest({ ...scope, item: PHONE })?.selection).toEqual({
      organization_id: ORG,
      scope_type_id: CLIENTS,
      scope_id: MERIDIAN,
      context_item_id: PHONE,
    });
  });

  it("sends only the unbroken chain (a ?scope= link waits for its back-fill)", () => {
    expect(previewRequest({ ...EMPTY_SELECTION, org: ORG, scope: MERIDIAN })?.selection).toEqual({
      organization_id: ORG,
      scope_type_id: null,
      scope_id: null,
      context_item_id: null,
    });
  });
});
