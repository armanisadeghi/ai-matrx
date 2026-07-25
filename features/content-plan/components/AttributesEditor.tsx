"use client";

/**
 * Vertical-attribute editor for plan.node.attributes, schema-driven from
 * `plan.profile.attribute_schemas.node` (a JSON Schema per vertical).
 *
 * There is NO hard site→vertical binding in the DB yet (open item in the
 * content-planning system-of-record doc), so the vertical is an explicit
 * picker over the org's profiles; a single-profile org auto-selects it.
 * Fields render from the schema (string arrays, booleans, strings); anything
 * the simple renderer can't express stays editable as raw JSON — never
 * silently dropped.
 */
import { useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Json } from "@/types/database.types";

import type { PlanProfileRow } from "../types";

interface SchemaProperty {
  type?: string;
  items?: { type?: string };
  default?: unknown;
}

function nodeSchemaProperties(
  profile: PlanProfileRow | null,
): Record<string, SchemaProperty> | null {
  if (!profile) return null;
  const schemas = profile.attribute_schemas as
    | { node?: { properties?: Record<string, SchemaProperty> } }
    | null;
  const properties = schemas?.node?.properties;
  return properties && typeof properties === "object" ? properties : null;
}

export function AttributesEditor({
  value,
  profiles,
  onChange,
}: {
  value: Json;
  profiles: PlanProfileRow[];
  onChange: (attributes: Json) => void;
}) {
  const [verticalId, setVerticalId] = useState<string | null>(
    profiles.length === 1 ? profiles[0].id : null,
  );
  const [rawOpen, setRawOpen] = useState(false);
  const [rawDraft, setRawDraft] = useState<string | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);

  const profile = useMemo(
    () => profiles.find((row) => row.id === verticalId) ?? null,
    [profiles, verticalId],
  );
  const properties = nodeSchemaProperties(profile);
  const attributes = (value ?? {}) as Record<string, Json>;

  const setField = (key: string, fieldValue: Json) => {
    onChange({ ...attributes, [key]: fieldValue });
  };

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Vertical attributes
        </h4>
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => {
            setRawOpen((previous) => !previous);
            setRawDraft(null);
            setRawError(null);
          }}
        >
          {rawOpen ? "Form view" : "Raw JSON"}
        </button>
      </div>

      {profiles.length > 1 ? (
        <div className="mb-2">
          <Select
            value={verticalId ?? ""}
            onValueChange={(next) => setVerticalId(next)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Pick the vertical profile…" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.vertical}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {rawOpen ? (
        <div>
          <Textarea
            value={rawDraft ?? JSON.stringify(attributes, null, 2)}
            onChange={(event) => {
              setRawDraft(event.target.value);
              try {
                const parsed = JSON.parse(event.target.value) as Json;
                setRawError(null);
                onChange(parsed);
              } catch (error) {
                setRawError(
                  error instanceof Error ? error.message : "Invalid JSON",
                );
              }
            }}
            className="min-h-28 font-mono text-xs"
          />
          {rawError ? (
            <p className="mt-1 text-xs text-destructive">
              Not saved yet — {rawError}
            </p>
          ) : null}
        </div>
      ) : !properties ? (
        <p className="text-xs text-muted-foreground">
          {profiles.length === 0
            ? "No plan profiles exist for this organization yet."
            : profile
              ? `The "${profile.vertical}" profile has no node attribute schema yet — use Raw JSON.`
              : "Pick a vertical profile to get schema-driven fields, or use Raw JSON."}
        </p>
      ) : (
        <div className="space-y-2">
          {Object.entries(properties).map(([key, property]) => {
            const label = key.replaceAll("_", " ");
            if (property.type === "boolean") {
              return (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`attr-${key}`}
                    checked={Boolean(attributes[key] ?? property.default ?? false)}
                    onCheckedChange={(checked) =>
                      setField(key, checked === true)
                    }
                  />
                  <Label htmlFor={`attr-${key}`} className="text-xs capitalize">
                    {label}
                  </Label>
                </div>
              );
            }
            if (property.type === "array") {
              const items = Array.isArray(attributes[key])
                ? (attributes[key] as Json[]).map(String)
                : [];
              return (
                <div key={key}>
                  <Label className="text-xs capitalize">{label} (comma-separated)</Label>
                  <Input
                    value={items.join(", ")}
                    onChange={(event) =>
                      setField(
                        key,
                        event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      )
                    }
                    className="h-8 text-sm"
                  />
                </div>
              );
            }
            return (
              <div key={key}>
                <Label className="text-xs capitalize">{label}</Label>
                <Input
                  value={String(attributes[key] ?? "")}
                  onChange={(event) => setField(key, event.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
