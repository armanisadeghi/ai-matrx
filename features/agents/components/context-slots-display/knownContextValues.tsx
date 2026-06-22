"use client";

/**
 * Registry of well-known ambient / system context keys (user, client,
 * route_brief, conversation, …). These ride on the first turn and are persisted
 * on `model_context.items` — they are NOT in the live `instanceContext` slice.
 *
 * Provides human-readable chip previews and detail-panel renderers instead of
 * raw JSON dumps.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ── Shared helpers ───────────────────────────────────────────────────────────

export function parseContextRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/** Prefer snapshot value on historical messages; fall back to live instance context. */
export function resolveContextEntryValue(
  entry: { key: string; value: unknown; label?: string },
  liveValue?: unknown,
): unknown {
  const label = entry.label?.trim();
  const snap = entry.value;
  const snapIsLabelPlaceholder =
    typeof snap === "string" && !!label && snap === label;

  if (!snapIsLabelPlaceholder && snap !== undefined && snap !== null) {
    return snap;
  }
  if (liveValue !== undefined && liveValue !== null) {
    return liveValue;
  }
  return snap;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function formatIsoShort(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function truncateId(id: string, head = 8): string {
  if (id.length <= head + 3) return id;
  return `${id.slice(0, head)}…`;
}

function ContextFieldGrid({
  fields,
}: {
  fields: Array<{ label: string; value: ReactNode; mono?: boolean }>;
}) {
  return (
    <dl className="grid grid-cols-[minmax(4.5rem,auto)_1fr] gap-x-3 gap-y-2 text-xs">
      {fields.map(({ label, value, mono }) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd
            className={cn(
              "min-w-0 break-words text-foreground",
              mono && "font-mono text-[11px]",
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── Per-key renderers ────────────────────────────────────────────────────────

interface KnownContextDefinition {
  /** Optional chip / popover type label (replaces generic "JSON"). */
  typeLabel?: string;
  preview: (record: Record<string, unknown>) => string | null;
  Detail: (props: { record: Record<string, unknown> }) => ReactNode;
}

const USER: KnownContextDefinition = {
  typeLabel: "Profile",
  preview: (r) => {
    const name = str(r.name);
    const email = str(r.email);
    if (name && email) return `${name} · ${email}`;
    return name ?? email;
  },
  Detail: ({ record: r }) => (
    <ContextFieldGrid
      fields={[
        { label: "Name", value: str(r.name) ?? "—" },
        { label: "Email", value: str(r.email) ?? "—" },
        { label: "User ID", value: str(r.id) ?? "—", mono: true },
        {
          label: "Admin",
          value: r.is_admin === true ? (str(r.admin_level) ?? "Yes") : "No",
        },
      ]}
    />
  ),
};

const CLIENT: KnownContextDefinition = {
  typeLabel: "Client",
  preview: (r) => {
    const now = str(r.now);
    const tz = str(r.timezone);
    if (now && tz) return `${formatIsoShort(now)} · ${tz}`;
    return now ? formatIsoShort(now) : tz;
  },
  Detail: ({ record: r }) => (
    <ContextFieldGrid
      fields={[
        { label: "Surface", value: str(r.surface) ?? "—" },
        {
          label: "Time",
          value: str(r.now) ? formatIsoShort(String(r.now)) : "—",
        },
        { label: "Timezone", value: str(r.timezone) ?? "—" },
        { label: "Locale", value: str(r.locale) ?? "—" },
      ]}
    />
  ),
};

const ROUTE_BRIEF: KnownContextDefinition = {
  typeLabel: "Route",
  preview: (r) => {
    const kind = str(r.route_kind);
    const title = str(r.title);
    const url = str(r.url);
    const head = title ?? (url ? url.split("?")[0] : null);
    if (kind && head) return `${kind} · ${head}`;
    return kind ?? head;
  },
  Detail: ({ record: r }) => (
    <ContextFieldGrid
      fields={[
        { label: "Kind", value: str(r.route_kind) ?? "—" },
        { label: "Title", value: str(r.title) ?? "—" },
        { label: "URL", value: str(r.url) ?? "—", mono: true },
      ]}
    />
  ),
};

const CONVERSATION: KnownContextDefinition = {
  typeLabel: "Thread",
  preview: (r) => {
    const id = str(r.id);
    return id ? `Conversation ${truncateId(id)}` : null;
  },
  Detail: ({ record: r }) => (
    <ContextFieldGrid
      fields={[{ label: "ID", value: str(r.id) ?? "—", mono: true }]}
    />
  ),
};

export const KNOWN_CONTEXT_VALUES: Record<string, KnownContextDefinition> = {
  user: USER,
  client: CLIENT,
  route_brief: ROUTE_BRIEF,
  conversation: CONVERSATION,
};

export function getKnownContextDefinition(
  key: string,
): KnownContextDefinition | null {
  return KNOWN_CONTEXT_VALUES[key] ?? null;
}

export function previewKnownContext(
  key: string,
  value: unknown,
): string | null {
  const def = getKnownContextDefinition(key);
  if (!def) return null;
  const record = parseContextRecord(value);
  if (!record) return null;
  return def.preview(record);
}

export function KnownContextDetail({
  contextKey,
  value,
}: {
  contextKey: string;
  value: unknown;
}) {
  const def = getKnownContextDefinition(contextKey);
  const record = parseContextRecord(value);
  if (!def || !record) {
    return null;
  }
  return <def.Detail record={record} />;
}

export function isKnownContextKey(key: string): boolean {
  return key in KNOWN_CONTEXT_VALUES;
}
