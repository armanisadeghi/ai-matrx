/**
 * A host with no canvas never pretends to show something on one.
 *
 * Chat puts its working document, scratchpad, sandbox and pinned artifacts on
 * the host's canvas through the `canvas` port. A bare host (only `db`) has no
 * canvas column, so every verb must return false and SAY so — once, with the
 * remedy, and into diagnostics — never a silent success.
 *
 * Proven failing before passing: made the default `open` return true and drop
 * the announcement → "every verb refuses" RED (open reported success, no
 * notice, no diagnostics row).
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { configureStore } from "@reduxjs/toolkit";
import {
  _resetChatHostForTests,
  resolveChatHost,
  type ChatCanvasOpeners,
  type ChatCanvasPort,
  type ChatCanvasView,
  type ChatDiagnosticContext,
} from "../index";
import { ChatProvider } from "../react";
import { useChatCanvasOpeners, useChatCanvasView } from "../canvas";
import { _resetAnnouncements } from "../errors";
import { createFakeDb } from "./fake-db";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

let warn: jest.SpyInstance;

beforeEach(() => {
  _resetAnnouncements();
  warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
  _resetChatHostForTests();
});

function renderUnderHost(canvas?: ChatCanvasPort) {
  const { db } = createFakeDb();
  const captured: ChatDiagnosticContext[] = [];
  const seen: { view: ChatCanvasView | null; openers: ChatCanvasOpeners | null } = {
    view: null,
    openers: null,
  };
  function Probe() {
    seen.view = useChatCanvasView();
    seen.openers = useChatCanvasOpeners();
    return null;
  }
  const store = configureStore({ reducer: { probe: () => 0 } });
  const host = {
    db,
    diagnostics: { capture: (_error: unknown, ctx: ChatDiagnosticContext) => void captured.push(ctx) },
    ...(canvas ? { canvas } : {}),
  };
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => {
    root.render(
      <ChatProvider host={host} store={store}>
        <Probe />
      </ChatProvider>,
    );
  });
  act(() => root.unmount());
  return { seen, captured };
}

const DOC = {
  type: "working_document",
  data: { conversationId: "c1", kind: "working" },
  metadata: { title: "Working document", sourceMessageId: "wd:c1:working" },
};

describe("an unhosted canvas refuses, and says so", () => {
  it("every verb refuses instead of succeeding", () => {
    const { seen, captured } = renderUnderHost();
    const openers = seen.openers as ChatCanvasOpeners;
    expect(openers.isAvailable).toBe(false);
    expect(openers.open(DOC)).toBe(false);
    expect(openers.offer(DOC)).toBe(false);
    expect(openers.openPointer({ artifactId: "a1", type: "code" })).toBe(false);
    openers.toggle();

    const notices = warn.mock.calls.map(([line]) => String(line));
    expect(notices.some((line) => line.includes('Canvas open of "working_document" did nothing'))).toBe(true);
    expect(notices.every((line) => !line.includes("Canvas") || line.includes("Pass a `canvas` port"))).toBe(true);
    expect(captured.map((ctx) => ctx.code)).toEqual([
      "canvas-host-missing",
      "canvas-host-missing",
      "canvas-host-missing",
      "canvas-host-missing",
    ]);
  });

  it("announces each verb once, not on every press", () => {
    const { seen, captured } = renderUnderHost();
    const openers = seen.openers as ChatCanvasOpeners;
    openers.open(DOC);
    openers.open(DOC);
    expect(warn.mock.calls.filter(([line]) => String(line).includes("Canvas open"))).toHaveLength(1);
    expect(captured).toHaveLength(1);
  });

  it("shows an empty, closed canvas", () => {
    const { seen } = renderUnderHost();
    expect(seen.view).toEqual({
      isOpen: false,
      sourceIds: [],
      activeSourceId: null,
      activeArtifactId: null,
    });
  });

  it("a host's own canvas port is the one chat uses", () => {
    const view: ChatCanvasView = {
      isOpen: true,
      sourceIds: ["wd:c1:working"],
      activeSourceId: "wd:c1:working",
      activeArtifactId: null,
    };
    const openers: ChatCanvasOpeners = {
      isAvailable: true,
      open: () => true,
      offer: () => true,
      openPointer: () => true,
      hide: () => undefined,
      toggle: () => undefined,
    };
    const { seen } = renderUnderHost({ useView: () => view, useOpeners: () => openers });
    expect(seen.view).toBe(view);
    expect(seen.openers).toBe(openers);
    expect(resolveChatHost({ db: createFakeDb().db, canvas: { useView: () => view, useOpeners: () => openers } }).overridden.has("canvas")).toBe(true);
  });
});
