/**
 * SurfaceActivity — several copies of one surface-owning component on one
 * screen (the tiles of a board). Only the ACTIVE copy may register: two live
 * same-name registrations are a coin flip (FOUND_DEFECTS D194), and an agent's
 * write would land in whichever copy mounted last.
 */
import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  SurfaceActivity,
  SurfaceRuntimeProvider,
  getRegisteredWriteHandlers,
  getSurfaceRuntimeStack,
  useSurfaceWriteHandlers,
} from "./SurfaceRuntimeContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SURFACE = "matrx-user/test-note";
const applied: string[] = [];

function NoteCopy({ id }: { id: string }) {
  useSurfaceWriteHandlers(SURFACE, { note_body: () => void applied.push(id) });
  return (
    <SurfaceRuntimeProvider surfaceName={SURFACE} getScope={() => ({ note_id: id })}>
      <span>{id}</span>
    </SurfaceRuntimeProvider>
  );
}

const control: { setActive: (id: string | null) => void } = { setActive: () => {} };

function Board() {
  const [active, set] = useState<string | null>("b");
  useEffect(() => {
    control.setActive = set;
  }, []);
  return (
    <>
      {["a", "b", "c"].map((id) => (
        <SurfaceActivity key={id} active={active === id}>
          <NoteCopy id={id} />
        </SurfaceActivity>
      ))}
    </>
  );
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
