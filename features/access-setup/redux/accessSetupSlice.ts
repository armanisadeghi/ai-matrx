// features/access-setup/redux/accessSetupSlice.ts
//
// The setup panel's state: one entry per record (`<type>:<id>`) and per cycle (`cycle:<id>`).
// Every write goes through a thunk that calls the service and then re-reads the door, so the
// panel always shows what the server now answers — never an optimistic guess about access.

import { createAsyncThunk, createSelector, createSlice } from "@reduxjs/toolkit";

import type { RootState } from "@/lib/redux/rootReducer";
import { toast } from "@/lib/toast";

import {
  clearSeat,
  confirmSetup,
  fetchCycleAccessSetup,
  fetchRecordAccessSetup,
  ownerTakesHr,
  setSeat,
} from "../service";
import type { CycleAccessSetup, RecordAccessSetup } from "../types";

export type AccessSetupStatus = "loading" | "ready" | "error";

interface AccessSetupState {
  records: Record<string, RecordAccessSetup>;
  cycles: Record<string, CycleAccessSetup>;
  status: Record<string, AccessSetupStatus>;
  errors: Record<string, string>;
  busy: Record<string, boolean>;
}

const initialState: AccessSetupState = { records: {}, cycles: {}, status: {}, errors: {}, busy: {} };

export const recordKey = (type: string, id: string) => `${type}:${id}`;
export const cycleKey = (cycleId: string) => `cycle:${cycleId}`;

export const loadRecordSetup = createAsyncThunk(
  "accessSetup/loadRecord",
  async ({ type, id }: { type: string; id: string }, { rejectWithValue }) => {
    const r = await fetchRecordAccessSetup(type, id);
    return r.ok ? r.data : rejectWithValue(r.message);
  },
);

export const loadCycleSetup = createAsyncThunk(
  "accessSetup/loadCycle",
  async ({ cycleId }: { cycleId: string }, { rejectWithValue }) => {
    const r = await fetchCycleAccessSetup(cycleId);
    return r.ok ? r.data : rejectWithValue(r.message);
  },
);

/** Add, exclude or undo one person on one seat, then re-read the record. */
export const changeSeat = createAsyncThunk(
  "accessSetup/changeSeat",
  async (
    a: { type: string; id: string; seat: string; userId: string; change: "add" | "exclude" | "undo" },
    { dispatch },
  ) => {
    const r = a.change === "undo"
      ? await clearSeat(a.type, a.id, a.seat, a.userId)
      : await setSeat(a.type, a.id, a.seat, a.userId, a.change);
    if (!r.ok) toast.error(r.message);
    await dispatch(loadRecordSetup({ type: a.type, id: a.id }));
    return r.ok;
  },
);

/** What to re-read after a write: the record panel or the cycle panel. */
export type SetupScope = { kind: "record"; type: string; id: string } | { kind: "cycle"; cycleId: string };

type ThunkDispatchLike = (action: ReturnType<typeof loadRecordSetup> | ReturnType<typeof loadCycleSetup>) => unknown;

async function reloadScope(dispatch: ThunkDispatchLike, scope: SetupScope): Promise<void> {
  if (scope.kind === "record") await dispatch(loadRecordSetup({ type: scope.type, id: scope.id }));
  else await dispatch(loadCycleSetup({ cycleId: scope.cycleId }));
}

export const scopeKey = (scope: SetupScope) =>
  scope.kind === "record" ? recordKey(scope.type, scope.id) : cycleKey(scope.cycleId);

export const confirmAccessSetup = createAsyncThunk(
  "accessSetup/confirm",
  async (a: { key: string; type: string; ids: string[]; scope: SetupScope }, { dispatch }) => {
    const r = await confirmSetup(a.type, a.ids);
    if (!r.ok) toast.error(r.message);
    else toast.success("People involved confirmed");
    await reloadScope(dispatch as ThunkDispatchLike, a.scope);
    return r.ok;
  },
);

/** Small company: the organization owner takes the HR role for every review. */
export const takeHrRole = createAsyncThunk(
  "accessSetup/takeHr",
  async (a: { key: string; organizationId: string; scope: SetupScope }, { dispatch }) => {
    const r = await ownerTakesHr(a.organizationId);
    if (!r.ok) toast.error(r.message);
    else toast.success("You now hold HR for every review");
    await reloadScope(dispatch as ThunkDispatchLike, a.scope);
    return r.ok;
  },
);

const keyOfWrite = (arg: { key?: string; type?: string; id?: string }) =>
  arg.key ?? (arg.type && arg.id ? recordKey(arg.type, arg.id) : "");

const accessSetupSlice = createSlice({
  name: "accessSetup",
  initialState,
  reducers: {},
  extraReducers: (b) => {
    b.addCase(loadRecordSetup.pending, (s, a) => {
      const k = recordKey(a.meta.arg.type, a.meta.arg.id);
      if (!s.records[k]) s.status[k] = "loading";
    });
    b.addCase(loadRecordSetup.fulfilled, (s, a) => {
      const k = recordKey(a.meta.arg.type, a.meta.arg.id);
      s.records[k] = a.payload;
      s.status[k] = "ready";
      delete s.errors[k];
    });
    b.addCase(loadRecordSetup.rejected, (s, a) => {
      const k = recordKey(a.meta.arg.type, a.meta.arg.id);
      s.status[k] = "error";
      s.errors[k] = typeof a.payload === "string" ? a.payload : "Could not load who is involved.";
    });
    b.addCase(loadCycleSetup.pending, (s, a) => {
      const k = cycleKey(a.meta.arg.cycleId);
      if (!s.cycles[k]) s.status[k] = "loading";
    });
    b.addCase(loadCycleSetup.fulfilled, (s, a) => {
      const k = cycleKey(a.meta.arg.cycleId);
      s.cycles[k] = a.payload;
      s.status[k] = "ready";
      delete s.errors[k];
    });
    b.addCase(loadCycleSetup.rejected, (s, a) => {
      const k = cycleKey(a.meta.arg.cycleId);
      s.status[k] = "error";
      s.errors[k] = typeof a.payload === "string" ? a.payload : "Could not load who is involved.";
    });
    for (const t of [changeSeat, confirmAccessSetup, takeHrRole] as const) {
      b.addCase(t.pending, (s, a) => {
        s.busy[keyOfWrite(a.meta.arg)] = true;
      });
      b.addCase(t.fulfilled, (s, a) => {
        delete s.busy[keyOfWrite(a.meta.arg)];
      });
      b.addCase(t.rejected, (s, a) => {
        delete s.busy[keyOfWrite(a.meta.arg)];
      });
    }
  },
});

export default accessSetupSlice.reducer;

// ── selectors: plain lookups, no defaults (redux-selector-rules) ──
const selectSlice = (s: RootState) => s.accessSetup;
const selectKey = (_s: RootState, key: string) => key;

export const selectRecordSetup = createSelector([selectSlice, selectKey], (st, k) => st.records[k]);
export const selectCycleSetup = createSelector([selectSlice, selectKey], (st, k) => st.cycles[k]);
export const selectSetupStatus = createSelector([selectSlice, selectKey], (st, k) => st.status[k]);
export const selectSetupError = createSelector([selectSlice, selectKey], (st, k) => st.errors[k]);
export const selectSetupBusy = createSelector([selectSlice, selectKey], (st, k) => st.busy[k] === true);
