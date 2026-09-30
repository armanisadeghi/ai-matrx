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
import { useUserOrganizations } from "@/features/organizations/hooks";

/**
 * `organizationId` null = brands across ALL the person's organizations, each
 * labelled with its organization when they belong to more than one (the org is
 * a label, never a filter or a group — active-org law). Pass an id only to
 * narrow to a record's own organization.
 */
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
  // access-errors: ok — picker options; a failed read leaves the select empty and the host surface owns its own record errors
  const options = useBrandOptions(organizationId);
  const { organizations } = useUserOrganizations();
  const orgName = new Map(organizations.map((o) => [o.id, o.name]));
  const labelOrg = !organizationId && organizations.length > 1;
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value ?? (allowAll ? "__all__" : "")}
        onValueChange={(v) => onChange(v === "__all__" ? null : v)}
        disabled={options.isLoading}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              "Choose a brand"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {allowAll && <SelectItem value="__all__">All brands</SelectItem>}
          {(options.data ?? []).map((brand) => (
            <SelectItem key={brand.id} value={brand.id}>
              {brand.name}
              {labelOrg && orgName.get(brand.organization_id)
                ? ` · ${orgName.get(brand.organization_id)}`
                : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
