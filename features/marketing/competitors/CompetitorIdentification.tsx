"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { isJsonObject } from "@/types/json";
import { useAppDispatch } from "@/lib/redux/hooks";
import { TagInput } from "@/features/notes/components/TagInput";
import { SettingDoor } from "@/features/settings/doors/SettingDoor";
import { getOrgModuleCustomValues } from "@/features/organizations/orgModuleSettings";
import {
  COMPETITOR_LABELS_NAMESPACE,
  COMPETITOR_LABELS_SETTING_ID,
  COMPETITOR_MODULE_KEY,
} from "./settings";

import type {
  CompetitorRow,
  CompetitorSite,
  CompetitorLookupResult,
} from "./data";
import {
  addCompetitor,
  classifyCompetitor,
  lookupCompetitor,
  saveCompetitorClassification,
} from "./data";
import { axesOf, buildRuling } from "./groundTruth";

const BUSINESS = ["direct", "adjacent", "none"] as const;
const MARKET = ["same_market", "different_market", "market_agnostic"] as const;
/**
 * The live vocabulary — mirrors `seo.competitor.competitor_entity_role_valid`.
 * Widened 2026-08-15 from the original 8 after real SERP evidence turned up
 * roles the first taxonomy had no name for: manufacturers and retail channels
 * outrank contractors on their own informational terms, insurers rank on
 * "what to do after a car accident", and live PBN spam shows up in the top 20.
 */
const ROLE = [
  "business",
  "manufacturer",
  "retail_channel",
  "marketplace",
  "adversary",
  "publisher",
  "professional_body",
  "community",
  "complementary_vendor",
  "reference",
  "supplier",
  "partner",
  "own_brand",
  "irrelevant",
  "spam",
] as const;
/** Axis 5 — independent of every other axis. The national chain you build
 *  toward is not a head-to-head rival however close its nearest branch is. */
const PEER_SCALE = ["smaller", "similar", "larger", "category_leader"] as const;
const POSTURE = [
  "compete",
  "copy",
  "outreach",
  "link_source",
  "monitor",
  "ignore",
] as const;

export const COMPETITOR_AXIS_CHOICES = {
  business_overlap: BUSINESS,
  market_overlap: MARKET,
  entity_role: ROLE,
  peer_scale: PEER_SCALE,
  posture: POSTURE,
} as const;

/** Plain-language axis prompts. The user is a brilliant non-technical expert:
 *  "Business overlap" means nothing to them, "Do they take your revenue?" does. */
export const COMPETITOR_AXIS_QUESTIONS: Record<string, string> = {
  business_overlap: "Do they take your revenue?",
  market_overlap: "Can they actually serve your customer?",
  entity_role: "What kind of organization is this, to you?",
  peer_scale: "Are they in your league?",
  posture: "What should you do about them?",
};

// Roles that ARE the answer: what the thing is matters more than any overlap
// it happens to have. FEATURE.md §4. Exported so the inline classification
// dropdown (the canonical `MatrxDataTable` editable-select column) can show
// the same human-readable labels the badge shows, instead of the raw enum.
export const ENTITY_ROLE_LABELS: Record<string, string> = {
  business: "Business",
  manufacturer: "Manufacturer / brand",
  retail_channel: "Retail channel",
  marketplace: "Marketplace / lead broker",
  adversary: "Opposing interest",
  publisher: "Publisher",
  professional_body: "Industry body",
  community: "Community site",
  complementary_vendor: "Complementary vendor",
  reference: "Reference site",
  supplier: "Supplier",
  partner: "Partner",
  own_brand: "Your own brand",
  irrelevant: "Ranks by accident",
  spam: "Spam / link farm",
};

/** `editOptions` for the canonical inline classification dropdown. */
export const ENTITY_ROLE_EDIT_OPTIONS = ROLE.map((value) => ({
  value,
  label: ENTITY_ROLE_LABELS[value] ?? value.replaceAll("_", " "),
}));

export function derivedCompetitorLabel(
  row: Pick<
    CompetitorRow,
    | "business_overlap"
    | "market_overlap"
    | "entity_role"
    | "search_overlap_band"
  > & { peer_scale?: string | null },
): string {
  if (row.entity_role && ENTITY_ROLE_LABELS[row.entity_role] && row.entity_role !== "business")
    return ENTITY_ROLE_LABELS[row.entity_role];

  // `category_leader` outranks market overlap: "the national chain you build
  // toward" is more useful than "technically in or out of my market".
  if (
    row.peer_scale === "category_leader" &&
    row.entity_role === "business" &&
    (row.business_overlap === "direct" || row.business_overlap === "adjacent")
  )
    return "Aspirational model";

  if (row.business_overlap === "none")
    return row.search_overlap_band && row.search_overlap_band !== "none"
      ? "Search-only competitor"
      : "Not a competitor";
  if (row.business_overlap === "direct")
    return row.market_overlap === "different_market"
      ? "Out-of-market peer"
      : "Direct competitor";
  if (row.business_overlap === "adjacent")
    return row.market_overlap === "different_market"
      ? "Adjacent peer"
      : "Adjacent competitor";
  return "Unclassified";
}

export function ManualCompetitorAdd({
  site,
  onAdded,
}: {
  site: CompetitorSite | null;
  onAdded: () => Promise<void>;
}) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const [results, setResults] = useState<CompetitorLookupResult[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const search = async () => {
    if (!site || name.trim().length < 2) return;
    setBusy("search");
    try {
      const found = await lookupCompetitor(site.id, name.trim(), dispatch);
      setResults(found);
      if (!found.length)
        toast.error(
          "No likely official sites found. Try the full business name.",
        );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lookup failed");
    } finally {
      setBusy(null);
    }
  };

  const add = async (result: CompetitorLookupResult) => {
    if (!site) return;
    setBusy(result.domain);
    try {
      const row = await addCompetitor(site, result);
      await classifyCompetitor(site.id, row.id, dispatch);
      await onAdded();
      setResults([]);
      setName("");
      toast.success(`${result.title} added for your review`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add competitor",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          Add a competitor you already know
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void search();
            }}
            placeholder="Type a business name, like Shred Nations"
            disabled={!site}
          />
          <Button
            onClick={() => void search()}
            disabled={!site || name.trim().length < 2 || busy !== null}
            className="gap-2"
          >
            {busy === "search" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}{" "}
            Find site
          </Button>
        </div>
        {results.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {results.map((result) => (
              <div
                key={result.domain}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    {result.title}
                    <ExternalLink className="size-3" />
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {result.domain}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs">
                    {result.description}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => void add(result)}
                  disabled={busy !== null}
                  className="shrink-0 gap-1"
                >
                  {busy === result.domain ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Plus className="size-3" />
                  )}{" "}
                  Add
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          We find the likely official site, then propose a classification.
          Nothing is confirmed until you say so.
        </p>
      </CardContent>
    </Card>
  );
}

export function CompetitorClassificationEditor({
  row,
  onSaved,
  source = "competitor_workspace",
}: {
  row: CompetitorRow;
  onSaved: () => Promise<void>;
  source?: string;
}) {
  const [draft, setDraft] = useState(row);
  const [labels, setLabels] = useState(row.custom_labels);
  // THE TRAINING SIGNAL (FEATURE.md §10). Free text, never a dropdown.
  const [why, setWhy] = useState("");
  const [organizationLabels, setOrganizationLabels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const classification =
    isJsonObject(row.latest_autopsy) &&
    isJsonObject(row.latest_autopsy.classification)
      ? row.latest_autopsy.classification
      : null;
  const classificationReasons =
    classification && isJsonObject(classification.reasons)
      ? classification.reasons
      : null;
  const uncertainty =
    classification && typeof classification.uncertainty === "string"
      ? classification.uncertainty
      : null;
  useEffect(() => {
    let alive = true;
    void getOrgModuleCustomValues(
      row.organization_id,
      COMPETITOR_MODULE_KEY,
      COMPETITOR_LABELS_NAMESPACE,
    )
      .then((result) => {
        if (alive) setOrganizationLabels(result.values);
      })
      .catch((error) => {
        console.error("[competitor-labels] load failed", error);
      });
    return () => {
      alive = false;
    };
  }, [row.organization_id]);
  const save = async (confirm: boolean) => {
    if (
      !draft.business_overlap ||
      !draft.market_overlap ||
      !draft.entity_role ||
      !draft.posture
    )
      return;
    setSaving(true);
    try {
      await saveCompetitorClassification(
        row.id,
        {
          business_overlap: draft.business_overlap,
          market_overlap: draft.market_overlap,
          entity_role: draft.entity_role,
          peer_scale: draft.peer_scale,
          posture: draft.posture,
          use_for_link_gap: draft.use_for_link_gap,
          custom_labels: labels,
        },
        confirm,
        confirm
          ? buildRuling({
              row,
              ruling: axesOf(draft),
              why,
              labelWouldHaveUsed: labels.join(", "),
              source,
              labelOf: derivedCompetitorLabel,
            })
          : undefined,
      );
      await onSaved();
      toast.success(confirm ? "Competitor confirmed" : "Classification saved");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save classification",
      );
    } finally {
      setSaving(false);
    }
  };
  const axis = (
    label: string,
    value: string | null,
    axisValues: readonly string[],
    key: "business_overlap" | "market_overlap" | "entity_role" | "peer_scale" | "posture",
  ) => {
    const axisReason = classificationReasons?.[key];
    return (
      <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value ?? ""}
        onValueChange={(next) =>
          setDraft((current) => ({ ...current, [key]: next }))
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          {axisValues.map((item) => (
            <SelectItem value={item} key={item}>
              {item.replaceAll("_", " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {typeof axisReason === "string" ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {axisReason}
        </p>
      ) : null}
    </div>
    );
  };
  return (
    <div className="space-y-5 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{derivedCompetitorLabel(draft)}</Badge>
        <Badge variant="outline">{row.classification_status}</Badge>
        {row.custom_labels.map((label) => (
          <Badge variant="secondary" key={label}>
            {label}
          </Badge>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {axis(
          "Business overlap",
          draft.business_overlap,
          BUSINESS,
          "business_overlap",
        )}
        {axis("Market overlap", draft.market_overlap, MARKET, "market_overlap")}
        {axis("Entity role", draft.entity_role, ROLE, "entity_role")}
        {axis("Are they in your league?", draft.peer_scale, PEER_SCALE, "peer_scale")}
        {axis("What should we do?", draft.posture, POSTURE, "posture")}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label>Your labels</Label>
          <SettingDoor
            target={{
              scope: "organization",
              organizationSlugOrId: row.organization_id,
              controlId: COMPETITOR_LABELS_SETTING_ID,
              requestedValue: labels.find(
                (label) => !organizationLabels.includes(label),
              ),
            }}
            label="Manage organization labels"
          />
        </div>
        <div className="rounded-md border border-input bg-background px-2 py-2">
          <TagInput
            tags={labels}
            onChange={setLabels}
            suggestions={organizationLabels}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Pick an organization label or type your own. Personal labels never
          rewrite the underlying evidence.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`gap-${row.id}`}
          checked={draft.use_for_link_gap === true}
          onCheckedChange={(checked) =>
            setDraft((current) => ({
              ...current,
              use_for_link_gap: checked === true,
            }))
          }
        />
        <Label htmlFor={`gap-${row.id}`} className="font-normal">
          Use as a link-gap seed after confirmation
        </Label>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`why-${row.id}`}>
          Why? (in your own words)
        </Label>
        <Textarea
          id={`why-${row.id}`}
          value={why}
          onChange={(event) => setWhy(event.target.value)}
          rows={2}
          placeholder="What made this obvious to you? Anything you say here teaches every future run."
        />
      </div>
      {uncertainty ? (
        <div className="rounded-lg bg-muted/50 p-3">
          <strong>What to verify:</strong> {uncertainty}
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={saving}
          onClick={() => void save(false)}
        >
          Save changes
        </Button>
        <Button
          disabled={
            saving ||
            !draft.business_overlap ||
            !draft.market_overlap ||
            !draft.entity_role ||
            !draft.posture
          }
          onClick={() => void save(true)}
          className="gap-2"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}{" "}
          Confirm classification
        </Button>
      </div>
    </div>
  );
}
