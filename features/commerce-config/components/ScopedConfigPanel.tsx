"use client";

/**
 * ScopedConfigPanel — the org + user tiers of scoped configuration
 * (/commerce/settings). Two tabs:
 *
 * - **Organization** — every `org`/`user`-scope knob grouped by feature:
 *   platform default greyed, the org's override editable, one-click reset to
 *   platform. Editing is org-admin gated in the UI (the `org_knob_set`
 *   setter enforces it server-side regardless); non-admin members see the
 *   resolved values read-only.
 * - **My settings** — only `override_scope='user'` knobs, written through
 *   `user_knob_set` so the server pipeline resolves the same value this UI
 *   shows (never a Redux-only preference).
 *
 * Inputs follow the knob's declared value_type: number/integer with the
 * platform min/max shown and clamped, boolean switch, enum select over
 * allowed_values, free string. The platform's range is always the ceiling —
 * the setter re-validates and read-time clamping wins over any stale row.
 */

import React, { useEffect, useState } from "react";
import { RotateCcw, SlidersHorizontal, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useUserRole } from "@/features/organizations/hooks";
import { toast } from "@/lib/toast";
import type { Json } from "@/types/database.types";

import type { ScopedKnob } from "../types";
import { formatKnobValue } from "../types";
import { fetchScopedKnobs, setOrgKnob, setUserKnob } from "../service";

type Tier = "org" | "user";

export function ScopedConfigPanel() {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const { isAdmin } = useUserRole(organizationId ?? undefined);
  const [knobs, setKnobs] = useState<ScopedKnob[] | null>(null);
  /** The org the loaded knob rows belong to — a save must never write one
   *  org's values under another org's id (org switch mid-session). */
  const [loadedOrgId, setLoadedOrgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Org switch: the previous org's values must neither render nor save.
    setKnobs(null);
    setLoadedOrgId(null);
    setError(null);
    if (!organizationId) return;
    let cancelled = false;
    fetchScopedKnobs({ organizationId })
      .then((rows) => {
        if (!cancelled) {
          setKnobs(rows);
          setLoadedOrgId(organizationId);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  if (!organizationId) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Pick an organization to manage its configuration.
      </p>
    );
  }
  if (error) {
    return <p className="p-6 text-sm text-destructive">{error}</p>;
  }
  if (!knobs || loadedOrgId !== organizationId) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const save = async (tier: Tier, knob: ScopedKnob, value: Json | null) => {
    // Guard against a stale closure racing an org switch: write only to the
    // org these rows were loaded for.
    if (loadedOrgId !== organizationId) {
      toast.error("The organization changed — reload before saving.");
      return;
    }
    const args = {
      organizationId: loadedOrgId,
      feature: knob.feature,
      key: knob.key,
      value,
    };
    try {
      if (tier === "org") await setOrgKnob(args);
      else await setUserKnob(args);
      setKnobs((prev) =>
        (prev ?? []).map((k) =>
          k.feature === knob.feature && k.key === knob.key
            ? tier === "org"
              ? { ...k, orgValue: value ?? undefined }
              : { ...k, userValue: value ?? undefined }
            : k,
        ),
      );
      toast.success(
        value === null ? `${knob.label} reset` : `${knob.label} saved`,
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save the setting.");
    }
  };

  const userKnobs = knobs.filter((k) => k.overrideScope === "user");

  return (
    <Tabs defaultValue="org" className="w-full">
      <TabsList>
        <TabsTrigger value="org" className="gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Organization
        </TabsTrigger>
        <TabsTrigger value="user" className="gap-1.5">
          <UserRound className="h-3.5 w-3.5" /> My settings
        </TabsTrigger>
      </TabsList>

      <TabsContent value="org">
        {!isAdmin && (
          <p className="mb-3 text-xs text-muted-foreground">
            You can see your organization&apos;s configuration; only an
            organization admin can change it.
          </p>
        )}
        <KnobGroups
          knobs={knobs}
          tier="org"
          readOnly={!isAdmin}
          onSave={(k, v) => save("org", k, v)}
        />
      </TabsContent>

      <TabsContent value="user">
        {userKnobs.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No settings are personal-overridable yet.
          </p>
        ) : (
          <KnobGroups
            knobs={userKnobs}
            tier="user"
            readOnly={false}
            onSave={(k, v) => save("user", k, v)}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}

function KnobGroups({
  knobs,
  tier,
  readOnly,
  onSave,
}: {
  knobs: ScopedKnob[];
  tier: Tier;
  readOnly: boolean;
  onSave: (knob: ScopedKnob, value: Json | null) => void;
}) {
  const features = [...new Set(knobs.map((k) => k.feature))];
  return (
    <div className="space-y-6">
      {features.map((feature) => (
        <section key={feature}>
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            {feature}
          </h2>
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {knobs
              .filter((k) => k.feature === feature)
              .map((knob) => (
                <KnobRow
                  key={`${knob.feature}:${knob.key}`}
                  knob={knob}
                  tier={tier}
                  readOnly={readOnly}
                  onSave={onSave}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function KnobRow({
  knob,
  tier,
  readOnly,
  onSave,
}: {
  knob: ScopedKnob;
  tier: Tier;
  readOnly: boolean;
  onSave: (knob: ScopedKnob, value: Json | null) => void;
}) {
  const overrideValue = tier === "org" ? knob.orgValue : knob.userValue;
  /** What this tier inherits when it has no override. */
  const inherited = tier === "org" ? knob.platformValue : (knob.orgValue ?? knob.platformValue);
  const hasOverride = overrideValue !== undefined;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {knob.label}
          </span>
          {tier === "org" && knob.overrideScope === "user" && (
            <Badge variant="outline" className="text-[10px]">
              user-overridable
            </Badge>
          )}
          {hasOverride && (
            <Badge variant="secondary" className="text-[10px]">
              overridden
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground" title={knob.description}>
          {knob.description}
        </p>
        <p className="text-xs text-muted-foreground">
          {tier === "org" ? "Platform default" : "Inherited"}:{" "}
          <span className="font-mono">{formatKnobValue(knob, inherited)}</span>
          {(knob.minValue !== null || knob.maxValue !== null) && (
            <>
              {" · "}range {knob.minValue ?? "−∞"}–{knob.maxValue ?? "∞"}
            </>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <KnobInput
          knob={knob}
          value={hasOverride ? overrideValue : inherited}
          disabled={readOnly}
          dimmed={!hasOverride}
          onCommit={(v) => onSave(knob, v)}
        />
        {hasOverride && !readOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => onSave(knob, null)}
            aria-label={`Reset ${knob.label} to the inherited value`}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        )}
      </div>
    </div>
  );
}

/** The value editor for one knob, per its declared value_type. Commits on
 *  blur/Enter (numbers, strings) or immediately (switch, select). */
function KnobInput({
  knob,
  value,
  disabled,
  dimmed,
  onCommit,
}: {
  knob: ScopedKnob;
  value: Json;
  disabled: boolean;
  dimmed: boolean;
  onCommit: (value: Json) => void;
}) {
  const [draft, setDraft] = useState<string>(
    value === null ? "" : typeof value === "string" ? value : String(value),
  );
  useEffect(() => {
    setDraft(value === null ? "" : typeof value === "string" ? value : String(value));
  }, [value]);

  if (knob.valueType === "boolean") {
    return (
      <Switch
        checked={value === true}
        disabled={disabled}
        onCheckedChange={(checked) => onCommit(checked)}
        aria-label={knob.label}
      />
    );
  }

  if (knob.valueType === "enum") {
    return (
      <Select
        value={typeof value === "string" ? value : undefined}
        disabled={disabled}
        onValueChange={(v) => onCommit(v)}
      >
        <SelectTrigger
          className={`w-44 ${dimmed ? "text-muted-foreground" : ""}`}
          aria-label={knob.label}
        >
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {(knob.allowedValues ?? []).map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const commitScalar = () => {
    const trimmed = draft.trim();
    if (trimmed === "") return; // reset is the explicit Reset button, never a blank commit
    if (knob.valueType === "number" || knob.valueType === "integer") {
      let parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) {
        toast.error(`${knob.label} needs a number.`);
        return;
      }
      if (knob.valueType === "integer") parsed = Math.round(parsed);
      // Clamp to the platform's range — mirrors read-time clamping so what
      // the user sees saved is what the pipeline resolves.
      if (knob.minValue !== null) parsed = Math.max(knob.minValue, parsed);
      if (knob.maxValue !== null) parsed = Math.min(knob.maxValue, parsed);
      if (String(parsed) !== trimmed) setDraft(String(parsed));
      onCommit(parsed);
      return;
    }
    onCommit(trimmed);
  };

  return (
    <Input
      value={draft}
      disabled={disabled}
      inputMode={
        knob.valueType === "integer" || knob.valueType === "number"
          ? "decimal"
          : undefined
      }
      className={`w-36 text-base ${dimmed ? "text-muted-foreground" : ""}`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitScalar}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      aria-label={knob.label}
    />
  );
}
