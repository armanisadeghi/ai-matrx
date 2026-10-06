"use client";

// Pick the organization the KG inspector filters by — by NAME, from the admin
// organization directory. Uses the design-system OrganizationPicker, which has
// no side effects: choosing here never changes the active organization.

import { useEffect, useState } from "react";
import { Building2, X } from "lucide-react";
import {
  OrganizationPicker,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import type { AdminOrganizationRow } from "@/features/admin/users/types";

interface Props {
  organizationId: string;
  onChange: (organizationId: string) => void;
}

let directoryPromise: Promise<AdminOrganizationRow[]> | null = null;

function loadOrganizations(): Promise<AdminOrganizationRow[]> {
  directoryPromise ??= fetch("/api/admin/users/organizations", {
    cache: "no-store",
  })
    .then(async (res) => {
      const json = (await res.json()) as {
        directory?: { organizations: AdminOrganizationRow[] };
      };
      if (!res.ok || !json.directory) {
        throw new Error(`Organization directory unavailable (${res.status})`);
      }
      return json.directory.organizations;
    })
    .catch((error: unknown) => {
      directoryPromise = null;
      throw error;
    });
  return directoryPromise;
}

export function KgOrganizationFilter({ organizationId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [organizations, setOrganizations] = useState<AdminOrganizationRow[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    loadOrganizations()
      .then((rows) => active && setOrganizations(rows))
      .catch(() => active && setLoadFailed(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const chosen = organizations.find((org) => org.id === organizationId);
  const label = chosen?.name ?? (organizationId ? organizationId : "Any organization");

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            icon={<Building2 />}
            type="button"
            variant="outline"
            width="lg"
            className="justify-start"
            aria-label="Filter edges by organization"
          >
            <span className="truncate">{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" width="lg" padding="sm">
          <OrganizationPicker
            hideHeading
            organizations={organizations
              .filter((org) => !org.archived_at)
              .map((org) => ({
                id: org.id,
                name: org.name,
                abbreviation: org.abbreviation,
                distinguisher: org.slug,
              }))}
            activeOrganizationId={organizationId || null}
            loading={loading}
            loadFailed={loadFailed}
            onSelect={(org) => {
              onChange(org.id);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {organizationId ? (
        <Button
          icon={<X />}
          type="button"
          variant="quiet"
          aria-label="Clear organization filter"
          onClick={() => onChange("")}
        />
      ) : null}
    </div>
  );
}
