/**
 * Where @ai-matrx/chat's SOURCE lives, for the app-integration suites in this folder that read it.
 *
 * These suites moved here from the package at P27 because they need the app's real host (its
 * content-ir / surface / sandbox registrations) or scan the app's files beside the package's. The
 * installed package ships built modules only, so a suite that reads package source reads the
 * aidream checkout beside this repo (the same rule as the screen-run parity suite).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const CANDIDATES = [path.resolve(process.cwd(), "../aidream/apps/shared/chat/src")];

export const CHAT_SRC: string = (() => {
  const found = CANDIDATES.find((dir) => existsSync(dir));
  if (!found)
    throw new Error(
      `cannot read @ai-matrx/chat source: none of ${CANDIDATES.join(", ")} exists. Check out aidream beside this repo.`,
    );
  return found;
})();

/** CHAT_SRC relative to the repo root, for suites that join it onto `process.cwd()`. */
export const CHAT_SRC_REL: string = path.relative(process.cwd(), CHAT_SRC);

/** The directory a moved suite used to sit in, inside the package source. */
export function chatSourceDir(dir: string): string {
  return path.join(CHAT_SRC, dir);
}

/**
 * `git grep -l <args>` over the app's pathspecs AND the package source, as one list: app files
 * relative to the repo root, package files as `${CHAT_SRC_REL}/<file>`. An empty result is [].
 */
export function gitGrepFiles(args: string[], appPathspecs: string[], chatPathspecs: string[] = ["*.ts", "*.tsx"]): string[] {
  const run = (cwd: string, pathspecs: string[]): string[] => {
    try {
      return execFileSync("git", ["grep", "-l", ...args, "--", ...pathspecs], { cwd, encoding: "utf8" })
        .split("\n")
        .filter(Boolean);
    } catch {
      return []; // git grep exits 1 when nothing matches
    }
  };
  return [
    // The app's own files only: never a leftover copy of the package inside this repo.
    ...(appPathspecs.length ? run(process.cwd(), [...appPathspecs, ":(exclude)packages/chat/**"]) : []),
    ...run(CHAT_SRC, chatPathspecs).map((file) => `${CHAT_SRC_REL}/${file}`),
  ];
}
