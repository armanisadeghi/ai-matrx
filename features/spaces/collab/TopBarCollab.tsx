"use client";

// features/spaces/collab/TopBarCollab.tsx — the top bar's collaboration controls (A6):
//   PresenceAvatars — who has this page open now (H3): up to 3 avatars, then "+N"; hover names them.
//   ShareMenu       — Notion's Share (H4): Invite opens the platform's ONE share dialog (ShareModal:
//                     people, levels, public link, who can see this) on this page's `document`; Copy link.
//                     No permission logic here — the sharing system and row security decide.
//                     The Publish tab (J1) is Notion's "Share to web": PublishPanel.

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, Tabs } from "@ai-matrx/design-system/controls";
import { Link2, UserPlus } from "lucide-react";
import { useState } from "react";

import { ShareModal } from "@/features/sharing/components/ShareModal";

import { pageOrganizationId } from "../data/agency-install";
import { PersonAvatar } from "./CommentsPanel";
import { PublishPanel } from "./PublishPanel";
import { personColor } from "./space-collab";
import type { SpaceViewer } from "./useSpaceRoom";

const SHOWN = 3;

export function PresenceAvatars({ viewers, me }: { viewers: SpaceViewer[]; me: string | null }) {
  // Notion shows the row only when someone else is here too.
  if (viewers.length < 2) return null;
  const shown = viewers.slice(0, SHOWN);
  const rest = viewers.slice(SHOWN);
  return (
    <div className="spaces-presence" aria-label="People viewing this page">
      {shown.map((v) => (
        // The ring is the person's colour — the same colour as their cursor in the page (personColor).
        <span
          key={v.userId}
          className="spaces-presence-avatar"
          style={{ boxShadow: `0 0 0 2px var(--spaces-page-bg), 0 0 0 3.5px ${personColor(v.userId)}` }}
          title={v.userId === me ? `${v.name} (you)` : v.name}
          data-viewer={v.userId}
        >
          <PersonAvatar name={v.name} url={v.avatarUrl} size={24} />
        </span>
      ))}
      {rest.length ? (
        <span className="spaces-presence-more" title={rest.map((v) => v.name).join(", ")}>
          +{rest.length}
        </span>
      ) : null}
    </div>
  );
}

export function ShareMenu({ spaceId, title, onCopyLink }: { spaceId: string; title: string; onCopyLink: () => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"share" | "publish">("share");
  const [dialog, setDialog] = useState(false);
  const [orgId, setOrgId] = useState<string | undefined>(undefined);
  const invite = () => {
    setOpen(false);
    // The page's own organization scopes the people picker and files the share's notice there.
    void pageOrganizationId(spaceId)
      .then((org) => setOrgId(org ?? undefined))
      .catch(() => setOrgId(undefined))
      .finally(() => setDialog(true));
  };
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="spaces-topbar-text-button">
            Share
          </button>
        </PopoverTrigger>
        <PopoverContent surface="solid" align="end" className="w-[360px] p-2">
          <Tabs
            value={tab}
            onValueChange={setTab}
            aria-label="Share or publish"
            className="mb-2"
            data={[
              { value: "share", label: "Share" },
              { value: "publish", label: "Publish" },
            ]}
          />
          {tab === "publish" ? (
            <PublishPanel spaceId={spaceId} />
          ) : (
          <div className="grid gap-1.5">
            <Button variant="primary" className="w-full" onClick={invite}>
              <UserPlus size={15} />
              Invite
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setOpen(false);
                onCopyLink();
              }}
            >
              <Link2 size={15} />
              Copy link
            </Button>
          </div>
          )}
        </PopoverContent>
      </Popover>
      {dialog ? (
        <ShareModal
          isOpen
          onClose={() => setDialog(false)}
          resourceType="document"
          resourceId={spaceId}
          resourceName={title || "Untitled"}
          resourceNoun="Page"
          organizationId={orgId}
          levelWording="notion"
        />
      ) : null}
    </>
  );
}
