// ─────────────────────────────────────────────────────────────────────────
// PERSON MENTIONS — `@[Dana](user:<uuid>)` → the member, BATCHED.
//
// Every person mention rendered in the same tick joins ONE read: the members
// of the viewer's active organization (`get_organization_members_with_users`,
// which refuses anyone without access to that organization). A mention of
// someone outside it — or any lookup while signed out or refused — resolves
// to null, and the chip falls back to the label as plain text.
// Loaded lazily by the mention element.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from "@/utils/supabase/client";

export interface MentionedPerson {
  userId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: string | null;
}

type Pending = { userId: string; settle: (p: MentionedPerson | null) => void };

const cache = new Map<string, Promise<MentionedPerson | null>>();
const queues = new Map<string, Pending[]>();

/** Test hook: how many member reads ran. */
export const peopleResolverStats = { reads: 0 };

async function readMembers(orgId: string): Promise<Map<string, MentionedPerson> | null> {
  const supabase = createClient();
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return null;
  peopleResolverStats.reads++;
  const { data, error } = await supabase.rpc("get_organization_members_with_users", { p_org_id: orgId });
  if (error || !Array.isArray(data)) return null;
  const map = new Map<string, MentionedPerson>();
  for (const row of data as { user_id: string; user_email: string | null; user_display_name: string | null; user_avatar_url: string | null; role: string | null }[]) {
    map.set(String(row.user_id).toLowerCase(), {
      userId: row.user_id,
      name: row.user_display_name || row.user_email || "Member",
      email: row.user_email || null,
      avatarUrl: row.user_avatar_url || null,
      role: row.role,
    });
  }
  return map;
}

export function resolvePerson(userId: string, orgId: string | null): Promise<MentionedPerson | null> {
  if (!orgId) return Promise.resolve(null);
  const key = `${orgId}|${userId.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const promise = new Promise<MentionedPerson | null>((settle) => {
    let queue = queues.get(orgId);
    if (!queue) {
      queue = [];
      queues.set(orgId, queue);
      setTimeout(() => {
        const batch = queues.get(orgId) ?? [];
        queues.delete(orgId);
        readMembers(orgId)
          .then((members) => batch.forEach((p) => p.settle(members?.get(p.userId.toLowerCase()) ?? null)))
          .catch(() => batch.forEach((p) => p.settle(null)));
      }, 0);
    }
    queue.push({ userId, settle });
  });
  cache.set(key, promise);
  // A miss is re-checked next time (joining an organization changes it).
  promise.then((p) => {
    if (!p) cache.delete(key);
  });
  return promise;
}
