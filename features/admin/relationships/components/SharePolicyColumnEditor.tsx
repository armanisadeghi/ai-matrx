"use client";

// features/admin/relationships/components/SharePolicyColumnEditor.tsx
//
// The public-columns allowlist editor for one shareable resource type —
// the best part of the retired /administration/sharing page, now living on
// the Relationships hub Sharing tab. Checked columns are visible to ANYONE
// with a share link, so the picker never pre-checks and loudly flags
// secret-looking columns; default is deny.

import { useMemo } from "react";
import { AlertTriangle, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

// Substrings that make a column dangerous to expose to anonymous viewers.
// Used ONLY to flag columns visually — never to pre-select anything.
const SECRET_HINTS = [
  "secret",
  "token",
  "password",
  "passwd",
  "api_key",
  "apikey",
  "private",
  "salt",
  "hash",
  // "storage" also catches the eradicated server-only S3 location column.
  "storage",
  "s3",
  "signed",
  "credential",
  "auth",
  "email",
  "phone",
  "ssn",
  "address",
  "ip_address",
  "user_id",
  "owner_id",
  "created_by",
];

// Exact column names that are sensitive but don't match a substring hint —
// the "secret sauce" columns the seeded allowlists deliberately exclude
// (agent prompt/config, app source, chat instructions, quiz answer key, …).
const SECRET_EXACT = new Set([
  "messages",
  "system_instruction",
  "config",
  "variables",
  "overrides",
  "settings",
  "tools",
  "custom_tools",
  "tool_config",
  "mcp_servers",
  "skill_config",
  "component_code",
  "slot_code",
  "state",
  "ciphertext",
  "nonce",
  "webhook_secret",
  "input",
  "output",
]);

export function isSecretLookingColumn(name: string): boolean {
  const n = name.toLowerCase();
  if (SECRET_EXACT.has(n)) return true;
  return SECRET_HINTS.some((hint) => n.includes(hint));
}

interface Props {
  /** Every physical column on the resource's table. */
  allColumns: string[];
  /** The saved allowlist (for dirty detection). */
  savedColumns: string[];
  /** The in-progress selection. */
  draft: Set<string>;
  busy: boolean;
  onToggleColumn: (column: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function SharePolicyColumnEditor({
  allColumns,
  savedColumns,
  draft,
  busy,
  onToggleColumn,
  onSave,
  onCancel,
}: Props) {
  const previous = useMemo(() => new Set(savedColumns), [savedColumns]);
  const selectedCount = allColumns.filter((c) => draft.has(c)).length;
  const dirty = useMemo(() => {
    if (draft.size !== previous.size) return true;
    for (const c of draft) if (!previous.has(c)) return true;
    return false;
  }, [draft, previous]);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Checked columns are visible to <strong>anyone with the link</strong> —
          never expose secrets, PII, or storage locations. Columns that look
          sensitive are flagged with a lock. Default is deny: only what you check
          is exposed.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
        {allColumns.map((column) => {
          const checked = draft.has(column);
          const secretLooking = isSecretLookingColumn(column);
          return (
            <label
              key={column}
              className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/40 cursor-pointer"
            >
              <Checkbox
                checked={checked}
                disabled={busy}
                onCheckedChange={() => onToggleColumn(column)}
              />
              <span
                className={`flex items-center gap-1 font-mono text-xs ${
                  checked && secretLooking
                    ? "font-semibold text-red-600 dark:text-red-400"
                    : secretLooking
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-foreground"
                }`}
                title={
                  secretLooking
                    ? "Looks sensitive — avoid exposing to anonymous viewers"
                    : undefined
                }
              >
                {secretLooking && <Lock className="h-3 w-3 shrink-0" />}
                {column}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">
          {selectedCount} of {allColumns.length} columns selected
          {dirty && (
            <span className="ml-2 text-amber-600 dark:text-amber-400">
              (unsaved)
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={busy || !dirty}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save exposed columns
          </Button>
        </div>
      </div>
    </div>
  );
}
