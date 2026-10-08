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
import { createOrgMember, deleteOrgMember, meetingTruth, type OrgMember } from "./fixtures";
import { ensureEnded, type Meeting } from "./meeting";

export class Cast {
  readonly actors: Actor[] = [];
  readonly extraBrowsers: Browser[] = [];
  readonly members: OrgMember[] = [];
  meeting: Meeting | null = null;
  constructor(
    private readonly browser: Browser,
    private readonly baseArgs: string[],
  ) {}

  async add(opts: ActorOptions & { launchArgs?: string[] }): Promise<Actor> {
    let browser = this.browser;
    let args = this.baseArgs;
    if (opts.launchArgs) {
      const type: BrowserType = this.browser.browserType().name() === "webkit" ? webkit : chromium;
      args = [...CHROMIUM_ARGS_BASE.filter((a) => type === chromium && !a.startsWith("--autoplay")), ...opts.launchArgs];
      browser = await type.launch({ ...(type === chromium ? { channel: "chromium" } : {}), args });
      this.extraBrowsers.push(browser);
    }
    const levers = [
      args.length ? `launch args: ${args.join(" ")}` : "launch args: none",
      ...(args.some((a) => a.startsWith("--use-fake-device-for-media-stream")) ? ["fake camera + microphone (Chromium --use-fake-device-for-media-stream)"] : []),
    ];
    const actor = await Actor.create(browser, opts, levers);
    this.actors.push(actor);
    return actor;
  }

  /**
   * A second signed-in person who is a MEMBER of the meeting's organization: a persona from
   * aidream's persona factory (tagged, expiring), signed in through the product's own email-link door.
   */
  async addOrgMember(label: string): Promise<Actor> {
    if (!this.meeting) throw new Error("addOrgMember needs the meeting (its organization) first");
    const truth = await meetingTruth(this.meeting.slug);
    if (!truth.organization_id) throw new Error(`meeting ${this.meeting.slug} has no organization on the server`);
    const member = await createOrgMember(truth.organization_id, `meet scenario: ${label}`);
    this.members.push(member);
    return this.add({ label, seat: "org-member", orgMember: member, displayName: member.full_name });
  }

  timeline(): string {
    return this.actors
      .flatMap((a) => a.log)
      .sort()
      .join("\n");
  }

  async dispose(): Promise<string[]> {
    for (const a of this.actors) await a.dispose();
    for (const b of this.extraBrowsers) await b.close().catch(() => undefined);
    return this.members.map((m) => `${m.full_name} (${m.user_id}) teardown log ${deleteOrgMember(m)}`);
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
    const launch = (testInfo.project.use as { launchOptions?: { args?: string[] } }).launchOptions;
    const cast = new Cast(browser, launch?.args ?? []);
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
      const teardown = await cast.dispose();
      for (const t of teardown) testInfo.annotations.push({ type: "persona", description: t });
      await testInfo.attach("timeline", { body: cast.timeline(), contentType: "text/plain" });
      const sources: Record<string, number> = {};
      for (const a of cast.actors) for (const [k, v] of Object.entries(a.sources)) sources[k] = (sources[k] ?? 0) + v;
      await testInfo.attach("evidence", {
        body: JSON.stringify({
          envEvents: cast.actors.flatMap((a) => a.envEvents.map((e) => ({ ...e, who: a.opts.label }))),
          levers: cast.actors.map((a) => ({ who: a.opts.label, seat: a.opts.seat, levers: a.levers })),
          sources,
        }),
        contentType: "application/json",
      });
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
