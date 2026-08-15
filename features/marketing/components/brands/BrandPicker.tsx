"use client";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrandOptions } from "@/features/marketing/data/hooks";

export function BrandPicker({
  organizationId,
  value,
  onChange,
  allowAll = false,
  label = "Brand",
}: {
  organizationId: string | null;
  value: string | null;
  onChange: (id: string | null) => void;
  allowAll?: boolean;
  label?: string;
}) {
  const options = useBrandOptions(organizationId);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value ?? (allowAll ? "__all__" : "")}
        onValueChange={(v) => onChange(v === "__all__" ? null : v)}
        disabled={!organizationId || options.isLoading}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              organizationId ? "Choose a brand" : "Choose an organization first"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {allowAll && <SelectItem value="__all__">All brands</SelectItem>}
          {(options.data ?? []).map((brand) => (
            <SelectItem key={brand.id} value={brand.id}>
              {brand.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
