"use client";

/**
 * ProfileSelector — pick the Cloud Browser to work with.
 *
 * Personal default + org-owned sessions (D-18) + sessions shared with me, each
 * showing its access level and quota. Access is user-keyed, never active-org
 * keyed — an org session appears because the user has a real grant on it.
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
import { cn } from "@/utils/cn";
import { User, Building2, Users } from "lucide-react";
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
  className,
}: {
  profiles: CloudBrowserProfile[];
  activeProfileId: string | null;
  quota: ProfileQuota | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const personal = profiles.filter((p) => p.isPersonalDefault || (p.ownerType === "user" && p.isDefault));
  const org = profiles.filter((p) => p.ownerType === "organization");
  const shared = profiles.filter(
    (p) => !p.isPersonalDefault && p.ownerType === "user" && !p.isDefault,
  );

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Select value={activeProfileId ?? undefined} onValueChange={onSelect}>
        <SelectTrigger className="h-9 w-full">
          <SelectValue placeholder="Choose a Cloud Browser" />
        </SelectTrigger>
        <SelectContent>
          {personal.length > 0 ? (
            <SelectGroup>
              <SelectLabel className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> My browser
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
            <Badge variant="outline" className="font-normal">
              {quota.storedProfiles}/{quota.maxStoredProfiles} saved browsers
            </Badge>
          </>
        ) : null}
      </div>
    </div>
  );
}
