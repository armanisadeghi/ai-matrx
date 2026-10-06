"use client";

/**
 * Structured editor for ONE ControlRule's translation fields (contract K6):
 * how the setting reaches the target (native / fixed / via family / dropped),
 * the provider key, the per-value map, what "off" sends, number cut-offs,
 * value → number, accepted values, range, default. Every other rule field
 * (processor, processor_config, ui_values, on_unmapped, to_default) stays
 * editable through the raw rule below — never dropped on save.
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@ai-matrx/design-system";
import { Input, SegmentedControl } from "@ai-matrx/design-system/controls";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import RuleValueInput from "@/features/ai-models/components/controls/RuleValueInput";
import type { ControlRule } from "../../types";
import { offValueOf, previewValues } from "../model";
import type { TranslationSetting } from "../types";

type Mode = "native" | "fixed" | "family" | "drop";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "native", label: "Native" },
  { value: "fixed", label: "Fixed" },
  { value: "family", label: "Via family" },
  { value: "drop", label: "Dropped" },
];

export function modeOf(rule: ControlRule): Mode {
  if (rule.drop === true) return "drop";
  if (rule.supported === false) return "family";
  if (rule.const !== undefined) return "fixed";
  return "native";
}

/** Text in a field → the value it means: JSON when it parses, else the string; "" = unset. */
export function parseLoose(text: string): unknown {
  const t = text.trim();
  if (t === "") return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

function showLoose(v: unknown): string {
  if (v === undefined) return "";
  return typeof v === "string" ? v : JSON.stringify(v);
}

function without<K extends keyof ControlRule>(
  rule: ControlRule,
  ...keys: K[]
): ControlRule {
  const next = { ...rule };
  for (const k of keys) delete next[k];
  return next;
}

function setField<K extends keyof ControlRule>(
  rule: ControlRule,
  key: K,
  value: ControlRule[K] | undefined,
): ControlRule {
  if (value === undefined) return without(rule, key);
  return { ...rule, [key]: value };
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {title}
      </Label>
      {children}
    </div>
  );
}

export default function RuleFields({
  rule,
  setting,
  onChange,
  blank = false,
}: {
  rule: ControlRule;
  setting: TranslationSetting | undefined;
  onChange: (rule: ControlRule) => void;
  /** No rule yet: nothing is chosen and no fields show until the owner picks how it reaches the model. */
  blank?: boolean;
}) {
  const mode = modeOf(rule);
  const valueType = setting?.value_type ?? "string";
  const numeric = valueType === "integer" || valueType === "number";
  const enumLike =
    valueType === "enum" ||
    valueType === "boolean" ||
    previewValues(setting, rule).length > 0;
  const values = previewValues(setting, rule);
  const [rawDraft, setRawDraft] = useState<string | null>(null);
  const [rawError, setRawError] = useState(false);
  const [newWord, setNewWord] = useState("");

  const setMode = (next: string) => {
    let r = without(rule, "drop", "why", "const");
    if (r.supported === false) r = without(r, "supported");
    if (next === "drop") r = { ...r, drop: true };
    if (next === "family") r = { ...r, supported: false };
    if (next === "fixed")
      r = { ...r, const: rule.const ?? setting?.default_value ?? "" };
    onChange(r);
  };

  const map =
    rule.value_map && typeof rule.value_map === "object" ? rule.value_map : {};
  const setMapEntry = (canonical: string, sends: unknown, dontSend = false) => {
    const next: Record<string, unknown> = { ...map };
    if (dontSend) next[canonical] = null;
    else if (sends === undefined) delete next[canonical];
    else next[canonical] = sends;
    onChange(
      setField(
        rule,
        "value_map",
        Object.keys(next).length > 0 ? next : undefined,
      ),
    );
  };

  const toNumber = rule.to_number ?? {};
  const setToNumber = (canonical: string, n: number | undefined) => {
    const next: Record<string, number> = { ...toNumber };
    if (n === undefined) delete next[canonical];
    else next[canonical] = n;
    onChange(
      setField(
        rule,
        "to_number",
        Object.keys(next).length > 0 ? next : undefined,
      ),
    );
  };

  const ladder = Array.isArray(rule.from_number) ? rule.from_number : [];
  const setLadder = (next: { lte: number | null; to: unknown }[]) =>
    onChange(setField(rule, "from_number", next.length > 0 ? next : undefined));

  const off = rule.off;
  const hasOff = offValueOf(setting) !== undefined || off !== undefined;
  const acceptsExample =
    (setting?.canonical_values ?? [])
      .filter((v) => v !== "auto")
      .slice(0, 3)
      .map(showLoose)
      .join(", ") || "—";
  const offKind = !off
    ? "unset"
    : "send" in off
      ? "send"
      : "floor" in off
        ? "floor"
        : "omit";

  return (
    <div className="space-y-4">
      <Section title={blank ? "Pick how it reaches the model" : "Reaches the target"}>
        {blank ? (
          // Nothing is chosen yet: plain buttons, never a segmented control whose hover
          // state reads as a selection (V3 verifier saw "Dropped" look pre-selected).
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-testid="rule-mode-pick">
            {MODE_OPTIONS.map((o) => (
              <Button
                key={o.value}
                type="button"
                variant="outline"
                onClick={() => setMode(o.value)}
              >
                {o.label}
              </Button>
            ))}
          </div>
        ) : (
          <SegmentedControl aria-label="Mode" fill value={mode} onValueChange={setMode} data={MODE_OPTIONS} />
        )}
      </Section>

      {blank ? null : (
        <>
          {mode === "drop" ? (
            <Section title="Why it is dropped">
              <Input
                value={rule.why ?? ""}
                placeholder="This model has no such control"
                onChange={(e) =>
                  onChange(setField(rule, "why", e.target.value || undefined))
                }
              />
            </Section>
          ) : null}

          {mode === "fixed" ? (
            <Section title="Always sends">
              <RuleValueInput
                valueType={valueType}
                enumValues={setting?.canonical_values}
                min={setting?.canonical_min}
                max={setting?.canonical_max}
                value={rule.const}
                onChange={(v) => onChange(setField(rule, "const", v))}
              />
            </Section>
          ) : null}

          {mode === "native" || mode === "fixed" ? (
            <Section title="Provider key">
              <Input mono
                value={rule.provider_key ?? ""}
                placeholder={setting?.key ?? "same key"}
                onChange={(e) =>
                  onChange(
                    setField(
                      rule,
                      "provider_key",
                      e.target.value.trim() || undefined,
                    ),
                  )
                }
              />
            </Section>
          ) : null}

          {mode === "native" && enumLike && values.length > 0 ? (
            <Section title="Values">
              <div className="overflow-hidden rounded-md border border-border">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto_minmax(0,0.8fr)] gap-x-2 border-b border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                  <span>Value</span>
                  <span>Sends</span>
                  <span>Skip</span>
                  <span>As number</span>
                </div>
                {values.map((v) => {
                  const token = typeof v === "string" ? v : JSON.stringify(v);
                  const hasEntry = token in map;
                  const mapped = map[token];
                  return (
                    <div
                      key={token}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto_minmax(0,0.8fr)] items-center gap-x-2 border-b border-border/60 px-2 py-1 last:border-b-0"
                    >
                      <span className="truncate font-mono text-xs">
                        {token}
                      </span>
                      <Input mono
                        value={
                          hasEntry && mapped !== null ? showLoose(mapped) : ""
                        }
                        disabled={hasEntry && mapped === null}
                        placeholder={
                          hasEntry && mapped === null ? "not sent" : token
                        }
                        aria-label={`What ${token} sends`}
                        onChange={(e) =>
                          setMapEntry(token, parseLoose(e.target.value))
                        }
                      />
                      <Switch
                        checked={hasEntry && mapped === null}
                        aria-label={`Send nothing for ${token}`}
                        onCheckedChange={(checked) =>
                          setMapEntry(token, undefined, checked)
                        }
                      />
                      <Input
                        type="number"
                        value={toNumber[token] ?? ""}
                        placeholder="—"
                        aria-label={`${token} as a number`}
                        onChange={(e) =>
                          setToNumber(
                            token,
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </Section>
          ) : null}

          {mode === "native" && hasOff ? (
            <Section title="Off sends">
              <div className="flex items-center gap-2">
                <Select
                  value={offKind}
                  onValueChange={(k) => {
                    if (k === "unset") onChange(without(rule, "off"));
                    else if (k === "send")
                      onChange({ ...rule, off: { send: "" } });
                    else if (k === "floor")
                      onChange({ ...rule, off: { floor: true } });
                    else onChange({ ...rule, off: { omit: true, why: "" } });
                  }}
                >
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Not declared</SelectItem>
                    <SelectItem value="send">A value</SelectItem>
                    <SelectItem value="floor">Lowest accepted</SelectItem>
                    <SelectItem value="omit">Nothing</SelectItem>
                  </SelectContent>
                </Select>
                {off && "send" in off ? (
                  <Input mono
                    value={showLoose(off.send)}
                    placeholder="none"
                    aria-label="Value off sends"
                    onChange={(e) =>
                      onChange({
                        ...rule,
                        off: { send: parseLoose(e.target.value) ?? "" },
                      })
                    }
                  />
                ) : null}
                {off && "omit" in off ? (
                  <Input
                    value={off.why ?? ""}
                    placeholder="Why nothing is sent"
                    aria-label="Why off sends nothing"
                    onChange={(e) =>
                      onChange({
                        ...rule,
                        off: { omit: true, why: e.target.value },
                      })
                    }
                  />
                ) : null}
              </div>
            </Section>
          ) : null}

          {mode === "native" ? (
            <Section title="Number cut-offs">
              <div className="space-y-1">
                {ladder.map((step, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 text-xs text-muted-foreground">≤</span>
                    <Input
                      type="number"
                      value={step.lte ?? ""}
                      placeholder="above"
                      className="w-28"
                      aria-label="Up to"
                      onChange={(e) => {
                        const next = [...ladder];
                        next[i] = {
                          ...step,
                          lte:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        };
                        setLadder(next);
                      }}
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input mono
                      value={step.to === null ? "" : showLoose(step.to)}
                      placeholder="dropped"
                      className="flex-1"
                      aria-label="Becomes"
                      onChange={(e) => {
                        const next = [...ladder];
                        next[i] = {
                          ...step,
                          to: parseLoose(e.target.value) ?? null,
                        };
                        setLadder(next);
                      }}
                    />
                    <Button
                      icon={<X />}
                      type="button"
                      variant="quiet"
                      aria-label="Remove cut-off"
                      onClick={() =>
                        setLadder(ladder.filter((_, j) => j !== i))
                      }
                    />
                  </div>
                ))}
                <Button
                  icon={<Plus />}
                  type="button"
                  variant="quiet"
                  onClick={() =>
                    setLadder([...ladder, { lte: null, to: null }])
                  }
                >
                  Cut-off
                </Button>
              </div>
            </Section>
          ) : null}

          {mode === "native" && numeric ? (
            <Section title="Value as number">
              <div className="space-y-1">
                {Object.entries(toNumber).map(([word, n]) => (
                  <div key={word} className="flex items-center gap-2">
                    <Input mono
                      value={word}
                      readOnly
                      className="w-28"
                      aria-label="Value"
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input
                      type="number"
                      value={n}
                      className="w-28"
                      aria-label={`${word} as a number`}
                      onChange={(e) =>
                        setToNumber(
                          word,
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                        )
                      }
                    />
                    <Button
                      icon={<X />}
                      type="button"
                      variant="quiet"
                      aria-label={`Remove ${word}`}
                      onClick={() => setToNumber(word, undefined)}
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input mono
                    value={newWord}
                    placeholder="medium"
                    className="w-28"
                    aria-label="New value"
                    onChange={(e) => setNewWord(e.target.value)}
                  />
                  <Button
                    icon={<Plus />}
                    type="button"
                    variant="quiet"
                    disabled={!newWord.trim() || newWord.trim() in toNumber}
                    onClick={() => {
                      setToNumber(newWord.trim(), 0);
                      setNewWord("");
                    }}
                  >
                    Value
                  </Button>
                </div>
              </div>
            </Section>
          ) : null}

          {mode === "native" ? (
            <Section title="Accepts">
              <Input mono
                value={
                  Array.isArray(rule.accepts)
                    ? rule.accepts.map(showLoose).join(", ")
                    : ""
                }
                placeholder={acceptsExample}
                onChange={(e) => {
                  const parts = e.target.value
                    .split(",")
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .map((p) => parseLoose(p));
                  onChange(
                    setField(
                      rule,
                      "accepts",
                      parts.length > 0 ? parts : undefined,
                    ),
                  );
                }}
              />
            </Section>
          ) : null}

          {mode === "native" && numeric ? (
            <Section title="Range">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={rule.clamp?.min ?? ""}
                  placeholder={
                    setting?.canonical_min != null
                      ? String(setting.canonical_min)
                      : "min"
                  }
                  className="w-28"
                  aria-label="Minimum"
                  onChange={(e) => {
                    const min =
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value);
                    const clamp = { ...(rule.clamp ?? {}), min };
                    if (min === undefined) delete clamp.min;
                    onChange(
                      setField(
                        rule,
                        "clamp",
                        Object.keys(clamp).length > 0 ? clamp : undefined,
                      ),
                    );
                  }}
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="number"
                  value={rule.clamp?.max ?? ""}
                  placeholder={
                    setting?.canonical_max != null
                      ? String(setting.canonical_max)
                      : "max"
                  }
                  className="w-28"
                  aria-label="Maximum"
                  onChange={(e) => {
                    const max =
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value);
                    const clamp = { ...(rule.clamp ?? {}), max };
                    if (max === undefined) delete clamp.max;
                    onChange(
                      setField(
                        rule,
                        "clamp",
                        Object.keys(clamp).length > 0 ? clamp : undefined,
                      ),
                    );
                  }}
                />
              </div>
            </Section>
          ) : null}

          {mode === "native" ? (
            <Section title="Default">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <RuleValueInput
                    valueType={valueType}
                    enumValues={setting?.canonical_values}
                    min={setting?.canonical_min}
                    max={setting?.canonical_max}
                    value={rule.default}
                    onChange={(v) => onChange(setField(rule, "default", v))}
                  />
                </div>
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch
                    checked={rule.send_when_unset === true}
                    onCheckedChange={(c) =>
                      onChange(
                        setField(rule, "send_when_unset", c ? true : undefined),
                      )
                    }
                  />
                  Send when not set
                </label>
              </div>
            </Section>
          ) : null}

          <details className="group text-xs">
            <summary className="cursor-pointer select-none text-muted-foreground">
              Advanced
            </summary>
            <div className="mt-1.5">
              <Textarea
                value={rawDraft ?? JSON.stringify(rule, null, 2)}
                rows={6}
                spellCheck={false}
                className={`font-mono text-[11px] ${rawError ? "border-destructive" : ""}`}
                aria-label="Raw rule"
                onChange={(e) => {
                  setRawDraft(e.target.value);
                  try {
                    const parsed = JSON.parse(e.target.value) as unknown;
                    if (
                      parsed &&
                      typeof parsed === "object" &&
                      !Array.isArray(parsed)
                    ) {
                      setRawError(false);
                      onChange(parsed as ControlRule);
                    } else setRawError(true);
                  } catch {
                    setRawError(true);
                  }
                }}
                onBlur={() => {
                  if (!rawError) setRawDraft(null);
                }}
              />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
