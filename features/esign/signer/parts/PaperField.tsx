"use client";

// features/esign/signer/parts/PaperField.tsx — ONE FIELD ON THE PAGE (esign-parity CONTRACT §13.2).
//
// The page is paper in light and dark mode, so everything here is drawn in PAPER / the recipient
// palette (contract/paper.ts), never theme tokens. A field of the signer's own is a compact tag in
// their colour until filled ("Sign here", "Initial here", DocHub's inline tags); on a desktop the
// text kinds are typed straight onto the page. The ACTIVE field carries the callout: its label with
// a required star, Edit / Clear, and Next field → or Skip →. On a phone the page only points; the
// bottom drawer holds the input (S13.3).

import { ArrowRight, Check, PenLine } from "lucide-react";

import { cn } from "@/lib/utils";

import type { FieldValue } from "../../contract/fieldModel";
import { PAPER, recipientColor } from "../../contract/paper";
import { formatIsoDate, isFilled, isMarkKind, KIND_LABEL, KIND_TAG, type SField } from "../model";

export interface PaperFieldProps {
  field: SField;
  value: FieldValue;
  colorIndex: number;
  active: boolean;
  missed: boolean;
  /** The phone layout: the page only points, the drawer edits. */
  compact: boolean;
  /** Before consent the page is shown but nothing on it acts. */
  locked: boolean;
  markUrl: string | null;
  dateText: string;
  dateFormat: string;
  /** Another signer's field: their name, their finished value and mark. */
  other?: { name: string | null; signed: boolean; markUrl: string | null };
  onActivate: (field: SField) => void;
  onChange: (fieldId: string, value: FieldValue) => void;
  onBlur: () => void;
  onMark: (field: SField) => void;
  onClear: (field: SField) => void;
  onNext: (field: SField) => void;
}

const BOX_FONT = "clamp(8px, 62cqh, 15px)";

export function PaperField(props: PaperFieldProps) {
  const { field, value, colorIndex, active, missed, compact, locked, markUrl, other } = props;
  const style: React.CSSProperties = {
    left: `${field.x * 100}%`,
    top: `${field.y * 100}%`,
    width: `${field.w * 100}%`,
    height: `${field.h * 100}%`,
    containerType: "size",
  };

  if (!field.mine) return <OtherField {...props} style={style} />;

  const color = recipientColor(colorIndex);
  const filled = isFilled(field, value);
  const border = missed ? "#dc2626" : color;
  const domId = `esign-field-${field.id}`;
  const interactiveInline = !compact && !locked && !isMarkKind(field.kind) && field.kind !== "date_signed";

  return (
    <div
      className="absolute"
      style={{ ...style, zIndex: active ? 30 : 10 }}
      data-field-id={field.id}
    >
      <div
        id={domId}
        className={cn("relative h-full w-full rounded-[3px]", active && "ring-2 ring-offset-1")}
        style={{
          outline: `1.5px ${field.required || filled ? "solid" : "dashed"} ${border}`,
          background: filled ? recipientColor(colorIndex, 0.06) : recipientColor(colorIndex, missed ? 0.08 : 0.16),
          // ring colour (Tailwind ring uses --tw-ring-color)
          ["--tw-ring-color" as string]: color,
          ["--tw-ring-offset-color" as string]: PAPER.page,
        }}
      >
        {interactiveInline ? (
          <InlineInput {...props} domId={`${domId}-input`} />
        ) : (
          <button
            type="button"
            disabled={locked || field.kind === "date_signed"}
            aria-label={`${field.label}${field.required ? ", required" : ""}${filled ? ", filled" : ""}`}
            aria-required={field.required}
            onClick={() => {
              props.onActivate(field);
              if (!compact && isMarkKind(field.kind) && !filled) props.onMark(field);
            }}
            className="flex h-full w-full items-center justify-center overflow-hidden"
            style={{ color: PAPER.ink, fontSize: BOX_FONT }}
          >
            <FieldFace {...props} filled={filled} color={color} />
          </button>
        )}
        {field.required && !filled ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-1 -top-1.5 text-[11px] font-bold leading-none"
            style={{ color: missed ? "#dc2626" : color }}
          >
            *
          </span>
        ) : null}
      </div>
      {active && !compact && !locked ? <Callout {...props} filled={filled} color={color} /> : null}
    </div>
  );
}

/** What a field shows when it is not an inline input: the tag, the mark, the tick, the value. */
function FieldFace({
  field,
  value,
  markUrl,
  dateText,
  dateFormat,
  filled,
  color,
}: PaperFieldProps & { filled: boolean; color: string }) {
  if (isMarkKind(field.kind)) {
    if (filled && markUrl) {
      // eslint-disable-next-line @next/next/no-img-element -- a data: URL of the signer's own mark
      return <img src={markUrl} alt="" className="h-full w-full object-contain" />;
    }
    if (filled) {
      // Applied, but this page holds no picture of it (a saved mark the adopt answer did not echo):
      // say what is true, never "Sign here" over a field that is signed.
      return <span className="truncate px-1 font-medium italic">{field.kind === "initials" ? "Initialed" : "Signed"}</span>;
    }
    return (
      <span
        className="flex h-full max-h-7 min-h-0 w-full items-center justify-center gap-1 rounded-sm px-1 font-semibold text-white"
        style={{ background: color, fontSize: "clamp(8px, 55cqh, 12px)" }}
      >
        <PenLine className="hidden h-3 w-3 shrink-0 @[64px]:block" />
        {/* A narrow box says the short word; a wide one the whole tag. */}
        <span className="truncate @[84px]:hidden">{field.kind === "initials" ? "Initial" : "Sign"}</span>
        <span className="hidden truncate @[84px]:inline">{KIND_TAG[field.kind]}</span>
      </span>
    );
  }
  if (field.kind === "date_signed") return <span className="truncate px-0.5">{dateText}</span>;
  if (field.kind === "checkbox") {
    return value === true ? <Check className="h-[85%] w-[85%]" strokeWidth={3} /> : null;
  }
  if (field.kind === "radio") {
    return value === true ? <span className="h-[55%] w-[55%] rounded-full" style={{ background: PAPER.ink }} /> : null;
  }
  if (typeof value === "string" && value !== "") {
    const shown = field.kind === "date" ? formatIsoDate(value, field.date_format ?? dateFormat) : value;
    return <span className="w-full truncate px-0.5 text-left">{shown}</span>;
  }
  return (
    <span className="truncate px-0.5 font-medium" style={{ color, fontSize: "clamp(7px, 55cqh, 11px)" }}>
      {KIND_TAG[field.kind] || ""}
    </span>
  );
}

/** Desktop: type, pick and tick directly on the page. */
function InlineInput({ field, value, dateFormat, onChange, onBlur, onActivate, domId }: PaperFieldProps & { domId: string }) {
  const common = {
    id: domId,
    "aria-label": field.label,
    "aria-required": field.required,
    onFocus: () => onActivate(field),
    onBlur,
    className: "h-full w-full bg-transparent px-1 outline-none placeholder:text-[#6b7280]",
    style: { color: PAPER.ink, fontSize: BOX_FONT, colorScheme: "light" as const },
  };
  if (field.kind === "checkbox" || field.kind === "radio") {
    const on = value === true;
    return (
      <button
        type="button"
        id={domId}
        role={field.kind}
        aria-checked={on}
        aria-label={field.kind === "radio" ? (field.option_value ?? field.label) : field.label}
        aria-required={field.required}
        onFocus={() => onActivate(field)}
        onClick={() => onChange(field.id, field.kind === "radio" ? true : !on)}
        className="flex h-full w-full items-center justify-center"
        style={{ color: PAPER.ink }}
      >
        {on ? (
          field.kind === "checkbox" ? (
            <Check className="h-[85%] w-[85%]" strokeWidth={3} />
          ) : (
            <span className="h-[55%] w-[55%] rounded-full" style={{ background: PAPER.ink }} />
          )
        ) : null}
      </button>
    );
  }
  if (field.kind === "dropdown") {
    return (
      // ui-exception: a value typed onto the paper page — the native picker sits inside the field's own box
      <select
        {...common}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(field.id, e.target.value === "" ? null : e.target.value)}
      >
        <option value="">{KIND_TAG.dropdown}</option>
        {(field.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind === "text" && field.multiline) {
    return (
      // ui-exception: a form value typed onto the paper page inside the field's own box, bounded by max_length
      <textarea
        {...common}
        className={cn(common.className, "resize-none py-0.5 leading-tight")}
        style={{ ...common.style, fontSize: "clamp(8px, 22cqh, 13px)" }}
        value={typeof value === "string" ? value : ""}
        maxLength={field.max_length ?? 4000}
        placeholder={field.placeholder ?? KIND_TAG.text}
        onChange={(e) => onChange(field.id, e.target.value)}
      />
    );
  }
  return (
    // ui-exception: a form value typed onto the paper page inside the field's own box — a raw value
    <input
      {...common}
      type={field.kind === "date" ? "date" : field.kind === "email" ? "email" : "text"}
      inputMode={field.kind === "number" ? "decimal" : undefined}
      readOnly={field.read_only === true}
      value={typeof value === "string" ? value : ""}
      maxLength={field.kind === "text" ? (field.max_length ?? 4000) : undefined}
      placeholder={field.placeholder ?? KIND_TAG[field.kind] ?? KIND_LABEL[field.kind]}
      title={field.tooltip ?? (field.kind === "date" ? `Format ${field.date_format ?? dateFormat}` : undefined)}
      onChange={(e) => onChange(field.id, e.target.value)}
    />
  );
}

/** The callout over the active field (DocHub: "Signature Field 1 *  Edit  Next Field →"). */
function Callout({ field, onMark, onClear, onNext, filled, color }: PaperFieldProps & { filled: boolean; color: string }) {
  const nearTop = field.y < 0.07;
  const mark = isMarkKind(field.kind);
  return (
    <div
      role="group"
      aria-label={`${field.label} actions`}
      className={cn(
        "absolute left-0 z-40 flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[12px] font-medium text-white shadow-lg",
        nearTop ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]",
      )}
      style={{ background: color }}
    >
      <span className="max-w-[12rem] truncate px-1">
        {field.label}
        {field.required ? " *" : ""}
      </span>
      {mark && !filled ? (
        <CalloutButton onClick={() => onMark(field)}>{field.kind === "initials" ? "Initial" : "Sign"}</CalloutButton>
      ) : null}
      {mark && filled ? <CalloutButton onClick={() => onMark(field)}>Edit</CalloutButton> : null}
      {filled ? <CalloutButton onClick={() => onClear(field)}>Clear</CalloutButton> : null}
      <CalloutButton onClick={() => onNext(field)}>
        {filled || field.required ? "Next field" : "Skip"} <ArrowRight className="h-3 w-3" />
      </CalloutButton>
    </div>
  );
}

function CalloutButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex items-center gap-1 rounded bg-white/15 px-2 py-0.5 hover:bg-white/30"
    >
      {children}
    </button>
  );
}

/** Another signer's field: muted until they sign, then their value and mark in ink. */
function OtherField({
  field,
  value,
  other,
  dateFormat,
  colorIndex,
  style,
}: PaperFieldProps & { style: React.CSSProperties }) {
  const signed = other?.signed ?? false;
  let face: React.ReactNode = null;
  if (signed && isMarkKind(field.kind) && other?.markUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- a data: URL of a finished signer's mark
    face = <img src={other.markUrl} alt={`${other.name ?? "Signer"}'s ${field.kind}`} className="h-full w-full object-contain" />;
  } else if (signed && value !== null && value !== undefined) {
    face =
      value === true ? (
        <Check className="h-[85%] w-[85%]" strokeWidth={3} />
      ) : (
        <span className="truncate px-0.5">
          {typeof value === "string" && field.kind === "date" ? formatIsoDate(value, field.date_format ?? dateFormat) : String(value)}
        </span>
      );
  } else if (!signed) {
    face = (
      <span className="truncate px-1" style={{ color: PAPER.muted, fontSize: "clamp(7px, 50cqh, 11px)" }}>
        {other?.name ? `${other.name}` : KIND_LABEL[field.kind]}
      </span>
    );
  }
  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center overflow-hidden rounded-[3px]"
      style={{
        ...style,
        zIndex: 5,
        color: PAPER.ink,
        fontSize: BOX_FONT,
        outline: signed ? "none" : `1px dashed ${recipientColor(colorIndex, 0.6)}`,
        background: signed ? "transparent" : recipientColor(colorIndex, 0.06),
      }}
      aria-label={`${KIND_LABEL[field.kind]} for ${other?.name ?? "another signer"}${signed ? ", signed" : ""}`}
    >
      {face}
    </div>
  );
}
