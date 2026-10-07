"use client";

// features/esign/editor/components/FieldsPanel.tsx — the palette: who the next field is for, then
// every kind. Drag a kind onto the page, or tap it and tap the page (the way on a phone).

import { Wand2 } from "lucide-react";

import { Button } from "@ai-matrx/design-system/controls";
import { Spinner } from "@/components/ui/loaders/Spinner";
import { cn } from "@/lib/utils";

import type { DraftRecipient } from "../../contract/draft";
import type { FieldKindV2 } from "../../contract/fieldModel";
import { recipientColor } from "../../contract/paper";
import { KIND_SPECS } from "../model";
import { PALETTE_DRAG } from "./DocumentStage";

interface Props {
  recipients: DraftRecipient[];
  activeRecipient: string | null;
  onActiveRecipient(key: string): void;
  armed: FieldKindV2 | null;
  onArm(kind: FieldKindV2 | null): void;
  onFind(): void;
  finding: boolean;
  candidateCount: number;
  onAcceptAll(): void;
  canFind: boolean;
}

export function RecipientDot({ index }: { index: number }) {
  return (
    <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 10 10" aria-hidden>
      <circle cx="5" cy="5" r="5" fill={recipientColor(index)} />
    </svg>
  );
}

export function FieldsPanel(p: Props) {
  const signers = p.recipients.filter((r) => r.role === "signer");
  const active = signers.find((r) => r.key === p.activeRecipient) ?? null;
  const groups = ["Signing", "Details", "Inputs"] as const;
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="type-title text-foreground">Fields for</h3>
        {signers.length === 0 ? (
          <p className="type-secondary text-muted-foreground">Add a signer to place fields</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {signers.map((r) => {
              const on = r.key === p.activeRecipient;
              return (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => p.onActiveRecipient(r.key)}
                  className={cn(
                    "flex h-7 max-w-[11rem] items-center gap-1.5 rounded-full border px-2.5 text-xs",
                    on ? "font-medium text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  style={on ? { borderColor: recipientColor(r.color_index), background: recipientColor(r.color_index, 0.14) } : undefined}
                >
                  <RecipientDot index={r.color_index} />
                  <span className="truncate">{r.full_name || r.email || "Recipient"}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <Button
          icon={p.finding ? <Spinner size="xs" className="text-current" /> : <Wand2 />}
          disabled={!p.canFind || p.finding}
          onClick={p.onFind}
        >
          Find fields
        </Button>
        {p.candidateCount > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="type-secondary text-muted-foreground">{p.candidateCount} suggested</span>
            <Button variant="outline" disabled={!active} onClick={p.onAcceptAll}>
              {active ? `Accept all for ${(active.full_name || "recipient").split(" ")[0]}` : "Accept all"}
            </Button>
          </div>
        )}
      </section>

      {groups.map((g) => (
        <section key={g} className="flex flex-col gap-1.5">
          <h3 className="type-secondary text-muted-foreground">{g}</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {KIND_SPECS.filter((k) => k.group === g).map((k) => {
              const Icon = k.icon;
              const on = p.armed === k.kind;
              return (
                <button
                  key={k.kind}
                  type="button"
                  draggable={!!active}
                  disabled={!active}
                  aria-pressed={on}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(PALETTE_DRAG, k.kind);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => p.onArm(on ? null : k.kind)}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-md border px-2.5 text-left text-xs disabled:opacity-50",
                    on ? "border-solid text-foreground" : "border-dashed border-border text-foreground/90 hover:bg-accent/40",
                  )}
                  style={on && active ? { borderColor: recipientColor(active.color_index), background: recipientColor(active.color_index, 0.14) } : undefined}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{k.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {p.armed && active && (
        <p className="type-secondary text-muted-foreground">Tap the page to place it · Esc cancels</p>
      )}
    </div>
  );
}
