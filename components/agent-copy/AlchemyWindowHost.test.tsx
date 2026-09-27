/**
 * PP-01a — the web app's WindowPort draws LIVE preparation sessions in real WindowPanels, several
 * at once.
 *
 * Real: the controller, `AlchemyWindowHost`, `WindowPanel` with the real window-manager reducers,
 * and two real `@ai-matrx/alchemy/operate` preparation sessions. Breaks caught: the render closure
 * serialized or lost (the second seal would never show); two sessions sharing one window or one
 * session's edit reaching the other; a closed panel never telling its opener; the port claiming
 * to be a single-dialog host.
 */
import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { openPreparation, type PreparationSession, type SealedArtifact } from "@ai-matrx/alchemy/operate";
import type { WindowHandle } from "@ai-matrx/alchemy/ports";
import overlayReducer from "@/lib/redux/slices/overlaySlice";
import windowManagerReducer from "@/lib/redux/slices/windowManagerSlice";
import adminDebugReducer from "@/lib/redux/preferences/adminDebugSlice";
import urlSyncReducer from "@/lib/redux/slices/urlSyncSlice";
import { AlchemyWindowHost, alchemyPanelId, createAlchemyWindowController } from "./AlchemyWindowHost";

const routeNotes = "Route 14 — Tuesday pickups\nHarbor Dental: cardboard, dock behind the blue door";
const intakeNotes = "New-patient intake — Marisol Ortega\nInsurer: Delta Dental PPO";

function SessionView({ session, label }: { session: PreparationSession; label: string }) {
  const [artifact, setArtifact] = useState<SealedArtifact | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    void session.seal("plain", {}, new AbortController().signal).then(setArtifact);
  }, [session, revision]);
  return (
    <div>
      <pre aria-label={label}>{artifact?.plainText ?? ""}</pre>
      <button
        type="button"
        aria-label={`${label}: keep the heading only`}
        onClick={() => {
          session.edit({ kind: "text", text: session.draft.payload.kind === "text" ? (session.draft.payload.text.split("\n")[0] ?? "") : "" });
          setRevision((r) => r + 1);
        }}
      />
    </div>
  );
}

const sealedText = async (session: PreparationSession) => (await session.seal("plain", {}, new AbortController().signal)).plainText;
const byLabel = (label: string) => document.querySelector(`[aria-label="${label}"]`);
async function waitFor(check: () => boolean, what: string) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  throw new Error(`never happened: ${what}`);
}

describe("web app WindowPort (PP-01a)", () => {
  let container: HTMLDivElement;
  let root: Root;
  const store = () =>
    configureStore({ reducer: { overlays: overlayReducer, windowManager: windowManagerReducer, adminDebug: adminDebugReducer, urlSync: urlSyncReducer } });

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() })),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.querySelectorAll("[data-window-panel-state]").forEach((node) => node.parentElement?.parentElement?.remove());
  });

  it("is a real window host: non-blocking and several at once", () => {
    const controller = createAlchemyWindowController({ focusPanel: () => {} });
    expect(controller.port.presentation).toBe("window");
    expect(controller.port.multiInstance).toBe(true);
  });

  it("two live sessions open side by side, each showing exactly its own sealed artifact before and after an edit", async () => {
    const s = store();
    const controller = createAlchemyWindowController({ focusPanel: () => {} });
    await act(async () => {
      root.render(
        <Provider store={s}>
          <AlchemyWindowHost controller={controller} />
        </Provider>,
      );
    });
    const route = await openPreparation({ kind: "text", text: routeNotes }, "target", new AbortController().signal);
    const intake = await openPreparation({ kind: "text", text: intakeNotes }, "target", new AbortController().signal);
    await act(async () => {
      controller.port.open(() => <SessionView session={route} label="Route preview" />, { title: "Prepare route notes" });
      controller.port.open(() => <SessionView session={intake} label="Intake preview" />, { title: "Prepare intake" });
    });
    await waitFor(() => byLabel("Route preview")?.textContent === routeNotes && byLabel("Intake preview")?.textContent === intakeNotes, "both previews sealed");
    expect(byLabel("Route preview")?.textContent).toBe(await sealedText(route));

    await act(async () => {
      (byLabel("Route preview: keep the heading only") as HTMLButtonElement).click();
    });
    await waitFor(() => byLabel("Route preview")?.textContent === "Route 14 — Tuesday pickups", "the route edit sealed");
    expect(byLabel("Route preview")?.textContent).toBe(await sealedText(route));
    expect(byLabel("Intake preview")?.textContent).toBe(intakeNotes);
  });

  it("closing one window tells only its opener and leaves the other open", async () => {
    const s = store();
    const focused: string[] = [];
    const controller = createAlchemyWindowController({ focusPanel: (id) => focused.push(id) });
    await act(async () => {
      root.render(
        <Provider store={s}>
          <AlchemyWindowHost controller={controller} />
        </Provider>,
      );
    });
    const firstClosed = jest.fn();
    const secondClosed = jest.fn();
    let first!: WindowHandle;
    let second!: WindowHandle;
    await act(async () => {
      first = controller.port.open(() => <p>Pickup schedule</p>, { title: "Prepare pickup schedule", onClose: firstClosed });
      second = controller.port.open(() => <p>Dental intake</p>, { title: "Prepare intake", onClose: secondClosed });
    });
    act(() => second.focus());
    expect(focused).toEqual([alchemyPanelId(second.instanceId)]);
    await act(async () => first.close());
    expect(firstClosed).toHaveBeenCalledTimes(1);
    expect(secondClosed).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Pickup schedule");
    expect(document.body.textContent).toContain("Dental intake");
    expect(second.isOpen()).toBe(true);
  });
});
