/** @jest-environment jsdom */

// Guard (2026-10-03): /files/webhooks listed every readable webhook in one undeclared pile.
// It now carries the list header — All | Mine | My team | My Orgs and the organization
// filter — read from public.webhook_list_lanes, opening on All.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Webhook } from "../types";

const ORG_A = "22222222-2222-4222-8222-222222222222";
const ORG_B = "99999999-9999-4999-8999-999999999999";
const ME = "33333333-3333-4333-8333-333333333333";

function hook(id: string, url: string, owner: string, org: string): Webhook {
  return {
    id,
    created_by: owner,
    target_url: url,
    description: null,
    is_active: true,
    organization_id: org,
    event_types: null,
    resource_types: null,
    last_attempt_at: null,
    last_success_at: null,
    consecutive_failures: 0,
    max_consecutive_failures: 10,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  } as Webhook;
}

const mine = hook("11111111-1111-4111-8111-111111111111", "https://hooks.example.com/mine", ME, ORG_A);
const coworker = hook("55555555-5555-4555-8555-555555555555", "https://hooks.example.com/coworker", "66666666-6666-4666-8666-666666666666", ORG_B);

jest.mock("../service", () => ({
  listWebhooks: jest.fn(async () => [mine, coworker]),
  listWebhookLanes: jest.fn(async () => [
    { id: mine.id, lane: "mine", organization_id: ORG_A },
    { id: mine.id, lane: "orgs", organization_id: ORG_A },
    { id: mine.id, lane: "all", organization_id: ORG_A },
    { id: coworker.id, lane: "orgs", organization_id: ORG_B },
    { id: coworker.id, lane: "all", organization_id: ORG_B },
  ]),
  listDeliveries: jest.fn(async () => []),
  createWebhook: jest.fn(),
  declareTableWebhook: jest.fn(),
  deleteWebhook: jest.fn(),
  redeliverWebhookDelivery: jest.fn(),
  rotateWebhookSecret: jest.fn(),
  sendTestWebhook: jest.fn(),
  updateWebhook: jest.fn(),
}));
jest.mock("@/features/data-tables/service", () => ({ listTablesEverywhere: jest.fn(async () => ({ success: true, data: [] })) }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null, useAppDispatch: () => jest.fn() }));
jest.mock("@/lib/list-scope", () => ({ defaultListScopeFor: jest.fn(() => Promise.resolve({ kind: "all" })) }));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: [{ id: ORG_A, name: "Harbor Dental" }, { id: ORG_B, name: "Coastal Ortho" }], loading: false }),
}));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const { WebhooksManager }: typeof import("../components/WebhooksManager") = require("../components/WebhooksManager");

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("webhooks list lanes", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.history.replaceState(null, "", "/");
  });

  async function shownWith(search: string) {
    window.history.replaceState(null, "", `/files/webhooks${search}`);
    await act(async () => root.render(<WebhooksManager />));
    await act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
    return container.textContent ?? "";
  }

  it("opens on All with a count on every lane", async () => {
    const text = await shownWith("");
    expect(text).toContain("hooks.example.com/mine");
    expect(text).toContain("hooks.example.com/coworker");
    const tabs = [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
    expect(tabs).toEqual(["All2", "Mine1", "My team0", "My Orgs2"]);
  });

  it("Mine shows only the person's own webhooks", async () => {
    const text = await shownWith("?scope=mine");
    expect(text).toContain("hooks.example.com/mine");
    expect(text).not.toContain("hooks.example.com/coworker");
  });

  it("the organization filter narrows the list", async () => {
    const text = await shownWith(`?org_filter=${ORG_B}`);
    expect(text).toContain("hooks.example.com/coworker");
    expect(text).not.toContain("hooks.example.com/mine");
  });
});
