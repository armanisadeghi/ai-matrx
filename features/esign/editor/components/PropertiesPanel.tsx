"use client";

// features/esign/editor/components/PropertiesPanel.tsx — the selected field(s): who fills it,
// required, label, and the options its kind has (CONTRACT §1.2).

import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical, Copy, Trash2 } from "lucide-react";

import { Button, Field, Select, Switch } from "@ai-matrx/design-system/controls";
import { ProTextarea } from "@/components/official/ProTextarea";

import type { DraftField, DraftGroup, EnvelopeDraftV1 } from "../../contract/draft";
import { DATE_FORMATS, kindSpec, newId } from "../model";
import { ProInput } from "@/components/official/ProInput";

interface Props {
  draft: EnvelopeDraftV1;
  selected: DraftField[];
  edit(fn: (d: EnvelopeDraftV1) => EnvelopeDraftV1, key?: string | null): void;
  onDuplicate(): void;
  onDelete(): void;
  showAlign: boolean;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="type-secondary text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="type-body">{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

export function PropertiesPanel({ draft, selected, edit, onDuplicate, onDelete, showAlign }: Props) {
  if (selected.length === 0) {
    return <p className="type-secondary text-muted-foreground">Select a field to edit it</p>;
  }
  const ids = new Set(selected.map((f) => f.id));
  const patch = (change: Partial<DraftField>, key: string | null = null) =>
    edit((d) => ({ ...d, fields: d.fields.map((f) => (ids.has(f.id) ? { ...f, ...change } : f)) }), key);
  const signers = draft.recipients.filter((r) => r.role === "signer");
  const recipientOptions = signers.map((r) => ({ value: r.key, label: r.full_name || r.email || "Recipient" }));
  const f = selected[0];
  const same = (k: keyof DraftField) => selected.every((s) => s[k] === f[k]);
  const multi = selected.length > 1;
  const spec = kindSpec(f.kind);

  function align(how: "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter") {
    const l = Math.min(...selected.map((s) => s.x));
    const r = Math.max(...selected.map((s) => s.x + s.w));
    const t = Math.min(...selected.map((s) => s.y));
    const b = Math.max(...selected.map((s) => s.y + s.h));
    edit((d) => ({
      ...d,
      fields: d.fields.map((x) => {
        if (!ids.has(x.id)) return x;
        if (how === "left") return { ...x, x: l };
        if (how === "right") return { ...x, x: r - x.w };
        if (how === "top") return { ...x, y: t };
        if (how === "bottom") return { ...x, y: b - x.h };
        if (how === "hcenter") return { ...x, x: (l + r) / 2 - x.w / 2 };
        return { ...x, y: (t + b) / 2 - x.h / 2 };
      }),
    }));
  }

  const groupOptions: DraftGroup[] = draft.groups.filter((g) => g.kind === (f.kind === "radio" ? "radio" : "checkbox") && g.recipient_key === f.recipient_key);
  const group = draft.groups.find((g) => g.id === f.group_id);

  function setGroup(id: string) {
    if (id === "") {
      patch({ group_id: null, option_value: null });
    } else if (id === "__new") {
      const gid = newId();
      const kind = f.kind === "radio" ? "radio" : "checkbox";
      edit((d) => ({
        ...d,
        groups: [...d.groups, { id: gid, kind, document_key: f.document_key, recipient_key: f.recipient_key, label: `${kind === "radio" ? "Choice" : "Group"} ${d.groups.filter((g) => g.kind === kind).length + 1}`, required: true, min: kind === "checkbox" ? 1 : null, max: null }],
        fields: d.fields.map((x) => (x.id === f.id ? { ...x, group_id: gid, option_value: x.option_value || x.label || "Option" } : x)),
      }));
    } else {
      patch({ group_id: id, option_value: f.option_value || f.label || "Option" });
    }
  }
  const patchGroup = (change: Partial<DraftGroup>) =>
    edit((d) => ({ ...d, groups: d.groups.map((g) => (g.id === f.group_id ? { ...g, ...change } : g)) }), `group-${f.group_id}`);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate type-title text-foreground">{multi ? `${selected.length} fields` : spec.label}</h3>
        <div className="flex">
          <Button variant="quiet" aria-label="Duplicate" icon={<Copy />} onClick={onDuplicate} />
          <Button variant="quiet" aria-label="Delete" icon={<Trash2 />} onClick={onDelete} />
        </div>
      </div>

      {multi && showAlign && (
        <div className="flex flex-wrap">
          <Button variant="quiet" aria-label="Align left" icon={<AlignStartVertical />} onClick={() => align("left")} />
          <Button variant="quiet" aria-label="Align centre" icon={<AlignCenterVertical />} onClick={() => align("hcenter")} />
          <Button variant="quiet" aria-label="Align right" icon={<AlignEndVertical />} onClick={() => align("right")} />
          <Button variant="quiet" aria-label="Align top" icon={<AlignStartHorizontal />} onClick={() => align("top")} />
          <Button variant="quiet" aria-label="Align middle" icon={<AlignCenterHorizontal />} onClick={() => align("vcenter")} />
          <Button variant="quiet" aria-label="Align bottom" icon={<AlignEndHorizontal />} onClick={() => align("bottom")} />
        </div>
      )}

      <Row label="Assigned to">
        <Select
          aria-label="Assigned to"
          value={same("recipient_key") ? f.recipient_key : ""}
          options={recipientOptions}
          onValueChange={(v) => patch({ recipient_key: v })}
        />
      </Row>

      {!multi && (
        <Row label="Label">
          <ProInput aria-label="Label" maxLength={60} value={f.label} onChange={(e) => patch({ label: e.target.value }, `label-${f.id}`)} />
        </Row>
      )}

      {f.kind !== "date_signed" && (
        <ToggleRow label="Required" checked={f.required && same("required")} disabled={!!f.group_id} onChange={(v) => patch({ required: v })} />
      )}

      {!multi && (
        <>
          {f.kind === "text" && (
            <>
              <Row label="Placeholder">
                <ProInput aria-label="Placeholder" value={f.placeholder ?? ""} onChange={(e) => patch({ placeholder: e.target.value || null }, `ph-${f.id}`)} />
              </Row>
              <Row label="Maximum length">
                <Field aria-label="Maximum length" type="number" min={1} max={4000} value={f.max_length ?? ""} onChange={(e) => patch({ max_length: e.target.value ? Math.min(4000, Math.max(1, Number(e.target.value))) : null }, `ml-${f.id}`)} />
              </Row>
              <ToggleRow label="Several lines" checked={!!f.multiline} onChange={(v) => patch({ multiline: v })} />
            </>
          )}
          {f.kind === "number" && (
            <div className="grid grid-cols-3 gap-2">
              <Row label="Min">
                <Field aria-label="Minimum" type="number" value={f.number?.min ?? ""} onChange={(e) => patch({ number: { ...f.number, min: e.target.value === "" ? null : Number(e.target.value) } }, `nmin-${f.id}`)} />
              </Row>
              <Row label="Max">
                <Field aria-label="Maximum" type="number" value={f.number?.max ?? ""} onChange={(e) => patch({ number: { ...f.number, max: e.target.value === "" ? null : Number(e.target.value) } }, `nmax-${f.id}`)} />
              </Row>
              <Row label="Decimals">
                <Field aria-label="Decimals" type="number" min={0} max={6} value={f.number?.decimals ?? 0} onChange={(e) => patch({ number: { ...f.number, decimals: Math.min(6, Math.max(0, Number(e.target.value) || 0)) } }, `ndec-${f.id}`)} />
              </Row>
            </div>
          )}
          {(f.kind === "date" || f.kind === "date_signed") && (
            <Row label="Date format">
              <Select
                aria-label="Date format"
                value={f.date_format ?? ""}
                options={[{ value: "", label: `Envelope default (${draft.settings.date_format_default})` }, ...DATE_FORMATS]}
                onValueChange={(v) => patch({ date_format: (v || null) as DraftField["date_format"] })}
              />
            </Row>
          )}
          {f.kind === "dropdown" && (
            <Row label="Options, one per line">
              <ProTextarea
                aria-label="Options"
                rows={4}
                value={(f.options ?? []).join("\n")}
                onChange={(e) => patch({ options: e.target.value.split("\n").slice(0, 50) }, `opt-${f.id}`)}
                onBlur={() => patch({ options: [...new Set((f.options ?? []).map((o) => o.trim()).filter(Boolean))] })}
              />
            </Row>
          )}
          {(f.kind === "radio" || f.kind === "checkbox") && (
            <>
              <Row label="Group">
                <Select
                  aria-label="Group"
                  value={f.group_id ?? ""}
                  options={[
                    { value: "", label: f.kind === "radio" ? "Choose a group" : "Single checkbox" },
                    ...groupOptions.map((g) => ({ value: g.id, label: g.label })),
                    { value: "__new", label: "New group" },
                  ]}
                  onValueChange={setGroup}
                />
              </Row>
              {group && (
                <>
                  <Row label="Group name">
                    <ProInput aria-label="Group name" value={group.label} onChange={(e) => patchGroup({ label: e.target.value })} />
                  </Row>
                  <Row label="This option's value">
                    {/* ui-exception: an option value is the raw value the form submits, not prose */}
                    <Field aria-label="Option value" value={f.option_value ?? ""} onChange={(e) => patch({ option_value: e.target.value }, `ov-${f.id}`)} />
                  </Row>
                  <ToggleRow label={group.kind === "radio" ? "One must be chosen" : "Required"} checked={group.required} onChange={(v) => patchGroup({ required: v })} />
                  {group.kind === "checkbox" && (
                    <div className="grid grid-cols-2 gap-2">
                      <Row label="At least">
                        <Field aria-label="At least" type="number" min={0} value={group.min ?? ""} onChange={(e) => patchGroup({ min: e.target.value === "" ? null : Number(e.target.value) })} />
                      </Row>
                      <Row label="At most">
                        <Field aria-label="At most" type="number" min={1} value={group.max ?? ""} onChange={(e) => patchGroup({ max: e.target.value === "" ? null : Number(e.target.value) })} />
                      </Row>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {["full_name", "first_name", "last_name", "email", "company", "title", "text", "number", "date"].includes(f.kind) && (
            <>
              <Row label="Pre-filled value">
                <ProInput aria-label="Pre-filled value" value={typeof f.prefill === "string" ? f.prefill : ""} onChange={(e) => patch({ prefill: e.target.value || null, read_only: e.target.value ? f.read_only : false }, `pf-${f.id}`)} />
              </Row>
              {typeof f.prefill === "string" && f.prefill !== "" && (
                <ToggleRow label="Locked for the signer" checked={!!f.read_only} onChange={(v) => patch({ read_only: v })} />
              )}
            </>
          )}
          <Row label="Hint for the signer">
            <ProInput aria-label="Hint" maxLength={140} value={f.tooltip ?? ""} onChange={(e) => patch({ tooltip: e.target.value || null }, `tt-${f.id}`)} />
          </Row>
        </>
      )}
    </div>
  );
}
