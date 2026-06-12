"use client";

import * as React from "react";
import { Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, NumberField } from "../FormField";
import { ImpairmentSearch } from "./ImpairmentSearch";
import type { InjuryDraft } from "../../state/types";
import type {
  ImpairmentAvailableAttributes,
  Side,
  WcImpairmentDefinitionRead,
} from "../../api/types";

interface InjuryEditorProps {
  open: boolean;
  injury: InjuryDraft;
  onChange: (patch: Partial<InjuryDraft>) => void;
  onClose: () => void;
  onDelete?: () => void;
  onSelectImpairment: (definition: WcImpairmentDefinitionRead | null) => void;
  resolvedDefinition: WcImpairmentDefinitionRead | null;
  isNew?: boolean;
}

const SIDES: { value: Side; label: string }[] = [
  { value: "default", label: "Bilateral / N/A" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

function attributeAccepts(
  attributes: ImpairmentAvailableAttributes | undefined,
  field: "wpi" | "ue" | "le" | "digit" | "side",
): boolean {
  if (!attributes) return true;
  return Boolean(attributes[field]);
}

export function InjuryEditor(props: InjuryEditorProps) {
  const isMobile = useIsMobile();
  const TitleNode = props.isNew ? "Add injury" : "Edit injury";
  const Description =
    "Select the AMA impairment, the side, and the percentages from the medical evaluation.";

  if (isMobile) {
    return (
      <Drawer open={props.open} onOpenChange={(open) => !open && props.onClose()}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{TitleNode}</DrawerTitle>
            <DrawerDescription>{Description}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 max-h-[70dvh] overflow-y-auto">
            <InjuryEditorBody {...props} />
          </div>
          <DrawerFooter>
            <EditorActions
              onClose={props.onClose}
              onDelete={props.onDelete}
              isNew={props.isNew}
            />
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{TitleNode}</DialogTitle>
          <DialogDescription>{Description}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[70dvh] overflow-y-auto pr-1">
          <InjuryEditorBody {...props} />
        </div>
        <DialogFooter>
          <EditorActions
            onClose={props.onClose}
            onDelete={props.onDelete}
            isNew={props.isNew}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditorActions({
  onClose,
  onDelete,
  isNew,
}: {
  onClose: () => void;
  onDelete?: () => void;
  isNew?: boolean;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-2">
      {onDelete && !isNew ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          Remove injury
        </Button>
      ) : (
        <span />
      )}
      <Button type="button" onClick={onClose}>
        {isNew ? "Add injury" : "Done"}
      </Button>
    </div>
  );
}

function InjuryEditorBody({
  injury,
  onChange,
  onSelectImpairment,
  resolvedDefinition,
}: InjuryEditorProps) {
  const attrs = resolvedDefinition?.attributes;

  return (
    <div className="space-y-5 pt-1">
      <Field label="Impairment" hint="From the AMA Guides catalog." required>
        <ImpairmentSearch
          value={injury.impairment_definition_id}
          onChange={(id, def) => onSelectImpairment(def)}
        />
      </Field>

      {attributeAccepts(attrs, "side") && (
        <Field label="Side" required={Boolean(attrs?.side)}>
          <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-border bg-muted/40 p-1">
            {SIDES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ side: opt.value })}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  injury.side === opt.value
                    ? "bg-card text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>
      )}

      {attributeAccepts(attrs, "wpi") && (
        <PercentField
          label="Whole-person impairment (WPI)"
          value={injury.wpi}
          onChange={(v) => onChange({ wpi: v })}
          required={Boolean(attrs?.wpi)}
        />
      )}

      {attributeAccepts(attrs, "ue") && (
        <PercentField
          label="Upper extremity (UE)"
          value={injury.ue}
          onChange={(v) => onChange({ ue: v })}
          required={Boolean(attrs?.ue)}
        />
      )}

      {attributeAccepts(attrs, "le") && (
        <PercentField
          label="Lower extremity (LE)"
          value={injury.le}
          onChange={(v) => onChange({ le: v })}
          required={Boolean(attrs?.le)}
        />
      )}

      {attributeAccepts(attrs, "digit") && (
        <PercentField
          label="Digit %"
          value={injury.digit}
          onChange={(v) => onChange({ digit: v })}
          hint="Required for finger / thumb / toe impairments."
          required={Boolean(attrs?.digit)}
        />
      )}

      <Field
        label="Pain"
        hint="Add-on per AMA Chapter 18 (0–3)."
        trailing={
          <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
            {injury.pain}
          </span>
        }
      >
        <Slider
          value={[injury.pain]}
          onValueChange={(v) => onChange({ pain: v[0] ?? 0 })}
          min={0}
          max={3}
          step={1}
        />
      </Field>

      <Field
        label="Industrial apportionment"
        hint="Percentage attributable to work (0–100)."
        trailing={
          <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
            {injury.industrial}%
          </span>
        }
      >
        <Slider
          value={[injury.industrial]}
          onValueChange={(v) => onChange({ industrial: v[0] ?? 0 })}
          min={0}
          max={100}
          step={1}
        />
      </Field>

      {/* AG (Almanac Grade) override. Stored on the injury for record-
          keeping; the rating engine doesn't apply it today. Surfaced for
          parity with calculators that expose it. */}
      <Field
        label="AG (Almanac Grade)"
        hint="Override flag. Saved with the injury; not applied to the rating math today."
        trailing={
          <Switch
            checked={injury.ag}
            onCheckedChange={(v) => onChange({ ag: Boolean(v) })}
            aria-label="AG override"
          />
        }
      >
        <span className="text-xs text-muted-foreground">
          {injury.ag ? "Override on" : "Override off"}
        </span>
      </Field>
    </div>
  );
}

function PercentField({
  label,
  value,
  onChange,
  hint,
  required,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  hint?: string;
  required?: boolean;
}) {
  return (
    <Field label={label} hint={hint} required={required}>
      <NumberField
        value={value == null ? "" : String(value)}
        onChange={(raw) => {
          if (raw === "") {
            onChange(null);
            return;
          }
          const n = Number(raw);
          if (Number.isNaN(n)) return;
          onChange(Math.max(0, Math.min(100, n)));
        }}
        suffix={<Percent className="h-4 w-4" />}
        placeholder="0"
        min={0}
        max={100}
        step={1}
      />
    </Field>
  );
}
