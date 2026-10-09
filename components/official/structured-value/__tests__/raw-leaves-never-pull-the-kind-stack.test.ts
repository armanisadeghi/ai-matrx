/**
 * FORCING FUNCTION — a raw leaf never pulls the kind stack into its chunk.
 *
 * The bottom-layer refusals (C4) run the tiny detector synchronously and reach
 * the kind renderer ONLY through `KindValueFrontDoor`'s `React.lazy` edge. A
 * static import of `AnswerValueView` / `KindInstanceRender` anywhere in a
 * leaf's static graph drags the ~3,100-module content-ir cluster into every
 * chunk that holds a plain code block or JSON tree — measured 2026-09-30 with
 * `scripts/build-lab/graph-report.ts` closures: CodeBlock 335 → 3,135 modules
 * when the gate imported the view statically, 342 behind the door.
 *
 * Same static-edge rule as the build lab (type-only imports and `import()` are
 * not static edges).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { aliasTarget } from "@/scripts/lib/source-roots.cjs";

const ROOT = resolve(__dirname, "../../../..");
const EXTS = [".tsx", ".ts", "/index.tsx", "/index.ts"];
const STATIC_IMPORT =
  /^\s*(?:import|export)\s+(?!type\b)([^'";]*?)\s*from\s*["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;

function resolveSpec(fromFile: string, spec: string): string | null {
  let base: string;
  const aliased = aliasTarget(spec);
  if (aliased !== null) base = join(ROOT, aliased);
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // a package
  if (/\.(tsx?|jsx?)$/.test(base) && existsSync(base)) return base;
  for (const ext of EXTS) if (existsSync(base + ext)) return base + ext;
  return null;
}

function staticClosure(start: string): Set<string> {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const file = stack.pop()!;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(STATIC_IMPORT)) {
      const clause = m[1];
      if (clause && /^\{\s*type\s[^}]*\}$/.test(clause.trim())) continue;
      const to = resolveSpec(file, m[2] ?? m[3]);
      if (to && !seen.has(to)) {
        seen.add(to);
        stack.push(to);
      }
    }
  }
  return seen;
}

const LEAVES = [
  "../aidream/apps/shared/rich-content/src/code-block/CodeBlock.tsx",
  "components/ui/JsonComponents/JsonViewerComponent.tsx",
  "components/official/json-explorer/JsonTreeViewer.tsx",
  "components/official/json-explorer/RawJsonExplorer.tsx",
  "components/official-candidate/json-inspector/JsonInspector.tsx",
  "../aidream/apps/shared/chat/src/tool-call-visualization/result-fields/ResultValue.tsx",
  "../aidream/apps/shared/chat/src/tool-call-visualization/result-fields/ToolResultValue.tsx",
  "../aidream/apps/shared/chat/src/tool-call-visualization/registry/GenericRenderer.tsx",
  "../aidream/apps/shared/rich-content/src/display/chat-markdown/BasicMarkdownContent.tsx",
  "components/mardown-display/MarkdownRenderer.tsx",
  "components/mardown-display/blocks/data-events/UnknownDataEventBlock.tsx",
  "../aidream/apps/shared/rich-content/src/display/blocks/json/JsonBlock.tsx",
  "components/official/structured-value/KindDataGate.tsx",
];
const KIND_STACK = [
  "components/official/structured-value/AnswerValueView.tsx",
  "features/content-ir/studio/components/KindInstanceRender.tsx",
  "components/official/structured-value/KindValueRenderImpl.tsx",
];

describe("raw leaves reach the kind stack only through the lazy front door", () => {
  it.each(LEAVES)("%s", (leaf) => {
    const closure = staticClosure(join(ROOT, leaf));
    const pulled = KIND_STACK.filter((m) => closure.has(join(ROOT, m)));
    expect(pulled).toEqual([]);
  });

  it("the front door's edge is lazy", () => {
    const door = readFileSync(
      join(ROOT, "components/official/structured-value/KindValueFrontDoor.tsx"),
      "utf8",
    );
    expect(door).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(\s*["']@\/components\/official\/structured-value\/KindValueRenderImpl["']/);
  });
});
