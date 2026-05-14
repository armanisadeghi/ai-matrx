// File: features/user-profile/components/EmergencyContactListEditor.tsx
//
// Editor for the `emergency_contacts` JSONB column. Slightly richer than
// the other list editors because each entry has its own name, relationship,
// phone, email, and free-text notes.

"use client";

import { useCallback } from "react";
import { ShieldAlert } from "lucide-react";
import type { EmergencyContact } from "@/features/user-profile/types";
import {
  ListAddButton,
  ListEditorEmptyState,
  ListEditorRow,
  TextField,
} from "./ListEditorRow";

export interface EmergencyContactListEditorProps {
  value: EmergencyContact[];
  onChange: (next: EmergencyContact[]) => void;
}

export function EmergencyContactListEditor({
  value,
  onChange,
}: EmergencyContactListEditorProps) {
  const update = useCallback(
    (id: string, patch: Partial<EmergencyContact>) =>
      onChange(value.map((c) => (c.id === id ? { ...c, ...patch } : c))),
    [onChange, value],
  );

  const remove = useCallback(
    (id: string) => onChange(value.filter((c) => c.id !== id)),
    [onChange, value],
  );

  const add = useCallback(() => {
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        name: "",
        relationship: null,
        phone: null,
        email: null,
        notes: null,
      },
    ]);
  }, [onChange, value]);

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <ListEditorEmptyState
          icon={ShieldAlert}
          label="No emergency contacts yet."
        />
      ) : (
        <div className="space-y-2">
          {value.map((entry, index) => (
            <ListEditorRow
              key={entry.id}
              index={index}
              onRemove={() => remove(entry.id)}
            >
              <TextField
                label="Name"
                placeholder="Full name"
                value={entry.name}
                onChange={(name) => update(entry.id, { name })}
                autoComplete="name"
              />
              <TextField
                label="Relationship"
                placeholder="Spouse, parent, friend…"
                value={entry.relationship ?? ""}
                onChange={(relationship) =>
                  update(entry.id, {
                    relationship: relationship.length > 0 ? relationship : null,
                  })
                }
              />
              <TextField
                label="Phone"
                placeholder="+1 (555) 123-4567"
                type="tel"
                value={entry.phone ?? ""}
                onChange={(phone) =>
                  update(entry.id, { phone: phone.length > 0 ? phone : null })
                }
              />
              <TextField
                label="Email"
                placeholder="contact@example.com"
                type="email"
                value={entry.email ?? ""}
                onChange={(email) =>
                  update(entry.id, { email: email.length > 0 ? email : null })
                }
              />
              <div className="sm:col-span-2">
                <TextField
                  label="Notes"
                  placeholder="When to call, preferred language, etc."
                  value={entry.notes ?? ""}
                  onChange={(notes) =>
                    update(entry.id, {
                      notes: notes.length > 0 ? notes : null,
                    })
                  }
                />
              </div>
            </ListEditorRow>
          ))}
        </div>
      )}
      <ListAddButton label="Add emergency contact" onClick={add} />
    </div>
  );
}
