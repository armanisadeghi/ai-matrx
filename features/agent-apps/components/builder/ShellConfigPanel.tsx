"use client";

/**
 * ShellConfigPanel — common config controls that apply to most shells.
 * Per-shell-specific fields can extend this later by branching on
 * shell_kind; today the common fields cover what every shell honours.
 */

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AgentAppShellConfigCommon,
  AgentAppShellKind,
} from "@/features/agent-apps/types";

interface ShellConfigPanelProps {
  shellKind: AgentAppShellKind;
  value: AgentAppShellConfigCommon;
  onChange: (next: AgentAppShellConfigCommon) => void;
  disabled?: boolean;
}

const VARIABLE_INPUT_STYLES: NonNullable<
  AgentAppShellConfigCommon["variableInputStyle"]
>[] = ["form", "inline", "wizard", "compact", "guided", "cards"];

const HISTORY_VIEWS: NonNullable<AgentAppShellConfigCommon["historyView"]>[] = [
  "hidden",
  "app",
  "all",
];

export function ShellConfigPanel({
  shellKind,
  value,
  onChange,
  disabled,
}: ShellConfigPanelProps) {
  const set = <K extends keyof AgentAppShellConfigCommon>(
    key: K,
    next: AgentAppShellConfigCommon[K],
  ) => onChange({ ...value, [key]: next });

  // The custom path doesn't honour shell_config — there's no shell.
  if (shellKind === "fully_custom") {
    return (
      <div className="text-sm text-muted-foreground">
        Custom apps render their own UI; no shell config applies.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Row label="Title">
        <Input
          value={value.title ?? ""}
          onChange={(e) => set("title", e.target.value || undefined)}
          placeholder="App name (default)"
          disabled={disabled}
          className="text-[16px]"
        />
      </Row>

      <Row label="Hide title">
        <Switch
          checked={value.hideTitle ?? false}
          onCheckedChange={(v) => set("hideTitle", v)}
          disabled={disabled}
        />
      </Row>

      <Row label="Auto-run on open">
        <Switch
          checked={value.autoRun ?? false}
          onCheckedChange={(v) => set("autoRun", v)}
          disabled={disabled}
        />
      </Row>

      <Row label="Allow follow-up chat">
        <Switch
          checked={value.allowChat ?? shellKind === "chat"}
          onCheckedChange={(v) => set("allowChat", v)}
          disabled={disabled}
        />
      </Row>

      <Row label="Compact density">
        <Switch
          checked={value.compact ?? false}
          onCheckedChange={(v) => set("compact", v)}
          disabled={disabled}
        />
      </Row>

      {(shellKind === "form_to_result" || shellKind === "chat") && (
        <Row label="Variable input style">
          <Select
            value={value.variableInputStyle ?? "form"}
            onValueChange={(v) =>
              set(
                "variableInputStyle",
                v as AgentAppShellConfigCommon["variableInputStyle"],
              )
            }
            disabled={disabled}
          >
            <SelectTrigger className="h-9 w-[180px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VARIABLE_INPUT_STYLES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      )}

      {shellKind === "chat" && (
        <Row label="History view">
          <Select
            value={value.historyView ?? "sidebar"}
            onValueChange={(v) =>
              set("historyView", v as AgentAppShellConfigCommon["historyView"])
            }
            disabled={disabled}
          >
            <SelectTrigger className="h-9 w-[180px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HISTORY_VIEWS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-center gap-3">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div>{children}</div>
    </div>
  );
}
