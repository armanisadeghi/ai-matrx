"use client";

// features/meet/redux/meetingsSlice.ts
//
// ONE MEETING, LOADED ONCE PER TAB. A meeting with its invitees and upcoming
// occurrences — the three reads the meeting's home (`MeetingDetail`), a meeting
// tile, every "Meeting notes" part of it and the meeting's agent surface
// (`MeetingSurfaceHost`) need — lives here keyed by meeting id. Every view
// selects it; a woken or remounted view reads nothing it already has.
//
// The reads are the package repository's (`createMeetRepository`), exactly as
// the meeting's home always made them: the row projection stays the package's,
// never a second mapper here. A write made in this tab re-reads on purpose
// (`loadMeeting({ force: true })`); a change made anywhere else arrives through
// `useMeetingLive` (one channel per meeting, ref-counted).
//
// The meeting's templates (`meet.templates` / `meet.personal_templates` knobs,
// and whether this person may write the organization's) are kept here too, per
// organization and person, for the same reason.
//
// A failed read is kept whole (`error`), never shown as "no meeting": the
// access gate asks the platform which failure it is.

import { createAsyncThunk, createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  MeetingInvitee,
  MeetingOccurrence,
  MeetingRecord,
  MeetRepository,
} from "@ai-matrx/meet/react";
import { supabase } from "@/utils/supabase/client";
import { fetchKnobWriteDoor } from "@/lib/scoped-config/service";
import { parseTemplateList, type MeetingTemplate } from "@/features/meet/lib/meeting-template";

export interface LoadedMeeting {
  meeting: MeetingRecord;
  invitees: readonly MeetingInvitee[];
  occurrences: readonly MeetingOccurrence[];
}

export interface MeetingEntry {
  /** The last good read; kept while a re-read runs or after one fails. */
  loaded: LoadedMeeting | null;
  loading: boolean;
  /** The last read's failure, whole (the access gate classifies it). */
  error: unknown;
  /** The newest read asked for — an older answer landing late is dropped. */
  requestId: string | null;
}

export interface MeetTemplatesEntry {
  organization: MeetingTemplate[];
  personal: MeetingTemplate[];
  mayWriteOrganization: boolean;
  loaded: boolean;
}

export interface MeetingsState {
  byId: Record<string, MeetingEntry>;
  templatesByKey: Record<string, MeetTemplatesEntry>;
}

const initialState: MeetingsState = { byId: {}, templatesByKey: {} };

const DAY_MS = 86_400_000;

// Reads need no organization (access is personal): a plain repository on the
// app's client, the same one `useMeetingActions` reads through without a host.
// The package loads on the first read (this slice is in the store, so every route's first
// load): a static import here kept the whole Meet package in the shell.
let readRepository: Promise<MeetRepository> | null = null;
function repository(): Promise<MeetRepository> {
  readRepository ??= import("@ai-matrx/meet/core").then(({ createMeetRepository }) =>
    createMeetRepository({ client: supabase }),
  );
  return readRepository;
}

/** The read itself. */
export async function readMeeting(repo: MeetRepository, meetingId: string): Promise<LoadedMeeting> {
  const meeting = await repo.meeting(meetingId as MeetingRecord["id"]);
  const [invitees, occurrences] = await Promise.all([
    repo.invitees(meeting.id).catch(() => [] as readonly MeetingInvitee[]),
    meeting.scheduledFor
      ? repo.meetingOccurrences(meeting.id, {
          from: new Date(Date.now() - DAY_MS).toISOString(),
          to: new Date(Date.now() + 400 * DAY_MS).toISOString(),
          limit: meeting.recurrenceRule ? 20 : 1,
        })
      : Promise.resolve([] as readonly MeetingOccurrence[]),
  ]);
  return { meeting, invitees, occurrences };
}

type WithMeetings = { meetings: MeetingsState };

/**
 * Load one meeting into the store. Without `force` it reads only a meeting no
 * view in this tab has read (and none is reading): every mount may dispatch it.
 */
export const loadMeeting = createAsyncThunk<
  LoadedMeeting,
  { meetingId: string; force?: boolean },
  { state: WithMeetings; rejectValue: unknown }
>("meetings/load", async ({ meetingId }, { rejectWithValue }) => {
  try {
    return await readMeeting(await repository(), meetingId);
  } catch (thrown) {
    // Kept whole: the access gate reads the PostgREST code off it.
    return rejectWithValue(thrown);
  }
}, {
  condition: ({ meetingId, force }, { getState }) => {
    const entry = getState().meetings.byId[meetingId];
    if (!entry) return true;
    if (force) return true;
    return !entry.loading && entry.loaded === null && entry.error === null;
  },
});

/** Re-read only the guest list (an invitee row changed). */
export const refreshMeetingInvitees = createAsyncThunk<
  { meetingId: string; invitees: readonly MeetingInvitee[] },
  { meetingId: string },
  { state: WithMeetings }
>(
  "meetings/refreshInvitees",
  async ({ meetingId }) => ({
    meetingId,
    invitees: await (await repository()).invitees(meetingId as MeetingRecord["id"]),
  }),
  {
    // Nothing to refresh until the meeting itself is in the store.
    condition: ({ meetingId }, { getState }) => Boolean(getState().meetings.byId[meetingId]?.loaded),
  },
);

export function meetTemplatesKey(organizationId: string, userId: string): string {
  return `${organizationId}:${userId}`;
}

const TEMPLATE_KNOB_KEY = { organization: "templates", personal: "personal_templates" } as const;

/** The person's and the organization's meeting templates, once per organization and person. */
export const loadMeetTemplates = createAsyncThunk<
  { key: string; organization: MeetingTemplate[]; personal: MeetingTemplate[]; mayWriteOrganization: boolean },
  { organizationId: string; userId: string; force?: boolean },
  { state: WithMeetings }
>(
  "meetings/loadTemplates",
  async ({ organizationId, userId }) => {
    const read = (key: string, forUser: boolean) =>
      supabase
        .schema("platform")
        .rpc("knob_resolve", {
          p_feature: "meet",
          p_key: key,
          p_organization_id: organizationId,
          // The organization list is read WITHOUT the person, so a personal
          // override of the same key could never shadow it.
          p_user_id: (forUser ? userId : null) as string,
        })
        .then(({ data, error }) => (error ? [] : parseTemplateList(data)));
    const [organization, personal, mayWriteOrganization] = await Promise.all([
      read(TEMPLATE_KNOB_KEY.organization, false),
      read(TEMPLATE_KNOB_KEY.personal, true),
      fetchKnobWriteDoor({ fullKey: "meet.templates", organizationId })
        // An unknown answer (null) is not permission.
        .then((door) => door.mayWrite === true)
        .catch(() => false),
    ]);
    return { key: meetTemplatesKey(organizationId, userId), organization, personal, mayWriteOrganization };
  },
  {
    condition: ({ organizationId, userId, force }, { getState }) =>
      Boolean(force) || getState().meetings.templatesByKey[meetTemplatesKey(organizationId, userId)] === undefined,
  },
);

const meetingsSlice = createSlice({
  name: "meetings",
  initialState,
  reducers: {
    /** A write here answered with the saved row: the store holds it, no re-read. */
    meetingSaved(state, action: PayloadAction<{ meeting: MeetingRecord }>) {
      const entry = state.byId[action.payload.meeting.id];
      if (entry?.loaded) entry.loaded.meeting = action.payload.meeting as typeof entry.loaded.meeting;
    },
    /** A template list was written here: the store holds what was saved. */
    meetTemplatesWritten(
      state,
      action: PayloadAction<{ key: string; scope: "organization" | "personal"; templates: MeetingTemplate[] }>,
    ) {
      const entry = state.templatesByKey[action.payload.key];
      if (entry) entry[action.payload.scope] = action.payload.templates;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadMeeting.pending, (state, action) => {
        const id = action.meta.arg.meetingId;
        const entry = state.byId[id];
        if (entry) {
          entry.loading = true;
          entry.requestId = action.meta.requestId;
        } else {
          state.byId[id] = { loaded: null, loading: true, error: null, requestId: action.meta.requestId };
        }
      })
      .addCase(loadMeeting.fulfilled, (state, action) => {
        const entry = state.byId[action.meta.arg.meetingId];
        if (!entry || entry.requestId !== action.meta.requestId) return;
        entry.loaded = action.payload as LoadedMeeting;
        entry.loading = false;
        entry.error = null;
      })
      .addCase(loadMeeting.rejected, (state, action) => {
        const entry = state.byId[action.meta.arg.meetingId];
        if (!entry || entry.requestId !== action.meta.requestId) return;
        entry.loading = false;
        entry.error = action.payload ?? action.error;
      })
      .addCase(refreshMeetingInvitees.fulfilled, (state, action) => {
        const entry = state.byId[action.payload.meetingId];
        if (entry?.loaded) entry.loaded.invitees = action.payload.invitees as MeetingInvitee[];
      })
      .addCase(loadMeetTemplates.pending, (state, action) => {
        const key = meetTemplatesKey(action.meta.arg.organizationId, action.meta.arg.userId);
        state.templatesByKey[key] ??= { organization: [], personal: [], mayWriteOrganization: false, loaded: false };
      })
      .addCase(loadMeetTemplates.fulfilled, (state, action) => {
        const { key, organization, personal, mayWriteOrganization } = action.payload;
        state.templatesByKey[key] = { organization, personal, mayWriteOrganization, loaded: true };
      })
      .addCase(loadMeetTemplates.rejected, (state, action) => {
        const key = meetTemplatesKey(action.meta.arg.organizationId, action.meta.arg.userId);
        const entry = state.templatesByKey[key];
        if (entry) entry.loaded = true;
      });
  },
});

export const { meetingSaved, meetTemplatesWritten } = meetingsSlice.actions;
export default meetingsSlice.reducer;

export const selectMeetingEntry = createSelector(
  [(state: WithMeetings) => state.meetings.byId, (_state: WithMeetings, meetingId: string) => meetingId],
  (byId, meetingId): MeetingEntry | undefined => byId[meetingId],
);

export const selectMeetTemplates = createSelector(
  [(state: WithMeetings) => state.meetings.templatesByKey, (_state: WithMeetings, key: string) => key],
  (byKey, key): MeetTemplatesEntry | undefined => byKey[key],
);
