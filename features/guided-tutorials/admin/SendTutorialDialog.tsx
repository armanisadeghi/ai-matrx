"use client";

/**
 * "Send a tutorial" — pick a person, pick a guided tutorial, add an optional
 * note; it goes as an in-app DM carrying the "Show me how" card and/or an
 * email with the same link. Opened from the Users & Access Accounts row menu
 * (features/admin/users/components/AccountsTableClient.tsx).
 */

import { useState } from "react";
import { GraduationCap, Mail, MessageSquare } from "lucide-react";
import { Button, Select, Switch, Textarea } from "@ai-matrx/design-system/controls";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { UserSearchField } from "@/features/user-search/UserSearchField";
import { GUIDED_TUTORIALS, findTutorial } from "../registry";
import { sendTutorial } from "./sendTutorial";

export interface TutorialRecipient {
  id: string;
  label: string;
  email?: string | null;
}

export function SendTutorialDialog({
  person,
  onClose,
}: {
  /** null = closed. An empty `id` opens it with no person picked. */
  person: TutorialRecipient | null;
  onClose: () => void;
}) {
  const organizationId = useAppSelector(selectOrganizationId);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [tutorialId, setTutorialId] = useState(GUIDED_TUTORIALS[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [viaDm, setViaDm] = useState(true);
  const [viaEmail, setViaEmail] = useState(true);
  const [sending, setSending] = useState(false);

  const seedKey = person ? person.id || "__none__" : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setUserId(person?.id || null);
    setUserLabel(person?.label ?? "");
    setEmail(person?.email ?? null);
    setNote("");
  }

  const tutorial = findTutorial(tutorialId);
  const ready = Boolean(tutorial && userId && (viaDm || viaEmail));

  const send = async () => {
    if (!tutorial || !userId) return;
    setSending(true);
    try {
      const result = await sendTutorial({
        tutorial,
        userId,
        email,
        note,
        organizationId,
        channels: { dm: viaDm, email: viaEmail },
        origin: window.location.origin,
      });
      const sent = [result.dm?.ok && "message", result.email?.ok && "email"].filter(Boolean);
      const failed = [
        result.dm && !result.dm.ok && `Message: ${result.dm.error}`,
        result.email && !result.email.ok && `Email: ${result.email.error}`,
      ].filter((line): line is string => typeof line === "string");
      if (sent.length) toast.success(`Tutorial sent by ${sent.join(" and ")}`);
      for (const line of failed) toast.error(line);
      if (!failed.length) onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={person !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" aria-hidden />
            Send a tutorial
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-xs text-muted-foreground">
            <span>Person</span>
            <UserSearchField
              value={userLabel}
              onValueChange={(v) => {
                setUserLabel(v);
                setUserId(null);
                setEmail(null);
              }}
              directory="admin"
              title="Send to"
              placeholder="Find a person…"
              onUserSelect={(user) => {
                setUserId(user.id);
                setUserLabel(user.displayName || user.email || user.id);
                setEmail(user.email ?? null);
              }}
            />
          </label>
          <div className="space-y-1 text-xs text-muted-foreground">
            <span>Tutorial</span>
            <Select
              aria-label="Tutorial"
              className="w-full"
              value={tutorialId}
              onValueChange={setTutorialId}
              options={GUIDED_TUTORIALS.map((t) => ({ value: t.id, label: t.title }))}
            />
          </div>
          <label className="block space-y-1 text-xs text-muted-foreground">
            <span>Note</span>
            <Textarea
              rows={3}
              value={note}
              placeholder={tutorial ? `Here's a quick walkthrough: ${tutorial.title}.` : ""}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-2">
              <Switch checked={viaDm} onCheckedChange={setViaDm} aria-label="Send as a message" />
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              Message
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={viaEmail} onCheckedChange={setViaEmail} aria-label="Send as an email" />
              <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              Email
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={sending || !ready} onClick={() => void send()}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
