import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import {
  claimPlayback,
  getActivePlaybackHolderId,
  releasePlayback,
} from "@/features/audio/playback/playbackLock";

const ROOT = process.cwd();

/** The one call that joins the app-wide playback lock + session registry. */
const ARBITRATION_CALL = "useMediaElementPlaybackSession({";

const CANDIDATE_SUFFIXES = [
  ".tsx",
  ".ts",
  "/index.tsx",
  "/index.ts",
] as const;

/** In-repo import specifiers only: `@/…`, `./…`, `../…`. */
function resolveImport(
  root: string,
  fromFile: string,
  specifier: string,
): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(root, specifier.slice(2));
  else if (specifier.startsWith(".")) base = join(dirname(fromFile), specifier);
  else return null;
  for (const suffix of CANDIDATE_SUFFIXES) {
    if (existsSync(base + suffix)) return base + suffix;
  }
  return existsSync(base) ? base : null;
}

/**
 * The specifiers this file imports AND renders as JSX. Following only rendered
 * components is what makes the walk answer "which player does this surface put
 * on screen" instead of "does anything reachable from here own audio" — a
 * service module three hops down that happens to arbitrate would otherwise
 * answer for a player that does not.
 */
function renderedComponentImports(source: string): string[] {
  const out: string[] = [];
  const pattern =
    /import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const [, defaultBinding, namedBindings, specifier] = match;
    const names = [
      ...(defaultBinding ? [defaultBinding] : []),
      ...(namedBindings ?? "")
        .split(",")
        .map((part) => part.split(" as ").pop()!.trim())
        .filter(Boolean),
    ];
    if (names.some((name) => new RegExp(`<${name}[\\s/>]`).test(source))) {
      out.push(specifier);
    }
  }
  return out;
}

/**
 * Walk the players this surface actually renders, and the players THEY render,
 * until a file CALLS the arbitration hook. Returns the chain that got there (repo-relative), or null
 * when no player below this surface joins the boundary.
 */
function chainToArbitration(
  root: string,
  entryRelative: string,
  maxDepth = 6,
): string[] | null {
  const start = join(root, entryRelative);
  const seen = new Set<string>([start]);
  const queue: { file: string; chain: string[] }[] = [
    { file: start, chain: [entryRelative] },
  ];
  while (queue.length) {
    const { file, chain } = queue.shift()!;
    const source = readFileSync(file, "utf8");
    if (source.includes(ARBITRATION_CALL)) return chain;
    if (chain.length >= maxDepth) continue;
    for (const specifier of renderedComponentImports(source)) {
      const next = resolveImport(root, file, specifier);
      if (!next || seen.has(next)) continue;
      seen.add(next);
      queue.push({ file: next, chain: [...chain, relative(root, next)] });
    }
  }
  return null;
}


afterEach(() => {
  for (const id of ["podcast", "file", "education", "fast-fire"]) {
    releasePlayback(id);
  }
});

describe("app-wide playback arbitration", () => {
  it("makes a new audible path synchronously stop the previous holder", () => {
    const stopped: string[] = [];
    claimPlayback({ id: "podcast", stop: () => stopped.push("podcast") });

    claimPlayback({ id: "file", stop: () => stopped.push("file") });

    expect(stopped).toEqual(["podcast"]);
    expect(getActivePlaybackHolderId()).toBe("file");
  });

  it("does not let a preempted path release the current holder", () => {
    claimPlayback({ id: "education", stop: () => {} });
    claimPlayback({ id: "fast-fire", stop: () => {} });

    releasePlayback("education");

    expect(getActivePlaybackHolderId()).toBe("fast-fire");
  });
});

describe("Q4 playback surfaces use the canonical arbitration boundary", () => {
  const managedSurface = (relativePath: string) =>
    readFileSync(join(ROOT, relativePath), "utf8");

  it.each([
    "features/files/components/core/FilePreview/previewers/AudioPreview.tsx",
    "features/flashcards/fast-fire/components/SpokenFrontPlayer.tsx",
    "features/flashcards/fast-fire/components/FastFireReviewPlayer.tsx",
    "features/flashcards/fast-fire/components/FastFireReviewPlaylist.tsx",
  ])("routes %s through useMediaElementPlaybackSession", (relativePath) => {
    const source = managedSurface(relativePath);
    expect(source).toContain("useMediaElementPlaybackSession({");
  });

  it("routes durable study-session audio through the package playback port", () => {
    const source = managedSurface(
      "features/education/study/components/SessionAudio.tsx",
    );
    expect(source).toContain("<InlineMediaRef");
    expect(source).toContain('as="audio"');
    expect(source).not.toMatch(/<audio(?:\s|>)/);
  });

  it("routes the recovered public audio-study episode through the boundary, whichever player it renders", () => {
    // A study surface may render the shared element, the podcast player, or a
    // player written tomorrow. What may never change is that SOMETHING in the
    // chain below it claims the playback lock — a second player that does not
    // is two players fighting over the speaker. So the chain is walked, not
    // the component name asserted.
    const chain = chainToArbitration(
      ROOT,
      "features/education/media/audio/components/AudioPlayback.tsx",
    );
    expect(chain).not.toBeNull();

    const detail = managedSurface(
      "features/education/media/audio/components/AudioStudyDetail.tsx",
    );
    expect(detail).toContain('import { AudioPlayback } from "./AudioPlayback"');
    expect(detail).toContain("<AudioPlayback");
  });

  it("the chain walk is falsifiable — a player that skips the boundary is not found", () => {
    // Without this, a resolver that silently gave up on every import would
    // report the same "not null" for a broken surface as for a sound one.
    const dir = mkdtempSync(join(tmpdir(), "playback-chain-"));
    try {
      mkdirSync(join(dir, "surface"), { recursive: true });
      writeFileSync(
        join(dir, "surface", "Entry.tsx"),
        'import { Player } from "./Player";\nexport const E = () => <Player />;\n',
      );
      writeFileSync(
        join(dir, "surface", "Player.tsx"),
        'export const Player = () => <audio controls src="x.mp3" />;\n',
      );
      expect(chainToArbitration(dir, "surface/Entry.tsx")).toBeNull();

      writeFileSync(
        join(dir, "surface", "Player.tsx"),
        'import { useMediaElementPlaybackSession } from "@/features/audio/session/useMediaElementPlaybackSession";\n' +
          "export const Player = () => {\n" +
          "  useMediaElementPlaybackSession({});\n" +
          '  return <audio controls src="x.mp3" />;\n' +
          "};\n",
      );
      expect(chainToArbitration(dir, "surface/Entry.tsx")).toEqual([
        "surface/Entry.tsx",
        "surface/Player.tsx",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
