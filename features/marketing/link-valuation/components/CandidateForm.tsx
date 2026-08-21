"use client";

/**
 * The candidate input pane.
 *
 * Two things here are load-bearing and were absent from the source model:
 *
 * 1. **The target.** Relevance is relevance *to something*. The spreadsheet
 *    never had a field for it — the operator held it in their head — so the
 *    same domain could be scored twice with different answers and no record of
 *    why. It is a required input now.
 * 2. **Provenance on every value.** A number measured by an API, estimated by
 *    a model, and typed by a person are all legitimate, and they are not the
 *    same thing. The engine down-weights by it and the result panel shows it.
 */

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BrainCircuit, Info } from "lucide-react";

import type {
  EvaluationInput,
  LinkValuationConfig,
  Provenance,
  SignalDef,
  SignalValue,
} from "../types";

const PROVENANCE_OPTIONS: readonly { value: Provenance; label: string }[] = [
  { value: "api", label: "API" },
  { value: "ai", label: "AI" },
  { value: "manual", label: "Manual" },
  { value: "derived", label: "Derived" },
];

const ENTITY_GROUPS: readonly {
  key: SignalDef["entity"];
  label: string;
  hint: string;
}[] = [
  {
    key: "domain",
    label: "The domain",
    hint: "Facts about the site as a whole.",
  },
  {
    key: "page",
    label: "The page",
    // access-errors: ok — form-field hint about a prospective external page, not a failed read
    hint: "Leave empty when the placement page does not exist yet.",
  },
  {
    key: "target",
    label: "Relevance to our target",
    hint: "How well this fits what WE are ranking for.",
  },
  { key: "deal", label: "The deal", hint: "What the publisher agreed to." },
];

function isAiSourced(signal: SignalDef): boolean {
  return signal.sources.every((source) => source.kind === "ai");
}

interface Props {
  config: LinkValuationConfig;
  input: EvaluationInput;
  onChange: (next: EvaluationInput) => void;
}

export function CandidateForm({ config, input, onChange }: Props) {
  const setValue = (key: string, patch: Partial<SignalValue>) => {
    const current = input.values[key] ?? {
      value: null,
      provenance: "manual",
      confidence: 1,
    };
    onChange({
      ...input,
      values: { ...input.values, [key]: { ...current, ...patch } },
    });
  };

  const setTarget = (patch: Partial<EvaluationInput["target"]>) => {
    onChange({ ...input, target: { ...input.target, ...patch } });
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        <section className="rounded-md border border-border bg-card p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What we are evaluating
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="lv-domain" className="text-xs">
                Candidate domain
              </Label>
              <Input
                id="lv-domain"
                value={input.domain}
                onChange={(event) =>
                  onChange({ ...input, domain: event.target.value })
                }
                placeholder="example.com"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="lv-keyword" className="text-xs">
                Our target keyword
              </Label>
              <Input
                id="lv-keyword"
                value={input.target.keyword}
                onChange={(event) => setTarget({ keyword: event.target.value })}
                placeholder="what we want to rank for"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="lv-page" className="text-xs">
                Our target page
              </Label>
              <Input
                id="lv-page"
                value={input.target.page}
                onChange={(event) => setTarget({ page: event.target.value })}
                placeholder="the page the link should point at"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="lv-campaign" className="text-xs">
                Campaign
              </Label>
              <Input
                id="lv-campaign"
                value={input.target.campaign}
                onChange={(event) =>
                  setTarget({ campaign: event.target.value })
                }
                placeholder="optional"
                className="h-8 text-sm"
              />
            </div>
          </div>
        </section>

        {ENTITY_GROUPS.map((group) => {
          const signals = config.signals.filter(
            (signal) => signal.entity === group.key && signal.enabled,
          );
          if (signals.length === 0) return null;

          return (
            <section
              key={group.key}
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {group.hint}
                </p>
              </div>

              <div className="flex flex-col divide-y divide-border">
                {signals.map((signal) => {
                  const current = input.values[signal.key];
                  const aiOnly = isAiSourced(signal);

                  return (
                    <div
                      key={signal.key}
                      className="grid grid-cols-[1fr_auto] items-center gap-2 py-1.5 sm:grid-cols-[minmax(0,1fr)_9rem_6rem]"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Label
                          htmlFor={`lv-${signal.key}`}
                          className="truncate text-xs font-normal"
                        >
                          {signal.label}
                        </Label>
                        {aiOnly ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="secondary"
                                className="h-4 shrink-0 gap-1 px-1 text-[10px]"
                              >
                                <BrainCircuit className="h-2.5 w-2.5" />
                                AI
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm text-xs">
                              Sourced from the mandate{" "}
                              <code className="text-[11px]">
                                {signal.sources[0]?.mandateKey ?? "unnamed"}
                              </code>
                              . Not yet seeded — enter a value by hand to test
                              the model.
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 shrink-0 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm text-xs">
                            <p className="font-medium">{signal.label}</p>
                            <p className="mt-1">{signal.semantic}</p>
                            <p className="mt-1 text-muted-foreground">
                              Scale {signal.scale.min}–{signal.scale.max}{" "}
                              {signal.scale.unit} ·{" "}
                              {signal.scale.direction === "lower-better"
                                ? "lower is better"
                                : "higher is better"}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      {signal.valueKind === "enum" ? (
                        <Select
                          value={
                            typeof current?.value === "string"
                              ? current.value
                              : ""
                          }
                          onValueChange={(next) =>
                            setValue(signal.key, { value: next })
                          }
                        >
                          <SelectTrigger
                            id={`lv-${signal.key}`}
                            className="h-8 text-xs"
                          >
                            <SelectValue placeholder="Not set" />
                          </SelectTrigger>
                          <SelectContent>
                            {(signal.options ?? []).map((option) => (
                              <SelectItem
                                key={option}
                                value={option}
                                className="text-xs"
                              >
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={`lv-${signal.key}`}
                          type="number"
                          inputMode="decimal"
                          value={
                            current?.value === null ||
                            current?.value === undefined
                              ? ""
                              : String(current.value)
                          }
                          onChange={(event) =>
                            setValue(signal.key, {
                              value:
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                            })
                          }
                          placeholder="—"
                          className="h-8 text-xs"
                        />
                      )}

                      <Select
                        value={current?.provenance ?? "manual"}
                        onValueChange={(next) =>
                          setValue(signal.key, {
                            provenance: next as Provenance,
                            // An AI estimate is worth less than a measurement, and
                            // the score should say so rather than pretend.
                            confidence: next === "ai" ? 0.65 : 1,
                          })
                        }
                      >
                        <SelectTrigger className="hidden h-8 text-[11px] sm:flex">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROVENANCE_OPTIONS.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              className="text-xs"
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
