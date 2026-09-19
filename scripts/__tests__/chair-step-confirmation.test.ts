/**
 * THE CHAIR-STEP CONFIRMATION — a chair step runs only when the command NAMES it, and it is
 * never a job for Arman.
 *
 * Until 2026-09-18 this suite drove `confirmChairStep` through a real pty, because the contract
 * was "a human types the filename at a terminal". That contract is gone (owner ruling, quoted in
 * scripts/lib/chair-step.ts): agents have no terminal, so every DROP on the platform became a
 * command handed to the owner, and one unapplied chair step in the swept directory halted every
 * unattended release. What is proven here instead:
 *
 *   1. named      → confirmed, with no stdin at all (the shape every agent and every cron has);
 *   2. not named  → refused, and the refusal tells the reader the flag, WHO runs it, and that it
 *                   is never Arman;
 *   3. the RUNNER itself, as a real child process with stdin closed, refuses an unnamed chair
 *      step BEFORE it loads a credential or opens a connection, and says so.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { chairStepRefusal, confirmChairStep } from "../lib/chair-step";

const FILE = "zz_example_drop.sql";
const WHY = "drops one index nobody reads";

describe("the chair-step confirmation", () => {
  it("CONFIRMS when the command named this file — no terminal, no prompt", async () => {
    await expect(confirmChairStep(FILE, WHY, [FILE])).resolves.toBeNull();
    await expect(confirmChairStep(FILE, WHY, ["other.sql", FILE])).resolves.toBeNull();
  });

  it("REFUSES when the command did not name it, or named a different file", async () => {
    await expect(confirmChairStep(FILE, WHY, [])).resolves.toBe(chairStepRefusal(FILE, WHY));
    await expect(confirmChairStep(FILE, WHY, ["zz_example_drop"])).resolves.toBe(chairStepRefusal(FILE, WHY));
    await expect(confirmChairStep(FILE, WHY, ["other.sql"])).resolves.toBe(chairStepRefusal(FILE, WHY));
  });

  it("tells the reader the flag, who runs it, and that it is never Arman", () => {
    const text = chairStepRefusal(FILE, WHY);
    expect(text).toContain(`--confirm-chair-step ${FILE}`);
    expect(text).toContain("Opus, Fable, Sol, Astra");
    expect(text).toContain("hands it UP");
    expect(text).toContain("NEVER handed to Arman");
    expect(text).toContain("migrations/inverse/");
    // The retired contract must not creep back into the words.
    expect(text).not.toMatch(/terminal|TTY|type the filename/i);
  });

  it("the real runner refuses an UNNAMED chair step with stdin closed, before any connection", () => {
    // The runner refuses any file outside migrations/, so the probe lives where a real pending
    // chair step lives: migrations/inverse/, the directory no release sweeps. Unique per process,
    // removed in `finally`, and it could not run even if it were left behind — it is unnamed.
    const probe = `zz_chair_step_probe_${process.pid}.sql`;
    const file = resolve(__dirname, "..", "..", "migrations", "inverse", probe);
    writeFileSync(file, `-- chair-step: ${WHY}\ndrop index if exists public.zz_never_existed;\n`);
    try {
      const runner = resolve(__dirname, "..", "apply-migration.ts");
      const cli = resolve(__dirname, "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
      const res = spawnSync(process.execPath, [cli, runner, file, "--target", "production"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        // No database credential may be needed to be refused: prove it by withholding them.
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: process.env.NODE_ENV ?? "test" },
        timeout: 120_000,
      });
      const out = `${res.stdout}\n${res.stderr}`;
      expect(res.status).toBe(1);
      expect(out).toContain(`--confirm-chair-step ${probe}`);
      expect(out).toContain("NEVER handed to Arman");
      expect(out).not.toMatch(/Applied and ledgered/);
    } finally {
      rmSync(file, { force: true });
    }
  });
});
