"use client";

/**
 * "Before your pages can go live" — the content-plan setup checklist.
 *
 * THE SPLIT this file exists to make. `readiness.ts` used to answer two
 * different questions in one list:
 *
 *   1. **Pass/fail things a person does once** — does the site belong to a
 *      brand, does it have a website to build into, does that website have a
 *      look and feel. Those are CHECKLIST steps, and they now live here on
 *      `lib/guided-setup/` (persistence, re-verification on return, one-click
 *      fixes, and a step we perform on the user's behalf).
 *   2. **Coverage** — 17 of 30 service pages planned, 4 pages with no brief.
 *      That is a METER, not a checklist, and it stays exactly where it was
 *      (`Readiness.families` / `corePages` / `nodesWithout*`, rendered by
 *      `SetupWorkOrderColumn`). Forcing "17 of 30" into a tick box would be a
 *      step that is never done and always nagging.
 *
 * `readiness.ts` remains the pure MEASUREMENT layer for both halves — this
 * definition consumes its `items`, never re-measures. Its honesty rule carries
 * straight over: a site whose website we could not read reads `unknown` WITH
 * the reason, never a red "you haven't done this".
 *
 * WHY THE FOUNDATION IS THREE STEPS AND NOT ONE PER REQUIREMENT. The primitive
 * can express one-per-requirement (`steps` accepts a pure factory over the
 * context, so `asset:service_icon` could have its own row) — this is a
 * deliberate choice, not a limitation. **What GROUPS a step here is the ACTION
 * that finishes it**, because a step the user cannot finish is the dead end the
 * primitive exists to delete:
 *
 *   `design` — ONE starter-kit call writes styles + header + footer, so three
 *              rows would print one action three times.
 *   `menu`   — no button can finish it early: the kit seeds the menu FROM the
 *              site's pages, which do not exist yet. Found by RENDERING it.
 *   `images` — there is nowhere in the product to do it at all (Coming Soon
 *              `cms.site-images`), so N identical dead-ended rows help nobody.
 *
 * Each step's `detail` still names every piece it covers by state, so nothing
 * measured is lost and nothing is said twice.
 */

import Link from "next/link";

import { announceComingSoon } from "@/lib/coming-soon/announce";
import { registerChecklist } from "@/lib/guided-setup/registry";
import type { CheckResult } from "@/lib/guided-setup/types";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { MarketingSite } from "@/features/marketing/types";
import type { AppDispatch } from "@/lib/redux/store";

import { bridgeStarterKit, createAndLinkCmsSite } from "./bridge";
import type { ChecklistItem, CmsFacts } from "./readiness";

export interface ContentPlanSetupContext {
  site: MarketingSite;
  /**
   * The foundation half of `buildReadiness().items` — already measured against
   * the live CMS. Null while no shape is expanded (a malformed archetype), in
   * which case every foundation step reads `unknown` rather than guessing.
   */
  foundation: ChecklistItem[] | null;
  cms: CmsFacts | null;
  /** A real transport/permission failure reading the CMS. Never "no site". */
  cmsError: string | null;
  cmsLoading: boolean;
  dispatch: AppDispatch;
  /** Refresh everything the checks read, after we change the world. */
  onChanged: () => Promise<void>;
}

/**
 * What the starter kit BUILDS OUT OF NOTHING — and therefore what one "build it
 * for me" button can actually finish.
 *
 * `nav_entries` is deliberately NOT here, and that is a live-render finding, not
 * an oversight: the starter kit seeds the menu FROM the site's show-in-nav
 * pages, so on a website whose pages don't exist yet it writes styles, header
 * and footer and leaves the menu empty. Kept in this list, the step stayed red
 * forever with a button that would then refuse ("the site is not empty") — a
 * dead end wearing a fix's clothes. The menu is its own step below.
 */
const SHELL_KEYS = ["tokens", "header", "footer"] as const;

/** Plain words for each shell piece — the archetype's own labels are jargon. */
const SHELL_WORDS: Record<string, string> = {
  tokens: "Colours and fonts",
  header: "Header",
  footer: "Footer",
};

const cmsHref = (ctx: ContentPlanSetupContext, suffix = "") =>
  ctx.cms?.link.cmsSiteId ? `/cms/${ctx.cms.link.cmsSiteId}${suffix}` : undefined;

/**
 * Every foundation step answers "could we even look?" the same way, so it is
 * asked once. Returning a `CheckResult` means the caller returns it verbatim;
 * returning null means we have real measurements to judge.
 */
function unreadable(ctx: ContentPlanSetupContext): CheckResult | null {
  if (ctx.cmsLoading) {
    return { status: "unknown", reason: "We're still checking your website." };
  }
  if (ctx.cmsError) {
    return {
      status: "unknown",
      reason: "We couldn't reach your website just now, so we haven't checked this.",
      detail: ctx.cmsError,
    };
  }
  if (!ctx.foundation) {
    return {
      status: "unknown",
      reason:
        "We can't tell what this site shape needs until the shape itself loads.",
    };
  }
  return null;
}

export const contentPlanSetupChecklist = registerChecklist<ContentPlanSetupContext>({
  key: "marketing.content_plan_setup",
  title: "Before your pages can go live",
  description:
    "We check these every time you open this plan, so if something stops working you'll see it here.",
  completeTitle: "This site is ready to build",
  completeDescription:
    "Your pages have somewhere to live and something to look like. We keep checking.",
  steps: [
    {
      kind: "verified",
      id: "brand",
      title: "This site belongs to a brand",
      description:
        "Everything we plan for this site is filed under its brand — without one, not a single page can be saved.",
      check: async ({ site }): Promise<CheckResult> =>
        site.brand_id
          ? { status: "pass" }
          : {
              status: "fail",
              reason:
                "This site isn't filed under a brand yet, so nothing can be planned for it.",
              fix: { label: "Open your sites", href: marketingRoutes.sites() },
            },
    },
    {
      kind: "auto",
      id: "website",
      // Not `autoRun` on purpose: this creates a real website record with a
      // web address derived from the site's domain. Creating one unasked, for
      // someone who meant to point this plan at a website they already have,
      // is the "did something the user never asked for" failure.
      autoRun: false,
      title: "Your pages have somewhere to live",
      description:
        "A plan is a list of pages. This is the website they get built into — we can set it up for you in one click.",
      runLabel: "Set it up for me",
      runningLabel: "Setting up your website…",
      check: async (ctx): Promise<CheckResult> => {
        if (ctx.cmsLoading) {
          return { status: "unknown", reason: "We're still checking." };
        }
        if (ctx.cmsError) {
          return {
            status: "unknown",
            reason: "We couldn't check this just now.",
            detail: ctx.cmsError,
          };
        }
        const link = ctx.cms?.link;
        if (link?.linked && ctx.cms?.site) {
          return { status: "pass", detail: `Building into "${link.cmsSlug}"` };
        }
        // A recorded pointer we cannot open is a DIFFERENT problem from having
        // none — and "create a second one" is the wrong answer to it.
        if (link && !link.linked && link.reason?.startsWith("settings.cms")) {
          return {
            status: "fail",
            reason:
              "This plan points at a website we can't open — it may have been deleted, or it belongs to someone who hasn't shared it with you.",
            fix: { label: "See your websites", href: "/cms", newTab: true },
          };
        }
        return {
          status: "fail",
          reason: "There's no website for these pages yet.",
        };
      },
      run: async (ctx) => {
        await createAndLinkCmsSite(ctx.dispatch, ctx.site);
        await ctx.onChanged();
      },
    },
    {
      kind: "auto",
      id: "design",
      autoRun: false,
      dependsOn: ["website"],
      title: "Your website has a look and feel",
      description:
        "Colours and fonts, a header and a footer — the frame every page sits inside. We can build a first version for you, and you can change any of it afterwards.",
      runLabel: "Build it for me",
      runningLabel: "Building your colours, header and footer…",
      check: async (ctx): Promise<CheckResult> => {
        const blocked = unreadable(ctx);
        if (blocked) return blocked;
        const declared = (ctx.foundation ?? []).filter((item) =>
          (SHELL_KEYS as readonly string[]).includes(item.key),
        );
        if (declared.length === 0) {
          return {
            status: "pass",
            detail: "This site shape doesn't ask for a header or a footer.",
          };
        }
        if (declared.some((item) => item.state === "unknown")) {
          return {
            status: "unknown",
            reason: "We couldn't read your website's design, so we haven't judged it.",
            detail: declared.find((item) => item.state === "unknown")?.detail,
          };
        }
        // Per-piece truth in ONE line — the visibility four separate steps
        // would have bought, without printing one action four times.
        const detail = declared
          .map(
            (item) =>
              `${SHELL_WORDS[item.key] ?? item.label}: ${item.state === "met" ? "ready" : "not yet"}`,
          )
          .join(" · ");
        const missing = declared.filter((item) => item.state !== "met");
        if (missing.length === 0) return { status: "pass", detail };
        return {
          status: "fail",
          reason: `Still missing: ${missing
            .map((item) => (SHELL_WORDS[item.key] ?? item.label).toLowerCase())
            .join(", ")}.`,
          detail,
        };
      },
      run: async (ctx) => {
        // `force: false` — a website that already has a shell must never be
        // overwritten by a checklist button. The server refuses loudly and the
        // primitive shows that refusal; replacing an existing design stays the
        // deliberate, confirmed action it is in "Make it real".
        await bridgeStarterKit(ctx.dispatch, ctx.site.id, {
          force: false,
          dryRun: false,
          cmsSite: ctx.cms?.link.cmsSiteId ?? undefined,
        });
        await ctx.onChanged();
      },
      // NO DEAD ENDS: someone who wants to design it themselves gets both
      // doors, and they are different actions from the button above — never a
      // second copy of it.
      extra: (ctx) => {
        const settings = cmsHref(ctx, "/settings");
        const components = cmsHref(ctx, "/components");
        if (!settings || !components) return null;
        return (
          <p className="text-[11px] text-muted-foreground">
            Rather do it yourself?{" "}
            <Link
              className="font-medium text-primary hover:underline"
              href={settings}
            >
              Colours, fonts and menu
            </Link>{" "}
            ·{" "}
            <Link
              className="font-medium text-primary hover:underline"
              href={components}
            >
              Header and footer
            </Link>
          </p>
        );
      },
    },
    {
      kind: "verified",
      id: "menu",
      dependsOn: ["website"],
      title: "Your website has a menu",
      description:
        "The links across the top of every page. It's built from the pages you choose to show, so it fills in as your pages go live.",
      check: async (ctx): Promise<CheckResult> => {
        const blocked = unreadable(ctx);
        if (blocked) return blocked;
        const nav = (ctx.foundation ?? []).find(
          (item) => item.key === "nav_entries",
        );
        if (!nav) {
          return { status: "pass", detail: "This site shape doesn't ask for one." };
        }
        if (nav.state === "unknown") {
          return {
            status: "unknown",
            reason: "We couldn't read your website's menu, so we haven't judged it.",
            detail: nav.detail,
          };
        }
        if (nav.state === "met") {
          return { status: "pass", detail: `${nav.actual} links` };
        }
        return {
          status: "fail",
          reason:
            nav.actual === 0
              ? "Your menu is still empty. It fills itself in from the pages you mark as visible, so build the pages first — then set it here."
              : `Your menu has ${nav.actual} of the ${nav.required} links this site shape expects.`,
          fix: {
            label: "Set up the menu",
            href: cmsHref(ctx, "/settings") ?? "/cms",
          },
        };
      },
    },
    {
      kind: "verified",
      id: "images",
      dependsOn: ["website"],
      // Optional NOT because pictures don't matter — because there is nowhere
      // in the product for this user to add them yet (see the Coming Soon row
      // below). A required step nobody can complete nags forever.
      optional: true,
      title: "Your website has the pictures it needs",
      description:
        "Some site shapes expect a logo, or a picture for each service. Pages still build without them; they just look unfinished.",
      check: async (ctx): Promise<CheckResult> => {
        const blocked = unreadable(ctx);
        if (blocked) return blocked;
        const assets = (ctx.foundation ?? []).filter((item) =>
          item.key.startsWith("asset:"),
        );
        if (assets.length === 0) {
          return { status: "pass", detail: "This site shape doesn't ask for any." };
        }
        if (assets.some((item) => item.state === "unknown")) {
          return {
            status: "unknown",
            reason: "We couldn't read your website's pictures, so we haven't judged them.",
          };
        }
        const short = assets.filter((item) => item.state !== "met");
        if (short.length === 0) {
          return { status: "pass", detail: `${assets.length} set(s) in place.` };
        }
        return {
          status: "fail",
          reason: `Still missing: ${short
            .map((item) => `${item.label.replace(/^Asset — /, "")} (${item.actual} of ${item.required})`)
            .join(", ")}.`,
          fix: {
            label: "Add pictures",
            run: async () => {
              announceComingSoon("cms.site-images");
            },
          },
        };
      },
    },
  ],
});
