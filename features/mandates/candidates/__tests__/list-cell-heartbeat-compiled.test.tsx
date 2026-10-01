/**
 * THE LIST CELL KEEPS UP UNDER THE REACT COMPILER (V1 D3, seen on the clone
 * 2026-09-30). The app builds with `reactCompiler: true` (next.config.js), and
 * the compiler memoizes a render value on its REACTIVE inputs only. The cell's
 * first heartbeat read a module-level counter in render; compiled, the cell's
 * value never changed while the heartbeat kept publishing newer answers
 * (fiber inspection: the store version climbed to 16, the text stayed "0 of 1").
 * Jest does not run the compiler, so `list-cell-heartbeat.test.tsx` was green
 * against that bug. This test compiles `../live.ts` with the SAME compiler
 * (babel-plugin-react-compiler, default options) and drives the compiled hook.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "user-1" }));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  peekEffectiveKnob: () => 10,
  ensureEffectiveKnob: async () => 10,
  subscribeEffectiveKnob: () => () => undefined,
}));

const OUT_DIR = join(__dirname, "__compiled__");
const OUT = join(OUT_DIR, "live.compiled.js");

/**
 * Compiled in a plain Node child (Babel 8 is ESM-only and cannot load inside
 * Jest's CommonJS runtime): TypeScript strips the types, the React Compiler
 * compiles, the result lands beside this test and is required like any module.
 */
const COMPILE = `
const ts = require("typescript");
const babel = require("@babel/core");
const fs = require("fs");
const [src, out] = process.argv.slice(1);
const js = ts.transpileModule(fs.readFileSync(src, "utf8"), { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve } }).outputText;
const compiled = babel.transformSync(js, { filename: "live.js", babelrc: false, configFile: false,
  plugins: [[require.resolve("babel-plugin-react-compiler"), {}]] });
if (!compiled.code.includes("react/compiler-runtime")) { console.error("not compiled"); process.exit(3); }
fs.writeFileSync(out, compiled.code);
`;

function compileLive(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  execFileSync(process.execPath, ["-e", COMPILE, join(__dirname, "..", "live.ts"), OUT], {
    cwd: join(__dirname, "..", "..", "..", ".."),
    stdio: "pipe",
  });
}

const MANDATE = "458e658d-cb53-4af9-baa7-d366b993e59c";
function cell(runsIn: number, status: "collecting" | "ready") {
  return {
    id: "eb08edff-74b6-48a6-8026-8ce698693591",
    status,
    runs_wanted: 1,
    runs_in: runsIn,
    runs_failed: 0,
    runs_stopped: 0,
    runs_regressed: 0,
    stalled: false,
    open_count: 1,
    recommendation: null,
  } as const;
}

let root: Root | null = null;
let container: HTMLDivElement;
afterAll(() => rmSync(OUT_DIR, { recursive: true, force: true }));
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  jest.useRealTimers();
});

async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

it("the compiled hook shows the heartbeat's newer count, then stops", async () => {
  compileLive();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useLiveCandidateCell } = require(OUT) as typeof import("../live");
  function Probe({ listCell }: { listCell: ReturnType<typeof cell> }) {
    const live = useLiveCandidateCell(MANDATE, listCell);
    return <span data-testid="probe">{live ? `${live.runs_in} of ${live.runs_wanted}` : "none"}</span>;
  }

  jest.useFakeTimers();
  rpc.mockResolvedValueOnce({ data: { [MANDATE]: cell(1, "ready") }, error: null });
  container = document.createElement("div");
  document.body.appendChild(container);
  const listCell = cell(0, "collecting");
  act(() => {
    root = createRoot(container);
    root.render(<Probe listCell={listCell} />);
  });
  const text = () => container.querySelector("[data-testid=probe]")?.textContent;
  expect(text()).toBe("0 of 1");

  await tick(10_000);
  await tick(0);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(text()).toBe("1 of 1");

  await tick(60_000);
  expect(rpc).toHaveBeenCalledTimes(1);
});
