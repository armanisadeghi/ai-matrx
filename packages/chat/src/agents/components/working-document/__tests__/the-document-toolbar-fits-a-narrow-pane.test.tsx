/**
 * THE DOCUMENT TOOLBAR FITS A NARROW PANE.
 *
 * The working-document editor's header (view mode, agent diff, history, the
 * action toolkit, the switch) sits in a 360px canvas pane, on a 375px phone
 * and in a wide window. On a phone the view-mode button was squeezed until its
 * word broke letter by letter ("E di t") and the action toolkit wrapped to a
 * second row. The header is now a size container: the controls never shrink,
 * the word drops below 20rem, and below 30rem the toolkit folds into its one ⋯
 * menu — decided by the PANEL's width, never the screen's (a canvas pane on a
 * wide screen is as narrow as a phone).
 *
 * jsdom has no layout, so this pins the contract the browser enforces (the
 * live check is a 360px pane and a 375px phone, both themes).
 *
 * Proven failing before passing (2026-10-02): against the previous controls
 * and header → every test RED (the button could shrink and wrap, its word was
 * always shown, the header was no container and drew only the full bar).
 */

import fs from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { WorkingDocumentViewControls } from "../WorkingDocumentViewControls";

// The History button opens its canvas tab through the host's canvas port.
jest.mock("../../../../host/canvas", () => ({
  useChatCanvasTab: () => ({ isAvailable: true, isVisible: false, selected: null, toggle: () => undefined }),
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const classesOf = (element: Element | null) => new Set((element?.getAttribute("class") ?? "").split(/\s+/));

describe("the view-mode button never squeezes", () => {
  it("keeps its size and its word on one line, and drops the word in a narrow panel", () => {
    const { container, unmount } = render(<WorkingDocumentViewControls conversationId="c-narrow" />);
    const modeButton = container.querySelector('button[title="Change view mode"]');
    expect(modeButton).not.toBeNull();
    // THE button (design-system controls) never shrinks and never wraps: its
    // geometry is locked in controls.css, so the contract is "is THE button".
    expect(modeButton?.getAttribute("data-matrx-control")).toBe("button");
    // Icon-only in a narrow panel, and still named.
    expect(modeButton?.getAttribute("aria-label")).toBe("View: Edit");
    const word = Array.from(modeButton?.querySelectorAll("span") ?? []).find((span) => span.textContent === "Edit");
    expect(classesOf(word ?? null).has("hidden")).toBe(true);
    expect(classesOf(word ?? null).has("@[20rem]/wdhead:inline")).toBe(true);
    for (const other of Array.from(container.querySelectorAll("button"))) {
      expect(other.getAttribute("data-matrx-control")).toBe("button");
    }
    unmount();
  });
});

describe("the header folds by the panel's width, not the screen's", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "WorkingDocumentPanel.tsx"), "utf8");

  it("the header row is the size container the controls read", () => {
    expect(panel).toMatch(/className="@container\/wdhead [^"]*"/);
  });

  it("the full toolkit shows only in a wide panel; a narrow one gets the one ⋯ menu", () => {
    expect(panel).toMatch(/className="hidden [^"]*@\[30rem\]\/wdhead:flex"[\s\S]{0,200}variant="bar"/);
    expect(panel).toMatch(/className="[^"]*@\[30rem\]\/wdhead:hidden"[\s\S]{0,200}variant="menu"/);
  });

  it("no control in the toolbar answers to the screen width", () => {
    const controls = fs.readFileSync(path.join(__dirname, "..", "WorkingDocumentViewControls.tsx"), "utf8");
    expect(controls).not.toMatch(/\b(sm|md|lg):(inline|flex|block|hidden)\b/);
  });
});
