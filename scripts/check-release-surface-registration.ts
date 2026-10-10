/** Read-only runtime admission against the committed candidate, never shared WIP. */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadDbEnv } from "./lib/direct-db";

async function main() {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  // --apply: the RELEASE path repairs what it finds (idempotent, soft-only sync of exactly
  // the drifted manifests, from the committed candidate). Default stays read-only.
  const apply = process.argv.includes("--apply");
  const sha =
    process.env.SURFACE_SYNC_SHA ||
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const env = loadDbEnv();
  if ("missing" in env)
    throw new Error(
      `Surface registration cannot be verified: missing ${env.missing.join(", ")}`,
    );
  const snapshot = mkdtempSync(resolve(tmpdir(), "matrx-surface-release-"));
  try {
    const archive = execFileSync("git", ["archive", "--format=tar", sha], {
      cwd: root,
      maxBuffer: 512 * 1024 * 1024,
    });
    const archivePath = resolve(snapshot, "source.tar");
    writeFileSync(archivePath, archive);
    execFileSync("tar", ["-xf", archivePath, "-C", snapshot]);
    rmSync(archivePath);
    symlinkSync(
      resolve(root, "node_modules"),
      resolve(snapshot, "node_modules"),
      "dir",
    );
    console.log(
      `Checking surface registrations for committed candidate ${sha}`,
    );
    const childEnv = {
      ...process.env,
      SUPABASE_MATRIX_USER: env.user,
      SUPABASE_MATRIX_PASSWORD: env.password,
      SUPABASE_MATRIX_HOST: env.host,
      SUPABASE_MATRIX_PORT: String(env.port),
      SUPABASE_MATRIX_DATABASE_NAME: env.database,
    };
    const tsx = resolve(root, "node_modules/.bin/tsx");
    const run = (args: string[]) =>
      spawnSync(tsx, ["scripts/sync-surface-manifests-direct.ts", ...args], {
        cwd: snapshot,
        env: childEnv,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
    if (apply) {
      // Full mirror check (values, roles, write targets, client tools, metadata), then sync
      // ONLY the surfaces it names. A manifest can no longer ship with a missing/stale row.
      const full = run(["--check"]);
      const drifted = [
        ...new Set(
          [...(full.stderr ?? "").matchAll(/--surface (\S+)/g)].map((m) => m[1]),
        ),
      ];
      if (full.status !== 0 && drifted.length === 0) {
        console.error(full.stdout, full.stderr);
        throw new Error("Surface mirror check failed with nothing syncable");
      }
      for (const name of drifted) {
        const r = run(["--surface", name]);
        console.log(`SURFACE SYNC ${name}: ${r.status === 0 ? "synced" : "FAILED"}`);
        if (r.status !== 0) console.error(r.stdout, r.stderr);
      }
      if (drifted.length === 0) console.log("Surface mirror already matches the committed candidate.");
    }
    const final = run(["--check", "--registration-only"]);
    process.stdout.write(final.stdout ?? "");
    process.stderr.write(final.stderr ?? "");
    if (final.status !== 0) throw new Error("Surface registration admission failed");
    const after = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    if (after !== sha)
      console.log(
        `Surface admission remains valid for committed candidate ${sha}; HEAD advanced to ${after} while its immutable archive was checked.`,
      );
  } finally {
    rmSync(snapshot, { recursive: true, force: true });
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Surface registration admission failed",
  );
  process.exitCode = 1;
});
