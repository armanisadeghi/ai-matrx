/**
 * FORCING TEST for the LIVE-MONEY GATE on /demos/lulu-pricing.
 *
 * This suite exists because the gate has been deleted three times in one
 * evening (f7a9e3c297, 2d90e58b23, 69e8b9ff7f) while the demo could open a REAL
 * Stripe checkout. Twice the stated reason was the contract — the gate's reader
 * bound to `/lulu/payment-mode`, which aidream has not deployed. So the gate no
 * longer reads anything (see ../ordering-gate.ts): ordering is simply shut
 * until the backend can say which payment mode it is in.
 *
 * What is asserted here is the BUTTON, not an internal flag: with the order form
 * completely filled in, "Order & pay" is still disabled, and the screen says why
 * rather than looking merely broken. The next person who removes the gate gets a
 * red test, not a green build.
 *
 * No test here can reach checkout: `createOrder` is mocked and throws if called.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { OrderFlow } from "../OrderFlow";
import { ORDERING_ALLOWED } from "../ordering-gate";

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

describe("LIVE-MONEY GATE: /demos/lulu-pricing order button", () => {
  it("is shut while the backend cannot report its payment mode", () => {
    // Guards the premise of every case below. When aidream deploys
    // /lulu/payment-mode and sync-types picks it up, ../ordering-gate.ts stops
    // compiling on purpose — fix it there (read the mode, gate on
    // pairing_ok === true), then update this suite to cover the four states.
    expect(ORDERING_ALLOWED).toBe(false);
  });

  it("stays disabled even with the order form completely filled in", async () => {
    await renderOrderFlow();
    expect(orderButton().disabled).toBe(true);

    await completeForm();
    expect(orderButton().disabled).toBe(true);
  });

  it("says why, instead of looking merely broken", async () => {
    await renderOrderFlow();
    const notice = mounted().querySelector('[data-testid="ordering-off-notice"]');
    expect(notice).not.toBeNull();
    expect(notice?.textContent ?? "").toContain("Ordering is off");
    expect(notice?.textContent ?? "").toContain("payment mode");
  });

  it("never starts a checkout while the gate is shut", async () => {
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
});
