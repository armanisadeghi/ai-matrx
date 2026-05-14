// File: features/user-profile/components/SocialHandleListEditor.tsx
//
// Editor for the `social_handles` JSONB column on `user_form_profile`.
// Each entry pairs a platform name with a handle and optional URL — kept
// free-form so an agent can reference any service (LinkedIn, GitHub,
// Twitter/X, Bluesky, Mastodon, custom internal tools, …).

"use client";

import { useCallback } from "react";
import { AtSign } from "lucide-react";
import type { SocialHandle } from "@/features/user-profile/types";
import {
  ListAddButton,
  ListEditorEmptyState,
  ListEditorRow,
  TextField,
} from "./ListEditorRow";

export interface SocialHandleListEditorProps {
  value: SocialHandle[];
  onChange: (next: SocialHandle[]) => void;
}

export function SocialHandleListEditor({
  value,
  onChange,
}: SocialHandleListEditorProps) {
  const update = useCallback(
    (id: string, patch: Partial<SocialHandle>) =>
      onChange(value.map((s) => (s.id === id ? { ...s, ...patch } : s))),
    [onChange, value],
  );

  const remove = useCallback(
    (id: string) => onChange(value.filter((s) => s.id !== id)),
    [onChange, value],
  );

  const add = useCallback(() => {
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        platform: "",
        handle: "",
        url: null,
      },
    ]);
  }, [onChange, value]);

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <ListEditorEmptyState icon={AtSign} label="No social handles yet." />
      ) : (
        <div className="space-y-2">
          {value.map((entry, index) => (
            <ListEditorRow
              key={entry.id}
              index={index}
              onRemove={() => remove(entry.id)}
            >
              <TextField
                label="Platform"
                placeholder="LinkedIn"
                value={entry.platform}
                onChange={(platform) => update(entry.id, { platform })}
              />
              <TextField
                label="Handle"
                placeholder="@yourname"
                value={entry.handle}
                onChange={(handle) => update(entry.id, { handle })}
              />
              <TextField
                label="URL"
                placeholder="https://…"
                type="url"
                value={entry.url ?? ""}
                onChange={(url) =>
                  update(entry.id, { url: url.length > 0 ? url : null })
                }
              />
            </ListEditorRow>
          ))}
        </div>
      )}
      <ListAddButton label="Add social handle" onClick={add} />
    </div>
  );
}
