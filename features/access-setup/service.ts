// features/access-setup/service.ts
//
// THE ONE FILE THAT CALLS THE ACCESS-SETUP DOORS. Every wrapper returns AccessResult<T> and never
// throws: a refusal, a transport failure and an unreadable answer all arrive as { ok:false, message }.
//
// Doors (all SECURITY DEFINER, declared in platform.client_callable_door):
//   iam.record_access_setup(type, id)            the panel's read
//   iam.record_seat_set(type, id, seat, user, change, reason)   add / exclude one person on a seat
//   iam.record_seat_clear(type, id, seat, user)  undo that add / exclude
//   iam.record_setup_confirm(type, ids[])        one access-log row: "people involved confirmed"
//   hr.hr_review_cycle_access_setup(cycle)       the cycle-level panel (org-wide seats, stage knobs)
//   hr.hr_owner_takes_hr_role(org)               small company: the owner takes HR via the HR doors

import { supabase } from "@/utils/supabase/client";

import {
  parseCycleAccessSetup,
  parseRecordAccessSetup,
  type CycleAccessSetup,
  type RecordAccessSetup,
} from "./types";

export type AccessResult<T> = { ok: true; data: T } | { ok: false; reason: string; message: string };

type Rec = Record<string, unknown>;

const REFUSALS: Record<string, string> = {
  no_caller: "Sign in again to change who is involved.",
  not_reachable: "You are not involved in this record.",
  not_permitted: "You cannot change this seat.",
  last_holder_of_required_seat: "Someone has to fill this seat. Add another person first.",
  subject_seat_is_the_record: "This person is who the record is about.",
  nothing_to_undo: "Nothing to undo here.",
  validation: "That person is not a member of this organization.",
  no_setup: "This record has no people setup.",
};

const SERVICE_MESSAGE = "Could not reach the server. Try again in a moment.";

async function settle(
  door: string,
  run: () => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
): Promise<AccessResult<Rec>> {
  try {
    const { data, error } = await run();
    if (error) {
      console.error(`[access-setup] ${door} failed`, error);
      return { ok: false, reason: "transport", message: SERVICE_MESSAGE };
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return { ok: false, reason: "unreadable", message: "The answer could not be read. Reload and try again." };
    }
    const rec = data as Rec;
    if (rec.ok === false || (rec.ok !== true && rec.granted !== true)) {
      const reason = typeof rec.reason === "string" ? rec.reason : "refused";
      const detail = typeof rec.detail === "string" ? rec.detail : null;
      return { ok: false, reason, message: REFUSALS[reason] ?? detail ?? "That could not be done." };
    }
    return { ok: true, data: rec };
  } catch (thrown) {
    console.error(`[access-setup] ${door} did not reach the server`, thrown);
    return { ok: false, reason: "transport", message: SERVICE_MESSAGE };
  }
}

export async function fetchRecordAccessSetup(type: string, id: string): Promise<AccessResult<RecordAccessSetup>> {
  const r = await settle("record_access_setup", () =>
    supabase.schema("iam").rpc("record_access_setup", { p_type: type, p_id: id }),
  );
  if (!r.ok) return r;
  const view = parseRecordAccessSetup(r.data);
  return view ? { ok: true, data: view } : { ok: false, reason: "unreadable", message: "The answer could not be read. Reload and try again." };
}

export async function fetchCycleAccessSetup(cycleId: string): Promise<AccessResult<CycleAccessSetup>> {
  const r = await settle("hr_review_cycle_access_setup", () =>
    supabase.schema("hr").rpc("hr_review_cycle_access_setup", { p_cycle_id: cycleId }),
  );
  if (!r.ok) return r;
  const view = parseCycleAccessSetup(r.data);
  return view ? { ok: true, data: view } : { ok: false, reason: "unreadable", message: "The answer could not be read. Reload and try again." };
}

export async function setSeat(
  type: string,
  id: string,
  seat: string,
  userId: string,
  change: "add" | "exclude",
): Promise<AccessResult<true>> {
  const r = await settle("record_seat_set", () =>
    supabase.schema("iam").rpc("record_seat_set", {
      p_type: type,
      p_id: id,
      p_seat: seat,
      p_user: userId,
      p_change: change,
    }),
  );
  return r.ok ? { ok: true, data: true } : r;
}

export async function clearSeat(type: string, id: string, seat: string, userId: string): Promise<AccessResult<true>> {
  const r = await settle("record_seat_clear", () =>
    supabase.schema("iam").rpc("record_seat_clear", { p_type: type, p_id: id, p_seat: seat, p_user: userId }),
  );
  return r.ok ? { ok: true, data: true } : r;
}

export async function confirmSetup(type: string, ids: string[]): Promise<AccessResult<true>> {
  const r = await settle("record_setup_confirm", () =>
    supabase.schema("iam").rpc("record_setup_confirm", { p_type: type, p_ids: ids }),
  );
  return r.ok ? { ok: true, data: true } : r;
}

export async function ownerTakesHr(organizationId: string): Promise<AccessResult<true>> {
  const r = await settle("hr_owner_takes_hr_role", () =>
    supabase.schema("hr").rpc("hr_owner_takes_hr_role", { p_organization_id: organizationId }),
  );
  return r.ok ? { ok: true, data: true } : r;
}
