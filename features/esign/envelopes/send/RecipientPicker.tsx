"use client";

// features/esign/envelopes/send/RecipientPicker.tsx — who signs.
//
// DocuSign's recipient list, made for an organization: a colleague is PICKED from the sending
// organization's members (they sign with their account, and the request carries their user id);
// anyone else is added by name and email (they get a link and a one-time code). Each recipient
// keeps one colour — the same colour as their boxes on the document.
//
// Reuse: the member list is `useUserConnections({ organizationId })` (the roster the task
// assignee picker reads) and the search input is `UserSearchField`, whose search button opens
// the shared sortable people window over the same candidates.

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, UserPlus } from "lucide-react";

import { Badge, Button, Field } from "@ai-matrx/design-system/controls";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@ai-matrx/kit/format";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserAvatarUrl, selectUserEmail, selectUserFullName, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useUserConnections, type ConnectionUser } from "@/features/messaging/hooks/useUserConnections";
import { UserSearchField } from "@/features/user-search/UserSearchField";
import { ReadFailure } from "@/components/read-state/ReadFailure";

import { recipientColor, type Recipient } from "../types";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_MATCHES = 6;

let nextKey = 1;
export function newRecipientKey(): string {
  return `r${nextKey++}`;
}

interface RecipientPickerProps {
  organizationId: string | null;
  recipients: Recipient[];
  onChange: (next: Recipient[]) => void;
  sequential: boolean;
  /** Recipients with no signature box yet (soft warning, never a block). */
  missingSignature: ReadonlySet<string>;
  activeKey: string | null;
  onActivate: (key: string) => void;
}

export function RecipientPicker({
  organizationId,
  recipients,
  onChange,
  sequential,
  missingSignature,
  activeKey,
  onActivate,
}: RecipientPickerProps) {
  const { connections, isLoading, error, refresh } = useUserConnections(
    organizationId ? { organizationId } : {},
  );
  const meId = useAppSelector(selectUserId);
  const meEmail = useAppSelector(selectUserEmail);
  const meName = useAppSelector(selectUserFullName);
  const meAvatar = useAppSelector(selectUserAvatarUrl);
  const [query, setQuery] = useState("");
  const [outsider, setOutsider] = useState<{ fullName: string; email: string } | null>(null);

  const takenUsers = new Set(recipients.map((r) => r.userId).filter((v): v is string => !!v));
  const takenEmails = new Set(recipients.map((r) => r.email.trim().toLowerCase()));
  const q = query.trim().toLowerCase();
  const matches = q
    ? connections
        .filter((c) => !takenUsers.has(c.user_id))
        .filter((c) => c.display_name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
        .slice(0, MAX_MATCHES)
    : [];
  const typedEmail = EMAIL.test(query.trim()) ? query.trim() : null;

  function add(r: Omit<Recipient, "key">) {
    const key = newRecipientKey();
    onChange([...recipients, { ...r, key }]);
    onActivate(key);
    setQuery("");
  }

  function addMember(c: Pick<ConnectionUser, "user_id" | "display_name" | "email" | "avatar_url">) {
    if (takenUsers.has(c.user_id)) return;
    add({
      fullName: c.display_name || c.email?.split("@")[0] || "Member",
      email: c.email ?? "",
      userId: c.user_id,
      avatarUrl: c.avatar_url,
    });
  }

  function addOutsider() {
    if (!outsider) return;
    const fullName = outsider.fullName.trim();
    const email = outsider.email.trim();
    if (!fullName || !EMAIL.test(email) || takenEmails.has(email.toLowerCase())) return;
    // An address that belongs to a member is that member — picked, so they sign as themself.
    const member = connections.find((c) => c.email?.toLowerCase() === email.toLowerCase());
    if (member) addMember(member);
    else add({ fullName, email, userId: null, avatarUrl: null });
    setOutsider(null);
  }

  function move(index: number, by: -1 | 1) {
    const next = [...recipients];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row);
    onChange(next);
  }

  const meAdded = !!meId && takenUsers.has(meId);

  return (
    <div className="flex flex-col gap-2">
      {recipients.map((r, i) => {
        const selected = r.key === activeKey;
        return (
          <div
            key={r.key}
            data-clickable
            onClick={() => onActivate(r.key)}
            className={
              "flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 " +
              (selected ? "border-foreground/40 ring-1 ring-foreground/20" : "border-border")
            }
            style={{ borderLeft: `4px solid ${recipientColor(i)}` }}
          >
            {sequential && <span className="w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>}
            <Avatar className="h-6 w-6 shrink-0">
              {r.avatarUrl && <AvatarImage src={r.avatarUrl} />}
              <AvatarFallback className="text-[10px]" style={{ background: recipientColor(i, 0.18) }}>
                {getInitials(r.fullName || r.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.fullName}</div>
              <div className="flex min-w-0 items-center gap-1.5">
                {r.userId ? <Badge tone="info">Member</Badge> : <Badge>Guest</Badge>}
                <span className="truncate text-xs text-muted-foreground">
                  {missingSignature.has(r.key) ? "No signature box yet" : r.email}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
              {sequential && recipients.length > 1 && (
                <>
                  <Button variant="quiet" aria-label="Move up" icon={<ArrowUp />} disabled={i === 0} onClick={() => move(i, -1)} />
                  <Button
                    variant="quiet"
                    aria-label="Move down"
                    icon={<ArrowDown />}
                    disabled={i === recipients.length - 1}
                    onClick={() => move(i, 1)}
                  />
                </>
              )}
              <Button
                variant="quiet"
                aria-label={`Remove ${r.fullName}`}
                icon={<Trash2 />}
                onClick={() => onChange(recipients.filter((x) => x.key !== r.key))}
              />
            </div>
          </div>
        );
      })}

      <div className="relative">
        <UserSearchField
          value={query}
          onValueChange={setQuery}
          onUserSelect={(u) =>
            addMember({ user_id: u.id, display_name: u.displayName, email: u.email, avatar_url: u.avatarUrl })
          }
          candidates={connections
            .filter((c) => !takenUsers.has(c.user_id))
            .map((c) => ({
              id: c.user_id,
              email: c.email,
              displayName: c.display_name,
              avatarUrl: c.avatar_url,
              phone: null,
              adminLevel: null,
              organizations: [],
              source: c.source,
              createdAt: null,
              lastSignInAt: null,
            }))}
          title="Choose a signer"
          placeholder="Add a member by name or email"
          ariaLabel="Browse members"
          onEnter={() => {
            if (matches[0]) addMember(matches[0]);
            else if (typedEmail) setOutsider({ fullName: "", email: typedEmail });
          }}
        />
        {q && (
          <div className="mt-1 flex flex-col overflow-hidden rounded-md border border-border bg-card">
            {isLoading ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Loading members…</p>
            ) : error && connections.length === 0 ? (
              <ReadFailure error={error} what="your organization's members" onRetry={() => void refresh()} className="m-2" />
            ) : (
              <>
                {matches.map((c) => (
                  <button
                    key={c.user_id}
                    type="button"
                    onClick={() => addMember(c)}
                    className="flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/40"
                  >
                    <Avatar className="h-6 w-6 shrink-0">
                      {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                      <AvatarFallback className="text-[10px]">{getInitials(c.display_name ?? c.email ?? "")}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{c.display_name || c.email}</span>
                      {c.display_name && c.email && <span className="block truncate text-xs text-muted-foreground">{c.email}</span>}
                    </span>
                  </button>
                ))}
                {matches.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No member matches</p>}
                <button
                  type="button"
                  onClick={() => setOutsider({ fullName: typedEmail ? "" : query.trim(), email: typedEmail ?? "" })}
                  className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-left text-sm hover:bg-accent/40"
                >
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                  Add someone outside
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {outsider ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2">
          <Field
            aria-label="Guest name"
            placeholder="Full name"
            value={outsider.fullName}
            autoFocus
            autoComplete="off"
            onChange={(e) => setOutsider({ ...outsider, fullName: e.target.value })}
          />
          <Field
            aria-label="Guest email"
            placeholder="name@company.com"
            type="email"
            value={outsider.email}
            autoComplete="off"
            onChange={(e) => setOutsider({ ...outsider, email: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addOutsider()}
          />
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onClick={() => setOutsider(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Plus />}
              disabled={
                !outsider.fullName.trim() ||
                !EMAIL.test(outsider.email.trim()) ||
                takenEmails.has(outsider.email.trim().toLowerCase())
              }
              onClick={addOutsider}
            >
              Add guest
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {!meAdded && meId && (
            <Button
              variant="quiet"
              icon={<Plus />}
              onClick={() =>
                addMember({ user_id: meId, display_name: meName || null, email: meEmail, avatar_url: meAvatar || null })
              }
            >
              Add me
            </Button>
          )}
          <Button variant="quiet" icon={<UserPlus />} onClick={() => setOutsider({ fullName: "", email: "" })}>
            Add someone outside
          </Button>
        </div>
      )}
    </div>
  );
}
