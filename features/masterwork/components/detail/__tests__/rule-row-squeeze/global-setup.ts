/**
 * globalSetup — compile fixture.html's real Tailwind CSS before the gate
 * runs. See build-css.mjs's header for why this is a real compile and not a
 * hand-copied approximation.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const HERE = __dirname;

export default function globalSetup(): void {
  execFileSync("node", [path.join(HERE, "build-css.mjs")], { stdio: "inherit" });
}
