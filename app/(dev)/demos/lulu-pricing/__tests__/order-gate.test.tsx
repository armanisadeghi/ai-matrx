/**
 * FORCING TEST for the LIVE-MONEY GATE on /demos/lulu-pricing.
 *
 * This suite exists because the gate was deleted once already: commit
 * f57438c08c added it, `pnpm sync-types` regenerated the contract without the
 * (not-yet-deployed) /lulu/payment-mode route, and f7a9e3c297 removed all 127
 * lines to make the build green — leaving "Order & pay" enabled on form
 * completeness alone against a production backend holding live Stripe keys.
 *
 * The next person who deletes the gate gets a red test, not a green build.
 *
 * It drives the real OrderFlow through the ONE seam that decides the gate — the
 * backend's answer at GET /lulu/payment-mode — and asserts the button, not an
 * internal flag:
 *   404 / error            → disabled + "Ordering is off — could not confirm"
 *   200 pairing_ok: false  → disabled
 *   200 pairing_ok: true   → enabled (with a complete form)
 *
 * No test here ever reaches checkout: createOrder is mocked and never called.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { OrderFlow } from "../OrderFlow";
// Type-only on purpose: pulling the raw client as a VALUE here would enroll
// this test file in the transport gates (`check:api-contracts` /
// `check:backend-boundaries`) alongside the reader it exists to protect.
// The mock itself is fetched via `jest.requireMock` below.
import type { getJson as GetJson } from "@/lib/python-client";

// The repo has no @testing-library/react (see test-utils/renderHook.tsx); React
// 19's own `act` + createRoot is the house harness.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/python-client", () => ({ getJson: jest.fn() }));

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
// depends on none of their styling, and mocking them keeps the suite off the
// package's ESM chain. `disabled` is forwarded verbatim — that prop IS the
// assertion of this suite.
jest.mock("@ai-matrx/design-system", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
  Label: (props: React.ComponentProps<"label">) => <label {...props} />,
  Button: (props: React.ComponentProps<"button">) => <button {...props} />,
}));

const mockedGetJson = (
  jest.requireMock("@/lib/python-client") as { getJson: jest.Mock }
).getJson as jest.MockedFunction<typeof GetJson>;

const PAIRED_TEST_MODE = {
  lulu_environment: "test",
  lulu_api_base: "https://api.sandbox.lulu.com",
  payment_mode: "test",
  pairing_ok: true,
  charges_real_money: false,
  message: "Sandbox printing paired with Stripe test mode — no real money.",
};

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

let container: HTMLDivElement;
let root: Root;

async function renderOrderFlow(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<OrderFlow {...PROPS} />);
  });
  // Let the payment-mode probe settle.
  await act(async () => {
    await Promise.resolve();
  });
}

function orderButton(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    '[data-testid="order-and-pay"]',
  );
  if (!button) throw new Error("The 'Order & pay' button is gone from the form.");
  return button;
}

function badgeText(): string {
  return (
    container.querySelector('[data-testid="payment-mode-badge"]')?.textContent ??
    ""
  );
}

/** Type into a React-controlled input the way the browser does. */
async function fill(id: string, value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(`#${id}`);
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
  await fill("order-title", "My Course Workbook");
  await fill("order-name", "Ada Lovelace");
  await fill("order-email", "ada@example.com");
  await fill("order-phone", "+15555550100");
  await fill("order-street", "1 Main St");
}

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  jest.clearAllMocks();
});

describe("LIVE-MONEY GATE: /demos/lulu-pricing order button", () => {
  it("stays shut and says so when the backend has no /lulu/payment-mode (404)", async () => {
    mockedGetJson.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );
    await renderOrderFlow();
    await completeForm();

    expect(badgeText()).toContain("Ordering is off — could not confirm payment mode");
    expect(orderButton().disabled).toBe(true);
  });

  it("stays shut when the backend answers with pairing_ok: false", async () => {
    mockedGetJson.mockResolvedValue({
      data: {
        ...PAIRED_TEST_MODE,
        payment_mode: "live",
        pairing_ok: false,
        message: "Lulu is in test mode while Stripe is live — ordering refused.",
      },
      meta: {} as never,
    } as never);
    await renderOrderFlow();
    await completeForm();

    expect(orderButton().disabled).toBe(true);
  });

  it("stays shut while the backend has not answered yet", async () => {
    mockedGetJson.mockReturnValue(new Promise(() => {}) as never);
    await renderOrderFlow();
    await completeForm();

    expect(badgeText()).toContain("Checking which payment mode");
    expect(orderButton().disabled).toBe(true);
  });

  it("opens only when the backend reports pairing_ok: true and the form is complete", async () => {
    mockedGetJson.mockResolvedValue({
      data: PAIRED_TEST_MODE,
      meta: {} as never,
    } as never);
    await renderOrderFlow();

    // Gate open, form empty — still shut, for the ordinary reason.
    expect(orderButton().disabled).toBe(true);

    await completeForm();
    expect(badgeText()).toContain("Test mode — no real money");
    expect(orderButton().disabled).toBe(false);
  });
});
