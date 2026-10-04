"use client";

// features/esign/signing/SigningFields.tsx — the placed fields, drawn over one rendered page.
//
// Mounted in the PDF viewer's overlay slot, which is exactly the size of the drawn page, so each
// field is placed by percentage and follows the page through every zoom, width and rotation. Text
// inside a field is sized from the field's own height (container query units), so a signature
// stays a signature at 40% zoom and on a phone.
//
// A field is the signer's own (`signer_id === me.id`): highlighted, pressable, and filled from what
// they adopted. Anyone else's is muted, inert, and says whose it is.

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { FIELD_LABEL, FIELD_PROMPT, rotateBox, type PlacedField } from "./fieldMap";

/** What the signer's fields show once they have adopted a signature. */
export interface FieldValues {
  signature: { kind: "typed"; name: string } | { kind: "drawn"; src: string };
  initials: string;
  date: string;
  name: string;
}

export function SigningFields({
  fields,
  rotation,
  myId,
  values,
  pressable,
  activeId,
  focusNonce,
  onPress,
}: {
  fields: PlacedField[];
  rotation: number;
  myId: string | null;
  /** Null until the signer adopts; then every one of their fields shows its value. */
  values: FieldValues | null;
  /** False before the sign step and after signing: the fields show, a press does nothing. */
  pressable: boolean;
  activeId: string | null;
  /** Bumped by "Next field": the active field scrolls into view even when it already was active. */
  focusNonce: number;
  onPress: (field: PlacedField) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0" data-esign-fields="">
      {fields.map((field) => {
        const box = rotateBox(field, rotation);
        const style = {
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.w * 100}%`,
          height: `${box.h * 100}%`,
        };
        if (field.signerId !== myId) {
          return (
            <div
              key={field.id}
              style={{ ...style, containerType: "size" }}
              title={`${FIELD_LABEL[field.kind]} for another signer`}
              className="absolute flex items-center justify-center overflow-hidden rounded-sm border border-dashed border-muted-foreground/40 bg-muted/70 text-muted-foreground"
            >
              <span className="truncate px-1" style={{ fontSize: "clamp(7px, 45cqh, 13px)" }}>
                Other signer
              </span>
            </div>
          );
        }
        return (
          <MyField
            key={field.id}
            field={field}
            style={style}
            values={values}
            pressable={pressable}
            active={field.id === activeId}
            focusNonce={focusNonce}
            onPress={onPress}
          />
        );
      })}
    </div>
  );
}

function MyField({
  field,
  style,
  values,
  pressable,
  active,
  focusNonce,
  onPress,
}: {
  field: PlacedField;
  style: React.CSSProperties;
  values: FieldValues | null;
  pressable: boolean;
  active: boolean;
  focusNonce: number;
  onPress: (field: PlacedField) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active && focusNonce > 0) ref.current?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [active, focusNonce]);

  const filled = values !== null;
  return (
    <button
      ref={ref}
      type="button"
      style={{ ...style, containerType: "size" }}
      aria-label={filled ? `${FIELD_LABEL[field.kind]}, filled` : FIELD_PROMPT[field.kind]}
      aria-disabled={!pressable || undefined}
      data-esign-field={field.id}
      onClick={() => pressable && onPress(field)}
      className={cn(
        "pointer-events-auto absolute flex items-center justify-start overflow-visible rounded-sm border text-left outline-none transition-[background-color,box-shadow]",
        filled
          ? "border-primary/40 bg-primary/5 text-foreground"
          : "border-primary bg-primary/15 text-primary",
        active && pressable && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        pressable && !filled && "hover:bg-primary/25",
        "focus-visible:ring-2 focus-visible:ring-primary",
      )}
    >
      {active && pressable && (
        <span className="pointer-events-none absolute bottom-full left-0 mb-1 whitespace-nowrap rounded-sm bg-primary px-1.5 py-0.5 text-[11px] font-medium leading-none text-primary-foreground shadow-sm">
          {filled ? "Next" : FIELD_PROMPT[field.kind]}
        </span>
      )}
      <FieldContent field={field} values={values} />
      {filled && (
        <Check className="pointer-events-none absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full bg-primary p-0.5 text-primary-foreground" />
      )}
    </button>
  );
}

function FieldContent({ field, values }: { field: PlacedField; values: FieldValues | null }) {
  if (!values) {
    return (
      <span className="w-full truncate px-1 text-center font-medium" style={{ fontSize: "clamp(7px, 45cqh, 14px)" }}>
        {FIELD_PROMPT[field.kind]}
      </span>
    );
  }
  if (field.kind === "signature") {
    if (values.signature.kind === "drawn") {
      // The signer's own drawing, a data URL from the pad on this screen.
      return <img src={values.signature.src} alt="" className="h-full w-full object-contain object-left" />;
    }
    return (
      <span className="w-full truncate px-1 font-serif italic leading-none" style={{ fontSize: "75cqh" }}>
        {values.signature.name}
      </span>
    );
  }
  const text = field.kind === "initials" ? values.initials : field.kind === "date_signed" ? values.date : values.name;
  const serif = field.kind === "initials";
  return (
    <span
      className={cn("w-full truncate px-1 leading-none", serif && "text-center font-serif italic")}
      style={{ fontSize: serif ? "70cqh" : "62cqh" }}
    >
      {text}
    </span>
  );
}
