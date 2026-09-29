"use client";

/**
 * The two row controls of an AI-catalog record, as FORM fields (the record's
 * form stages them and saves them with its other fields): "Shown to" and
 * "Published to the web", in the Words table's words (`@/lib/row-access`,
 * common-docs/policies/access-ladder.md). A record already saved can use
 * `RowAccessControl` directly; these catalog forms stage every field and save
 * once, so the pair lives here as plain form inputs.
 */
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ai-matrx/design-system";
import {
  PUBLISHED_TO_WEB_LABEL,
  SHOWN_TO_LABEL,
  publishedToWebPatch,
  shownToChoices,
  shownToLabel,
  type ShownTo,
} from "@/lib/row-access";

export interface RowWordsValue {
  shown_to: ShownTo | null;
  published_to_web: boolean;
}

const DEFAULT_KEY = "__default__";

export function RowWordsFields({
  value,
  onChange,
}: {
  value: RowWordsValue;
  onChange: (next: RowWordsValue) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 items-end">
      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {SHOWN_TO_LABEL}
        </Label>
        <Select
          value={value.shown_to ?? DEFAULT_KEY}
          onValueChange={(v) =>
            onChange({
              ...value,
              shown_to: v === DEFAULT_KEY ? null : (v as ShownTo),
            })
          }
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_KEY}>{shownToLabel(null)}</SelectItem>
            {shownToChoices(value.published_to_web).map((v) => (
              <SelectItem key={v} value={v}>
                {shownToLabel(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex h-8 items-center gap-2 text-sm cursor-pointer">
        <Switch
          checked={value.published_to_web}
          onCheckedChange={(checked) =>
            onChange({
              published_to_web: checked,
              // "Everyone on AI Matrx" needs a record published to the web.
              shown_to:
                !checked && value.shown_to === "everyone_on_ai_matrx"
                  ? "everyone"
                  : value.shown_to,
            })
          }
        />
        {PUBLISHED_TO_WEB_LABEL}
      </label>
    </div>
  );
}

/**
 * The write for a staged pair: `shown_to` always, and the web switch with its
 * who/when stamp only when it changed (so an unrelated save never restamps it).
 */
export function rowWordsWrite(
  next: RowWordsValue,
  previous: RowWordsValue | null,
  userId: string | null,
): {
  shown_to: ShownTo | null;
  published_to_web?: boolean;
  published_to_web_at?: string | null;
  published_to_web_by?: string | null;
} {
  if (previous && previous.published_to_web === next.published_to_web) {
    return { shown_to: next.shown_to };
  }
  if (!previous && !next.published_to_web) return { shown_to: next.shown_to };
  return {
    shown_to: next.shown_to,
    ...publishedToWebPatch(next.published_to_web, userId),
  };
}
