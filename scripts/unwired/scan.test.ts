import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanFrontendUnwired } from "./scan";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "matrx-unwired-test-"));
  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, contents);
  }
  return root;
}

describe("scanFrontendUnwired", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("reports an exported component with no JSX mounter", () => {
    const root = fixture({
      "components/UnwiredCard.tsx": "export function UnwiredCard() { return <section>ready</section>; }\n",
    });
    roots.push(root);

    const result = scanFrontendUnwired(root);

    expect(result.findings).toEqual([
      expect.objectContaining({
        detector: "react-component-unmounted",
        file: "components/UnwiredCard.tsx",
        symbol: "UnwiredCard",
      }),
    ]);
  });

  it("follows a re-export barrel to the JSX mounter", () => {
    const root = fixture({
      "components/WiredCard.tsx": "export function WiredCard() { return <section>ready</section>; }\n",
      "components/index.ts": 'export { WiredCard } from "./WiredCard";\n',
      "app/page.tsx": 'import { WiredCard } from "@/components"; export default function Page() { return <WiredCard />; }\n',
    });
    roots.push(root);

    const result = scanFrontendUnwired(root);

    expect(result.findings).toEqual([]);
  });

  it("does not count a test as a runtime importer of a hook", () => {
    const root = fixture({
      "hooks/useBuriedThing.ts": "export function useBuriedThing() { return 1; }\n",
      "hooks/useBuriedThing.test.ts": 'import { useBuriedThing } from "./useBuriedThing"; test("x", () => expect(useBuriedThing()).toBe(1));\n',
    });
    roots.push(root);

    const result = scanFrontendUnwired(root);

    expect(result.findings).toEqual([
      expect.objectContaining({ detector: "export-unimported", symbol: "useBuriedThing" }),
    ]);
  });

  it("requires a host installer to be called, not merely imported", () => {
    const root = fixture({
      "lib/runner.ts": "export function setAiRunner(fn: () => void) { void fn; }\n",
      "app/page.tsx": 'import { setAiRunner } from "@/lib/runner"; export default function Page() { return <main />; }\n',
    });
    roots.push(root);

    const result = scanFrontendUnwired(root);

    expect(result.findings).toEqual([
      expect.objectContaining({ detector: "host-installer-unset", symbol: "setAiRunner" }),
    ]);
  });

  it("counts a component mounted from a route inside a directory named tests", () => {
    const root = fixture({
      "components/DemoCard.tsx": "export default function DemoCard() { return <section />; }\n",
      "app/(dev)/demos/tests/oauth/page.dev.tsx":
        'import DemoCard from "@/components/DemoCard"; export default function Page() { return <DemoCard />; }\n',
    });
    roots.push(root);

    expect(scanFrontendUnwired(root).findings).toEqual([]);
  });

  it("carries a wired export to the sibling it consumes in the same module", () => {
    const root = fixture({
      "lib/messaging.ts":
        "export class MessagingService { ping() { return 1; } }\nexport function getMessagingService() { return new MessagingService(); }\n",
      "app/page.tsx":
        'import { getMessagingService } from "@/lib/messaging"; export default function Page() { getMessagingService(); return <main />; }\n',
    });
    roots.push(root);

    expect(scanFrontendUnwired(root).findings).toEqual([]);
  });

  it("counts a component handed to a registry as an object-property value", () => {
    const root = fixture({
      "features/renderers/ListOverlay.tsx": "export const ListOverlay = () => <section />;\n",
      "features/registry.tsx":
        'import { ListOverlay } from "./renderers/ListOverlay"; export const REGISTRY = { lists: { OverlayComponent: ListOverlay } };\n',
      "app/page.tsx":
        'import { REGISTRY } from "@/features/registry"; export default function Page() { const C = REGISTRY.lists.OverlayComponent; return <C />; }\n',
    });
    roots.push(root);

    expect(scanFrontendUnwired(root).findings).toEqual([]);
  });

  it("never classifies a SCREAMING_SNAKE constant as a component", () => {
    const root = fixture({
      "features/columns.tsx": "export const TABLE_COLUMNS = [{ cell: () => <span /> }];\n",
    });
    roots.push(root);

    expect(scanFrontendUnwired(root).findings).toEqual([]);
  });

  it("treats file-pattern dynamic imports as framework mounters", () => {
    const root = fixture({
      "components/displays/ChartDisplay.tsx": "export default function ChartDisplay() { return <section />; }\n",
      "app/page.tsx": "export default async function Page() { const item = { id: 'ChartDisplay' }; const mod = await import(`../components/displays/${item.id}`); return mod.default({}); }\n",
    });
    roots.push(root);

    const result = scanFrontendUnwired(root);

    expect(result.findings).toEqual([]);
  });
});
