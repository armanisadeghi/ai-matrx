"use client";

// features/meet/components/manage/GuestPicker.tsx
//
// "ADD GUESTS" — Google Calendar's one field: type a name or an address, pick a
// person you work with, or press Enter on any email. Guests are INVITEES, not
// share grants with a permission picker: the database door
// (`meet_add_invitees`) turns an address that belongs to an account into that
// account and gives it the meeting's viewer grant (a co-host gets admin). A
// guest can be made a co-host right here, which is the only role a meeting has.

import { useState } from "react";
import { Crown, Mail, UserPlus, X } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useUserConnections } from "@/features/messaging/hooks/useUserConnections";
import { isEmail, type DraftInvitee } from "@/features/meet/lib/meeting-draft";

function initials(value: string): string {
  const words = value
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  ).slice(0, 2);
}

export function guestName(
  guest: Pick<DraftInvitee, "displayName" | "email">,
): string {
  return guest.displayName?.trim() || guest.email || "Guest";
}

export interface GuestPickerProps {
  guests: readonly DraftInvitee[];
  onChange: (guests: DraftInvitee[]) => void;
  organizationId: string | null;
  /** The host is never a guest of their own meeting. */
  hostUserId: string | null;
  /** Extra per-guest content (an RSVP state) keyed by `DraftInvitee.key`. */
  renderStatus?: (guest: DraftInvitee) => React.ReactNode;
  /** Hide the co-host toggle (a viewer who may not name co-hosts). */
  canNameCohosts?: boolean;
  autoFocus?: boolean;
}

export function GuestPicker({
  guests,
  onChange,
  organizationId,
  hostUserId,
  renderStatus,
  canNameCohosts = true,
  autoFocus,
}: GuestPickerProps) {
  const [query, setQuery] = useState("");
  const { connections } = useUserConnections(
    organizationId ? { organizationId } : {},
  );

  const taken = new Set(
    guests.flatMap((g) =>
      [g.userId, g.email?.toLowerCase()].filter((v): v is string => !!v),
    ),
  );
  const q = query.trim().toLowerCase();
  const suggestions =
    q === ""
      ? []
      : connections
          .filter(
            (c) =>
              c.user_id !== hostUserId &&
              !taken.has(c.user_id) &&
              ((c.display_name ?? "").toLowerCase().includes(q) ||
                (c.email ?? "").toLowerCase().includes(q)),
          )
          .slice(0, 6);

  const add = (guest: Omit<DraftInvitee, "key" | "inviteeId" | "cohost">) => {
    const key = guest.userId ?? guest.email ?? String(Date.now());
    onChange([...guests, { ...guest, key, inviteeId: null, cohost: false }]);
    setQuery("");
  };

  const addTyped = () => {
    const email = query.trim();
    if (suggestions.length > 0 && !isEmail(email)) {
      const first = suggestions[0]!;
      add({
        userId: first.user_id,
        email: first.email ?? null,
        displayName: first.display_name ?? null,
      });
      return;
    }
    if (!isEmail(email) || taken.has(email.toLowerCase())) return;
    const known = connections.find(
      (c) => (c.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    add({
      userId: known?.user_id ?? null,
      email,
      displayName: known?.display_name ?? null,
    });
  };

  const typedIsNewEmail =
    isEmail(query) && !taken.has(query.trim().toLowerCase());

  return (
    <div className="space-y-2">
      <div className="relative">
        <UserPlus
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTyped();
            }
          }}
          placeholder="Add guests by name or email"
          aria-label="Add guests"
          className="pl-8"
          autoComplete="off"
        />
        {q !== "" && (suggestions.length > 0 || typedIsNewEmail) ? (
          <ul
            role="listbox"
            aria-label="Suggested guests"
            className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md"
          >
            {suggestions.map((c) => (
              <li key={c.user_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() =>
                    add({
                      userId: c.user_id,
                      email: c.email ?? null,
                      displayName: c.display_name ?? null,
                    })
                  }
                >
                  <Avatar className="h-6 w-6">
                    {c.avatar_url ? (
                      <AvatarImage src={c.avatar_url} alt="" />
                    ) : null}
                    <AvatarFallback className="text-[10px]">
                      {initials(c.display_name ?? c.email ?? "?")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">
                    {c.display_name ?? c.email}
                  </span>
                  {c.display_name && c.email ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {c.email}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
            {typedIsNewEmail &&
            suggestions.every((c) => (c.email ?? "").toLowerCase() !== q) ? (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={addTyped}
                >
                  <Mail
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="truncate">Invite {query.trim()}</span>
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {guests.length > 0 ? (
        <ul
          className="divide-y divide-border rounded-md border border-border"
          aria-label="Guests"
        >
          {guests.map((guest) => (
            <li
              key={guest.key}
              className="flex items-center gap-2 px-2.5 py-1.5"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px]">
                  {initials(guestName(guest))}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm">{guestName(guest)}</span>
                  {guest.cohost ? (
                    <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
                      <Crown className="h-3 w-3" aria-hidden="true" />
                      Co-host
                    </span>
                  ) : null}
                </div>
                {guest.displayName && guest.email ? (
                  <div className="truncate text-xs text-muted-foreground">
                    {guest.email}
                  </div>
                ) : !guest.userId ? (
                  <div className="text-xs text-muted-foreground">
                    Joins by link as a guest
                  </div>
                ) : null}
              </div>
              {renderStatus ? renderStatus(guest) : null}
              {canNameCohosts && guest.userId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 px-2 text-xs",
                    guest.cohost && "text-primary",
                  )}
                  aria-pressed={guest.cohost}
                  title={
                    guest.cohost
                      ? "Remove co-host: they stay invited"
                      : "Make co-host: they can admit people, record and end the meeting"
                  }
                  onClick={() =>
                    onChange(
                      guests.map((g) =>
                        g.key === guest.key ? { ...g, cohost: !g.cohost } : g,
                      ),
                    )
                  }
                >
                  {guest.cohost ? "Co-host" : "Make co-host"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`Remove ${guestName(guest)}`}
                onClick={() =>
                  onChange(guests.filter((g) => g.key !== guest.key))
                }
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
