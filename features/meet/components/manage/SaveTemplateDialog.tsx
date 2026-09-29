"use client";

// features/meet/components/manage/SaveTemplateDialog.tsx
//
// "Save as template" (Meet wave 4): this meeting's length, agenda, repeat rule,
// settings, guests and after-meeting workflows become a preset for the next one
// — for the person, or (for those the organization knob's own door allows:
// owners and admins) for everyone in the organization. Starting from one is
// the "From a template" menu in the New meeting form.

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { MeetingInvitee, MeetingRecord } from "@ai-matrx/meet/react";
import { Input } from "@ai-matrx/design-system";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/lib/toast";
import { errorSentence } from "@/features/meet/hooks/useMeetingActions";
import type { MeetTemplates } from "@/features/meet/hooks/useMeetTemplates";
import {
  templateFromMeeting,
  type TemplateScope,
} from "@/features/meet/lib/meeting-template";
import { afterWorkflowIds } from "@/features/meet/components/manage/AfterMeetingWorkflows";

export function SaveTemplateDialog({
  open,
  onOpenChange,
  meeting,
  invitees,
  templates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: MeetingRecord;
  invitees: readonly MeetingInvitee[];
  templates: MeetTemplates;
}) {
  const [name, setName] = useState(meeting.title);
  const [scope, setScope] = useState<TemplateScope>("personal");
  const [saving, setSaving] = useState(false);
  const replaces = templates.templates.some(
    (t) =>
      t.scope === scope && t.name.toLowerCase() === name.trim().toLowerCase(),
  );

  const save = async () => {
    if (name.trim() === "" || saving) return;
    setSaving(true);
    try {
      await templates.save(
        templateFromMeeting(
          meeting,
          invitees,
          name,
          afterWorkflowIds(meeting.metadata),
        ),
        scope,
      );
      toast.success(
        scope === "organization"
          ? "Saved. Everyone in the organization can start from it."
          : "Saved. Start from it in New meeting.",
      );
      onOpenChange(false);
    } catch (thrown) {
      toast.error(errorSentence(thrown));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (!saving ? onOpenChange(v) : undefined)}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Save as template</DialogTitle>
          <DialogDescription>
            Length, agenda, repeat, settings, guests and after-meeting workflows
            — not the date.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {replaces ? (
              <p className="text-xs text-muted-foreground">
                Replaces the template with this name.
              </p>
            ) : null}
          </div>
          {templates.mayWriteOrganization ? (
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as TemplateScope)}
              className="space-y-1.5"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="personal" /> Just for me
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="organization" /> Everyone in the
                organization
              </label>
            </RadioGroup>
          ) : null}
          {templates.templates.length > 0 ? (
            <div className="space-y-1 border-t border-border pt-3">
              <div className="text-xs font-medium text-muted-foreground">
                Saved templates
              </div>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                {templates.templates.map((t) => {
                  const removable =
                    t.scope === "personal" || templates.mayWriteOrganization;
                  return (
                    <li
                      key={`${t.scope}:${t.id}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="min-w-0 truncate">{t.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t.scope === "organization" ? "Organization" : "Personal"}
                      </span>
                      {removable ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="ml-auto h-7 w-7 shrink-0"
                          aria-label={`Delete template ${t.name}`}
                          onClick={() =>
                            void templates
                              .remove(t)
                              .then(() => toast.success(`Deleted “${t.name}”.`))
                              .catch((thrown: unknown) =>
                                toast.error(errorSentence(thrown)),
                              )
                          }
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={name.trim() === "" || saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
