/**
 * Deterministic Assists producer for HR — mirrors
 * `features/crm/crm-assists-producer.ts` exactly, because that producer is
 * already right and a second shape would be a second system.
 *
 * 🚨 A CHIP BOTH SEES AND ACTS. Every chip below carries the FIX as its action:
 * the door that finishes the thing it noticed. NONE of them opens a chat, and
 * none of them is an "ask the assistant about this" affordance — a chip that
 * only reports is a notification, and we do not build notifications here.
 *
 * Producer rules honored (features/assists/FEATURE.md):
 *  - dedupe keys + `filterUndecidedKeys` first — a dismissal is durable.
 *  - capped: at most THREE chips per sweep, in the order below.
 *  - cheapest-first: the employer context is passed IN (the caller already
 *    resolved it via `useHrContext`), and the two extra reads only fire when the
 *    caller actually holds the capability that makes them meaningful.
 *  - the action is real: every chip navigates to the surface where the fix is
 *    one interaction away.
 *
 * NOT AGENT DISCLOSURE. Assists are the platform's noticing lane; agent
 * disclosure is the shell's top Agents menu and adds NO visible page content.
 * This lane declares no `agentRole` and binds no mandate — HR runs no fixed AI
 * worker on these surfaces yet, and inventing one to satisfy disclosure is
 * explicitly forbidden.
 *
 * System-of-record: /Users/armanisadeghi/code/common-docs/systems/platform/assists/FEATURE.md
 */

import type { AppDispatch } from "@/lib/redux/store";
import { filterUndecidedKeys } from "@/features/assists/service";
import { emitAssistTracked } from "@/features/assists/redux/emitTracked";
import { assistPriority } from "@/features/assists/types";

import { fetchHrOrgChart, fetchHrPendingChanges } from "./service";
import {
  hrMeHref,
  hrOrgChartHref,
  hrPeopleNewHref,
  hrSettingsHref,
  type HrOrgRef,
} from "./routes";

/**
 * The assist surface keys from SPEC-UI-IA §3. The strings are the surface
 * MANIFEST names — never invented per call site.
 */
export const HR_ASSIST_SURFACES = {
  home: "matrx-user/hr",
  me: "matrx-user/hr-me",
  people: "matrx-user/hr-people",
  employee: "matrx-user/hr-employee",
  relations: "matrx-user/hr-relations",
} as const;

const SOURCE_KEY = "hr.readiness";
const EXPIRES_MS = 14 * 24 * 60 * 60 * 1000;
/** A scheduled change this close is worth a chip; further out it is just calendar. */
const IMMINENT_DAYS = 7;
const MAX_CHIPS = 3;

type HrAssistInput = {
  userId: string;
  organizationId: string;
  /** What goes in `?org=` on every link this producer builds. */
  orgRef: HrOrgRef;
  /** From `hr_my_context().active.capabilities`. Never a client-side guess. */
  capabilities: string[];
  /** This person's active spell today, when they have one. */
  employmentId: string | null;
  employeeCount: number;
  isActivated: boolean;
  canActivate: boolean;
  dispatch: AppDispatch;
};

type Candidate = {
  key: string;
  emit: () => Promise<void>;
};

function daysUntil(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return Number.POSITIVE_INFINITY;
  const target = new Date(year, month - 1, date).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

/**
 * One sweep per session (the strip gates it). Emits at most `MAX_CHIPS`.
 *
 * Every read is wrapped: a refusal for one chip must never kill the sweep, and a
 * refusal is DATA here (service.ts) rather than a thrown exception, so the
 * `result.ok` checks below are the whole error handling.
 */
export async function produceHrAssists(input: HrAssistInput): Promise<void> {
  const {
    userId,
    organizationId,
    orgRef,
    capabilities,
    employmentId,
    employeeCount,
    isActivated,
    canActivate,
    dispatch,
  } = input;

  const held = new Set(capabilities);
  const scope = `${userId}:${organizationId}`;
  const candidates: Candidate[] = [];

  const expiresAt = () => new Date(Date.now() + EXPIRES_MS).toISOString();

  // 1 — HR is on but nobody finished setup. Nothing else in HR works until this
  //     does, so it outranks everything.
  if (!isActivated && canActivate) {
    const key = `${SOURCE_KEY}.activation:${scope}`;
    candidates.push({
      key,
      emit: () =>
        emit({
          userId,
          dispatch,
          sourceKey: `${SOURCE_KEY}.activation`,
          dedupeKey: key,
          title: "Finish setting up HR",
          body: "HR is switched on for this organization but nobody has said who the employer of record is, where people work, or who runs HR. Nobody can be added until that is done — it is three steps and all of it can be changed later.",
          href: hrSettingsHref("employer", { org: orgRef }),
          label: "Set up HR",
          confirm:
            "Opens HR setup. Nothing is created until you finish the last step.",
          receipt: "Opened HR setup.",
          surfaceName: HR_ASSIST_SURFACES.home,
          priority: assistPriority("elevated", 8),
          expiresAt: expiresAt(),
        }),
    });
  }

  // 2 — Set up, but nobody is in it yet.
  if (isActivated && employeeCount === 0 && held.has("identity.write")) {
    const key = `${SOURCE_KEY}.first_hire:${scope}`;
    candidates.push({
      key,
      emit: () =>
        emit({
          userId,
          dispatch,
          sourceKey: `${SOURCE_KEY}.first_hire`,
          dedupeKey: key,
          title: "Add the first person",
          body: "HR is set up for this employer and has nobody in it yet. Adding one person turns on the directory, the org chart and every self-service surface — you can link somebody who already has a login, or an existing contact, instead of retyping them.",
          href: hrPeopleNewHref({ org: orgRef }),
          label: "Add someone",
          confirm:
            "Opens the new-employee form. It checks for a duplicate before it creates anything.",
          receipt: "Opened the new-employee form.",
          surfaceName: HR_ASSIST_SURFACES.people,
          priority: assistPriority("normal", 8),
          expiresAt: expiresAt(),
        }),
    });
  }

  // 3 — People nobody reports to. The org chart renders them in an explicit
  //     tray, so the chip's action is the surface that already shows the fix.
  if (isActivated && employeeCount > 0 && held.has("working_record.read")) {
    const chart = await fetchHrOrgChart({ organizationId }).catch(() => null);
    const unplaced = chart?.ok ? chart.data.unplaced.length : 0;
    const cycles = chart?.ok ? chart.data.cycles.length : 0;
    if (unplaced > 0 || cycles > 0) {
      const key = `${SOURCE_KEY}.org_chart:${scope}:${unplaced}:${cycles}`;
      candidates.push({
        key,
        emit: () =>
          emit({
            userId,
            dispatch,
            sourceKey: `${SOURCE_KEY}.org_chart`,
            dedupeKey: key,
            title:
              cycles > 0
                ? "The reporting lines have a loop"
                : `${unplaced} ${unplaced === 1 ? "person reports" : "people report"} to nobody`,
            body:
              cycles > 0
                ? "Somebody reports to somebody who reports back to them, so the org chart cannot resolve a top. The chart shows the loop rather than hiding it — open it and change one of the two lines."
                : `${unplaced === 1 ? "One person has" : `${unplaced} people have`} no manager as of today, so approvals that route up a chain have nowhere to go. The org chart lists them in a tray with the assignment control on each one.`,
            href: hrOrgChartHref({ org: orgRef }),
            label: "Open the org chart",
            confirm: "Opens the org chart. Looking changes nothing.",
            receipt: "Opened the org chart.",
            surfaceName: HR_ASSIST_SURFACES.people,
            priority: assistPriority("normal", cycles > 0 ? 7 : 5),
            expiresAt: expiresAt(),
            evidence: {
              kind: "org_chart",
              label: "Today's reporting lines",
              href: hrOrgChartHref({ org: orgRef }),
              items: [
                unplaced > 0 ? `${unplaced} with no manager` : null,
                cycles > 0 ? `${cycles} in a reporting loop` : null,
              ].filter((item): item is string => item !== null),
            },
          }),
      });
    }
  }

  // 4 — Something is about to change for THIS person and they may not know.
  if (employmentId) {
    const pending = await fetchHrPendingChanges(employmentId).catch(() => null);
    if (pending?.ok) {
      const rows = [
        ...pending.data.positions,
        ...pending.data.compensation,
        ...pending.data.reporting_lines,
      ];
      const imminent = rows
        .map((row) => daysUntil(row.effective_from))
        .filter((days) => days >= 0 && days <= IMMINENT_DAYS);
      if (imminent.length > 0) {
        const soonest = Math.min(...imminent);
        const key = `${SOURCE_KEY}.pending_soon:${scope}:${employmentId}:${soonest}`;
        candidates.push({
          key,
          emit: () =>
            emit({
              userId,
              dispatch,
              sourceKey: `${SOURCE_KEY}.pending_soon`,
              dedupeKey: key,
              title:
                imminent.length === 1
                  ? soonest === 0
                    ? "A change to your record takes effect today"
                    : `A change to your record takes effect in ${soonest} ${soonest === 1 ? "day" : "days"}`
                  : `${imminent.length} changes to your record take effect this week`,
              body: "Your own page lists what is scheduled, when it starts, who asked for it, and where it is in approval. Anything that has not reached its date yet can still be stopped there.",
              href: hrMeHref(orgRef),
              label: "See what changes",
              confirm: "Opens your own HR record. Looking changes nothing.",
              receipt: "Opened your HR record.",
              surfaceName: HR_ASSIST_SURFACES.me,
              priority: assistPriority("elevated", soonest === 0 ? 5 : 2),
              expiresAt: expiresAt(),
            }),
        });
      }
    }
  }

  if (candidates.length === 0) return;

  const undecided = new Set(
    await filterUndecidedKeys(candidates.map((c) => c.key)).catch(() => []),
  );

  let emitted = 0;
  for (const candidate of candidates) {
    if (emitted >= MAX_CHIPS) break;
    if (!undecided.has(candidate.key)) continue;
    await candidate.emit();
    emitted += 1;
  }
}

async function emit(args: {
  userId: string;
  dispatch: AppDispatch;
  sourceKey: string;
  dedupeKey: string;
  title: string;
  body: string;
  href: string;
  label: string;
  confirm: string;
  receipt: string;
  surfaceName: string;
  priority: number;
  expiresAt: string;
  evidence?: {
    kind: string;
    label?: string;
    href?: string;
    items?: string[];
  };
}): Promise<void> {
  await emitAssistTracked(
    args.userId,
    {
      sourceKey: args.sourceKey,
      title: args.title,
      body: args.body,
      action: {
        kind: "navigate",
        href: args.href,
        label: args.label,
        confirm: args.confirm,
        receipt: args.receipt,
      },
      surfaceName: args.surfaceName,
      dedupeKey: args.dedupeKey,
      expiresAt: args.expiresAt,
      priority: args.priority,
      evidence: args.evidence,
    },
    args.dispatch,
  );
}
