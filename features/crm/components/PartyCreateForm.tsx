"use client";

import { useState } from "react";
import { Building2, User } from "lucide-react";
import { toast } from "@/lib/toast";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  CRM_CREATE_PARTY_SURFACE_NAME,
  createCrmCreatePartyScope,
  crmCreatePartyManifest,
} from "@/features/surfaces/manifests/crm-create-party.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import { addContactPoint, createParty, normalizeMediumValue } from "../service";
import { PARTY_KINDS, type PartyKind } from "../types";

const LABELS = surfaceValueLabels(crmCreatePartyManifest);

/** Draft fields the `party_draft` write target accepts, by the kind they belong to. */
const PERSON_FIELDS = ["first_name", "last_name", "job_title"] as const;
const COMPANY_FIELDS = ["company_name", "primary_domain"] as const;
const CONTACT_FIELDS = ["email", "phone"] as const;
const DRAFT_FIELDS: readonly string[] = [
  "party_kind",
  ...PERSON_FIELDS,
  ...COMPANY_FIELDS,
  ...CONTACT_FIELDS,
];

export interface PartyCreateFormProps {
  initialKind?: PartyKind;
  initialOrgId?: string | null;
  onCancel: () => void;
  onCreated: (partyId: string) => void;
}

/**
 * Canonical CRM party capture core. Presentation shells (currently the
 * WindowPanel) own close/navigation; this core owns the live draft and writes.
 */
export function PartyCreateForm({
  initialKind = "person",
  initialOrgId,
  onCancel,
  onCreated,
}: PartyCreateFormProps) {
  const effectiveOrgId = useAppSelector(selectEffectiveOrganizationId);
  const orgId = initialOrgId ?? effectiveOrgId;
  const [kind, setKind] = useState<PartyKind>(initialKind);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const displayName =
    kind === "person"
      ? [firstName.trim(), lastName.trim()].filter(Boolean).join(" ")
      : companyName.trim();
  const formValid = Boolean(orgId && displayName);
  const partyDraft = {
    party_kind: kind,
    display_name: displayName,
    first_name: firstName,
    last_name: lastName,
    company_name: companyName,
    job_title: jobTitle,
    primary_domain: domain,
    email,
    phone,
  };

  const submit = async () => {
    if (!orgId) {
      toast.error("No organization resolved yet — try again in a moment");
      return;
    }
    if (!displayName) {
      toast.error(
        kind === "person" ? "A name is required" : "A company name is required",
      );
      return;
    }

    setSaving(true);
    try {
      const party = await createParty({
        kind,
        displayName,
        orgId,
        firstName: kind === "person" ? firstName : undefined,
        lastName: kind === "person" ? lastName : undefined,
        jobTitle: kind === "person" ? jobTitle : undefined,
        primaryDomain: kind === "organization" ? domain : undefined,
      });

      const contactErrors: string[] = [];
      for (const entry of [
        { channel: "email" as const, value: email },
        { channel: "phone" as const, value: phone },
      ]) {
        if (!entry.value.trim()) continue;
        try {
          await addContactPoint({
            partyId: party.id,
            orgId,
            channel: entry.channel,
            value: entry.value,
            makePrimary: true,
          });
        } catch (error) {
          contactErrors.push(
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      for (const message of contactErrors) {
        // The record exists; a failed contact method is the moment you most
        // want to open it and fix that by hand.
        toast.error(`Record created, but a contact method failed: ${message}`, {
          action: toastDoor("party", party.id),
        });
      }
      toast.success(`${displayName} created`, {
        action: toastDoor("party", party.id),
      });
      onCreated(party.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create record",
      );
    } finally {
      setSaving(false);
    }
  };

  // Write half of this surface (manifest `writeTargets`): ONE composite draft
  // target. It validates the whole payload — the real `PARTY_KINDS`
  // vocabulary, field shapes, kind coherence, and contact values through the
  // SAME `normalizeMediumValue` the save path uses — and THROWS on anything
  // bad, which the writeback seam turns into an error envelope the agent
  // reads. Accepted keys land through the same setters the user's typing uses.
  // Creating the record is deliberately NOT a target: dedup, medium linking,
  // and ownership all happen at save, and the human presses Create record.
  const getSurfaceWriteHandlers = () => ({
    party_draft: (value: unknown) => {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(
          `party_draft expects an object with any of: ${DRAFT_FIELDS.join(" | ")}.`,
        );

      const draft = value as Record<string, unknown>;
      const keys = Object.keys(draft);
      if (keys.length === 0)
        throw new Error("party_draft needs at least one field to stage.");

      const unknown = keys.filter((key) => !DRAFT_FIELDS.includes(key));
      if (unknown.length > 0)
        throw new Error(
          `party_draft does not accept: ${unknown.join(", ")}. Allowed fields: ${DRAFT_FIELDS.join(" | ")}.`,
        );

      // Kind decides which inputs are rendered, so resolve it first and
      // validate the rest of the payload against it.
      let nextKind = kind;
      if ("party_kind" in draft) {
        const raw = draft.party_kind;
        if (
          typeof raw !== "string" ||
          !(PARTY_KINDS as readonly string[]).includes(raw)
        )
          throw new Error(
            `party_kind expects one of: ${PARTY_KINDS.join(" | ")}.`,
          );
        nextKind = raw as PartyKind;
      }

      /** Trimmed string for a present key; `undefined` when the key is absent. */
      const field = (key: string): string | undefined => {
        if (!(key in draft)) return undefined;
        const raw = draft[key];
        if (typeof raw !== "string")
          throw new Error(`party_draft.${key} expects a string.`);
        return raw.trim();
      };

      // A value for the wrong kind would land in an input the user cannot
      // see. Clearing (empty string) is always allowed.
      const wrongKind = (
        nextKind === "person" ? COMPANY_FIELDS : PERSON_FIELDS
      ).filter((key) => field(key));
      if (wrongKind.length > 0)
        throw new Error(
          nextKind === "person"
            ? `A person draft has no ${wrongKind.join(" or ")} field — this form captures an employer as job_title, and the company as its own record.`
            : `A company draft has no ${wrongKind.join(" or ")} field — create the person as their own record.`,
        );

      // Canonical medium validation: the exact check the save path runs, so a
      // value an agent stages can never fail only at Create time.
      for (const channel of CONTACT_FIELDS) {
        const next = field(channel);
        if (next) normalizeMediumValue(channel, next);
      }

      setKind(nextKind);
      const stage = (key: string, set: (next: string) => void) => {
        const next = field(key);
        if (next !== undefined) set(next);
      };
      stage("first_name", setFirstName);
      stage("last_name", setLastName);
      stage("job_title", setJobTitle);
      stage("company_name", setCompanyName);
      stage("primary_domain", setDomain);
      stage("email", setEmail);
      stage("phone", setPhone);
    },
  });

  const kindButton = (value: PartyKind, label: string, Icon: typeof User) => (
    <button
      type="button"
      onClick={() => setKind(value)}
      className={cn(
        "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors",
        kind === value
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName={CRM_CREATE_PARTY_SURFACE_NAME}
      getScope={() =>
        createCrmCreatePartyScope({
          organization_id: orgId ?? undefined,
          ...partyDraft,
          party_draft: partyDraft,
          form_valid: formValid,
          is_saving: saving,
        })
      }
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="flex gap-2">
            {kindButton("person", "Person", User)}
            {kindButton("organization", "Company", Building2)}
          </div>

          {kind === "person" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="crm-first" className="text-xs">
                    {LABELS.first_name}
                  </Label>
                  <Input
                    id="crm-first"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    autoFocus
                    data-surface-value="first_name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="crm-last" className="text-xs">
                    {LABELS.last_name}
                  </Label>
                  <Input
                    id="crm-last"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    data-surface-value="last_name"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="crm-title" className="text-xs">
                  {LABELS.job_title}
                </Label>
                <Input
                  id="crm-title"
                  value={jobTitle}
                  onChange={(event) => setJobTitle(event.target.value)}
                  placeholder="Optional"
                  data-surface-value="job_title"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="crm-company" className="text-xs">
                  {LABELS.company_name}
                </Label>
                <Input
                  id="crm-company"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  autoFocus
                  data-surface-value="company_name"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="crm-domain" className="text-xs">
                  {LABELS.primary_domain}
                </Label>
                <Input
                  id="crm-domain"
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  placeholder="acme.com (optional)"
                  data-surface-value="primary_domain"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="crm-email" className="text-xs">
                {LABELS.email}
              </Label>
              <Input
                id="crm-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Optional"
                data-surface-value="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="crm-phone" className="text-xs">
                {LABELS.phone}
              </Label>
              <Input
                id="crm-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+1 310 555 1234"
                data-surface-value="phone"
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 bg-muted/20 px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={saving || !formValid}>
            {saving ? "Creating…" : "Create record"}
          </Button>
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
