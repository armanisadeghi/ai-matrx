/**
 * Guards for the agent delete surface (FIX-Q10, 2026-09-11).
 *
 * TWO defects, two guards:
 *
 * 1. THE SCREEN LIED. `deleteAgent` only stamps `deleted_at` — a soft delete —
 *    while two hand-written confirms promised "This cannot be undone." The
 *    guard below reads every file that dispatches `deleteAgent` and fails if
 *    any of them carries permanence wording. It is a CLASS guard: a third
 *    delete surface written next month fails the same way.
 *
 * 2. A DEAD DELETE CONTROL. `AgentCard` and `AgentListItem` rendered Delete
 *    unconditionally while guarding `if (onDelete)`, so a host that omitted the
 *    prop got a button that swallowed the click. The guards below prove the
 *    absent-not-dead behaviour at the component that renders the control
 *    (`AgentActionModal`, rendered for real), and prove the two hosts derive
 *    their handler conditionally so `undefined` actually reaches it.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { AgentActionModal } from "@/features/agents/components/agent-listings/AgentActionModal";
import { buildAgentDeleteConfirm } from "@/features/agents/deletion/agentDeleteConfirm";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

/** Sentences that claim an agent delete is permanent. */
const PERMANENCE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: '"cannot be undone"', re: /cannot be undone/i },
  { label: '"can\'t be undone"', re: /can(?:'|’|&rsquo;)t be undone/i },
  { label: '"permanently removes"', re: /permanently (?:removes?|deletes?)/i },
  { label: '"is permanent"', re: /(?:this|delete\w*) is permanent/i },
  { label: '"irreversible"', re: /irreversible/i },
];

const SEARCH_DIRS = ["app", "components", "features", "lib", "hooks"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "__snapshots__"]);

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Every file that actually performs an agent delete — the thunk that defines
 * it is excluded, since its own doc comment legitimately discusses the word.
 */
function filesThatDeleteAgents(): string[] {
  const files: string[] = [];
  for (const dir of SEARCH_DIRS) walk(join(REPO_ROOT, dir), files);
  return files.filter((file) => {
    if (file.endsWith(join("agent-definition", "thunks.ts"))) return false;
    if (file.includes(join("features", "agents", "deletion"))) return false;
    return /\bdeleteAgent\s*\(/.test(readFileSync(file, "utf8"));
  });
}

describe("agent delete confirm copy is honest about a soft delete", () => {
  it("finds the delete surfaces it is supposed to be guarding", () => {
    // If this ever drops to zero the guard has gone blind (a rename, a move)
    // and would pass forever without reading anything.
    expect(filesThatDeleteAgents().length).toBeGreaterThan(0);
  });

  it("no agent delete surface claims the delete is permanent", () => {
    const offences: string[] = [];
    for (const file of filesThatDeleteAgents()) {
      const source = readFileSync(file, "utf8");
      for (const { label, re } of PERMANENCE_PATTERNS) {
        if (re.test(source)) {
          offences.push(`${file.slice(REPO_ROOT.length + 1)} — ${label}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("the shared copy names what stops, what survives, and the way back", () => {
    const copy = buildAgentDeleteConfirm("ZZZ Scratch Agent");
    expect(copy.title).toBe('Delete "ZZZ Scratch Agent"?');
    expect(copy.description).toMatch(/stops running/i);
    expect(copy.description).toMatch(/soft delete/i);
    expect(copy.description).toMatch(/restore/i);
    for (const { re } of PERMANENCE_PATTERNS) {
      expect(copy.description).not.toMatch(re);
    }
  });

  it("falls back to a readable name instead of empty quotes", () => {
    expect(buildAgentDeleteConfirm("   ").title).toBe("Delete this agent?");
    expect(buildAgentDeleteConfirm(null).description).toMatch(
      /^This agent stops running/,
    );
  });
});

describe("the Delete control is absent, never dead", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderModal = (onDelete?: () => void) => {
    act(() => {
      root.render(
        <AgentActionModal
          isOpen
          onClose={() => {}}
          agentName="ZZZ Scratch Agent"
          onRun={() => {}}
          onEdit={() => {}}
          onDelete={onDelete}
        />,
      );
    });
    return document.body.textContent ?? "";
  };

  it("renders Delete when a handler is wired", () => {
    expect(renderModal(() => {})).toContain("Delete");
  });

  it("renders NO Delete when no handler is wired", () => {
    expect(renderModal(undefined)).not.toContain("Delete");
  });

  // The hosts are what feed that prop. They mount a Redux tree far too deep to
  // render here, so this asserts the one line that decides it: the handler is
  // derived FROM the incoming prop, so omitting the prop propagates `undefined`
  // instead of an always-defined wrapper that silently does nothing.
  it.each([
    "features/agents/components/agent-listings/AgentCard.tsx",
    "features/agents/components/agent-listings/AgentListItem.tsx",
  ])("%s derives its delete handler from the onDelete prop", (relative) => {
    const source = readFileSync(join(REPO_ROOT, relative), "utf8");
    expect(source).toMatch(/const handleDelete = onDelete\s*\n?\s*\?/);
    expect(source).not.toMatch(/const handleDelete = \(/);
  });
});
