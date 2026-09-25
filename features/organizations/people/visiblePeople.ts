// ─────────────────────────────────────────────────────────────────────────
// PEOPLE YOU CAN SEE — the ONE client lookup for "who is this account?".
//
// Access is personal (Arman, 2026-09-23): a person resolves when the viewer
// shares ANY organization with them — never only the active one. The database
// decides, through `public.people_you_share_an_organization_with`
// (SECURITY DEFINER, `iam.has_org_access` on each organization the person
// belongs to; signed out → nothing). Someone the viewer shares no
// organization with resolves to null.
//
// Every lookup made in the same tick joins ONE call (at most 200 ids).
// Used by the `user` peek and @-mention chips.
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from "@/utils/supabase/client";

export interface VisiblePerson {
  userId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: string | null;
  joinedAt: string | null;
  /** One organization the viewer shares with them (the earliest they joined). */
  organizationId: string | null;
  organizationName: string | null;
}

type Pending = { id: string; settle: (p: VisiblePerson | null) => void };

let queue: Pending[] | null = null;
const cache = new Map<string, Promise<VisiblePerson | null>>();

/** Test hook: how many lookups reached the database. */
export const visiblePeopleStats = { calls: 0 };

async function flush(batch: Pending[]): Promise<void> {
  const ids = [...new Set(batch.map((p) => p.id))];
  const found = new Map<string, VisiblePerson>();
  for (let i = 0; i < ids.length; i += 200) {
    visiblePeopleStats.calls++;
    const { data, error } = await supabase.rpc("people_you_share_an_organization_with", {
      p_user_ids: ids.slice(i, i + 200),
    });
    if (error || !Array.isArray(data)) continue;
    for (const row of data) {
      found.set(String(row.user_id).toLowerCase(), {
        userId: row.user_id,
        name: row.display_name || row.email || "Member",
        email: row.email || null,
        avatarUrl: row.avatar_url || null,
        role: row.role || null,
        joinedAt: row.joined_at || null,
        organizationId: row.organization_id || null,
        organizationName: row.organization_name || null,
      });
    }
  }
  batch.forEach((p) => p.settle(found.get(p.id) ?? null));
}

export function resolveVisiblePerson(userId: string): Promise<VisiblePerson | null> {
  const id = userId.toLowerCase();
  const cached = cache.get(id);
  if (cached) return cached;
  const promise = new Promise<VisiblePerson | null>((settle) => {
    if (!queue) {
      queue = [];
      setTimeout(() => {
        const batch = queue ?? [];
        queue = null;
        flush(batch).catch(() => batch.forEach((p) => p.settle(null)));
      }, 0);
    }
    queue.push({ id, settle });
  });
  cache.set(id, promise);
  // A miss is re-checked next time (joining an organization changes it).
  promise.then((p) => {
    if (!p) cache.delete(id);
  });
  return promise;
}
