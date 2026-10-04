/** @jest-environment jsdom */

// The cap-hit paywall offers plans from the catalog (names, exact prices, AI
// points), names the person's default plan, and choosing a plan announces the
// tracked plan-checkout promise — never a fake checkout or trial.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Json } from "@/types/database.types";

const announce = jest.fn((_id: string) => Promise.resolve());
jest.mock("@/lib/coming-soon/announce", () => ({ announceComingSoon: (id: string) => announce(id) }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/x",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => true }));
jest.mock("@/hooks/auth/useLoginHref", () => ({ useLoginHref: () => "/sign-up" }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => { throw new Error("no network in this test"); } }));
// The Dialog primitive's portal/animation layers are not under test here.
jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { seedPlanCatalog } from "../service";
import { parsePlanCatalog } from "../parse";
import { CapabilityPaywallDialog } from "../../components/CapabilityPaywallDialog";
import { PLAN_CHECKOUT_COMING_SOON } from "../planAction";
import type { EntitlementResult } from "../../types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const plan = (key: string, name: string, audience: string, rank: number, monthly: number, annual: number, extra: Record<string, Json> = {}): Json => ({
  plan_key: key, name, audience, tagline: null, rank, tier: monthly ? "premium" : "free",
  monthly_cents: monthly, annual_cents: annual, per_seat: false, min_seats: null, badge: null,
  is_default: false, listed_on_pricing: true, limits: [], ...extra,
});

seedPlanCatalog(
  parsePlanCatalog([
    plan("zero", "Starter Zero", "free", 10, 0, 0, { is_default: true }),
    plan("alpha", "Alpha Plan", "personal", 20, 1900, 1520, {
      limits: [{ capability: "platform.points", period: "month", limit: 4321 }],
    }),
    plan("beta", "Beta Plan", "personal", 30, 4900, 3920),
    plan("team", "Team Plan", "company", 60, 3900, 3120),
  ]),
);

const verdict = {
  allowed: false,
  tier: "free",
  used: 7,
  limit: 7,
  period: "month",
  windows: [],
} as unknown as EntitlementResult;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("offers catalog plans with exact prices and announces the checkout promise", () => {
  act(() => {
    root.render(
      <CapabilityPaywallDialog open onOpenChange={() => undefined} capability="platform.points" verdict={verdict} />,
    );
  });
  const text = host.textContent ?? "";
  expect(text).toContain("Starter Zero plan");
  expect(text).toContain("Alpha Plan");
  expect(text).toContain("$15.20");
  expect(text).toContain("4,321 AI points / month");
  expect(text).toContain("Beta Plan");
  expect(text).not.toContain("Team Plan");
  expect(text).not.toMatch(/trial/i);

  const alpha = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Alpha Plan"));
  act(() => alpha!.click());
  expect(announce).toHaveBeenCalledWith(PLAN_CHECKOUT_COMING_SOON);
});
