/**
 * SurfaceActivity — several copies of one surface-owning component on one
 * screen (the tiles of a board). Only the ACTIVE copy may register: two live
 * same-name registrations are a coin flip (FOUND_DEFECTS D194), and an agent's
 * write would land in whichever copy mounted last.
 */
jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: (name: string) =>
    name === "matrx-user/test-note"
      ? {
          surfaceName: name,
          label: "Test note",
          description: "A test note.",
          values: [{ name: "note_id", description: "The note." }],
          writeTargets: [
            {
              name: "note_body",
              label: "Note body",
              description: "The body.",
              valueType: "string",
              mode: "draft",
              applyPolicy: "auto",
              approval: "test",
            },
          ],
          clientTools: [
            {
              name: "note_ping",
              label: "Ping",
              description: "Answers with the note id.",
              inputSchema: { type: "object", properties: {}, required: [] },
            },
          ],
        }
      : undefined,
  getAllManifests: () => [],
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  SurfaceActivity,
  SurfaceRuntimeProvider,
  createSurfaceCapture,
  getRegisteredWriteHandlers,
  getSurfaceRuntimeStack,
  useSurfaceClientTools,
  useSurfaceWriteHandlers,
  type SurfaceRegistry,
} from "./SurfaceRuntimeContext";
import { applySurfaceWrite } from "./surface-writeback";
import { executeSurfaceClientTool } from "./surface-client-tools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SURFACE = "matrx-user/test-note";
const applied: string[] = [];

function NoteCopy({ id }: { id: string }) {
  useSurfaceWriteHandlers(SURFACE, { note_body: () => void applied.push(id) });
  useSurfaceClientTools(SURFACE, { note_ping: () => ({ note_id: id }) });
  return (
    <SurfaceRuntimeProvider surfaceName={SURFACE} getScope={() => ({ note_id: id })}>
      <span>{id}</span>
    </SurfaceRuntimeProvider>
  );
}

const control: { setActive: (id: string | null) => void } = { setActive: () => {} };
const captures = new Map<string, SurfaceRegistry>();

function Board({ capture = false }: { capture?: boolean }) {
  const [active, set] = useState<string | null>("b");
  useEffect(() => {
    control.setActive = set;
  }, []);
  return (
    <>
      {["a", "b", "c"].map((id) => (
        <SurfaceActivity key={id} active={active === id} capture={capture ? captureFor(id) : undefined}>
          <NoteCopy id={id} />
        </SurfaceActivity>
      ))}
    </>
  );
}

function captureFor(id: string): SurfaceRegistry {
  const existing = captures.get(id);
  if (existing) return existing;
  const made = createSurfaceCapture();
  captures.set(id, made);
  return made;
}

async function applyNoteBody() {
  const handler = getRegisteredWriteHandlers(SURFACE).note_body;
  if (!handler) return "none";
  await (typeof handler === "function" ? handler("x") : handler.apply("x"));
  return applied.at(-1) ?? "none";
}

describe("SurfaceActivity — only the active copy registers", () => {
  it("registers the active copy's runtime and handlers, and moves with activation", async () => {
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Board />));
    const live = () => getSurfaceRuntimeStack().filter((r) => r.surfaceName === SURFACE);

    expect(live()).toHaveLength(1);
    expect(await live()[0].getScope()).toEqual({ note_id: "b" });
    expect(await applyNoteBody()).toBe("b");

    act(() => control.setActive("c"));
    expect(live()).toHaveLength(1);
    expect(await live()[0].getScope()).toEqual({ note_id: "c" });
    expect(await applyNoteBody()).toBe("c");

    act(() => control.setActive(null));
    expect(live()).toHaveLength(0);
    expect(await applyNoteBody()).toBe("none");

    act(() => root.unmount());
  });
});

describe("SurfaceActivity capture — a dormant copy is reachable without going live", () => {
  it("routes each copy into its own capture, live or dormant, while the global stack keeps exactly one", async () => {
    captures.clear();
    applied.length = 0;
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Board capture />));
    const live = () => getSurfaceRuntimeStack().filter((r) => r.surfaceName === SURFACE);

    // The ONE-live law is unchanged: only "b" is in the global stack.
    expect(live()).toHaveLength(1);
    expect(await live()[0].getScope()).toEqual({ note_id: "b" });

    // Every copy — dormant "a" and "c" too — is readable through its capture.
    for (const id of ["a", "b", "c"]) {
      const capture = captures.get(id);
      expect(capture?.stack()).toHaveLength(1);
      expect(capture?.primary()?.surfaceName).toBe(SURFACE);
      expect(await capture?.primary()?.getScope()).toEqual({ note_id: id });
    }

    // A dormant copy's write target and client tool run through the ONE
    // writeback / client-tool runtimes with the capture as source.
    const write = await applySurfaceWrite("note_body", "hello", { source: captures.get("a"), origin: "agent" });
    expect(write.ok).toBe(true);
    expect(applied.at(-1)).toBe("a");
    const tool = await executeSurfaceClientTool("note_ping", {}, { source: captures.get("c") });
    expect(tool).toMatchObject({ ok: true, output: { note_id: "c" } });

    // The global path still reaches only the live copy.
    await applySurfaceWrite("note_body", "hello", { origin: "agent" });
    expect(applied.at(-1)).toBe("b");

    // Flipping which copy is live never disturbs a capture's registration.
    const before = captures.get("a")?.primary();
    act(() => control.setActive("a"));
    expect(live()).toHaveLength(1);
    expect(await live()[0].getScope()).toEqual({ note_id: "a" });
    expect(captures.get("a")?.primary()).toBe(before);
    expect(captures.get("b")?.stack()).toHaveLength(1);

    act(() => root.unmount());
    for (const capture of captures.values()) expect(capture.stack()).toHaveLength(0);
  });
});
