// File: features/user-profile/components/AddressFields.tsx
//
// Shared address grid for shipping + billing. Generic over a "prefix"
// (e.g. "shipping_" or "billing_") so it can be wired to either pair of
// columns on `user_form_profile` without duplicating the field layout.

"use client";

import { TextField } from "./ListEditorRow";

export interface AddressValues {
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface AddressFieldsProps {
  value: AddressValues;
  onChange: (next: AddressValues) => void;
  /** Hint for HTML autocomplete. Use "shipping" or "billing". */
  scope: "shipping" | "billing";
  disabled?: boolean;
}

export function AddressFields({
  value,
  onChange,
  scope,
  disabled,
}: AddressFieldsProps) {
  const set = <K extends keyof AddressValues>(key: K, next: AddressValues[K]) =>
    onChange({ ...value, [key]: next });

  // When disabled we render a non-interactive preview so the user can still
  // see what the field will contain. The form passes disabled=true for the
  // billing grid when "Same as shipping" is on.
  if (disabled) {
    return (
      <div className="rounded-md border border-dashed border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Billing uses the shipping address. Untick &ldquo;Same as shipping&rdquo;
        to enter a different billing address.
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <TextField
          label="Street address"
          placeholder="123 Main St"
          value={value.line1 ?? ""}
          onChange={(line1) => set("line1", line1.length > 0 ? line1 : null)}
          autoComplete={`${scope} address-line1`}
        />
      </div>
      <div className="sm:col-span-2">
        <TextField
          label="Apartment, suite, etc. (optional)"
          placeholder="Unit, building, floor"
          value={value.line2 ?? ""}
          onChange={(line2) => set("line2", line2.length > 0 ? line2 : null)}
          autoComplete={`${scope} address-line2`}
        />
      </div>
      <TextField
        label="City"
        value={value.city ?? ""}
        onChange={(city) => set("city", city.length > 0 ? city : null)}
        autoComplete={`${scope} address-level2`}
      />
      <TextField
        label="State / Region"
        value={value.region ?? ""}
        onChange={(region) => set("region", region.length > 0 ? region : null)}
        autoComplete={`${scope} address-level1`}
      />
      <TextField
        label="Postal code"
        value={value.postal_code ?? ""}
        onChange={(postal_code) =>
          set("postal_code", postal_code.length > 0 ? postal_code : null)
        }
        autoComplete={`${scope} postal-code`}
      />
      <TextField
        label="Country"
        placeholder="United States"
        value={value.country ?? ""}
        onChange={(country) =>
          set("country", country.length > 0 ? country : null)
        }
        autoComplete={`${scope} country-name`}
      />
    </div>
  );
}
