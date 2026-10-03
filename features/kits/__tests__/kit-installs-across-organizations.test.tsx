/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const readInstall = jest.fn();
const storeCheck = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "user-1" }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "user-1" }));
jest.mock("../installer", () => ({
  kitRecordsClient: (org: string) => ({ org }),
  readInstall: (client: { org: string }, org: string, key: string) => readInstall(client.org, org, key),
}));

import { useKitInstalls, type KitInstallsState } from "../hooks/useKitInstalls";

let latest: KitInstallsState | null = null;
function Probe({ ids }: { ids: readonly string[] | null }) {
  latest = useKitInstalls("starter", ids);
  return null;
}

describe("useKitInstalls lists installs across every organization it is given", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    root = createRoot(host);
    latest = null;
    storeCheck.mockReset().mockResolvedValue({ state: "on" });
    readInstall.mockReset();
  });
  afterEach(() => act(() => root.unmount()));

  async function render(ids: readonly string[] | null) {
    await act(async () => {
      root.render(<Probe ids={ids} />);
    });
    await act(async () => {});
  }

  it("returns the install of each organization it lives in, each carrying its own organization", async () => {
    readInstall.mockImplementation(async (client: string, org: string) =>
      org === "org-a" || org === "org-c" ? { id: `i-${org}`, organization_id: org, status: "installed", steps: {} } : null,
    );
    await render(["org-a", "org-b", "org-c"]);
    expect(latest!.loading).toBe(false);
    expect(latest!.installs.map((i) => i.organizationId)).toEqual(["org-a", "org-c"]);
    // every read ran in the organization it was asked about, never in a single active one
    expect(readInstall.mock.calls.map((c) => c[0]).sort()).toEqual(["org-a", "org-b", "org-c"]);
  });

  it("narrows to one organization only when the caller passes only that one", async () => {
    readInstall.mockResolvedValue({ id: "i", organization_id: "org-b", status: "installed", steps: {} });
    await render(["org-b"]);
    expect(latest!.installs).toHaveLength(1);
    expect(readInstall).toHaveBeenCalledTimes(1);
  });

  it("names an organization whose read failed instead of dropping it silently", async () => {
    readInstall.mockImplementation(async (_c: string, org: string) => {
      if (org === "org-b") throw new Error("boom");
      return null;
    });
    await render(["org-a", "org-b"]);
    expect(latest!.failures).toEqual([{ organizationId: "org-b", message: "boom" }]);
  });

  it("stays loading until the organizations are known", async () => {
    await render(null);
    expect(latest!.loading).toBe(true);
    expect(readInstall).not.toHaveBeenCalled();
  });
});
