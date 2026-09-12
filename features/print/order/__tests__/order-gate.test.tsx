/**
 * FORCING TEST for the LIVE-MONEY GATE on /demos/lulu-pricing.
 *
 * This suite exists because the gate was deleted three times in one evening
 * (f7a9e3c297, 2d90e58b23, 69e8b9ff7f) while the demo could open a REAL Stripe
 * checkout — twice because its reader bound to a route the backend had not yet
 * deployed. aidream has now deployed `/lulu/payment-mode`, so the reader is on
 * the contract-bound typed client like every other call in this folder.
 *
 * What is asserted here is the BUTTON, not an internal flag, at the ONE seam
 * that decides the gate — the backend's answer:
 *   404 / error            → disabled + "Ordering is off — could not confirm"
 *   200 pairing_ok: false  → disabled
 *   still unanswered       → disabled
 *   200 pairing_ok: true   → enabled (with a complete form)
 * The next person who removes the gate gets a red test, not a green build.
 *
 * No test here can reach checkout: `createOrder` is mocked and throws if called.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { OrderFlow } from "../OrderFlow";

jest.mock("@/lib/api/typed-client", () => ({ apiGet: jest.fn() }));

const mockedApiGet = (
  jest.requireMock("@/lib/api/typed-client") as { apiGet: jest.Mock }
).apiGet;

const PAIRED_TEST_MODE = {
  lulu_environment: "test",
  lulu_api_base: "https://api.sandbox.lulu.com",
  payment_mode: "test",
  pairing_ok: true,
  charges_real_money: false,
  message: "Sandbox printing paired with Stripe test mode — no real money.",
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
});

function badgeText(): string {
  return (
    mounted().querySelector('[data-testid="payment-mode-badge"]')?.textContent ??
    ""
  );
}

describe("LIVE-MONEY GATE: /demos/lulu-pricing order button", () => {
  it("stays shut and says so when the backend cannot answer (404)", async () => {
    mockedApiGet.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );
    await renderOrderFlow();
    await completeForm();

    expect(badgeText()).toContain("Ordering is off — could not confirm payment mode");
    expect(orderButton().disabled).toBe(true);
  });

  it("stays shut when the backend answers with pairing_ok: false", async () => {
    mockedApiGet.mockResolvedValue({
      data: {
        ...PAIRED_TEST_MODE,
        payment_mode: "live",
        pairing_ok: false,
        charges_real_money: false,
        message: "Lulu is in test mode while Stripe is live — ordering refused.",
      },
    });
    await renderOrderFlow();
    await completeForm();

    expect(orderButton().disabled).toBe(true);
  });

  it("stays shut while the backend has not answered yet", async () => {
    mockedApiGet.mockReturnValue(new Promise(() => {}));
    await renderOrderFlow();
    await completeForm();

    expect(badgeText()).toContain("Checking which payment mode");
    expect(orderButton().disabled).toBe(true);
  });

  it("never starts a checkout while the gate is shut", async () => {
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

  it("opens only when the backend reports pairing_ok: true and the form is complete", async () => {
    mockedApiGet.mockResolvedValue({ data: PAIRED_TEST_MODE });
    await renderOrderFlow();

    // Gate open, form empty — still shut, for the ordinary reason.
    expect(orderButton().disabled).toBe(true);

    await completeForm();
    expect(badgeText()).toContain("Test mode — no real money");
    expect(orderButton().disabled).toBe(false);
  });
});
