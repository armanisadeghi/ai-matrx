/**
 * FORCING TEST for LIVE-MONEY VISIBILITY on /print/order.
 *
 * This suite exists because the badge was deleted three times in one evening
 * (f7a9e3c297, 2d90e58b23, 69e8b9ff7f) while the surface could open a REAL
 * Stripe checkout — twice because its reader bound to a route the backend had
 * not yet deployed. aidream has now deployed `/lulu/payment-mode`, so the reader
 * is on the contract-bound typed client like every other call in this folder.
 *
 * WHAT THIS ASSERTS CHANGED ON 2026-09-11 (Arman's ruling): "I don't want us to
 * keep putting these live money gates up. Instead I'd rather have settings and
 * configurations that do it… The key is to scare me by showing how much money we
 * spent so far today, not by putting blocks in the code." The refusals now live
 * in two org-configurable knobs on the server. So this suite no longer asserts
 * that THIS FILE refuses — it asserts that the surface FOLLOWS THE SERVER and
 * SAYS WHY, at the ONE seam that decides it: the backend's answer.
 *
 *   404 / error                     → shut + "could not confirm"
 *   still unanswered                → shut
 *   ordering_allowed: false         → shut, naming the setting
 *   live + dev origin + knob off    → shut, naming the setting
 *   live + dev origin + knob ON     → OPEN (the knob decides, not this file)
 *   ordering_allowed: true          → open (with a complete form)
 *
 * The next person who removes the badge, or who reintroduces a hard-coded
 * refusal this surface owns, gets a red test rather than a green build.
 *
 * No test here can reach checkout: `createOrder` is mocked and throws if called.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { OrderFlow } from "../OrderFlow";

jest.mock("@/lib/api/typed-client", () => ({ apiGet: jest.fn() }));

/**
 * jsdom refuses to let `window.location` be redefined, so the ONE line that
 * reads the hostname is stubbed and everything else in the gate module stays
 * REAL — `orderingAllowed` and `orderingBlockedReason`, the functions that
 * actually decide and explain, are the real implementations under test here.
 */
jest.mock("../ordering-gate", () => ({
  ...jest.requireActual("../ordering-gate"),
  isDevOriginSurface: jest.fn(() => false),
}));

const mockedIsDevOrigin = (
  jest.requireMock("../ordering-gate") as { isDevOriginSurface: jest.Mock }
).isDevOriginSurface;

const mockedApiGet = (
  jest.requireMock("@/lib/api/typed-client") as { apiGet: jest.Mock }
).apiGet;

/** The seeded platform defaults, paired in test mode. */
const PAIRED_TEST_MODE = {
  lulu_environment: "test",
  lulu_api_base: "https://api.sandbox.lulu.com",
  payment_mode: "test",
  pairing_ok: true,
  charges_real_money: false,
  message: "Sandbox printing paired with Stripe test mode — no real money.",
  require_mode_pairing: true,
  allow_dev_origin_live_charges: false,
  ordering_allowed: true,
  settings_note:
    "Dev-origin orders: blocked by setting — change it under Organization settings → Configuration (Commerce). Matching Lulu/Stripe modes: required by setting.",
};

/** A correctly-paired LIVE backend — the 2026-09-07 reviewer's server. */
const PAIRED_LIVE_MODE = {
  ...PAIRED_TEST_MODE,
  lulu_environment: "live",
  lulu_api_base: "https://api.lulu.com",
  payment_mode: "live",
  charges_real_money: true,
  message: "LIVE MODE — a completed checkout charges a real card.",
};

// The repo has no @testing-library/react (see test-utils/renderHook.tsx); React
// 19's own `act` + createRoot is the house harness.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../order-api", () => ({
  ORDER_STATUS_LABELS: {},
  listOrders: jest.fn(async () => []),
  createOrder: jest.fn(async () => {
    throw new Error("createOrder must never run in the gate suite");
  }),
  cancelOrder: jest.fn(),
  isCancelable: () => false,
}));

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: jest.fn(async () => false),
}));

// The design-system primitives are styled <input>/<label>/<button>; the gate
// depends on none of their styling. `disabled` is forwarded verbatim — that
// prop IS the assertion of this suite.
jest.mock("@ai-matrx/design-system", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
  Label: (props: React.ComponentProps<"label">) => <label {...props} />,
  Button: (props: React.ComponentProps<"button">) => <button {...props} />,
}));

const PROPS = {
  podPackageId: "0600X0900BWSTDPB060UW444MXX",
  pageCount: 120,
  quantity: 1,
  shippingLevel: "MAIL",
  destination: {
    countryCode: "US",
    city: "Los Angeles",
    postcode: "90001",
    street1: "1 Main St",
    stateCode: "CA",
  },
  disabled: false,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/** Drive the surface as if it were served from a developer machine, or not. */
function setDevOrigin(devOrigin: boolean): void {
  mockedIsDevOrigin.mockReturnValue(devOrigin);
}

async function renderOrderFlow(): Promise<void> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  container = host;
  await act(async () => {
    const created = createRoot(host);
    root = created;
    created.render(<OrderFlow {...PROPS} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function orderButton(): HTMLButtonElement {
  const button = mounted().querySelector<HTMLButtonElement>(
    '[data-testid="order-and-pay"]',
  );
  if (!button) throw new Error("The 'Order & pay' button is gone from the form.");
  return button;
}

function mounted(): HTMLDivElement {
  if (!container) throw new Error("Render the order form first.");
  return container;
}

/** Type into a React-controlled input the way the browser does. */
async function fill(id: string, value: string): Promise<void> {
  const input = mounted().querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`No field #${id} on the order form.`);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function completeForm(): Promise<void> {
  await fill("order-title", "Gate Check");
  await fill("order-name", "Ada Lovelace");
  await fill("order-email", "ada@example.com");
  await fill("order-phone", "+15555550100");
  await fill("order-street", "1 Main St");
}

beforeEach(() => {
  setDevOrigin(false);
});

afterEach(async () => {
  const activeRoot = root;
  if (activeRoot) {
    await act(async () => {
      activeRoot.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
  jest.clearAllMocks();
  setDevOrigin(false);
});

function badgeText(): string {
  return (
    mounted().querySelector('[data-testid="payment-mode-badge"]')?.textContent ??
    ""
  );
}

describe("LIVE-MONEY VISIBILITY: /print/order order button", () => {
  it("stays shut and says so when the backend cannot answer (404)", async () => {
    mockedApiGet.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );
    await renderOrderFlow();
    await completeForm();

    expect(badgeText()).toContain("Ordering is off — could not confirm payment mode");
    expect(orderButton().disabled).toBe(true);
  });

  it("stays shut when the server's own settings say ordering_allowed: false", async () => {
    mockedApiGet.mockResolvedValue({
      data: {
        ...PAIRED_TEST_MODE,
        payment_mode: "live",
        pairing_ok: false,
        ordering_allowed: false,
        message:
          "The print lane's two money integrations disagree: Lulu is in test mode while Stripe is in live mode.",
      },
    });
    await renderOrderFlow();
    await completeForm();

    expect(orderButton().disabled).toBe(true);
    expect(badgeText()).toContain("a setting is blocking it");
  });

  it("stays shut while the backend has not answered yet", async () => {
    mockedApiGet.mockReturnValue(new Promise(() => {}));
    await renderOrderFlow();
    await completeForm();

    expect(badgeText()).toContain("Checking which payment mode");
    expect(orderButton().disabled).toBe(true);
  });

  it("never starts a checkout while the door is shut", async () => {
    mockedApiGet.mockRejectedValue(new Error("Not Found"));
    const { createOrder } = jest.requireMock("../order-api") as {
      createOrder: jest.Mock;
    };
    await renderOrderFlow();
    await completeForm();
    await act(async () => {
      orderButton().click();
    });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("opens when the server allows ordering and the form is complete", async () => {
    mockedApiGet.mockResolvedValue({ data: PAIRED_TEST_MODE });
    await renderOrderFlow();

    // Door open, form empty — still shut, for the ordinary reason.
    expect(orderButton().disabled).toBe(true);

    await completeForm();
    expect(badgeText()).toContain("Test mode — no real money");
    expect(orderButton().disabled).toBe(false);
  });
});

describe("THE KNOB DECIDES: dev-origin live charges", () => {
  it("is shut on a dev origin against a LIVE backend while the setting is off, and names the setting", async () => {
    setDevOrigin(true);
    mockedApiGet.mockResolvedValue({ data: PAIRED_LIVE_MODE });
    await renderOrderFlow();
    await completeForm();

    // This is the exact 2026-09-07 path: a localhost page talking to a
    // correctly-paired LIVE production backend.
    expect(orderButton().disabled).toBe(true);
    expect(badgeText()).toContain("development address");
    expect(badgeText()).toContain("Dev-origin orders: blocked by setting");
  });

  it("OPENS on the same dev origin once the setting is on — the knob decides, not this file", async () => {
    setDevOrigin(true);
    mockedApiGet.mockResolvedValue({
      data: { ...PAIRED_LIVE_MODE, allow_dev_origin_live_charges: true },
    });
    await renderOrderFlow();
    await completeForm();

    expect(orderButton().disabled).toBe(false);
    expect(badgeText()).toContain("Live mode — real money");
    expect(badgeText()).toContain("Dev-origin orders: allowed by setting");
  });

  it("is unaffected by a dev origin when the backend is in TEST mode", async () => {
    setDevOrigin(true);
    mockedApiGet.mockResolvedValue({ data: PAIRED_TEST_MODE });
    await renderOrderFlow();
    await completeForm();

    // Local development against a sandbox-paired backend is the SUPPORTED path;
    // no setting has to be touched to make ordering testable.
    expect(orderButton().disabled).toBe(false);
  });
});

describe("THE BADGE REPORTS THE SETTINGS, in plain words", () => {
  it("says when matching modes are not required and that such orders are recorded", async () => {
    mockedApiGet.mockResolvedValue({
      data: { ...PAIRED_TEST_MODE, require_mode_pairing: false },
    });
    await renderOrderFlow();

    expect(badgeText()).toContain("not required by setting");
    expect(badgeText()).toContain("every one is recorded");
  });

  it("always names both settings, whatever the mode", async () => {
    mockedApiGet.mockResolvedValue({ data: PAIRED_LIVE_MODE });
    await renderOrderFlow();

    expect(badgeText()).toContain("Dev-origin orders:");
    expect(badgeText()).toContain("Matching Lulu and Stripe modes:");
  });
});
