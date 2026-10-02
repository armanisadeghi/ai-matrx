/**
 * A BARE HOST (no manifests, no feature-intelligence port) IS NEVER SILENT
 * (PACKAGE-INDEPENDENCE §5.1, P19).
 *
 * Unregistered, every manifest lookup answers "no manifest" — what an unknown
 * surface answers in a full host — the intelligence icon renders nothing, and
 * each seam says so ONCE on the console with its remedy.
 *
 * Break it names: a seam that throws, invents a manifest, or stays quiet →
 * red; one that repeats its line on every lookup → red.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const MANIFESTS = Symbol.for("@ai-matrx/chat/surfaces/manifest-source");
const INTELLIGENCE = Symbol.for("@ai-matrx/chat/surfaces/intelligence-port");
type Holder = Record<symbol, unknown>;

describe("a host that registered nothing", () => {
  const holder = globalThis as unknown as Holder;
  const saved = { manifests: holder[MANIFESTS], intelligence: holder[INTELLIGENCE] };
  let warn: jest.SpyInstance;

  beforeEach(() => {
    delete holder[MANIFESTS];
    delete holder[INTELLIGENCE];
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    holder[MANIFESTS] = saved.manifests;
    holder[INTELLIGENCE] = saved.intelligence;
  });

  it("reads every surface as undeclared and says so once, with the remedy", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const seam = require("../registry") as typeof import("../registry");
    expect(seam.hasRegisteredSurfaceManifests()).toBe(false);
    expect(seam.getManifest("matrx-user/chat")).toBeUndefined();
    expect(seam.getAllManifests()).toEqual([]);
    expect(seam.getRawManifest("matrx-user/chat")).toBeUndefined();
    expect(seam.getSurfaceAncestry("matrx-user/chat")).toEqual([]);
    expect(seam.getSurfaceChildren("matrx-user/chat")).toEqual([]);
    expect(seam.surfaceAcceptsAgentBindings("matrx-user/chat")).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/registerSurfaceManifests\(\)/);
  });

  it("answers with the host's manifests once one is registered", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const seam = require("../registry") as typeof import("../registry");
    const manifest = { surfaceName: "host/one", values: [] } as unknown as NonNullable<
      ReturnType<typeof seam.getManifest>
    >;
    const off = seam.registerSurfaceManifests({
      getManifest: (name) => (name === "host/one" ? manifest : undefined),
      getAllManifests: () => [manifest],
      getRawManifest: () => undefined,
      getSurfaceAncestry: () => [],
      getSurfaceChildren: () => [],
    });
    expect(seam.getManifest("host/one")).toBe(manifest);
    expect(seam.getAllManifests()).toEqual([manifest]);
    off();
    expect(seam.hasRegisteredSurfaceManifests()).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("hides the intelligence icon and page jobs, and says so once", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const intelligence = require("../intelligence") as typeof import("../intelligence");
    expect(intelligence.hasSurfaceIntelligence()).toBe(false);
    expect(
      renderToStaticMarkup(<intelligence.IntelligenceIndicator feature="chat" label="Chat" />),
    ).toBe("");
    expect(intelligence.declaredKeysForRoute("/chat")).toEqual([]);
    expect(intelligence.declaredPlacesFor("chat")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/registerSurfaceIntelligence\(\)/);
  });
});
