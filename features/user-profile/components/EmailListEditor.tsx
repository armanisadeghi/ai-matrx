// File: features/user-profile/components/EmailListEditor.tsx
//
// Editor for the `emails` JSONB column on `user_form_profile`. The user's
// auth email is NOT shown here — this list is for additional contact
// addresses the agent can use (work, school, secondary personal, etc).

"use client";

import { useCallback } from "react";
import { Mail } from "lucide-react";
import type { EmailEntry, EmailKind } from "@/features/user-profile/types";
import {
  ListAddButton,
  ListEditorEmptyState,
  ListEditorRow,
  SelectField,
  TextField,
} from "./ListEditorRow";

const EMAIL_KIND_OPTIONS: ReadonlyArray<{ value: EmailKind; label: string }> = [
  { value: "personal", label: "Personal" },
  { value: "work", label: "Work" },
  { value: "school", label: "School" },
  { value: "other", label: "Other" },
];

export interface EmailListEditorProps {
  value: EmailEntry[];
  onChange: (next: EmailEntry[]) => void;
}

export function EmailListEditor({ value, onChange }: EmailListEditorProps) {
  const update = useCallback(
    (id: string, patch: Partial<EmailEntry>) =>
      onChange(value.map((e) => (e.id === id ? { ...e, ...patch } : e))),
    [onChange, value],
  );

  const remove = useCallback(
    (id: string) => onChange(value.filter((e) => e.id !== id)),
    [onChange, value],
  );

  const add = useCallback(() => {
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        label: "personal",
        email: "",
        is_primary: value.length === 0,
        is_verified: false,
      },
    ]);
  }, [onChange, value]);

  const setPrimary = useCallback(
    (id: string, next: boolean) => {
      onChange(
        value.map((e) => ({
          ...e,
          is_primary: next ? e.id === id : e.is_primary && e.id !== id,
        })),
      );
    },
    [onChange, value],
  );

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <ListEditorEmptyState
          icon={Mail}
          label="No additional email addresses yet."
        />
      ) : (
        <div className="space-y-2">
          {value.map((entry, index) => (
            <ListEditorRow
              key={entry.id}
              index={index}
              onRemove={() => remove(entry.id)}
              primary={{
                value: entry.is_primary === true,
                onChange: (next) => setPrimary(entry.id, next),
                title: "Primary email",
              }}
            >
              <SelectField
                label="Type"
                value={entry.label}
                onChange={(label) => update(entry.id, { label })}
                options={EMAIL_KIND_OPTIONS}
              />
              <TextField
                label="Address"
                placeholder="you@example.com"
                type="email"
                value={entry.email}
                onChange={(email) => update(entry.id, { email })}
                autoComplete="email"
              />
            </ListEditorRow>
          ))}
        </div>
      )}
      <ListAddButton label="Add email" onClick={add} />
    </div>
  );
}
