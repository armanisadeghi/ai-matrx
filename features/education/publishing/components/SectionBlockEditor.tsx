"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type {
  EduFaqItem,
  EduFeatureItem,
  EduLink,
  EduSection,
  EduStat,
  EduStatus,
  EduStatusCard,
  EduStep,
} from "../../types";
import { EDU_STATUSES } from "../../types";
import { EDU_SECTION_KINDS } from "../validate";

const SECTION_LABELS: Record<EduSection["kind"], string> = {
  prose: "Article text",
  "feature-grid": "Feature cards",
  steps: "Steps",
  "status-cards": "Status cards",
  "stat-bar": "Key statistics",
  faq: "Questions and answers",
  cta: "Call to action",
};

function newSection(kind: EduSection["kind"]): EduSection {
  switch (kind) {
    case "prose":
      return { kind, heading: "", body: "" };
    case "feature-grid":
      return { kind, heading: "", subheading: "", items: [], columns: 3 };
    case "steps":
      return { kind, heading: "", subheading: "", steps: [] };
    case "status-cards":
      return { kind, heading: "", subheading: "", cards: [] };
    case "stat-bar":
      return { kind, stats: [] };
    case "faq":
      return { kind, heading: "", items: [] };
    case "cta":
      return {
        kind,
        heading: "",
        body: "",
        primary: { label: "Start studying", href: "/education" },
      };
  }
}

function educationStatus(value: string): EduStatus {
  return EDU_STATUSES.find((status) => status === value) ?? "planned";
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function ItemShell({
  label,
  onRemove,
  children,
}: {
  label: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">
          {label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={`Remove ${label.toLowerCase()}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      {children}
    </div>
  );
}

function AddItemButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="w-full"
    >
      <Plus className="h-4 w-4" /> {label}
    </Button>
  );
}

function FeatureItems({
  items,
  onChange,
}: {
  items: EduFeatureItem[];
  onChange: (items: EduFeatureItem[]) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <ItemShell
          key={index}
          label={`Card ${index + 1}`}
          onRemove={() =>
            onChange(items.filter((_, itemIndex) => itemIndex !== index))
          }
        >
          <TextField
            label="Title"
            value={item.title}
            onChange={(title) =>
              onChange(
                items.map((entry, itemIndex) =>
                  itemIndex === index ? { ...entry, title } : entry,
                ),
              )
            }
          />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={item.description}
              onChange={(event) =>
                onChange(
                  items.map((entry, itemIndex) =>
                    itemIndex === index
                      ? { ...entry, description: event.target.value }
                      : entry,
                  ),
                )
              }
              rows={3}
            />
          </div>
          <TextField
            label="Link (optional)"
            value={item.href ?? ""}
            onChange={(href) =>
              onChange(
                items.map((entry, itemIndex) =>
                  itemIndex === index
                    ? { ...entry, href: href || undefined }
                    : entry,
                ),
              )
            }
            placeholder="/education/flashcards"
          />
        </ItemShell>
      ))}
      <AddItemButton
        label="Add card"
        onClick={() => onChange([...items, { title: "", description: "" }])}
      />
    </div>
  );
}

function StepItems({
  steps,
  onChange,
}: {
  steps: EduStep[];
  onChange: (steps: EduStep[]) => void;
}) {
  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <ItemShell
          key={index}
          label={`Step ${index + 1}`}
          onRemove={() =>
            onChange(steps.filter((_, itemIndex) => itemIndex !== index))
          }
        >
          <div className="grid grid-cols-[90px_1fr] gap-3">
            <TextField
              label="Number"
              value={step.number}
              onChange={(number) =>
                onChange(
                  steps.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, number } : entry,
                  ),
                )
              }
            />
            <TextField
              label="Title"
              value={step.title}
              onChange={(title) =>
                onChange(
                  steps.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, title } : entry,
                  ),
                )
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={step.description}
              onChange={(event) =>
                onChange(
                  steps.map((entry, itemIndex) =>
                    itemIndex === index
                      ? { ...entry, description: event.target.value }
                      : entry,
                  ),
                )
              }
              rows={3}
            />
          </div>
        </ItemShell>
      ))}
      <AddItemButton
        label="Add step"
        onClick={() =>
          onChange([
            ...steps,
            {
              number: String(steps.length + 1).padStart(2, "0"),
              title: "",
              description: "",
            },
          ])
        }
      />
    </div>
  );
}

function FaqItems({
  items,
  onChange,
}: {
  items: EduFaqItem[];
  onChange: (items: EduFaqItem[]) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <ItemShell
          key={index}
          label={`Question ${index + 1}`}
          onRemove={() =>
            onChange(items.filter((_, itemIndex) => itemIndex !== index))
          }
        >
          <TextField
            label="Question"
            value={item.q}
            onChange={(q) =>
              onChange(
                items.map((entry, itemIndex) =>
                  itemIndex === index ? { ...entry, q } : entry,
                ),
              )
            }
          />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Answer</Label>
            <Textarea
              value={item.a}
              onChange={(event) =>
                onChange(
                  items.map((entry, itemIndex) =>
                    itemIndex === index
                      ? { ...entry, a: event.target.value }
                      : entry,
                  ),
                )
              }
              rows={3}
            />
          </div>
        </ItemShell>
      ))}
      <AddItemButton
        label="Add question"
        onClick={() => onChange([...items, { q: "", a: "" }])}
      />
    </div>
  );
}

function StatItems({
  stats,
  onChange,
}: {
  stats: EduStat[];
  onChange: (stats: EduStat[]) => void;
}) {
  return (
    <div className="space-y-3">
      {stats.map((stat, index) => (
        <ItemShell
          key={index}
          label={`Statistic ${index + 1}`}
          onRemove={() =>
            onChange(stats.filter((_, itemIndex) => itemIndex !== index))
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Value"
              value={stat.value}
              onChange={(value) =>
                onChange(
                  stats.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, value } : entry,
                  ),
                )
              }
            />
            <TextField
              label="Label"
              value={stat.label}
              onChange={(label) =>
                onChange(
                  stats.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, label } : entry,
                  ),
                )
              }
            />
          </div>
        </ItemShell>
      ))}
      <AddItemButton
        label="Add statistic"
        onClick={() => onChange([...stats, { value: "", label: "" }])}
      />
    </div>
  );
}

function StatusCardItems({
  cards,
  onChange,
}: {
  cards: EduStatusCard[];
  onChange: (cards: EduStatusCard[]) => void;
}) {
  const replace = (index: number, patch: Partial<EduStatusCard>) =>
    onChange(
      cards.map((card, itemIndex) =>
        itemIndex === index ? { ...card, ...patch } : card,
      ),
    );
  return (
    <div className="space-y-3">
      {cards.map((card, index) => (
        <ItemShell
          key={index}
          label={`Status card ${index + 1}`}
          onRemove={() =>
            onChange(cards.filter((_, itemIndex) => itemIndex !== index))
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField
              label="Title"
              value={card.title}
              onChange={(title) => replace(index, { title })}
            />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select
                value={card.status}
                onValueChange={(status) =>
                  replace(index, { status: educationStatus(status) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["live", "beta", "coming-soon", "planned"] as const).map(
                    (status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={card.description ?? ""}
              onChange={(event) =>
                replace(index, { description: event.target.value || undefined })
              }
              rows={3}
            />
          </div>
          <TextField
            label="Link (optional)"
            value={card.href ?? ""}
            onChange={(href) => replace(index, { href: href || undefined })}
          />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Bullets (one per line)
            </Label>
            <Textarea
              value={(card.bullets ?? []).join("\n")}
              onChange={(event) =>
                replace(index, {
                  bullets: event.target.value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean),
                })
              }
              rows={3}
            />
          </div>
        </ItemShell>
      ))}
      <AddItemButton
        label="Add status card"
        onClick={() => onChange([...cards, { title: "", status: "live" }])}
      />
    </div>
  );
}

function LinkFields({
  label,
  link,
  onChange,
}: {
  label: string;
  link: EduLink;
  onChange: (link: EduLink) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField
          label="Button label"
          value={link.label}
          onChange={(value) => onChange({ ...link, label: value })}
        />
        <TextField
          label="Destination"
          value={link.href}
          onChange={(value) => onChange({ ...link, href: value })}
        />
      </div>
    </div>
  );
}

function SectionFields({
  section,
  onChange,
}: {
  section: EduSection;
  onChange: (section: EduSection) => void;
}) {
  switch (section.kind) {
    case "prose":
      return (
        <>
          <TextField
            label="Heading (optional)"
            value={section.heading ?? ""}
            onChange={(heading) =>
              onChange({ ...section, heading: heading || undefined })
            }
          />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Article text
            </Label>
            <Textarea
              value={section.body}
              onChange={(event) =>
                onChange({ ...section, body: event.target.value })
              }
              rows={8}
            />
          </div>
        </>
      );
    case "feature-grid":
      return (
        <>
          <TextField
            label="Heading (optional)"
            value={section.heading ?? ""}
            onChange={(heading) =>
              onChange({ ...section, heading: heading || undefined })
            }
          />
          <TextField
            label="Subheading (optional)"
            value={section.subheading ?? ""}
            onChange={(subheading) =>
              onChange({ ...section, subheading: subheading || undefined })
            }
          />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Columns</Label>
            <Select
              value={String(section.columns ?? 3)}
              onValueChange={(columns) =>
                onChange({ ...section, columns: columns === "2" ? 2 : 3 })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">Two</SelectItem>
                <SelectItem value="3">Three</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <FeatureItems
            items={section.items}
            onChange={(items) => onChange({ ...section, items })}
          />
        </>
      );
    case "steps":
      return (
        <>
          <TextField
            label="Heading (optional)"
            value={section.heading ?? ""}
            onChange={(heading) =>
              onChange({ ...section, heading: heading || undefined })
            }
          />
          <TextField
            label="Subheading (optional)"
            value={section.subheading ?? ""}
            onChange={(subheading) =>
              onChange({ ...section, subheading: subheading || undefined })
            }
          />
          <StepItems
            steps={section.steps}
            onChange={(steps) => onChange({ ...section, steps })}
          />
        </>
      );
    case "status-cards":
      return (
        <>
          <TextField
            label="Heading (optional)"
            value={section.heading ?? ""}
            onChange={(heading) =>
              onChange({ ...section, heading: heading || undefined })
            }
          />
          <TextField
            label="Subheading (optional)"
            value={section.subheading ?? ""}
            onChange={(subheading) =>
              onChange({ ...section, subheading: subheading || undefined })
            }
          />
          <StatusCardItems
            cards={section.cards}
            onChange={(cards) => onChange({ ...section, cards })}
          />
        </>
      );
    case "stat-bar":
      return (
        <StatItems
          stats={section.stats}
          onChange={(stats) => onChange({ ...section, stats })}
        />
      );
    case "faq":
      return (
        <>
          <TextField
            label="Heading (optional)"
            value={section.heading ?? ""}
            onChange={(heading) =>
              onChange({ ...section, heading: heading || undefined })
            }
          />
          <FaqItems
            items={section.items}
            onChange={(items) => onChange({ ...section, items })}
          />
        </>
      );
    case "cta":
      return (
        <>
          <TextField
            label="Heading"
            value={section.heading}
            onChange={(heading) => onChange({ ...section, heading })}
          />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Supporting text (optional)
            </Label>
            <Textarea
              value={section.body ?? ""}
              onChange={(event) =>
                onChange({ ...section, body: event.target.value || undefined })
              }
              rows={3}
            />
          </div>
          <LinkFields
            label="Primary button"
            link={section.primary}
            onChange={(primary) => onChange({ ...section, primary })}
          />
          {section.secondary ? (
            <div className="space-y-2">
              <LinkFields
                label="Secondary button"
                link={section.secondary}
                onChange={(secondary) => onChange({ ...section, secondary })}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => onChange({ ...section, secondary: undefined })}
              >
                <Trash2 className="h-4 w-4 text-destructive" /> Remove secondary
                button
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onChange({
                  ...section,
                  secondary: { label: "Learn more", href: "/education" },
                })
              }
            >
              <Plus className="h-4 w-4" /> Add secondary button
            </Button>
          )}
        </>
      );
  }
}

export function SectionBlockEditor({
  sections,
  onChange,
}: {
  sections: EduSection[];
  onChange: (sections: EduSection[]) => void;
}) {
  const replace = (index: number, section: EduSection) =>
    onChange(
      sections.map((entry, itemIndex) =>
        itemIndex === index ? section : entry,
      ),
    );
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sections.length) return;
    const next = [...sections];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {sections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Add the first content block below. No JSON is required.
        </div>
      ) : null}
      {sections.map((section, index) => (
        <section
          key={index}
          className="rounded-xl border border-border bg-card p-4 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">
                {SECTION_LABELS[section.kind]}
              </div>
              <div className="text-xs text-muted-foreground">
                Block {index + 1}
              </div>
            </div>
            <div className="flex items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label={`Move block ${index + 1} up`}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === sections.length - 1}
                onClick={() => move(index, 1)}
                aria-label={`Move block ${index + 1} down`}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() =>
                  onChange(
                    sections.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
                aria-label={`Remove block ${index + 1}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
          <SectionFields
            section={section}
            onChange={(next) => replace(index, next)}
          />
        </section>
      ))}
      <div className="rounded-xl border border-dashed border-border p-3">
        <Label className="text-xs text-muted-foreground">
          Add a content block
        </Label>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EDU_SECTION_KINDS.map((kind) => (
            <Button
              key={kind}
              type="button"
              variant="outline"
              onClick={() => onChange([...sections, newSection(kind)])}
            >
              <Plus className="h-4 w-4" /> {SECTION_LABELS[kind]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
