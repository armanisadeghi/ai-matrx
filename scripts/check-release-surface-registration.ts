/** Read-only runtime admission against the committed candidate, never shared WIP. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadDbEnv } from "./lib/direct-db";

async function main() {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
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
    execFileSync(
      resolve(root, "node_modules/.bin/tsx"),
      [
        "scripts/sync-surface-manifests-direct.ts",
        "--check",
        "--registration-only",
      ],
      {
        cwd: snapshot,
        stdio: "inherit",
        env: {
          ...process.env,
          SUPABASE_MATRIX_USER: env.user,
          SUPABASE_MATRIX_PASSWORD: env.password,
          SUPABASE_MATRIX_HOST: env.host,
          SUPABASE_MATRIX_PORT: String(env.port),
          SUPABASE_MATRIX_DATABASE_NAME: env.database,
        },
      },
    );
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
