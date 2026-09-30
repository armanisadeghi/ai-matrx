/** @jest-environment jsdom */
//
// KNOB RESOLUTION NEVER BLOCKS A READ (Arman, 2026-09-29). A page size or any
// other knob is asked for with `organizationId` null/undefined: the resolver
// still asks `platform.knob_snapshot` (organization argument omitted, so the
// server resolves user override -> platform default and skips the org rung) and
// the reader gets a value. With an organization selected, the organization is
// sent and its override is what the reader sees.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createClient } from "@/utils/supabase/client";

import { invalidateEffectiveKnob, useEffectiveKnob } from "../effectiveKnobs";

jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/client-directives/directiveRegistry", () => ({
  registerDirectiveHandler: jest.fn(),
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const KNOB = { feature: "resources.inventory", key: "page_size" };
const FULL = "resources.inventory.page_size";

const calls: Array<Record<string, unknown>> = [];
function serve() {
  const rpc = (fn: string, args: Record<string, unknown>) => {
    if (fn !== "knob_snapshot") throw new Error(`unexpected rpc ${fn}`);
    calls.push(args);
    // the organization layer overrides the platform default of 50
    const value = args.p_organization_id ? 25 : 50;
    return Promise.resolve({ data: { resolved: { [FULL]: value }, stamp: "s" }, error: null });
  };
  jest.mocked(createClient).mockReturnValue({
    rpc,
    schema: () => ({ rpc }),
  } as unknown as ReturnType<typeof createClient>);
}

function Reader({ org }: { org: string | null }) {
  const value = useEffectiveKnob(org, USER, KNOB);
  return <span data-testid="v">{String(value)}</span>;
}

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  calls.length = 0;
  invalidateEffectiveKnob();
  serve();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const text = () => container.querySelector("[data-testid=v]")?.textContent;

it("with NO organization the knob still resolves (platform default), and no org is sent", async () => {
  await act(async () => root.render(<Reader org={null} />));
  expect(text()).toBe("50");
  expect(calls).toHaveLength(1);
  expect(calls[0].p_organization_id).toBeUndefined();
});

it("with an organization selected its override is resolved and the org is sent", async () => {
  await act(async () => root.render(<Reader org={ORG} />));
  expect(text()).toBe("25");
  expect(calls[0].p_organization_id).toBe(ORG);
});
