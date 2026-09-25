"use client";

/**
 * UserPeek — a quick read-only profile of a PLATFORM USER (a member), for any
 * surface that names a person by account id: @-mention chips, comment authors,
 * "shared by", activity rows.
 *
 * Visibility is the platform's, never broadened: the person is read from the
 * members of the viewer's ACTIVE organization through
 * `get_organization_members_with_users`, which refuses anyone without access
 * to that organization. Someone outside it reads as "not someone you can see
 * here" — the peek never reveals an account the viewer could not list.
 *
 * There is no profile route a member may open for another member, so the
 * footer carries no Open door; emailing the person is a secondary action in
 * the body.
 */

import React from "react";
import { Mail, UserRound } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface MemberRow {
  user_id: string;
  user_email: string | null;
  user_display_name: string | null;
  user_avatar_url: string | null;
  role: string | null;
  joined_at: string | null;
}

type State =
  | { status: "loading" }
  | { status: "found"; row: MemberRow }
  | { status: "unavailable"; why: string };

export default function UserPeek({ id, open, onClose }: PeekProps) {
  const orgId = useAppSelector(selectOrganizationId);
  const [state, setState] = React.useState<State>({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ status: "loading" });
      if (!orgId) {
        if (!cancelled) setState({ status: "unavailable", why: "Choose an organization to see its members." });
        return;
      }
      const { data, error } = await supabase.rpc("get_organization_members_with_users", { p_org_id: orgId });
      if (cancelled) return;
      if (error) {
        setState({ status: "unavailable", why: "You can't see this organization's members." });
        return;
      }
      const row = (data as MemberRow[] | null)?.find((m) => m.user_id === id);
      setState(
        row
          ? { status: "found", row }
          : { status: "unavailable", why: "This person isn't someone you can see in your current organization." },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [id, orgId]);

  const row = state.status === "found" ? state.row : null;
  const name = row?.user_display_name || row?.user_email || "Person";

  return (
    <PeekDialog
      open={open}
      onClose={onClose}
      title={name}
      icon={<UserRound className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
      href={null}
      loading={state.status === "loading"}
    >
      {row ? (
        <div className="space-y-3" data-user-peek="">
          <div className="flex items-center gap-3">
            {row.user_avatar_url ? (
              <img src={row.user_avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                {name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{name}</p>
              {row.role ? <p className="text-xs capitalize text-muted-foreground">{row.role}</p> : null}
            </div>
          </div>
          {row.user_email ? (
            <PeekField label="Email">
              <a
                href={`mailto:${row.user_email}`}
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {row.user_email}
              </a>
            </PeekField>
          ) : null}
          {row.joined_at ? (
            <PeekField label="Member since">
              <span className="text-sm text-muted-foreground">{new Date(row.joined_at).toLocaleDateString()}</span>
            </PeekField>
          ) : null}
        </div>
      ) : state.status === "unavailable" ? (
        <p className="text-sm text-muted-foreground" data-user-peek-unavailable="">
          {state.why}
        </p>
      ) : null}
    </PeekDialog>
  );
}
