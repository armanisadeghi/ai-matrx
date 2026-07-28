"use client";

// features/crm/components/NewPartyDialog.tsx
//
// Create a person or a company. Email/phone are optional quick-adds — each
// one runs the canonical find-or-create-medium → link flow (never a column
// on the party; that is the failure this schema exists to prevent).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Building2, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { addContactPoint, createParty } from "../service";
import type { PartyKind } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  defaultKind?: PartyKind;
  onCreated?: () => void;
}

export function NewPartyDialog({
  open,
  onOpenChange,
  orgId,
  defaultKind = "person",
  onCreated,
}: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<PartyKind>(defaultKind);
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

  const reset = () => {
    setFirstName("");
    setLastName("");
    setCompanyName("");
    setJobTitle("");
    setDomain("");
    setEmail("");
    setPhone("");
  };

  const submit = async () => {
    if (!orgId) {
      toast.error("No organization resolved yet — try again in a moment");
      return;
    }
    if (!displayName) {
      toast.error(kind === "person" ? "A name is required" : "A company name is required");
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

      // Quick-add contact methods — each one is medium-first, then the link.
      const contactErrors: string[] = [];
      if (email.trim()) {
        try {
          await addContactPoint({
            partyId: party.id,
            orgId,
            channel: "email",
            value: email,
            makePrimary: true,
          });
        } catch (e) {
          contactErrors.push(e instanceof Error ? e.message : String(e));
        }
      }
      if (phone.trim()) {
        try {
          await addContactPoint({
            partyId: party.id,
            orgId,
            channel: "phone",
            value: phone,
            makePrimary: true,
          });
        } catch (e) {
          contactErrors.push(e instanceof Error ? e.message : String(e));
        }
      }
      for (const message of contactErrors) {
        toast.error(`Record created, but a contact method failed: ${message}`);
      }

      toast.success(`${displayName} created`);
      onCreated?.();
      reset();
      onOpenChange(false);
      router.push(`/crm/${party.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create record");
    } finally {
      setSaving(false);
    }
  };

  const kindButton = (value: PartyKind, label: string, Icon: typeof User) => (
    <button
      type="button"
      onClick={() => setKind(value)}
      className={cn(
        "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors",
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind === "person" ? "New person" : "New company"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            {kindButton("person", "Person", User)}
            {kindButton("organization", "Company", Building2)}
          </div>

          {kind === "person" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="crm-first" className="text-xs">
                    First name
                  </Label>
                  <Input
                    id="crm-first"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="crm-last" className="text-xs">
                    Last name
                  </Label>
                  <Input
                    id="crm-last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="crm-title" className="text-xs">
                  Job title
                </Label>
                <Input
                  id="crm-title"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="crm-company" className="text-xs">
                  Company name
                </Label>
                <Input
                  id="crm-company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="crm-domain" className="text-xs">
                  Domain
                </Label>
                <Input
                  id="crm-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="acme.com (optional)"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="crm-email" className="text-xs">
                Email
              </Label>
              <Input
                id="crm-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="crm-phone" className="text-xs">
                Phone
              </Label>
              <Input
                id="crm-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 310 555 1234"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={saving || !displayName}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
