// J6 — other surfaces on the chat package: extension side panel + desktop opt-in package chat. READ-ONLY (no message is sent).
// Each part is skipped with an exact reason when its environment is absent; nothing is faked.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { faulted } from "../lib/harness.mjs";
import { runExtensionSidePanel, desktopReachable } from "../lib/j6-surfaces.mjs";

export default {
  id: "j6-surfaces", title: "Extension side panel + desktop package chat render their composer", signIn: false,
  async run({ check, note, skip }) {
    const fault = faulted("j6-surfaces");
    const ext = await runExtensionSidePanel({ fault });
    if (ext.skip) skip("extension side panel", ext.skip);
    else for (const c of ext.checks) check(c.name, c.ok, c.detail);

    const desk = await desktopReachable();
    if (desk.skip) skip("desktop package chat", desk.skip);
    else {
      const d = await (await import("../lib/j6-surfaces.mjs")).runDesktopChat({ fault });
      for (const c of d.checks) check(c.name, c.ok, c.detail);
    }
    note("read-only: no message sent from either surface");
  },
};
