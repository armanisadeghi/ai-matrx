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

export type Seat = SignedInAs | "guest";

export interface ActorOptions {
  /** Who this person is in the story ("host", "guest", "second member"). */
  label: string;
  seat: Seat;
  /** The name a guest types; ignored for signed-in seats. */
  displayName?: string;
  faults?: MediaFaults;
}

export const THROTTLE_PROFILES: Record<string, Throttle & { downloadKbps: number; uploadKbps: number }> = {
  /** A bad café: 400 ms one-way, ~300 kbps. */
  poor: { latencyMs: 400, kbps: 300, downloadKbps: 300, uploadKbps: 300 },
  /** Tethered 3G. */
  "3g": { latencyMs: 150, kbps: 750, downloadKbps: 750, uploadKbps: 250 },
};

export class Actor {
  readonly gate: NetGate;
  readonly log: string[] = [];
  readonly pages: Page[] = [];
  private constructor(
    readonly opts: ActorOptions,
    readonly context: BrowserContext,
    gate: NetGate,
    readonly browserName: string,
  ) {
    this.gate = gate;
  }

  static async create(browser: Browser, opts: ActorOptions): Promise<Actor> {
    const gate = new NetGate(opts.label);
    const port = await gate.start();
    const browserName = browser.browserType().name();
    const context = await browser.newContext({
      baseURL: baseURL(),
      proxy: { server: `http://127.0.0.1:${port}` },
      permissions: browserName === "chromium" ? ["camera", "microphone"] : [],
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
    });
    await context.addInitScript(mediaFaultsInit, opts.faults ?? {});
    const actor = new Actor(opts, context, gate, browserName);
    const page = await context.newPage();
    actor.track(page);
    if (opts.seat !== "guest") await actor.signIn(opts.seat);
    return actor;
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
    this.note(`${label}: ${summarize(o)}`);
    return o;
  }

  private track(page: Page): void {
    this.pages.push(page);
    page.on("pageerror", (e) => this.note(`pageerror: ${e.message.slice(0, 160)}`));
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
        this.note(`ENV: sign-in attempt ${attempt} failed (${(e as Error).message.slice(0, 80)}); retrying`);
        await new Promise((r) => setTimeout(r, 20_000));
      }
    }
    await this.page.waitForURL((u) => !u.pathname.startsWith("/api/dev-login"), { timeout: 60_000 });
    const resume = this.page.getByRole("button", { name: "Resume this preview" });
    if (await resume.isVisible().catch(() => false)) {
      this.note("ENV: preview paused by the walk cap at sign-in; resuming");
      await resume.click();
      await this.page.waitForLoadState("domcontentloaded");
    }
    this.note(`signed in as ${as} -> ${new URL(this.page.url()).pathname}`);
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
