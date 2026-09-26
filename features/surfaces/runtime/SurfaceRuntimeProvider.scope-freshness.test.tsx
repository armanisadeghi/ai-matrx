import { act, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import {
  getSurfaceRuntimeForName,
  SurfaceRuntimeProvider,
} from "./SurfaceRuntimeContext";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

jest.mock("@/components/agent-copy/AlchemySurfaceBridge", () => ({
  AlchemySurfaceBridge: ({ children }: { children: ReactNode }) => children,
}));

const SURFACE = "matrx-user/education-audio-study";

function ScopeProbe({
  onRead,
}: {
  onRead: (scope: SurfaceScopePayload | Promise<SurfaceScopePayload> | undefined) => void;
}) {
  onRead(getSurfaceRuntimeForName(SURFACE)?.getScope());
  return null;
}

describe("SurfaceRuntimeProvider scope freshness", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("makes an already-registered runtime read the current render before passive effects", async () => {
    const accountScope = (account: string): SurfaceScopePayload => ({
      library_loaded: account !== "signed-out",
      // `view` is a declared value of this surface; a loaded value must be declared.
      view: account,
      ...(account === "account-a" ? { audio_library: [{ id: "a-only" }] } : {}),
    });

    await act(async () => {
      root.render(
        <SurfaceRuntimeProvider surfaceName={SURFACE} getScope={() => accountScope("account-a")}>
          <div />
        </SurfaceRuntimeProvider>,
      );
    });
    const registered = getSurfaceRuntimeForName(SURFACE);
    expect(registered?.getScope()).toMatchObject({
      view: "account-a",
      audio_library: [{ id: "a-only" }],
    });

    let scopeReadDuringRerender: SurfaceScopePayload | Promise<SurfaceScopePayload> | undefined;
    // The probe runs as the new provider tree renders, before its passive
    // effects. It invokes the callback already registered for Account A.
    await act(async () => {
      flushSync(() => {
        root.render(
          <SurfaceRuntimeProvider surfaceName={SURFACE} getScope={() => accountScope("signed-out")}>
            <ScopeProbe onRead={(scope) => { scopeReadDuringRerender = scope; }} />
          </SurfaceRuntimeProvider>,
        );
      });
    });

    expect(scopeReadDuringRerender).toEqual({
      library_loaded: false,
      view: "signed-out",
    });
    expect(registered?.getScope()).toEqual({
      library_loaded: false,
      view: "signed-out",
    });
    expect(getSurfaceRuntimeForName(SURFACE)).toBe(registered);
  });
});
