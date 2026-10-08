/**
 * ACTOR — one person in a scenario: their own browser context (cookie jar),
 * their own network gate, their own media faults, and every tab they open.
 *
 * Capabilities are the brief's list, each a real browser operation:
 * cut/restore/throttle network · refresh · second tab · close tab · background ·
 * sleep/wake · deny camera/mic/screen · unplug a device · real-time waits.
 */
import type { Browser, BrowserContext, CDPSession, Page } from "@playwright/test";
import { baseURL, devLoginURL, type SignedInAs } from "./env";
import { NetGate, type Throttle } from "./net-gate";
import { mediaFaultsInit, type MediaFaults } from "./media-faults";
import { observe, summarize, type Observation } from "./observe";
import type { OrgMember } from "./fixtures";

export type Seat = SignedInAs | "guest" | "org-member";

export interface ActorOptions {
  /** Who this person is in the story ("host", "guest", "second member"). */
  label: string;
  /**
   * `admin` = admin@admin.com (the host), `member` = test@test.com (a signed-in OUTSIDER to the
   * host's organization), `org-member` = a persona-factory person who is a MEMBER of the host's
   * organization (pass `orgMember`), `guest` = signed out.
   */
  seat: Seat;
  /** The name a guest types; ignored for signed-in seats. */
  displayName?: string;
  /** Script-level media faults (an init script). Only installed when given — recorded as a lever. */
  faults?: MediaFaults;
  /** The browser's OWN permission state set to Block for these devices (Chromium: CDP Browser.setPermission). */
  blockDevices?: ("camera" | "microphone")[];
  /** Required for seat `org-member`: the persona lib/fixtures.ts created. */
  orgMember?: OrgMember;
}

/** One request to the meeting server's token door, and what it answered. */
export interface TokenCall {
  at: number;
  url: string;
  status: number | null;
  /** The JSON body the page sent (room, org, meeting id, display name, device). */
  body: Record<string, unknown> | null;
}

/** An environment event proven in this run's evidence (walk-cap park, dev-server 5xx, compile error). */
export interface EnvEvent {
  at: number;
  what: string;
}

export const THROTTLE_PROFILES: Record<string, Throttle & { downloadKbps: number; uploadKbps: number }> = {
  /** A bad café: 400 ms one-way, ~300 kbps. */
  poor: { latencyMs: 400, kbps: 300, downloadKbps: 300, uploadKbps: 300 },
  /** Tethered 3G. */
  "3g": { latencyMs: 150, kbps: 750, downloadKbps: 750, uploadKbps: 250 },
};

const TOKEN_DOOR = /\/v1\/meet\/token(\?|$)/;
const COMPILE_ERROR = /Failed to compile|Module not found|Build Error/;

export class Actor {
  readonly gate: NetGate;
  readonly log: string[] = [];
  readonly pages: Page[] = [];
  readonly tokenCalls: TokenCall[] = [];
  readonly envEvents: EnvEvent[] = [];
  /** Every test lever this person ran with — the computed "no fakes" record. */
  readonly levers: string[] = [];
  /** Observation sources seen (contract vs visible-text fallback), with counts. */
  readonly sources: Record<string, number> = {};
  private constructor(
    readonly opts: ActorOptions,
    readonly context: BrowserContext,
    gate: NetGate,
    readonly browserName: string,
  ) {
    this.gate = gate;
  }

  static async create(browser: Browser, opts: ActorOptions, launchLevers: string[] = []): Promise<Actor> {
    const gate = new NetGate(opts.label);
    const port = await gate.start();
    const browserName = browser.browserType().name();
    const grant = browserName === "chromium" && !opts.blockDevices?.length ? ["camera", "microphone"] : [];
    const context = await browser.newContext({
      baseURL: baseURL(),
      proxy: { server: `http://127.0.0.1:${port}` },
      permissions: grant,
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
    });
    const actor = new Actor(opts, context, gate, browserName);
    actor.levers.push(`browser ${browserName} ${browser.version()}`, ...launchLevers, `network: own proxy (NetGate :${port})`);
    if (grant.length) actor.levers.push(`permission grant: ${grant.join(",")}`);
    if (opts.faults && Object.keys(opts.faults).length) {
      await context.addInitScript(mediaFaultsInit, opts.faults);
      actor.levers.push(`init script: media faults ${JSON.stringify(opts.faults)}`);
    }
    actor.watch(context);
    const page = await context.newPage();
    actor.track(page);
    if (opts.blockDevices?.length) await actor.blockInBrowser(page, opts.blockDevices);
    if (opts.seat === "org-member") {
      if (!opts.orgMember) throw new Error("seat org-member needs orgMember");
      await actor.signInWithEmailLink(opts.orgMember);
    } else if (opts.seat !== "guest") await actor.signIn(opts.seat);
    return actor;
  }

  /** Token-door traffic and environment evidence, for every tab of this person. */
  private watch(context: BrowserContext): void {
    const origin = new URL(baseURL()).origin;
    context.on("request", (req) => {
      if (req.method() !== "POST" || !TOKEN_DOOR.test(req.url())) return;
      let body: Record<string, unknown> | null = null;
      try {
        body = JSON.parse(req.postData() ?? "null") as Record<string, unknown> | null;
      } catch {
        body = null;
      }
      this.tokenCalls.push({ at: Date.now(), url: req.url(), status: null, body });
    });
    context.on("response", (res) => {
      const url = res.url();
      if (res.request().method() === "POST" && TOKEN_DOOR.test(url)) {
        const call = [...this.tokenCalls].reverse().find((c) => c.url === url && c.status === null);
        if (call) call.status = res.status();
        this.note(`token door answered HTTP ${res.status()}`);
        return;
      }
      if (res.status() >= 500 && url.startsWith(origin)) {
        const type = res.request().resourceType();
        const p = new URL(url).pathname;
        // The dev server failing to SERVE (a page, a chunk, the sign-in door) is environment; an API the product calls is not.
        if (type === "document" || type === "script" || type === "stylesheet" || p.startsWith("/_next/") || p.startsWith("/api/dev-login") || p.startsWith("/__dev-walk")) {
          this.env(`dev server answered HTTP ${res.status()} for ${type} ${p}`);
        }
      }
    });
  }

  env(what: string): void {
    this.envEvents.push({ at: Date.now(), what });
    this.note(`ENV: ${what}`);
  }

  /** Record what an observation was read from; a compile-error page is environment evidence. */
  saw(o: Observation): void {
    this.sources[o.source] = (this.sources[o.source] ?? 0) + 1;
    if (COMPILE_ERROR.test(o.text)) this.env(`dev server compile error on screen: ${o.text.slice(0, 120)}`);
  }

  get page(): Page {
    const open = this.pages.filter((p) => !p.isClosed());
    if (open.length === 0) throw new Error(`${this.opts.label} has no open tab`);
    return open[0];
  }

  note(line: string): void {
    this.log.push(`${new Date().toISOString().slice(11, 19)} [${this.opts.label}] ${line}`);
  }

  async snap(label: string, page: Page = this.page): Promise<Observation> {
    const o = await observe(page);
    this.saw(o);
    this.note(`${label}: ${summarize(o)}`);
    return o;
  }

  private track(page: Page): void {
    this.pages.push(page);
    page.on("pageerror", (e) => this.note(`pageerror: ${e.message.slice(0, 160)}`));
    page.on("crash", () => this.note("PAGE CRASHED"));
  }

  /** Set the browser's own site permission to Block (what a person's "Block" click stores). */
  private async blockInBrowser(page: Page, devices: ("camera" | "microphone")[]): Promise<void> {
    if (this.browserName !== "chromium") throw new Error(`blockDevices needs Chromium's permission store; ${this.browserName} has no scriptable one`);
    const cdp = await this.context.newCDPSession(page);
    const { targetInfo } = (await cdp.send("Target.getTargetInfo")) as { targetInfo: { browserContextId?: string } };
    for (const d of devices) {
      await cdp.send("Browser.setPermission", {
        permission: { name: d === "camera" ? "videoCapture" : "audioCapture" },
        setting: "denied",
        origin: new URL(baseURL()).origin,
        ...(targetInfo.browserContextId ? { browserContextId: targetInfo.browserContextId } : {}),
      });
    }
    this.levers.push(`browser permission store: ${devices.join(",")} = denied (CDP Browser.setPermission)`);
    this.note(`browser permission set to Block: ${devices.join(", ")}`);
  }

  async signIn(as: SignedInAs, next = "/meetings"): Promise<void> {
    // The shared dev server restarts, recompiles and caps walks under other agents; retry, noted as ENV.
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await this.page.goto(devLoginURL(as, next), { waitUntil: "domcontentloaded" });
        if (res && res.status() >= 400 && attempt < 6) throw new Error(`HTTP ${res.status()}`);
        break;
      } catch (e) {
        if (attempt >= 6) throw e;
        this.env(`sign-in attempt ${attempt} failed (${(e as Error).message.slice(0, 80)}); retrying`);
        await new Promise((r) => setTimeout(r, 20_000));
      }
    }
    await this.page.waitForURL((u) => !u.pathname.startsWith("/api/dev-login"), { timeout: 60_000 });
    const resume = this.page.getByRole("button", { name: "Resume this preview" });
    if (await resume.isVisible().catch(() => false)) {
      this.env("preview paused by the walk cap at sign-in; resuming");
      await resume.click();
      await this.page.waitForLoadState("domcontentloaded");
    }
    this.note(`signed in as ${as} -> ${new URL(this.page.url()).pathname}`);
  }

  /**
   * The org-member persona signs in the way a person does from an emailed sign-in link: the
   * product's own /auth/confirm redeems the one-use hash. Identity is then proven via /api/whoami.
   */
  async signInWithEmailLink(member: OrgMember, next = "/meetings"): Promise<void> {
    const link = `/auth/confirm?token_hash=${encodeURIComponent(member.token_hash)}&type=magiclink&redirectTo=${encodeURIComponent(next)}`;
    await this.page.goto(link, { waitUntil: "domcontentloaded" });
    await this.page.waitForURL((u) => !u.pathname.startsWith("/auth/confirm"), { timeout: 60_000 });
    const who = await this.page.evaluate(() => fetch("/api/whoami").then((r) => r.json()).catch(() => null)) as { email?: string } | null;
    if (who?.email !== member.email) throw new Error(`org member sign-in did not take: whoami=${JSON.stringify(who)}`);
    this.note(`signed in as org member ${member.full_name} (${member.company} persona, member of the host's organization) -> ${new URL(this.page.url()).pathname}`);
  }

  /** This person's Supabase session from their own cookie jar (token door probes, cleanup). */
  async session(): Promise<{ token: string; userId: string } | null> {
    const cookies = (await this.context.cookies()).filter((c) => /^sb-matrx-auth-v2(\.\d+)?$|^sb-.+-auth-token(\.\d+)?$/.test(c.name));
    if (cookies.length === 0) return null;
    cookies.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    let raw = decodeURIComponent(cookies.map((c) => c.value).join(""));
    if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice(7), "base64").toString("utf8");
    try {
      const s = JSON.parse(raw) as { access_token?: string; user?: { id?: string } };
      if (!s.access_token || !s.user?.id) return null;
      return { token: s.access_token, userId: s.user.id };
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------- network

  /** Pull the cable: signalling, media and navigator.onLine all drop. */
  async cutNetwork(): Promise<void> {
    this.gate.cutAll();
    await this.context.setOffline(true);
    this.note("network CUT (offline + proxy cut)");
  }

  /** The network is up but our servers are not reachable (navigator.onLine stays true). */
  async cutServersOnly(): Promise<void> {
    this.gate.cutAll();
    this.note("servers unreachable (proxy cut, browser still online)");
  }

  async restoreNetwork(): Promise<void> {
    this.gate.restore();
    await this.context.setOffline(false);
    this.note("network RESTORED");
  }

  /** Cut for `ms` of real time, then restore. */
  async dropFor(ms: number): Promise<void> {
    await this.cutNetwork();
    await new Promise((r) => setTimeout(r, ms));
    await this.restoreNetwork();
  }

  async throttle(profile: keyof typeof THROTTLE_PROFILES | null): Promise<void> {
    const p = profile === null ? null : THROTTLE_PROFILES[profile];
    this.gate.setThrottle(p ?? { latencyMs: 0, kbps: 0 });
    if (this.browserName === "chromium") {
      for (const page of this.pages.filter((x) => !x.isClosed())) {
        const cdp = await this.context.newCDPSession(page);
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: p?.latencyMs ?? 0,
          downloadThroughput: p ? (p.downloadKbps * 1000) / 8 : -1,
          uploadThroughput: p ? (p.uploadKbps * 1000) / 8 : -1,
        });
      }
    }
    this.note(`throttle ${profile ?? "off"}`);
  }

  // ------------------------------------------------------------------- tabs

  async refresh(page: Page = this.page): Promise<void> {
    await page.reload({ waitUntil: "domcontentloaded" });
    this.note("refreshed");
  }

  /** The same person opens another tab (same cookie jar). */
  async openSecondTab(path: string): Promise<Page> {
    const page = await this.context.newPage();
    this.track(page);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    this.note(`opened second tab ${path}`);
    return page;
  }

  /** A fresh blank tab for this person (tracked, so cleanup and `page` see it). */
  async newTab(): Promise<Page> {
    const page = await this.context.newPage();
    this.track(page);
    return page;
  }

  async closeTab(page: Page = this.page): Promise<void> {
    await page.close({ runBeforeUnload: true });
    this.note("closed tab");
  }

  /** Another tab takes the foreground; returns the backgrounded page's visibilityState. */
  async background(page: Page = this.page): Promise<string> {
    const cover = await this.context.newPage();
    await cover.goto("about:blank");
    await cover.bringToFront();
    const state = await page.evaluate(() => document.visibilityState).catch(() => "unknown");
    this.note(`backgrounded (visibilityState=${state})`);
    return state;
  }

  async foreground(page: Page = this.page): Promise<void> {
    for (const p of this.context.pages()) if (p !== page && p.url() === "about:blank") await p.close();
    await page.bringToFront();
    this.note("foregrounded");
  }

  /**
   * Laptop lid closed for `ms`: tab hidden, page frozen (no timers, no tasks),
   * network gone; then woken. The closest a browser lets a script get to sleep.
   */
  async sleepFor(ms: number, page: Page = this.page): Promise<void> {
    await this.background(page);
    let cdp: CDPSession | null = null;
    if (this.browserName === "chromium") {
      cdp = await this.context.newCDPSession(page);
      await cdp.send("Page.setWebLifecycleState", { state: "frozen" }).catch((e: Error) => this.note(`freeze refused: ${e.message}`));
    }
    await this.cutNetwork();
    this.note(`asleep for ${ms} ms`);
    await new Promise((r) => setTimeout(r, ms));
    await this.restoreNetwork();
    if (cdp) await cdp.send("Page.setWebLifecycleState", { state: "active" }).catch(() => undefined);
    await this.foreground(page);
    this.note("woke");
  }

  // ------------------------------------------------------------------ media

  async setFaults(next: Partial<MediaFaults>, page: Page = this.page): Promise<void> {
    await page.evaluate((f) => window.__meetHarness?.setFaults(f), next);
    this.note(`media faults ${JSON.stringify(next)}`);
  }

  /** A device disappears mid-call (headset unplugged). Returns how many live tracks ended. */
  async unplug(kind: "audioinput" | "videoinput", page: Page = this.page): Promise<number> {
    const ended = await page.evaluate((k) => window.__meetHarness?.unplug(k) ?? -1, kind);
    this.note(`unplugged ${kind} (${ended} live tracks ended)`);
    return ended;
  }

  async dispose(): Promise<void> {
    await this.context.close().catch(() => undefined);
    await this.gate.stop().catch(() => undefined);
  }
}
