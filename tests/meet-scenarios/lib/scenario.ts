/**
 * SCENARIO — the one way a state scenario is written.
 *
 *   scenario("wr-denied", async ({ cast }) => { … });
 *
 * The id MUST be a P0 state id in states-catalog.json (the catalog is the spec,
 * not this code); the test is annotated with that state's requirement. The
 * `cast` fixture owns every person's browser context and network gate, ends any
 * meeting the scenario started (UI first, RPC backstop), and attaches the merged
 * timeline of what each person did and saw — the evidence for the report.
 */
import { test as base, type Browser, type BrowserType } from "@playwright/test";
import { chromium, webkit } from "@playwright/test";
import { Actor, type ActorOptions } from "./actor";
import { catalogStates } from "./catalog";
import { ensureEnded, type Meeting } from "./meeting";

export class Cast {
  readonly actors: Actor[] = [];
  readonly extraBrowsers: Browser[] = [];
  meeting: Meeting | null = null;
  constructor(private readonly browser: Browser) {}

  async add(opts: ActorOptions & { launchArgs?: string[] }): Promise<Actor> {
    let browser = this.browser;
    if (opts.launchArgs) {
      const type: BrowserType = this.browser.browserType().name() === "webkit" ? webkit : chromium;
      browser = await type.launch({
        ...(type === chromium ? { channel: "chromium" } : {}),
        args: [...CHROMIUM_ARGS_BASE.filter((a) => type === chromium && !a.startsWith("--autoplay")), ...opts.launchArgs],
      });
      this.extraBrowsers.push(browser);
    }
    const actor = await Actor.create(browser, opts);
    this.actors.push(actor);
    return actor;
  }

  timeline(): string {
    return this.actors
      .flatMap((a) => a.log)
      .sort()
      .join("\n");
  }

  async dispose(): Promise<void> {
    for (const a of this.actors) await a.dispose();
    for (const b of this.extraBrowsers) await b.close().catch(() => undefined);
  }
}

/** Chromium flags every participant runs with (see playwright.config.ts). */
export const CHROMIUM_ARGS_BASE = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  // Media must ride TCP through the participant's NetGate so a cut cuts media.
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--autoplay-policy=no-user-gesture-required",
];

const test = base.extend<{ cast: Cast }>({
  cast: async ({ browser }, use, testInfo) => {
    const cast = new Cast(browser);
    // Keep this run's ONE preview host active for the walk cap (utils/supabase/walkCap.ts):
    // the same explicit-activity ping the app sends on interaction, from a signed-in tab.
    const keepAlive = setInterval(() => {
      const signedIn = cast.actors.find((a) => a.opts.seat !== "guest" && a.pages.some((p) => !p.isClosed()));
      const page = signedIn?.pages.find((p) => !p.isClosed());
      void page?.evaluate(() => fetch("/__dev-walk?activity=1", { method: "POST" }).then((r) => r.status)).catch(() => undefined);
    }, 45_000);
    try {
      await use(cast);
    } finally {
      clearInterval(keepAlive);
      const ended = await ensureEnded(cast.meeting).catch((e: Error) => `cleanup threw: ${e.message}`);
      if (cast.meeting) testInfo.annotations.push({ type: "cleanup", description: `${cast.meeting.path}: ${ended}` });
      await testInfo.attach("timeline", { body: cast.timeline(), contentType: "text/plain" });
      await cast.dispose();
    }
  },
});

export function scenario(id: string, body: (args: { cast: Cast }) => Promise<void>, opts: { timeoutMs?: number } = {}): void {
  const state = catalogStates().find((s) => s.id === id);
  if (!state || state.priority !== "P0") throw new Error(`scenario "${id}" is not a P0 state in states-catalog.json`);
  test(id, async ({ cast }, testInfo) => {
    testInfo.annotations.push(
      { type: "situation", description: state.situation },
      { type: "requirement", description: state.requirement },
      { type: "catalog-today", description: `${state.today.status}: ${state.today.note}` },
    );
    if (opts.timeoutMs) test.setTimeout(opts.timeoutMs);
    await body({ cast });
  });
}

export { test };
