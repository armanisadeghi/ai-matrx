// features/access-gate/service/canActOn.ts
//
// THE CLIENT QUESTION "may this person <level> this record?" — asked of `iam.has_access`, the ONE
// access kernel (owner, visibility + organization, direct grants, memberships, education
// assignments, reachability through containers). Never `public.has_permission`: that reads direct
// share rows only, so it told a record's OWNER "no" (RC-B11 walk, 2026-09-26) and every person who
// reaches a record through their organization or a container. Guard:
// features/access-gate/__tests__/no-direct-share-check-as-access.test.ts.
//
// A failed check answers "no" and says so in the console — a control that might refuse is worse
// than none (door law), and nothing fails silently.

import { supabase } from "@/utils/supabase/client";

export type AccessLevel = "viewer" | "commenter" | "editor" | "admin";

type IamRpc = {
  rpc: (fn: "has_access", args: { p_type: string; p_id: string; p_required: AccessLevel }) => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function canActOn(token: string, id: string, level: AccessLevel): Promise<boolean> {
  const iam = supabase.schema("iam" as never) as unknown as IamRpc;
  const { data, error } = await iam.rpc("has_access", { p_type: token, p_id: id, p_required: level });
  if (error) {
    console.error(`[access] could not ask whether this ${token} allows ${level}`, error);
    return false;
  }
  return data === true;
}
