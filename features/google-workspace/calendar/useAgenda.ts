"use client";

/**
 * Calendar Plane A — the agenda as state. ONE hook behind the ONE panel, so the
 * home screen, the Person record and the window panel cannot drift apart.
 *
 * What it owns: the knobs, the window read, the freshness answer, refresh on open
 * when stale, refresh on demand, and the attendee → Person join. What it does NOT
 * own: any rendering decision, and any notion of "now" other than one clock read
 * per pass (a component that called `new Date()` in three places could group an
 * event into a day it then labelled differently).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import {
  useOrganizationRequired,
  type OrganizationState,
} from "@/features/organizations/useOrganizationRequired";
import {
  accountHealth,
  preferredAccountId,
  type ConnectorProductHealth,
} from "@/features/connectors/health";
import {
  GOOGLE_PROVIDER,
  useGoogleConnectorState,
} from "@/features/connectors/google-adapter";
import { extractErrorMessage } from "@/utils/errors";

import {
  REFRESH_KNOB,
  refreshSecondsFrom,
} from "@/features/google-workspace/documents/knobs";

import {
  AGENDA_DAYS_KNOB,
  CALENDAR_PRODUCT_KEY,
  agendaDays,
  agendaIsStaleForOpen,
  attendeesOf,
  groupAgenda,
  newestSyncedAt,
  refreshedPhrase,
  undatedEvents,
  viewerTimeZone,
} from "./record";
import { readAgendaEvents, readAttendeePeople, refreshCalendarWindow } from "./service";
import type { AgendaGroup, AttendeePerson, CalendarEventRow } from "./types";

export interface AgendaValue {
  /** Today, tomorrow, then each later day inside the window. */
  groups: AgendaGroup[];
  /** Events in the window that carry no start time. Shown, never dropped. */
  undated: CalendarEventRow[];
  /** Attendees who are People here, by event id. */
  peopleByEvent: Map<string, AttendeePerson[]>;
  /** True only on the FIRST read; a refresh keeps the rows on screen. */
  isLoading: boolean;
  /** True while a Google refresh is in flight. */
  isRefreshing: boolean;
  /** How many days the window covers, after the knob and the provider clamp. */
  days: number;
  /** The viewer's IANA timezone, resolved once — every day boundary uses it. */
  timeZone: string;
  /** "Refreshed 4 minutes ago from Google", or that it never has been. */
  freshness: string;
  /** Whatever could not be read or refreshed, as sentences. Never swallowed. */
  problems: string[];
  /** The calendar product's health on the account this agenda refreshes through. */
  productHealth: ConnectorProductHealth | null;
  /** The connected account id a refresh would run through, when there is one. */
  connectionId: string | null;
  /** True once the connector state is known and no account can serve Calendar. */
  noAccount: boolean;
  /**
   * The organization question's answer, as ONE value the panel switches on:
   * `resolving` (still being asked), `required` (settled with nothing
   * selected), `unavailable` (the read FAILED — nobody looked, R37) or `ready`.
   * `readAgendaEvents` / `refreshCalendarWindow` fail closed
   * (`requireOrganizationContext`) with no organization to send, so this panel
   * never calls them outside `ready` — it renders the ONE notice instead of a
   * screen that would otherwise say "your calendar is connected and empty",
   * which is a confident and wrong claim for a person who has not picked an
   * organization at all, and doubly wrong for one whose memberships nobody
   * managed to read.
   *
   * 🚨 It replaces the `organizationRequired` / `organizationResolving` pair
   * (F-76, then 2026-09-18). Each fix in turn closed one state and left the
   * next open: forwarding only `organizationRequired` showed "nothing on it"
   * during boot, and the pair that followed could not see the fourth state at
   * all — under a failed read `organizationRequired` was false while the legacy
   * `resolving` stayed true, so `isLoading` held the agenda skeleton up for as
   * long as the panel was open. Four states, one value, one `switch`.
   */
  organizationState: OrganizationState;
  /**
   * True when a knob row did not answer and a documented default is in use —
   * the surface SAYS so rather than pretending an administrator chose it.
   */
  usingDefaultKnobs: boolean;
  refresh: () => Promise<void>;
  /** Re-read the rows without calling Google (after a note, after an edit). */
  reload: () => void;
}

/**
 * @param partyEmailKeys when set, only events with an attendee at one of these
 * normalized addresses are kept — "Upcoming with this person".
 */
export function useAgenda(options?: {
  partyEmailKeys?: readonly string[] | null;
  /** Skip the refresh-on-open call (a panel that is not the primary surface). */
  refreshOnOpen?: boolean;
}): AgendaValue {
  // All FOUR states, from the one hook that reads them: loadable, settled with
  // none (the honest terminal notice), still resolving (the skeleton), and the
  // read that FAILED (its own screen, with Try again). Taking a subset is what
  // made the agenda lie during boot and then hang forever under a failed read.
  const { organizationId, organizationState } = useOrganizationRequired();
  const userId = useAppSelector(selectUserId);
  const connector = useGoogleConnectorState();

  const rawDays = useEffectiveKnob(organizationId, userId, AGENDA_DAYS_KNOB);
  // ONE reader for the refresh floor — `REFRESH_KNOB` / `refreshSecondsFrom` live
  // beside the Docs record because "how old is too old" is one posture for every
  // Google record, not a per-surface opinion. A second parser here is how two
  // surfaces come to disagree about the same setting.
  const rawMinAge = useEffectiveKnob(organizationId, userId, REFRESH_KNOB);
  const days = agendaDays(rawDays);
  const minAgeSeconds = refreshSecondsFrom(rawMinAge);
  const usingDefaultKnobs = rawDays === undefined || rawMinAge === undefined;

  const [events, setEvents] = useState<CalendarEventRow[] | null>(null);
  const [peopleByEvent, setPeopleByEvent] = useState<Map<string, AttendeePerson[]>>(new Map());
  const [problems, setProblems] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [generation, setGeneration] = useState(0);
  const refreshedFor = useRef<string | null>(null);

  const timeZone = viewerTimeZone();
  const account =
    connector.accounts.find(
      (candidate) =>
        candidate.id ===
        preferredAccountId({
          provider: GOOGLE_PROVIDER,
          accounts: connector.accounts,
          rollout: connector.rollout,
          // 🚨 THE ACCOUNT THAT HOLDS CALENDAR, never the one holding the most
          // products (lane F-51): with Calendar on one account and five other
          // products on another, the count picked the second and this panel said
          // the calendar was not connected while the first could have served it.
          forProductKey: CALENDAR_PRODUCT_KEY,
        }),
    ) ?? null;
  const productHealth =
    accountHealth({
      provider: GOOGLE_PROVIDER,
      account,
      rollout: connector.rollout,
    }).find((row) => row.product.key === CALENDAR_PRODUCT_KEY) ?? null;
  const connectionId = account?.id ?? null;
  const noAccount = !connector.isLoading && !connector.isError && connector.accounts.length === 0;

  const reload = useCallback(() => setGeneration((n) => n + 1), []);

  // ── The window read ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!organizationId || !userId) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      const found: string[] = [];
      let rows: CalendarEventRow[] = [];
      try {
        rows = await readAgendaEvents({
          organizationId,
          userId,
          days,
          now: new Date(),
          signal: controller.signal,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        // NOTHING FAILS SILENTLY — an unreadable agenda says so; it never renders
        // as an empty day, which is a different and confident claim.
        found.push(
          `Your calendar could not be read from AI Matrx: ${extractErrorMessage(error)}`,
        );
      }
      if (cancelled) return;
      setEvents(rows);

      let people = new Map<string, AttendeePerson[]>();
      if (rows.length > 0) {
        try {
          people = await readAttendeePeople(rows);
        } catch (error: unknown) {
          found.push(
            `We could not check which attendees are People here: ${extractErrorMessage(error)}`,
          );
        }
      }
      if (cancelled) return;
      setPeopleByEvent(people);
      setProblems(found);
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [organizationId, userId, days, generation]);

  // ── Refresh ───────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!organizationId || !connectionId) return;
    setIsRefreshing(true);
    try {
      await refreshCalendarWindow({ connectionId, organizationId, days });
      setProblems((current) =>
        current.filter((problem) => !problem.startsWith("Google could not")),
      );
      reload();
    } catch (error: unknown) {
      setProblems((current) => [
        ...current.filter((problem) => !problem.startsWith("Google could not")),
        `Google could not be reached for this refresh: ${extractErrorMessage(error)}`,
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [organizationId, connectionId, days, reload]);

  // ── Refresh on open, ONCE per (account, window), and only when stale ──────
  useEffect(() => {
    if (options?.refreshOnOpen === false) return;
    if (!organizationId || !connectionId || events === null) return;
    // A product that is not connected cannot be refreshed; the strip says why.
    if (productHealth && productHealth.state !== "connected") return;
    const key = `${connectionId}:${days}`;
    if (refreshedFor.current === key) return;
    // 🚨 A DETACHED EVENT NEVER COUNTS AS EVIDENCE THE WINDOW IS STALE — its
    // `synced_at` is frozen the day someone kept it as AI Matrx data, and no
    // refresh will ever move it, so treating its age as staleness would spend
    // a Google call on every open for a fact no call could change.
    if (!agendaIsStaleForOpen(events, minAgeSeconds, new Date())) {
      refreshedFor.current = key;
      return;
    }
    refreshedFor.current = key;
    void refresh();
    // `refresh` is stable per (org, connection, window); `events` is what makes
    // this run once the first read has landed, which is when staleness is known.
  }, [
    organizationId,
    connectionId,
    days,
    events,
    minAgeSeconds,
    productHealth,
    refresh,
    options?.refreshOnOpen,
  ]);

  const now = new Date();
  const filtered = filterByAttendeeEmails(events ?? [], options?.partyEmailKeys ?? null);

  return {
    groups: groupAgenda(filtered, days, now, timeZone),
    undated: undatedEvents(filtered),
    peopleByEvent,
    // Unresolved is LOADING, never empty: while the organization question is
    // still being answered nothing has been read, so the skeleton is the only
    // honest thing on screen. Deliberately NOT extended to a null `userId` on
    // its own — that would be a spinner with no end for a signed-out viewer,
    // which is the same law-4 defect pointing the other way. `resolving` ends
    // either way: boot either lands on a selection or on "none".
    isLoading:
      organizationState === "resolving" ||
      (events === null && Boolean(organizationId && userId)),
    isRefreshing,
    days,
    timeZone,
    freshness: refreshedPhrase(newestSyncedAt(filtered), now),
    problems: connector.isError && connector.errorMessage
      ? [...problems, `Your Google connection could not be checked: ${connector.errorMessage}`]
      : problems,
    productHealth,
    connectionId,
    noAccount,
    organizationState,
    usingDefaultKnobs,
    refresh,
    reload,
  };
}

/**
 * "Upcoming with this person": an event counts when one of their addresses is on
 * it. The attendee list is the row's own, so this never needs a second read — and
 * it deliberately does NOT rely on the server's Person edge alone, because an
 * event refreshed BEFORE that Person existed here carries no edge until the next
 * refresh, and the person looking at the record would see nothing.
 */
export function filterByAttendeeEmails(
  events: readonly CalendarEventRow[],
  emailKeys: readonly string[] | null,
): CalendarEventRow[] {
  if (!emailKeys) return [...events];
  const wanted = new Set(emailKeys.map((key) => key.trim().toLowerCase()).filter(Boolean));
  if (wanted.size === 0) return [];
  return events.filter((event) => {
    // The ONE attendee reader (`attendeesOf`), so the filter and the rendered
    // list can never disagree about who is on an event.
    if (attendeesOf(event.attendees).some((attendee) => wanted.has(attendee.email))) return true;
    const organizer = event.organizer_email;
    return typeof organizer === "string" && wanted.has(organizer.trim().toLowerCase());
  });
}
