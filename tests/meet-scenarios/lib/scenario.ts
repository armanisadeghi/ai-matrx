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
import { adminProfileOverrides, createOrgMember, deleteOrgMember, meetingTruth, type OrgMember } from "./fixtures";
import { ENV_SETUP_PREFIX, UNPROVEN_PREFIX } from "./env";
import { activeSkinName, setActiveSkin } from "./skins";
import { ensureEnded, restoreHostProfiles, type EndOutcome, type Meeting } from "./meeting";

export class Cast {
  readonly actors: Actor[] = [];
  readonly extraBrowsers: Browser[] = [];
  readonly members: OrgMember[] = [];
  /** Every meeting this run created (the final sweep ends each one still live). */
  readonly created: Meeting[] = [];
  private current: Meeting | null = null;
  get meeting(): Meeting | null {
    return this.current;
  }
  set meeting(m: Meeting | null) {
    this.current = m;
    if (m && !this.created.some((c) => c.slug === m.slug)) this.created.push(m);
  }
  constructor(
    private readonly browser: Browser,
    private readonly baseArgs: string[],
  ) {}

  async add(opts: ActorOptions & { launchArgs?: string[] }): Promise<Actor> {
    let browser = this.browser;
    let args = this.baseArgs;
    if (opts.launchArgs || opts.blockDevices?.length) {
      // Its own browser: the shared one's flags would undo this person's setup. The fake-UI flag
      // auto-accepts every media prompt (it overrides a Block, and its accept is a user activation),
      // so it is dropped; camera/mic access comes from the context's permission grant instead.
      const type: BrowserType = this.browser.browserType().name() === "webkit" ? webkit : chromium;
      const extra = opts.launchArgs ?? [];
      args = [
        ...CHROMIUM_ARGS_BASE.filter(
          (a) => type === chromium && !a.startsWith("--use-fake-ui-for-media-stream") && !(a.startsWith("--autoplay") && extra.some((x) => x.startsWith("--autoplay"))),
        ),
        ...extra,
      ];
      browser = await type.launch({ ...(type === chromium ? { channel: "chromium" } : {}), args });
      this.extraBrowsers.push(browser);
    }
    const levers = [
      args.length ? `launch args: ${args.join(" ")}` : "launch args: none",
      ...(args.some((a) => a.startsWith("--use-fake-device-for-media-stream")) ? ["fake camera + microphone (Chromium --use-fake-device-for-media-stream)"] : []),
    ];
    return Actor.create(browser, opts, levers, (a) => this.actors.push(a));
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

/**
 * Run-start check (once per process): the test host's behavior profile must be the default. A leaked
 * user-level override silently re-rules every Meet-style scenario, so a dirty start is an environment
 * setup failure (reported ENV), never a product verdict.
 */
let startCheck: Promise<void> | null = null;
function assertDefaultProfileAtStart(): Promise<void> {
  startCheck ??= adminProfileOverrides().then((r) => {
    if (r.overrides.length) {
      throw new Error(`${ENV_SETUP_PREFIX} admin@admin.com holds a user-level meet.behavior_profile override (${JSON.stringify(r.overrides)}); Meet-style scenarios would run under the wrong rules. Clear it, then rerun.`);
    }
  });
  return startCheck;
}

const test = base.extend<{ cast: Cast }>({
  cast: async ({ browser }, use, testInfo) => {
    setActiveSkin(((testInfo.project.metadata as { skin?: string } | undefined)?.skin) ?? "meet");
    const launch = (testInfo.project.use as { launchOptions?: { args?: string[] } }).launchOptions;
    const cast = new Cast(browser, launch?.args ?? []);
    await assertDefaultProfileAtStart();
    // Keep this run's ONE preview host active for the walk cap (utils/supabase/walkCap.ts) during EVERY wait,
    // not just between steps: an explicit-activity request every 30 s (window is minutes) through a
    // signed-in person's browser context. It needs no open tab (a closed host tab or about:blank is fine).
    // A guest on the same host is parked by the SSE eviction notice of the HOST, so keeping the host active
    // is what keeps the guest unparked too.
    const keepAlive = setInterval(() => {
      const signedIn = cast.actors.find((a) => a.opts.seat !== "guest") ?? cast.actors[0];
      void signedIn?.pingWalkActivity();
    }, 30_000);
    try {
      await use(cast);
    } finally {
      clearInterval(keepAlive);
      // Final sweep: end EVERY meeting this run created that is still live; a failure is loud.
      for (const m of cast.created) {
        const out: EndOutcome = await ensureEnded(m).catch((e: Error) => ({ detail: `CLEANUP FAILURE: cleanup threw: ${e.message}`, failed: true }));
        testInfo.annotations.push({ type: out.failed ? "cleanup-failure" : "cleanup", description: `${m.path}: ${out.detail}` });
      }
      // Whatever the scenario changed on the host's account is put back, even after a failure.
      for (const f of await restoreHostProfiles(cast.actors)) testInfo.annotations.push({ type: "cleanup-failure", description: f });
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
          skin: activeSkinName(),
          loaded: cast.actors.map((a) => ({
            who: a.opts.label,
            scripts: a.loaded.scripts.size,
            driverLike: [...a.loaded.driverLike],
            dev: a.loaded.devSignals.size > 0,
            prod: a.loaded.prodSignals.size > 0,
            queryDocs: [...a.loaded.queryDocs],
          })),
          progressAt: Math.max(0, ...cast.actors.map((a) => a.progressAt)),
        }),
        contentType: "application/json",
      });
      // A park that took a live call away is never a PASS (and never a product FAIL): fail the run with the
      // park named; the report turns a fatal environment event into ENV.
      const lost = cast.actors.flatMap((a) => a.envEvents.filter((e) => e.fatal).map((e) => `[${a.opts.label}] ${e.what}`));
      if (lost.length && testInfo.status === "passed") throw new Error(`ENV: walk-cap park lost the scenario's state, no verdict: ${lost.join("; ")}`);
    }
  },
});

/**
 * A scenario whose product verdict cannot be produced right now (its precondition is not
 * reachable) calls this: the row is reported UNPROVEN with the reason — never FAIL, never PASS.
 */
export function unproven(reason: string): never {
  throw new Error(`${UNPROVEN_PREFIX} ${reason}`);
}

export function scenario(
  id: string,
  body: (args: { cast: Cast }) => Promise<void>,
  opts: { timeoutMs?: number; /** A variant of a catalog state (e.g. one `reknock_after_deny` value): the state's id, any priority. */ catalogId?: string } = {},
): void {
  const state = catalogStates().find((s) => s.id === (opts.catalogId ?? id));
  if (!state || (opts.catalogId === undefined && state.priority !== "P0")) throw new Error(`scenario "${id}" is not a P0 state in states-catalog.json`);
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
