// File: features/user-profile/components/PhoneListEditor.tsx
//
// Editor for the `phones` JSONB column on `user_form_profile`. Each row is a
// PhoneEntry { id, label, number, ext?, is_primary? }. Setting one row
// primary clears the flag on every other row — a UI invariant the API
// doesn't enforce by itself.

"use client";

import { useCallback } from "react";
import { Phone } from "lucide-react";
import type { PhoneEntry, PhoneKind } from "@/features/user-profile/types";
import {
  ListAddButton,
  ListEditorEmptyState,
  ListEditorRow,
  SelectField,
  TextField,
} from "./ListEditorRow";

const PHONE_KIND_OPTIONS: ReadonlyArray<{ value: PhoneKind; label: string }> = [
  { value: "mobile", label: "Mobile" },
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "other", label: "Other" },
];

export interface PhoneListEditorProps {
  value: PhoneEntry[];
  onChange: (next: PhoneEntry[]) => void;
}

export function PhoneListEditor({ value, onChange }: PhoneListEditorProps) {
  const update = useCallback(
    (id: string, patch: Partial<PhoneEntry>) =>
      onChange(value.map((p) => (p.id === id ? { ...p, ...patch } : p))),
    [onChange, value],
  );

  const remove = useCallback(
    (id: string) => onChange(value.filter((p) => p.id !== id)),
    [onChange, value],
  );

  const add = useCallback(() => {
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        label: "mobile",
        number: "",
        ext: null,
        is_primary: value.length === 0,
      },
    ]);
  }, [onChange, value]);

  const setPrimary = useCallback(
    (id: string, next: boolean) => {
      onChange(
        value.map((p) => ({
          ...p,
          is_primary: next ? p.id === id : p.is_primary && p.id !== id,
        })),
      );
    },
    [onChange, value],
  );

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <ListEditorEmptyState icon={Phone} label="No phone numbers yet." />
      ) : (
        <div className="space-y-2">
          {value.map((phone, index) => (
            <ListEditorRow
              key={phone.id}
              index={index}
              onRemove={() => remove(phone.id)}
              primary={{
                value: phone.is_primary === true,
                onChange: (next) => setPrimary(phone.id, next),
                title: "Primary phone",
              }}
            >
              <SelectField
                label="Type"
                value={phone.label}
                onChange={(label) => update(phone.id, { label })}
                options={PHONE_KIND_OPTIONS}
              />
              <TextField
                label="Number"
                placeholder="+1 (555) 123-4567"
                type="tel"
                value={phone.number}
                onChange={(number) => update(phone.id, { number })}
                autoComplete="tel"
              />
              <TextField
                label="Extension"
                placeholder="optional"
                value={phone.ext ?? ""}
                onChange={(ext) =>
                  update(phone.id, { ext: ext.length > 0 ? ext : null })
                }
              />
            </ListEditorRow>
          ))}
        </div>
      )}
      <ListAddButton label="Add phone" onClick={add} />
    </div>
  );
}
