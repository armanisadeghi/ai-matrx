// File: features/user-profile/components/UserProfilePage.tsx
//
// The full user-profile form. Single page divided into sections; each
// section has its own Save button so the user can commit Identity without
// having to also touch Contact or Addresses.
//
// Data sources:
//   • Account (auth metadata + public.profiles) → `useUserProfile`
//   • Form profile (public.user_form_profile)   → `useUserFormProfile`
//   • Read-only auth info (id, last sign-in, providers, email-verified)
//     comes straight from Redux via `useAppSelector(selectUser)`.
//
// Section anchors are stable DOM ids — see PROFILE_SECTION_IDS in types.ts.
// When `defaultSection` is provided we scroll that section into view on
// mount; the settings registry uses this to deep-link sub-tabs.

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectUser,
  selectUserId,
  selectUserAvatarUrl,
} from "@/lib/redux/selectors/userSelectors";
import { setUserMetadata } from "@/lib/redux/slices/userProfileSlice";
import {
  AlertTriangle,
  AtSign,
  Building2,
  Check,
  Clock,
  Home,
  IdCard,
  Loader2,
  Mail,
  Phone,
  ShieldAlert,
  Truck,
  Upload,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { FaGoogle, FaGithub } from "react-icons/fa";

import { ImageCropModal } from "@/components/official/ImageCropModal";
import type { ImageUploaderResult } from "@/components/official/ImageAssetUploader";
import { CloudFolders } from "@/features/files";
import { toast } from "sonner";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  PROFILE_SECTION_IDS,
  type ProfileSectionId,
  type UserAccountData,
  type UserFormProfileData,
} from "@/features/user-profile/types";
import { useUserProfile } from "@/features/user-profile/hooks/useUserProfile";
import { useUserFormProfile } from "@/features/user-profile/hooks/useUserFormProfile";
import { TextField } from "./ListEditorRow";
import { PhoneListEditor } from "./PhoneListEditor";
import { EmailListEditor } from "./EmailListEditor";
import { SocialHandleListEditor } from "./SocialHandleListEditor";
import { EmergencyContactListEditor } from "./EmergencyContactListEditor";
import { AddressFields, type AddressValues } from "./AddressFields";


// ── Constants ──────────────────────────────────────────────────────────────

const PROVIDER_ICONS: Record<string, { icon: React.ReactNode; color: string }> =
  {
    google: { icon: <FaGoogle size={12} />, color: "text-red-500" },
    github: { icon: <FaGithub size={12} />, color: "text-foreground" },
  };

const FORM_PROFILE_SECTION_KEYS = {
  identity: [
    "legal_first_name",
    "legal_middle_name",
    "legal_last_name",
    "preferred_name",
    "name_suffix",
    "pronouns",
    "date_of_birth",
  ],
  contact: ["phones", "emails", "social_handles", "website_url"],
  shipping: [
    "shipping_line1",
    "shipping_line2",
    "shipping_city",
    "shipping_region",
    "shipping_postal_code",
    "shipping_country",
  ],
  billing: [
    "billing_same_as_shipping",
    "billing_line1",
    "billing_line2",
    "billing_city",
    "billing_region",
    "billing_postal_code",
    "billing_country",
  ],
  work: ["company_name", "job_title"],
  emergency: ["emergency_contacts"],
} as const satisfies Record<string, ReadonlyArray<keyof UserFormProfileData>>;

// ── Public props ──────────────────────────────────────────────────────────

export interface UserProfilePageProps {
  /** Anchor id to scroll into view on mount. Used by settings sub-tab
   *  wrappers to deep-link to a specific section. */
  defaultSection?: ProfileSectionId;
  /** Suppresses the outer page padding when embedded in the settings shell
   *  (which provides its own padding). */
  embedded?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export function UserProfilePage({
  defaultSection,
  embedded,
}: UserProfilePageProps) {
  const account = useUserProfile();
  const formProfile = useUserFormProfile();

  // Scroll the requested section into view once data is ready and the DOM
  // anchors exist. Also fall back to `window.location.hash` for direct URL
  // deep-links into the standalone /settings/profile route.
  useEffect(() => {
    if (account.loadState !== "ready") return;
    const targetId =
      defaultSection ??
      (typeof window !== "undefined" && window.location.hash
        ? window.location.hash.slice(1)
        : undefined);
    if (!targetId) return;
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [account.loadState, defaultSection]);

  if (account.loadState === "loading" || formProfile.loadState === "loading") {
    return (
      <div className="flex h-full items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (account.loadState === "error") {
    return (
      <ErrorPanel
        title="Couldn't load your profile"
        message={account.loadError ?? "Unknown error"}
        onRetry={() => account.reset()}
      />
    );
  }

  if (formProfile.loadState === "error") {
    return (
      <ErrorPanel
        title="Couldn't load your form profile"
        message={formProfile.loadError ?? "Unknown error"}
        onRetry={() => formProfile.reset()}
      />
    );
  }

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-4xl space-y-2",
        embedded ? "p-3 md:p-4" : "p-4 md:p-6 lg:p-8",
      )}
    >
      <HeaderSection account={account.data} />
      <DisplaySection
        data={account.data}
        dirty={account.dirty}
        saving={account.saving}
        onField={account.setField}
        onSave={account.save}
        onReset={account.reset}
      />
      <IdentitySection
        data={formProfile.data}
        dirty={formProfile.isDirtyFor(FORM_PROFILE_SECTION_KEYS.identity)}
        saving={formProfile.saving}
        onField={formProfile.setField}
        onSave={() =>
          formProfile.saveSection(FORM_PROFILE_SECTION_KEYS.identity)
        }
      />
      <ContactSection
        data={formProfile.data}
        dirty={formProfile.isDirtyFor(FORM_PROFILE_SECTION_KEYS.contact)}
        saving={formProfile.saving}
        onField={formProfile.setField}
        onSave={() =>
          formProfile.saveSection(FORM_PROFILE_SECTION_KEYS.contact)
        }
      />
      <ShippingSection
        data={formProfile.data}
        dirty={formProfile.isDirtyFor(FORM_PROFILE_SECTION_KEYS.shipping)}
        saving={formProfile.saving}
        onFields={formProfile.setFields}
        onSave={() =>
          formProfile.saveSection(FORM_PROFILE_SECTION_KEYS.shipping)
        }
      />
      <BillingSection
        data={formProfile.data}
        dirty={formProfile.isDirtyFor(FORM_PROFILE_SECTION_KEYS.billing)}
        saving={formProfile.saving}
        onField={formProfile.setField}
        onFields={formProfile.setFields}
        onSave={() =>
          formProfile.saveSection(FORM_PROFILE_SECTION_KEYS.billing)
        }
      />
      <WorkSection
        data={formProfile.data}
        dirty={formProfile.isDirtyFor(FORM_PROFILE_SECTION_KEYS.work)}
        saving={formProfile.saving}
        onField={formProfile.setField}
        onSave={() => formProfile.saveSection(FORM_PROFILE_SECTION_KEYS.work)}
      />
      <EmergencySection
        data={formProfile.data}
        dirty={formProfile.isDirtyFor(FORM_PROFILE_SECTION_KEYS.emergency)}
        saving={formProfile.saving}
        onField={formProfile.setField}
        onSave={() =>
          formProfile.saveSection(FORM_PROFILE_SECTION_KEYS.emergency)
        }
      />
      <AccountInfoSection />
    </div>
  );
}

export default UserProfilePage;

// ── Section: Header (avatar + email + verified badge) ─────────────────────

function HeaderSection({ account }: { account: UserAccountData }) {
  const user = useAppSelector(selectUser);
  const userId = useAppSelector(selectUserId);
  const currentAvatarUrl = useAppSelector(selectUserAvatarUrl);
  const dispatch = useAppDispatch();
  const [photoOpen, setPhotoOpen] = useState(false);

  const avatarUrl = currentAvatarUrl ?? account.avatar_url ?? account.picture ?? null;

  const handlePhotoComplete = async (result: ImageUploaderResult | null) => {
    const url = result?.primary_url ?? result?.image_url ?? null;
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: url, picture: url }),
      });
      if (!res.ok) throw new Error("Failed to save photo");
      dispatch(setUserMetadata({ avatarUrl: url, picture: url }));
      toast.success(url ? "Profile photo updated" : "Profile photo removed");
    } catch {
      toast.error("Could not save profile photo — please try again");
    }
  };

  return (
    <section
      id={PROFILE_SECTION_IDS.header}
      className="rounded-lg border border-border bg-card p-4 md:p-5"
    >
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:gap-6">
        <div className="relative mx-auto shrink-0 md:mx-0">
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            className="group relative h-20 w-20 overflow-hidden rounded-full bg-muted ring-2 ring-border md:h-24 md:w-24 flex items-center justify-center"
            aria-label="Change profile photo"
          >
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Profile"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 80px, 96px"
              />
            ) : (
              <UserIcon className="h-9 w-9 text-muted-foreground" />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
              <Upload className="h-5 w-5 text-white" />
            </span>
          </button>
        </div>
        <div className="flex-1 text-center md:text-left">
          <h2 className="text-xl font-semibold text-foreground md:text-2xl">
            {account.display_name ||
              account.full_name ||
              account.name ||
              "User"}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {user.email ?? "—"}
          </p>
          <div className="mt-1.5 flex items-center justify-center gap-2 md:justify-start">
            {user.emailConfirmedAt ? (
              <Badge
                variant="outline"
                className="border-success/40 text-success"
              >
                <Check className="mr-1 h-3 w-3" />
                Verified
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-warning/40 text-warning"
              >
                <AlertTriangle className="mr-1 h-3 w-3" />
                Unverified email
              </Badge>
            )}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPhotoOpen(true)}
        >
          Change photo
        </Button>
      </div>

      <ImageCropModal
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        onComplete={(result) => void handlePhotoComplete(result)}
        currentUrl={avatarUrl}
        preset="avatar"
        folder={
          userId
            ? `${CloudFolders.IMAGES_AVATARS}/${userId}`
            : CloudFolders.IMAGES_AVATARS
        }
        visibility="public"
        title="Update Profile Photo"
        label="Photo"
        defaultAspect={1}
        allowedAspects={[1]}
        currentImageShape="circle"
        currentImageAlt="Profile photo"
      />
    </section>
  );
}

// ── Section: Display & username (account-level) ───────────────────────────

interface DisplaySectionProps {
  data: UserAccountData;
  dirty: boolean;
  saving: boolean;
  onField: <K extends keyof UserAccountData>(
    key: K,
    value: UserAccountData[K],
  ) => void;
  onSave: () => Promise<boolean>;
  onReset: () => Promise<void>;
}

function DisplaySection({
  data,
  dirty,
  saving,
  onField,
  onSave,
  onReset,
}: DisplaySectionProps) {
  return (
    <SectionAnchor
      id={PROFILE_SECTION_IDS.display}
      title="Display"
      description="How you appear across the app and in chat. Updates the avatar/name shown everywhere immediately on save."
      icon={UserIcon}
      footer={
        <SaveBar
          dirty={dirty}
          saving={saving}
          onSave={onSave}
          onReset={onReset}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Display name (chat)"
          placeholder="What other users see"
          value={data.display_name}
          onChange={(v) => onField("display_name", v)}
        />
        <TextField
          label="Full name"
          placeholder="Your full name"
          value={data.full_name ?? ""}
          onChange={(v) => onField("full_name", v.length > 0 ? v : null)}
          autoComplete="name"
        />
        <TextField
          label="Short name"
          placeholder="First name or nickname"
          value={data.name ?? ""}
          onChange={(v) => onField("name", v.length > 0 ? v : null)}
          autoComplete="given-name"
        />
        <TextField
          label="Preferred username"
          placeholder="e.g. arman"
          value={data.preferred_username ?? ""}
          onChange={(v) =>
            onField("preferred_username", v.length > 0 ? v : null)
          }
          autoComplete="username"
        />
        <div className="sm:col-span-2">
          <TextField
            label="Status message (chat)"
            placeholder="What you're up to right now"
            value={data.status_text ?? ""}
            onChange={(v) => onField("status_text", v.length > 0 ? v : null)}
          />
        </div>
      </div>
    </SectionAnchor>
  );
}

// ── Section: Identity (legal name, pronouns, DOB) ─────────────────────────

interface FormProfileSectionProps {
  data: UserFormProfileData;
  dirty: boolean;
  saving: boolean;
  onField: <K extends keyof UserFormProfileData>(
    key: K,
    value: UserFormProfileData[K],
  ) => void;
  onSave: () => Promise<boolean>;
}

function IdentitySection({
  data,
  dirty,
  saving,
  onField,
  onSave,
}: FormProfileSectionProps) {
  return (
    <SectionAnchor
      id={PROFILE_SECTION_IDS.identity}
      title="Identity"
      description="Legal and preferred names that agents acting on your behalf can use for paperwork, forms, and introductions."
      icon={IdCard}
      footer={<SaveBar dirty={dirty} saving={saving} onSave={onSave} />}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField
          label="Legal first name"
          value={data.legal_first_name ?? ""}
          onChange={(v) => onField("legal_first_name", v.length > 0 ? v : null)}
          autoComplete="given-name"
        />
        <TextField
          label="Legal middle name"
          value={data.legal_middle_name ?? ""}
          onChange={(v) =>
            onField("legal_middle_name", v.length > 0 ? v : null)
          }
          autoComplete="additional-name"
        />
        <TextField
          label="Legal last name"
          value={data.legal_last_name ?? ""}
          onChange={(v) => onField("legal_last_name", v.length > 0 ? v : null)}
          autoComplete="family-name"
        />
        <TextField
          label="Preferred name"
          placeholder="Nickname or chosen name"
          value={data.preferred_name ?? ""}
          onChange={(v) => onField("preferred_name", v.length > 0 ? v : null)}
          autoComplete="nickname"
        />
        <TextField
          label="Name suffix"
          placeholder="Jr., Sr., III…"
          value={data.name_suffix ?? ""}
          onChange={(v) => onField("name_suffix", v.length > 0 ? v : null)}
          autoComplete="honorific-suffix"
        />
        <TextField
          label="Pronouns"
          placeholder="she/her, he/him, they/them…"
          value={data.pronouns ?? ""}
          onChange={(v) => onField("pronouns", v.length > 0 ? v : null)}
        />
        <div className="sm:col-span-3">
          <DateField
            label="Date of birth"
            value={data.date_of_birth}
            onChange={(next) => onField("date_of_birth", next)}
          />
        </div>
      </div>
    </SectionAnchor>
  );
}

// ── Section: Contact (phones, emails, social, website) ────────────────────

function ContactSection({
  data,
  dirty,
  saving,
  onField,
  onSave,
}: FormProfileSectionProps) {
  return (
    <SectionAnchor
      id={PROFILE_SECTION_IDS.contact}
      title="Contact"
      description="Phone numbers, additional emails, social handles, and your website. Agents use these when they need to reach out or reference you."
      icon={Phone}
      footer={<SaveBar dirty={dirty} saving={saving} onSave={onSave} />}
    >
      <div className="space-y-4">
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            Phone numbers
          </h4>
          <PhoneListEditor
            value={data.phones}
            onChange={(phones) => onField("phones", phones)}
          />
        </div>
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            Additional emails
          </h4>
          <EmailListEditor
            value={data.emails}
            onChange={(emails) => onField("emails", emails)}
          />
        </div>
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
            Social handles
          </h4>
          <SocialHandleListEditor
            value={data.social_handles}
            onChange={(social_handles) =>
              onField("social_handles", social_handles)
            }
          />
        </div>
        <div>
          <TextField
            label="Website"
            placeholder="https://yourdomain.com"
            type="url"
            value={data.website_url ?? ""}
            onChange={(v) => onField("website_url", v.length > 0 ? v : null)}
            autoComplete="url"
          />
        </div>
      </div>
    </SectionAnchor>
  );
}

// ── Section: Shipping address ─────────────────────────────────────────────

interface ShippingSectionProps {
  data: UserFormProfileData;
  dirty: boolean;
  saving: boolean;
  onFields: (patch: Partial<UserFormProfileData>) => void;
  onSave: () => Promise<boolean>;
}

function ShippingSection({
  data,
  dirty,
  saving,
  onFields,
  onSave,
}: ShippingSectionProps) {
  const value: AddressValues = useMemo(
    () => ({
      line1: data.shipping_line1,
      line2: data.shipping_line2,
      city: data.shipping_city,
      region: data.shipping_region,
      postal_code: data.shipping_postal_code,
      country: data.shipping_country,
    }),
    [data],
  );

  return (
    <SectionAnchor
      id={PROFILE_SECTION_IDS.shipping}
      title="Shipping address"
      description="Where physical items should be sent. Used by agents when shipping is required."
      icon={Truck}
      footer={<SaveBar dirty={dirty} saving={saving} onSave={onSave} />}
    >
      <AddressFields
        value={value}
        scope="shipping"
        onChange={(next) =>
          onFields({
            shipping_line1: next.line1,
            shipping_line2: next.line2,
            shipping_city: next.city,
            shipping_region: next.region,
            shipping_postal_code: next.postal_code,
            shipping_country: next.country,
          })
        }
      />
    </SectionAnchor>
  );
}

// ── Section: Billing address ──────────────────────────────────────────────

interface BillingSectionProps {
  data: UserFormProfileData;
  dirty: boolean;
  saving: boolean;
  onField: <K extends keyof UserFormProfileData>(
    key: K,
    value: UserFormProfileData[K],
  ) => void;
  onFields: (patch: Partial<UserFormProfileData>) => void;
  onSave: () => Promise<boolean>;
}

function BillingSection({
  data,
  dirty,
  saving,
  onField,
  onFields,
  onSave,
}: BillingSectionProps) {
  const value: AddressValues = useMemo(
    () => ({
      line1: data.billing_line1,
      line2: data.billing_line2,
      city: data.billing_city,
      region: data.billing_region,
      postal_code: data.billing_postal_code,
      country: data.billing_country,
    }),
    [data],
  );

  return (
    <SectionAnchor
      id={PROFILE_SECTION_IDS.billing}
      title="Billing address"
      description="Where invoices and statements should be addressed."
      icon={Home}
      footer={<SaveBar dirty={dirty} saving={saving} onSave={onSave} />}
    >
      <div className="space-y-3">
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/40 bg-card/30 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={data.billing_same_as_shipping}
            onChange={(e) =>
              onField("billing_same_as_shipping", e.target.checked)
            }
            className="h-4 w-4 rounded border-border text-primary focus:ring-1 focus:ring-primary/30"
          />
          <span>Same as shipping address</span>
        </label>
        <AddressFields
          value={value}
          scope="billing"
          disabled={data.billing_same_as_shipping}
          onChange={(next) =>
            onFields({
              billing_line1: next.line1,
              billing_line2: next.line2,
              billing_city: next.city,
              billing_region: next.region,
              billing_postal_code: next.postal_code,
              billing_country: next.country,
            })
          }
        />
      </div>
    </SectionAnchor>
  );
}

// ── Section: Work ─────────────────────────────────────────────────────────

function WorkSection({
  data,
  dirty,
  saving,
  onField,
  onSave,
}: FormProfileSectionProps) {
  return (
    <SectionAnchor
      id={PROFILE_SECTION_IDS.work}
      title="Work"
      description="Where you work and what you do. Used by agents drafting emails, scheduling meetings, and filing paperwork on your behalf."
      icon={Building2}
      footer={<SaveBar dirty={dirty} saving={saving} onSave={onSave} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Company"
          placeholder="Your employer"
          value={data.company_name ?? ""}
          onChange={(v) => onField("company_name", v.length > 0 ? v : null)}
          autoComplete="organization"
        />
        <TextField
          label="Job title"
          placeholder="Your role"
          value={data.job_title ?? ""}
          onChange={(v) => onField("job_title", v.length > 0 ? v : null)}
          autoComplete="organization-title"
        />
      </div>
    </SectionAnchor>
  );
}

// ── Section: Emergency contacts ───────────────────────────────────────────

function EmergencySection({
  data,
  dirty,
  saving,
  onField,
  onSave,
}: FormProfileSectionProps) {
  return (
    <SectionAnchor
      id={PROFILE_SECTION_IDS.emergency}
      title="Emergency contacts"
      description="People to reach if something goes wrong. Visible only to you and never shared with other users."
      icon={ShieldAlert}
      footer={<SaveBar dirty={dirty} saving={saving} onSave={onSave} />}
    >
      <EmergencyContactListEditor
        value={data.emergency_contacts}
        onChange={(emergency_contacts) =>
          onField("emergency_contacts", emergency_contacts)
        }
      />
    </SectionAnchor>
  );
}

// ── Section: Account info (read-only) ─────────────────────────────────────

function AccountInfoSection() {
  const user = useAppSelector(selectUser);
  return (
    <SectionAnchor
      id={PROFILE_SECTION_IDS.account}
      title="Account information"
      description="Read-only details about your Matrx account."
      icon={Clock}
    >
      <div className="space-y-3 text-sm">
        <div>
          <div className="mb-0.5 text-xs font-medium text-muted-foreground">
            User ID
          </div>
          <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
            {user.id ?? "—"}
          </p>
        </div>
        <div>
          <div className="mb-0.5 text-xs font-medium text-muted-foreground">
            Last sign-in
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {user.lastSignInAt
                ? new Date(user.lastSignInAt).toLocaleString()
                : "Never"}
            </span>
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            Auth providers
          </div>
          <div className="flex flex-wrap gap-1.5">
            {user.appMetadata.providers?.length ? (
              user.appMetadata.providers.map((provider, idx) => {
                const style = PROVIDER_ICONS[provider.toLowerCase()] ?? {
                  icon: <UserIcon size={12} />,
                  color: "text-primary",
                };
                return (
                  <Badge key={idx} variant="outline" className="gap-1.5">
                    <span className={style.color}>{style.icon}</span>
                    <span className="capitalize">{provider}</span>
                  </Badge>
                );
              })
            ) : (
              <span className="text-xs text-muted-foreground">
                No linked providers.
              </span>
            )}
          </div>
        </div>
      </div>
    </SectionAnchor>
  );
}

// ── Shared section + save bar ─────────────────────────────────────────────

interface SectionAnchorProps {
  id: ProfileSectionId;
  title: string;
  description?: string;
  icon: LucideIcon;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

function SectionAnchor({
  id,
  title,
  description,
  icon: Icon,
  footer,
  children,
}: SectionAnchorProps) {
  // We render our own wrapper instead of SettingsSection here because we
  // need a stable DOM id on the outer <section> for deep-link scrolling,
  // and we want a footer slot for the per-section Save bar.
  const headerRef = useRef<HTMLDivElement>(null);
  return (
    <section
      id={id}
      className="scroll-mt-16 rounded-lg border border-border bg-card p-3 md:p-4"
    >
      <header
        ref={headerRef}
        className="mb-3 flex items-start justify-between gap-3"
      >
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description && (
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
      </header>
      <div>{children}</div>
      {footer && (
        <div className="mt-3 border-t border-border/40 pt-3">{footer}</div>
      )}
    </section>
  );
}

interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  onSave: () => Promise<boolean>;
  onReset?: () => Promise<void> | void;
}

function SaveBar({ dirty, saving, onSave, onReset }: SaveBarProps) {
  return (
    <div className="flex items-center justify-end gap-2 text-xs">
      {dirty && (
        <span className="mr-auto flex items-center gap-1 text-muted-foreground">
          <AlertTriangle className="h-3 w-3 text-warning" />
          Unsaved changes
        </span>
      )}
      {onReset && (
        <Button
          variant="ghost"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => void onReset()}
        >
          Discard
        </Button>
      )}
      <Button
        size="sm"
        disabled={!dirty || saving}
        onClick={() => void onSave()}
      >
        {saving ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            Saving…
          </>
        ) : dirty ? (
          "Save changes"
        ) : (
          "Saved"
        )}
      </Button>
    </div>
  );
}

// ── Small primitives ──────────────────────────────────────────────────────

interface DateFieldProps {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
}

function DateField({ label, value, onChange }: DateFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-8 w-fit min-w-44 rounded-md border border-border bg-card px-2.5 text-sm text-foreground shadow-sm transition-colors hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
        style={{ fontSize: "16px" }}
      />
    </label>
  );
}

interface ErrorPanelProps {
  title: string;
  message: string;
  onRetry: () => Promise<void> | void;
}

function ErrorPanel({ title, message, onRetry }: ErrorPanelProps) {
  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-destructive" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-destructive">
              {title}
            </div>
            <div className="mt-1 text-xs text-destructive/80">{message}</div>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={() => void onRetry()}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
