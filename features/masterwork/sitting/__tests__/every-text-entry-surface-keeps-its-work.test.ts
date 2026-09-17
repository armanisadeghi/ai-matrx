/**
 * @jest-environment node
 */
/**
 * THE GUARD: there is no way to type under masterwork that nobody has
 * answered for.
 *
 * ## The defect this exists to catch
 *
 * `./every-lane-keeps-its-work.test.ts` closed this class for capture LANES,
 * by reading the live Approach registry. Cold walk 8 (2026-09-17) then found
 * the same loss one step outside it: the Rulebook's Resources panel offers
 * "New document", which creates a platform document and opens it at
 * `/documents/<id>`. The walker typed several paragraphs of real expert
 * material there and found a blank page after a reload — and the document row
 * it wrote has ZERO rows in `udt_document_snapshots`, so not one save was ever
 * attempted.
 *
 * The lane registry could not have caught that, and never will: the lane
 * registry enumerates lanes, and this was a DOOR OUT of masterwork into
 * another feature. The same blind spot hid four more surfaces an Expert pastes
 * real work into — the Audition dialog, Compare Two, Run the Bench and the
 * Build window — none of which is a lane either.
 *
 * ## What this forces
 *
 * 1. Every FILE under `features/masterwork/**` that renders a text field has
 *    an entry in `TEXT_ENTRY_SURFACES`. A new dialog with a `<Textarea>` in it
 *    fails here, by name, until somebody answers "and what happens when she
 *    reloads?".
 * 2. A DECLARATION CANNOT BE A LIE. Each entry names the module that carries
 *    the mechanism, that module is read from disk, and it must actually
 *    contain it — a `sitting` surface must call the sitting primitive, and a
 *    `door` must open a module that really keeps what is typed into it.
 * 3. No STALE stickers: an entry whose file has gone, or no longer takes any
 *    typing, fails too, so the registry cannot quietly drift into fiction.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import {
  TEXT_ENTRY_SURFACES,
  keepingForSurface,
  type SurfaceKeeping,
} from "../textEntrySurfaces";

const REPO_ROOT = resolve(__dirname, "../../../..");
const MASTERWORK = resolve(REPO_ROOT, "features/masterwork");

/**
 * A place a person can type. Deliberately crude and deliberately WIDE: this
 * guard exists to be impossible to walk past, so a false positive costs one
 * honest line in the registry and a false negative costs somebody's work.
 */
const TEXT_ENTRY =
  /<Textarea|<Input[\s/>]|<input[\s/>]|<textarea[\s/>]|contentEditable/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!name.endsWith(".tsx")) continue;
    if (name.includes(".test.")) continue;
    out.push(full);
  }
  return out;
}

function textEntryFiles(): string[] {
  return walk(MASTERWORK)
    .filter((full) => TEXT_ENTRY.test(readFileSync(full, "utf8")))
    .map((full) => relative(REPO_ROOT, full))
    .sort();
}

function sourceOf(modulePath: string): string {
  return readFileSync(resolve(REPO_ROOT, modulePath), "utf8");
}

/** The mechanism each answer claims, as something readable off the file. */
function mechanismMissingFrom(keeping: SurfaceKeeping): string | null {
  if (keeping.kind === "door") {
    let opened: string;
    try {
      opened = sourceOf(keeping.opens);
    } catch {
      return `opens "${keeping.opens}", which does not exist`;
    }
    const missing = keeping.keptBy.filter((token) => !opened.includes(token));
    return missing.length
      ? `opens "${keeping.opens}", which is missing its keeping: ${missing.join(", ")}`
      : null;
  }
  let source: string;
  try {
    source = sourceOf(keeping.module);
  } catch {
    return `names "${keeping.module}", which does not exist`;
  }
  switch (keeping.kind) {
    case "sitting":
      return /useDialogSitting|createSittingStore/.test(source)
        ? null
        : `claims "sitting" but ${keeping.module} never calls the sitting primitive`;
    case "server-run":
      return /useMasterworkRun|durableRun/i.test(source)
        ? null
        : `claims "server-run" but ${keeping.module} uses no durable run`;
    case "server-write":
      return /await |supabase|service|Service/.test(source)
        ? null
        : `claims "server-write" but ${keeping.module} writes nothing`;
    case "none":
      return null;
  }
}

describe("every text-entry surface under masterwork keeps its work", () => {
  it("finds the surfaces at all", () => {
    // Sanity: the walk really read the feature. If this ever drops to a
    // handful, the walk broke and every other assertion below is vacuous.
    expect(textEntryFiles().length).toBeGreaterThanOrEqual(15);
  });

  /**
   * Proving it red (2026-09-17): delete the `RulebookSourcesPanel.tsx` entry
   * and this fails with that path listed — which is exactly the surface cold
   * walk 8 lost work on, and exactly the one the lane guard cannot see.
   */
  it("has an answer for every file a person can type into", () => {
    const undeclared = textEntryFiles().filter(
      (path) => keepingForSurface(path) === null,
    );
    expect(
      // Each path here is a place an Expert can type where nobody has answered
      // "what happens when she reloads?". Answer it in `textEntrySurfaces.ts`
      // — and if the answer is "the work is lost", that is not an answer, it
      // is the bug.
      undeclared.join("\n"),
    ).toBe("");
  });

  it("carries no stale stickers", () => {
    const live = new Set(textEntryFiles());
    const stale = Object.entries(TEXT_ENTRY_SURFACES)
      // A door is declared precisely BECAUSE it types nothing itself — the
      // Resources panel hands off to the packaged capture toolbar and then to
      // the document editor — so it is not expected in the walked set. Its
      // own honesty is checked by the mechanism test below, which reads the
      // module it opens.
      .filter(([path, keeping]) => keeping.kind !== "door" && !live.has(path))
      .map(([path]) => path);
    expect(
      // A declaration over a file that is gone, or that no longer takes any
      // typing, is fiction the next person would trust. Remove the row.
      stale.join("\n"),
    ).toBe("");
  });

  /**
   * Proving it red (2026-09-17): drop the `beforeunload` listener from
   * `DocumentEditor.tsx` and this fails with
   * `RulebookSourcesPanel.tsx opens "features/data-tables/components/DocumentEditor.tsx",
   * which is missing its keeping: beforeunload`.
   */
  it("declares nothing it cannot back up", () => {
    const lies = Object.entries(TEXT_ENTRY_SURFACES)
      .map(([path, keeping]) => {
        const missing = mechanismMissingFrom(keeping);
        return missing ? `${path} ${missing}` : null;
      })
      .filter((row): row is string => row !== null);
    expect(lies.join("\n")).toBe("");
  });
});
