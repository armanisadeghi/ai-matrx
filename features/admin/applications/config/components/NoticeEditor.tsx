"use client";

// features/admin/applications/config/components/NoticeEditor.tsx
//
// Operator-broadcast editor for AppConfigV1.notice — a one-shot message every
// installed client shows once ({level, title, body, url?} | null). The
// enabled switch maps to notice: null when off.

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  NOTICE_LEVELS,
  type NoticeDraft,
} from "@/features/admin/applications/config/schema";

interface NoticeEditorProps {
  notice: NoticeDraft;
  onChange: (notice: NoticeDraft) => void;
  errors: Record<string, string>;
}

const LEVEL_LABELS: Record<(typeof NOTICE_LEVELS)[number], string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

export function NoticeEditor({ notice, onChange, errors }: NoticeEditorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Notice active</p>
          <p className="text-xs text-muted-foreground">
            When off, clients receive <code>notice: null</code> and show
            nothing.
          </p>
        </div>
        <Switch
          checked={notice.enabled}
          onCheckedChange={(enabled) => onChange({ ...notice, enabled })}
        />
      </div>

      {notice.enabled ? (
        <div className="space-y-3 rounded-md border border-border bg-card p-3">
          <div className="space-y-1.5">
            <Label htmlFor="app-config-notice-level">Level</Label>
            <Select
              value={notice.level}
              onValueChange={(value) => {
                const level = NOTICE_LEVELS.find((l) => l === value);
                if (level) onChange({ ...notice, level });
              }}
            >
              <SelectTrigger id="app-config-notice-level" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTICE_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {LEVEL_LABELS[level]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="app-config-notice-title">Title</Label>
            <Input
              id="app-config-notice-title"
              value={notice.title}
              onChange={(e) => onChange({ ...notice, title: e.target.value })}
              placeholder="Update required"
              className={cn(errors["notice.title"] && "border-destructive")}
            />
            {errors["notice.title"] ? (
              <p className="text-xs text-destructive">
                {errors["notice.title"]}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="app-config-notice-body">Body</Label>
            <Textarea
              id="app-config-notice-body"
              value={notice.body}
              onChange={(e) => onChange({ ...notice, body: e.target.value })}
              placeholder="Message shown once in every installed client."
              rows={3}
              className={cn(errors["notice.body"] && "border-destructive")}
            />
            {errors["notice.body"] ? (
              <p className="text-xs text-destructive">
                {errors["notice.body"]}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="app-config-notice-url">URL (optional)</Label>
            <Input
              id="app-config-notice-url"
              value={notice.url}
              onChange={(e) => onChange({ ...notice, url: e.target.value })}
              placeholder="https://…"
              className={cn(
                "font-mono text-sm",
                errors["notice.url"] && "border-destructive",
              )}
              spellCheck={false}
              autoComplete="off"
            />
            {errors["notice.url"] ? (
              <p className="text-xs text-destructive">{errors["notice.url"]}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
