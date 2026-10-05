import { act } from "react";
import { createRoot } from "react-dom/client";
import { SubscriptionControls } from "../SubscriptionControls";
const mockClient = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ createClient: () => mockClient() }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "signed-in-person" }));
declare global { var IS_REACT_ACT_ENVIRONMENT: boolean; }
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

it("keeps management reachable for a purchased subscription without a second customer-presence query", async () => {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<SubscriptionControls livemode={false} hasPurchasedSubscription label="Manage billing" />));
    expect(host.querySelector("button")?.textContent).toBe("Manage billing");
    expect(mockClient).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
