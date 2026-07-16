/**
 * Dispatch-registry exhaustiveness + classification-parity tests.
 *
 * The registry (block-dispatch.tsx) is compile-time exhaustive against the
 * generated block-type unions; these tests bind it to the CLASSIFICATION
 * AUTHORITY — scripts/shape/content-vocab-crosswalk.json — so a
 * reclassification (or a new vocabulary item) cannot silently drift:
 *
 *  1. Every render-block vocabulary item in the crosswalk resolves to a
 *     registration.
 *  2. Each registration lives in the SAME classification bucket the crosswalk
 *     assigns (protocol / scalar_generic / shape / intentionally_opaque).
 *  3. An unknown type has NO registration and the loud path screams
 *     (console.error + captureError), never a silent default.
 */

import * as fs from "fs";
import * as path from "path";
import React from "react";

// Heavy chat components reached through the registry's imports pull
// next/dynamic trees (JsonInspector, players, …). The registry tests assert
// ROUTING, not component internals — stub the dynamic loader exactly like
// generic-structured-fallback.test.tsx does.
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const react = require("react") as typeof React;
    return function MockDynamicComponent() {
      return react.createElement("div", { "data-testid": "dynamic-stub" });
    };
  },
}));

// The component registry pulls the full markdown pipeline (remark/rehype ESM)
// — irrelevant to routing assertions. Stub every member with a component.
jest.mock("../BlockComponentRegistry", () => {
  const react = jest.requireActual("react") as typeof React;
  const stub = () =>
    function StubBlockComponent() {
      return react.createElement("div", { "data-testid": "stub-block" });
    };
  const proxy = new Proxy(
    {},
    {
      get: (_target, prop) =>
        typeof prop === "string" ? stub() : undefined,
    },
  );
  return { __esModule: true, BlockComponents: proxy, LoadingComponents: proxy };
});

// Heavy leaf components block-dispatch imports directly (syntax highlighters,
// media players, redux-touching editors). Routing tests never render them.
function stubComponentModule(named?: string[]) {
  return () => {
    const react = jest.requireActual("react") as typeof React;
    const Stub = function StubLeafComponent() {
      return react.createElement("div", { "data-testid": "stub-leaf" });
    };
    const mod: Record<string, unknown> = { __esModule: true, default: Stub };
    for (const name of named ?? []) mod[name] = Stub;
    return mod;
  };
}
jest.mock(
  "@/components/mardown-display/chat-markdown/InlineCodeSnippet",
  stubComponentModule(["InlineCodeSnippet"]),
);
jest.mock(
  "@/components/mardown-display/blocks/audio/AudioOutputBlockRenderer",
  stubComponentModule(),
);
jest.mock(
  "@/components/mardown-display/blocks/videos/VideoOutputBlockRenderer",
  stubComponentModule(),
);
jest.mock(
  "@/features/canvas/materialization/CodeBlockWithContextAttach",
  stubComponentModule(["CodeBlockWithContextAttach"]),
);
jest.mock(
  "@/components/mardown-display/blocks/generic/GenericStructuredBlock",
  stubComponentModule(),
);

import {
  resolveBlockDispatch,
  reportUnregisteredBlockType,
  BLOCK_DISPATCH_CLASSIFICATION,
} from "../block-dispatch";

interface CrosswalkRow {
  name: string;
  sources: string[];
  classification:
    | "shape"
    | "protocol"
    | "scalar_generic"
    | "intentionally_opaque";
}

const crosswalkPath = path.resolve(
  __dirname,
  "../../../../../scripts/shape/content-vocab-crosswalk.json",
);
const crosswalk = JSON.parse(fs.readFileSync(crosswalkPath, "utf8")) as {
  rows: CrosswalkRow[];
};

/** The crosswalk sources that name a BlockRenderer-visible block type. */
const RENDER_BLOCK_SOURCES = [
  "frontend:typed_render_block",
  "frontend:client_only_render_block",
  "frontend:server_only_render_block",
];

const renderBlockRows = crosswalk.rows.filter((row) =>
  row.sources.some((s) => RENDER_BLOCK_SOURCES.includes(s)),
);

/**
 * Detector-owned protocol tokens the renderer handles that carry NO
 * render-block union membership (crosswalk sources are detector tables only).
 */
const DETECTOR_PROTOCOL_TOKENS = [
  "editor_error",
  "editor_code_snippet",
  "audiocite",
];

/**
 * FE-synthesized types with no crosswalk row (documented in
 * block-dispatch.tsx): `media_block` (process-stream wrapper — known W1-C
 * crosswalk-inputs gap) and `generic_structured` (produced only by
 * applyIrKindRoute's R6 fallback).
 */
const FE_SYNTHESIZED_TYPES = ["media_block", "generic_structured"];

describe("block-dispatch registry", () => {
  it("covers every render-block vocabulary item in the crosswalk", () => {
    expect(renderBlockRows.length).toBeGreaterThan(50);
    const missing = renderBlockRows
      .map((row) => row.name)
      .filter((name) => resolveBlockDispatch(name) === null);
    expect(missing).toEqual([]);
  });

  it("registers every item in the classification bucket the crosswalk assigns", () => {
    const mismatches: string[] = [];
    for (const row of renderBlockRows) {
      const bucket = BLOCK_DISPATCH_CLASSIFICATION[row.classification] as
        | readonly string[]
        | undefined;
      if (!bucket?.includes(row.name)) {
        mismatches.push(
          `${row.name}: crosswalk says "${row.classification}" but the registry files it elsewhere`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("registers the detector-owned protocol tokens as protocol", () => {
    for (const token of DETECTOR_PROTOCOL_TOKENS) {
      expect(resolveBlockDispatch(token)).not.toBeNull();
      expect(BLOCK_DISPATCH_CLASSIFICATION.protocol).toContain(token);
      // These ARE crosswalk-classified (protocol) via detector sources.
      const row = crosswalk.rows.find((r) => r.name === token);
      expect(row?.classification).toBe("protocol");
    }
  });

  it("registers the documented FE-synthesized extras", () => {
    for (const type of FE_SYNTHESIZED_TYPES) {
      expect(resolveBlockDispatch(type)).not.toBeNull();
    }
  });

  it("keeps the classification buckets disjoint", () => {
    const seen = new Map<string, string>();
    for (const [bucket, names] of Object.entries(
      BLOCK_DISPATCH_CLASSIFICATION,
    )) {
      for (const name of names) {
        const prior = seen.get(name);
        expect(
          prior === undefined
            ? null
            : `${name} registered in both ${prior} and ${bucket}`,
        ).toBeNull();
        seen.set(name, bucket);
      }
    }
  });

  it("has NO registration for an unknown type — and the loud path screams", () => {
    expect(resolveBlockDispatch("__definitely_not_a_block_type__")).toBeNull();

    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      reportUnregisteredBlockType("__definitely_not_a_block_type__", {
        conversationId: "c1",
        messageId: "m1",
      });
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(String(consoleError.mock.calls[0][0])).toContain(
        "UNREGISTERED render-block type",
      );

      // Repeat fires captureError again but console-screams only once/type.
      reportUnregisteredBlockType("__definitely_not_a_block_type__", {});
      expect(consoleError).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
    }
  });
});
