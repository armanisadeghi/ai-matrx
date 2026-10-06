/**
 * GUARD: the remarks / block-state host port is never silently a stand-in.
 * `@ai-matrx/chat` keeps unsent chips through ONE module-level port the app
 * registers (registerRemarkDurability). Unregistered, every chip is browser-only
 * and vanishes on reload — with no error. Proven here three ways: the app's
 * registration component wires the port (and releases it), the Providers tree
 * mounts that component, and an unwired call announces itself.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import fs from "node:fs";
import path from "node:path";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({ useAppStore: () => ({ dispatch: jest.fn(), getState: () => ({}), subscribe: () => () => undefined }) }));
jest.mock("@/providers/chat-surface-manifests", () => ({}));
jest.mock("@/features/chat-tool-renderers/registerFeatureToolRenderers", () => ({}));
jest.mock("@/features/chat-context-bodies/registerContextBodies", () => ({}));
jest.mock("@/features/records-tool-display/registerDataToolRenderers", () => ({}));
jest.mock("@ai-matrx/chat/surfaces/runtime/intelligence", () => ({ registerSurfaceIntelligence: jest.fn() }));
jest.mock("@/features/mandates/feature-intelligence/IntelligenceIndicator", () => ({ IntelligenceIndicator: () => null, declaredKeysForRoute: jest.fn() }));
jest.mock("@/features/mandates/feature-intelligence/page-intelligence-doors", () => ({ usePageIntelligenceDoors: jest.fn() }));
jest.mock("@/features/mandates/feature-intelligence/registry", () => ({ declaredPlacesFor: jest.fn() }));
jest.mock("@/features/mandates/feature-intelligence/hrefs", () => ({ featureIntelligenceHref: jest.fn() }));
jest.mock("@/features/mandates/feature-intelligence/placement", () => ({ targetForKey: jest.fn() }));
jest.mock("@/features/block-state/remarkDurability", () => {
  const actual = jest.requireActual("@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks") as {
    registerRemarkDurability: (port: unknown) => () => void;
  };
  return {
    registerBlockStateRemarkDurability: () =>
      actual.registerRemarkDurability({ save: jest.fn(), retire: jest.fn(), restore: jest.fn(), hasPending: () => false, flush: async () => undefined }),
  };
});

import {
  isRemarkDurabilityRegistered,
  restoreComposerRemarks,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks";
import { ChatSurfaceRegistrations } from "@/providers/ChatSurfaceRegistrations";

describe("the remarks durability port", () => {
  it("is unregistered until the app mounts its registration, and released with it", async () => {
    expect(isRemarkDurabilityRegistered()).toBe(false);
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<ChatSurfaceRegistrations />));
    expect(isRemarkDurabilityRegistered()).toBe(true);
    await act(async () => root.unmount());
    expect(isRemarkDurabilityRegistered()).toBe(false);
  });

  it("the Providers tree mounts the registration for every route", () => {
    const providers = fs.readFileSync(path.join(process.cwd(), "app/Providers.tsx"), "utf8");
    expect(providers).toMatch(/<ChatSurfaceRegistrations\s*\/>/);
  });

  it("an unwired restore announces itself instead of silently doing nothing", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      restoreComposerRemarks("conversation-without-a-port");
      expect(error.mock.calls.flat().join(" ")).toContain("no durability port registered");
    } finally {
      error.mockRestore();
    }
  });
});
