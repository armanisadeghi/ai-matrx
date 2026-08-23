"use client";

/**
 * ProfileSelector — pick the Cloud Browser to work with, or start another one.
 *
 * Personal browsers + org-owned sessions (D-18) + sessions shared with me, each
 * showing its access level. Access is user-keyed, never active-org keyed — an
 * org session appears because the user has a real grant on it.
 *
 * 🚨 D-28 (Arman 2026-08-23): *"if the user wants multiple, we give them
 * multiple… they can have as many as they want… the best thing to do is to make
 * sure that we make it easy to start."* This component used to ONLY select, and
 * there was no create path anywhere in the platform, so a person had exactly one
 * browser forever. "New browser" is that door. It is also why there is no
 * `n/max saved browsers` badge any more: the max was an invented literal that
 * nothing enforced.
 */

import React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { cn } from "@/utils/cn";
import { User, Building2, Users, Plus } from "lucide-react";
import type { CloudBrowserProfile, ProfileQuota, ShareLevel } from "../types";

function levelLabel(level: ShareLevel): string {
  // Say FULL for `admin` (S1 §2.17).
  return level === "admin" ? "Full" : level === "editor" ? "Edit" : "View";
}

export function ProfileSelector({
  profiles,
  activeProfileId,
  quota,
  onSelect,
  onCreate,
  className,
}: {
  profiles: CloudBrowserProfile[];
  activeProfileId: string | null;
  quota: ProfileQuota | null;
  onSelect: (id: string) => void;
  /** Create another browser under a name the person chooses (D-28). */
  onCreate?: (displayName: string) => Promise<void>;
  className?: string;
}) {
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const personal = profiles.filter(
    (p) => p.ownerType === "user" && (p.isPersonalDefault || p.isDefault),
  );
  const org = profiles.filter((p) => p.ownerType === "organization");
  const shared = profiles.filter(
    (p) => !p.isPersonalDefault && p.ownerType === "user" && !p.isDefault,
  );

  const taken = new Set(
    profiles.map((p) => p.displayName.trim().toLocaleLowerCase()),
  );

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <Select value={activeProfileId ?? ""} onValueChange={onSelect}>
          <SelectTrigger className="h-9 min-w-0 flex-1">
            <SelectValue placeholder="Choose a Cloud Browser" />
          </SelectTrigger>
          <SelectContent>
            {personal.length > 0 ? (
              <SelectGroup>
                <SelectLabel className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> My browsers
                </SelectLabel>
                {personal.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.displayName}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {org.length > 0 ? (
              <SelectGroup>
                <SelectLabel className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Organization
                </SelectLabel>
                {org.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.displayName}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {shared.length > 0 ? (
              <SelectGroup>
                <SelectLabel className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Shared with me
                </SelectLabel>
                {shared.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.displayName}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>
        {onCreate ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5"
            onClick={() => setCreating(true)}
            title="Start another cloud browser"
          >
            <Plus className="h-3.5 w-3.5" />
            New browser
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {(() => {
          const active = profiles.find((p) => p.id === activeProfileId);
          if (!active) return null;
          return (
            <Badge variant="outline" className="font-normal">
              {levelLabel(active.accessLevel)} access
            </Badge>
          );
        })()}
        {quota ? (
          <>
            <Badge variant="outline" className="font-normal">
              {quota.liveRuns}/{quota.maxLiveRuns} live
            </Badge>
            {/* A count, not a cap — there is no maximum (D-28). */}
            <Badge variant="outline" className="font-normal">
              {quota.storedProfiles === 1
                ? "1 saved browser"
                : `${quota.storedProfiles} saved browsers`}
            </Badge>
          </>
        ) : null}
      </div>

      {onCreate ? (
        <TextInputDialog
          open={creating}
          onOpenChange={(open) => {
            if (!busy) setCreating(open);
          }}
          title="New cloud browser"
          description="A separate browser with its own logins and cookies — keep work, personal, and each client apart."
          placeholder="Work Google, Client — Acme, Personal…"
          confirmLabel="Create browser"
          busy={busy}
          validate={(value) =>
            taken.has(value.trim().toLocaleLowerCase())
              ? "You already have a browser with that name."
              : null
          }
          onConfirm={async (displayName) => {
            setBusy(true);
            try {
              await onCreate(displayName);
              setCreating(false);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
