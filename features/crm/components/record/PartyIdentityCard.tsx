"use client";

// features/crm/components/record/PartyIdentityCard.tsx
//
// Identity key-value rows with click-to-edit. What you can see, you can
// change: each field commits one UPDATE on blur/Enter through updateParty.

import { useState } from "react";
import { toast } from "@/lib/toast";
import { IdCard, Pencil, PhoneOff, Plus, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CategorySelect } from "@ai-matrx/associations/react";
import { CategoryTagPicker } from "@ai-matrx/associations/react";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CRM_RECORD_SURFACE_NAME } from "@/features/surfaces/manifests/crm-record.manifest";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { useAssociations } from "@/features/scopes/hooks/useAssociations";
import { isUuidShape } from "@ai-matrx/kit/uuid";
import {
  allowPartyContact,
  blockPartyContact,
  updateParty,
} from "../../service";
import {
  EXPERT_STATUSES,
  type PartyListRow,
  type PartyUpdate,
} from "../../types";
import { parseIdentityFields } from "../../agent-context/crmRecordSurfaceWrite";
import { CrmRecordCopyButtons } from "./CrmRecordCopyButtons";
import {
  buildIdentityCopyView,
  formatIdentityCopy,
  identityAgentPayload,
  type CrmRecordCopyParent,
} from "./record-copy";
import { SectionCard } from "./SectionCard";
import { ProTextarea } from "@/components/official/ProTextarea";

interface Props {
  party: PartyListRow;
  onChanged: () => Promise<void>;
}

type EditableKey =
  | "display_name"
  | "first_name"
  | "last_name"
  | "job_title"
  | "headline"
  | "legal_name"
  | "primary_domain"
  | "timezone"
  | "bio";

interface FieldSpec {
  key: EditableKey;
  label: string;
  personOnly?: boolean;
  companyOnly?: boolean;
  multiline?: boolean;
  placeholder?: string;
}

const FIELDS: FieldSpec[] = [
  { key: "display_name", label: "Name" },
  { key: "first_name", label: "First name", personOnly: true },
  { key: "last_name", label: "Last name", personOnly: true },
  { key: "job_title", label: "Title", personOnly: true },
  { key: "headline", label: "Headline" },
  { key: "legal_name", label: "Legal name", companyOnly: true },
  { key: "primary_domain", label: "Domain", placeholder: "acme.com" },
  { key: "timezone", label: "Timezone", placeholder: "America/Los_Angeles" },
  { key: "bio", label: "Bio", multiline: true },
];

function InlineField({
  spec,
  value,
  onCommit,
  startEditing = false,
  onLeftEmpty,
}: {
  spec: FieldSpec;
  value: string | null;
  onCommit: (next: string | null) => Promise<void>;
  /** Opened from "Add details": start in the editor. */
  startEditing?: boolean;
  /** Closed with nothing typed — the row folds back into "Add details". */
  onLeftEmpty?: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const start = () => {
    setDraft(value ?? "");
    setEditing(true);
  };

  const commit = async () => {
    const next = draft.trim() || null;
    setEditing(false);
    if (next === null && !value) onLeftEmpty?.();
    if (next === (value ?? null)) return;
    setSaving(true);
    try {
      await onCommit(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const inputClasses =
    "min-h-11 w-full min-w-0 flex-1 rounded border border-primary/40 bg-background px-1.5 py-0.5 text-base text-foreground outline-none focus:border-primary sm:min-h-0 sm:text-sm";

  return (
    // Label and value INLINE at every width for short fields (phone: an 80px
    // label column; desktop: the dense 96px right-aligned column). Stacking
    // label over value made the phone card ~450px tall and pushed Contact
    // points off the first screen (page-pass 2026-09-28). A multiline field
    // (Bio) still stacks on a phone — it needs the width.
    <div
      className={cn(
        "flex gap-2 py-0.5 sm:flex-row sm:items-start",
        spec.multiline ? "max-sm:flex-col max-sm:gap-0.5" : "items-center",
      )}
    >
      <span className="w-20 shrink-0 text-xs text-muted-foreground sm:w-24 sm:pt-0.5 sm:text-right">
        {spec.label}
      </span>
      {editing ? (
        spec.multiline ? (
          <ProTextarea
            autoFocus
            surfaceName={CRM_RECORD_SURFACE_NAME}
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditing(false);
                if (!value) onLeftEmpty?.();
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void commit();
            }}
            className={inputClasses}
          />
        ) : (
          // Bare input on purpose: this is a click-to-edit cell that commits on
          // blur, and ProInput's mic / "…" controls take focus from the field —
          // pressing them would blur, commit and close the editor mid-dictation.
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") {
                setEditing(false);
                if (!value) onLeftEmpty?.();
              }
            }}
            placeholder={spec.placeholder}
            className={inputClasses}
          />
        )
      ) : (
        <button
          type="button"
          onClick={start}
          className={cn(
            "group/field flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded px-0 py-0 text-left text-sm hover:bg-accent/50 sm:min-h-0 sm:items-start sm:px-1.5 sm:py-0.5",
            value ? "text-foreground" : "text-muted-foreground/60",
            saving && "opacity-60",
          )}
          title={`Edit ${spec.label.toLowerCase()}`}
          aria-label={`Edit ${spec.label.toLowerCase()}: ${value || "empty"}`}
        >
          <span
            className={cn(
              "min-w-0 flex-1",
              spec.multiline ? "whitespace-pre-wrap" : "truncate",
            )}
          >
            {value || "—"}
          </span>
          {/* Says the field is editable: always on touch, on hover with a
              mouse — never a mystery which values can be changed. */}
          <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover/field:opacity-100 pointer-coarse:opacity-100" />
        </button>
      )}
    </div>
  );
}

export function PartyIdentityCard({ party, onChanged }: Props) {
  const userId = useAppSelector(selectUserId);
  const { categories: lifecycleStages } = useCategories({
    dimension: CATEGORY_DIMENSIONS.crmLifecycleStage,
  });
  const { categories: ratings } = useCategories({
    dimension: CATEGORY_DIMENSIONS.crmRating,
  });
  const { categories: roleCategories } = useCategories({
    dimension: CATEGORY_DIMENSIONS.partyRole,
  });
  const { edges, setTargets } = useAssociations({
    type: "party",
    id: party.id,
  });
  const isPerson = party.party_kind === "person";
  const fields = FIELDS.filter(
    (f) => !(f.personOnly && !isPerson) && !(f.companyOnly && isPerson),
  );
  // EMPTY IS COMPACT: a thin record shows its name and what it actually has,
  // never a wall of "—" rows. Empty fields wait behind ONE "Add details" menu;
  // picking one opens that field's editor in place.
  const [opened, setOpened] = useState<EditableKey[]>([]);
  const shownFields = fields.filter(
    (f) =>
      f.key === "display_name" ||
      Boolean(party[f.key]) ||
      opened.includes(f.key),
  );
  const emptyFields = fields.filter((f) => !shownFields.includes(f));

  const commitField = async (key: EditableKey, next: string | null) => {
    const patch: PartyUpdate = { [key]: next };
    // display_name is NOT NULL — an emptied name keeps the old one.
    if (key === "display_name" && !next) {
      toast.error("Name cannot be empty");
      return;
    }
    await updateParty(party.id, patch);
    await onChanged();
  };

  // Stage + rating are FK columns on crm.party; roles are party → category
  // association edges (role 'member') — the split FEATURE.md mandates.
  const commitCategoryFk = async (
    key: "lifecycle_stage_id" | "rating_id",
    next: string | null,
  ) => {
    try {
      await updateParty(party.id, { [key]: next });
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  /**
   * Flag / UNFLAG do-not-contact. Lifting it goes through `allowPartyContact`
   * so the timeline records who re-opened the record — a suppression a rep can
   * undo silently is how a mis-click becomes an argument later.
   *
   * Either direction only moves the PARTY stance: a phone or email suppressed
   * on the value itself stays blocked until it is lifted in Contact, which is
   * where that value's state is shown.
   */
  const setDoNotContact = async (next: boolean) => {
    if (!userId) {
      throw new Error(
        "Sign in again — the audit trail needs to name who changed it.",
      );
    }
    if (next) {
      await blockPartyContact({
        partyId: party.id,
        orgId: party.organization_id,
        userId,
        reason: party.do_not_contact_reason,
      });
    } else {
      await allowPartyContact({
        partyId: party.id,
        orgId: party.organization_id,
        userId,
      });
    }
    await onChanged();
  };

  const toggleDnc = async (next: boolean) => {
    try {
      await setDoNotContact(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  useSurfaceWriteHandlers(CRM_RECORD_SURFACE_NAME, {
    identity_fields: async (value: unknown) => {
      await updateParty(party.id, parseIdentityFields(value));
      await onChanged();
    },
    lifecycle_stage_id: async (value: unknown) => {
      if (value !== null && !isUuidShape(value)) {
        throw new Error("lifecycle_stage_id expects a category UUID or null.");
      }
      if (
        value !== null &&
        !lifecycleStages.some((category) => category.id === value)
      ) {
        throw new Error(
          "lifecycle_stage_id is not a lifecycle stage available on this page.",
        );
      }
      await updateParty(party.id, { lifecycle_stage_id: value });
      await onChanged();
    },
    rating_id: async (value: unknown) => {
      if (value !== null && !isUuidShape(value)) {
        throw new Error("rating_id expects a category UUID or null.");
      }
      if (
        value !== null &&
        !ratings.some((category) => category.id === value)
      ) {
        throw new Error("rating_id is not a rating available on this page.");
      }
      await updateParty(party.id, { rating_id: value });
      await onChanged();
    },
    party_role_ids: async (value: unknown) => {
      if (!Array.isArray(value) || !value.every(isUuidShape)) {
        throw new Error("party_role_ids expects an array of category UUIDs.");
      }
      const unknownRole = value.find(
        (id) => !roleCategories.some((category) => category.id === id),
      );
      if (unknownRole) {
        throw new Error(
          `party_role_ids includes ${unknownRole}, which is not a role available on this page.`,
        );
      }
      const roleCategoryIds = new Set(
        roleCategories.map((category) => category.id),
      );
      const preservedOtherCategoryIds = edges
        .filter(
          (edge) =>
            edge.direction === "outgoing" &&
            edge.otherType === "category" &&
            edge.role === "member" &&
            !roleCategoryIds.has(edge.otherId),
        )
        .map((edge) => edge.otherId);
      const result = await setTargets({
        targetType: "category",
        targetIds: [...preservedOtherCategoryIds, ...value],
        orgId: party.organization_id,
        role: "member",
      });
      if (!result.ok) throw new Error(result.error);
      await onChanged();
    },
    expert_status: async (value: unknown) => {
      const status =
        value === null
          ? null
          : EXPERT_STATUSES.find((candidate) => candidate === value);
      if (value !== null && !status) {
        throw new Error(
          `expert_status expects ${EXPERT_STATUSES.join(" | ")}, or null.`,
        );
      }
      await updateParty(party.id, { expert_status: status ?? null });
      await onChanged();
    },
    do_not_contact: async (value: unknown) => {
      if (typeof value !== "boolean") {
        throw new Error("do_not_contact expects a boolean.");
      }
      await setDoNotContact(value);
    },
  });

  const copyParent: CrmRecordCopyParent = {
    type: "party",
    id: party.id,
    label: party.display_name,
  };
  const identityCopyView = buildIdentityCopyView({
    party,
    lifecycleStage:
      lifecycleStages.find(
        (category) => category.id === party.lifecycle_stage_id,
      ) ?? null,
    rating: ratings.find((category) => category.id === party.rating_id) ?? null,
    roles: roleCategories
      .filter((category) =>
        edges.some(
          (edge) =>
            edge.direction === "outgoing" &&
            edge.otherType === "category" &&
            edge.role === "member" &&
            edge.otherId === category.id,
        ),
      )
      .map((category) => ({ id: category.id, name: category.name })),
  });

  return (
    <SectionCard
      title="Identity"
      Icon={IdCard}
      compactAction
      action={
        <CrmRecordCopyButtons
          label={`${party.display_name} identity`}
          human={() => formatIdentityCopy(identityCopyView)}
          agent={() => identityAgentPayload(copyParent, identityCopyView)}
          json={() => identityCopyView}
        />
      }
    >
      <div className="space-y-0">
        {shownFields.map((spec) => (
          <InlineField
            key={spec.key}
            spec={spec}
            value={party[spec.key]}
            onCommit={(next) => commitField(spec.key, next)}
            startEditing={opened.includes(spec.key) && !party[spec.key]}
            onLeftEmpty={() =>
              setOpened((keys) => keys.filter((key) => key !== spec.key))
            }
          />
        ))}
        {emptyFields.length > 0 && (
          <div className="flex items-center gap-2 py-0.5">
            <span className="w-20 shrink-0 sm:w-24" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-1.5 text-xs text-muted-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add details
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {emptyFields.map((spec) => (
                  <DropdownMenuItem
                    key={spec.key}
                    onSelect={() => setOpened((keys) => [...keys, spec.key])}
                  >
                    {spec.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Classification — the CRM stance on this record. */}
        <div className="mt-1.5 space-y-1.5 border-t border-border pt-2">
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-muted-foreground sm:w-24 sm:text-right">
              Stage
            </span>
            <div className="min-w-0 flex-1">
              <CategorySelect
                dimension={CATEGORY_DIMENSIONS.crmLifecycleStage}
                value={party.lifecycle_stage_id}
                orgId={party.organization_id}
                onChange={(id) =>
                  void commitCategoryFk("lifecycle_stage_id", id)
                }
                placeholder="Set stage"
                noun="stage"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-muted-foreground sm:w-24 sm:text-right">
              Rating
            </span>
            <div className="min-w-0 flex-1">
              <CategorySelect
                dimension={CATEGORY_DIMENSIONS.crmRating}
                value={party.rating_id}
                orgId={party.organization_id}
                onChange={(id) => void commitCategoryFk("rating_id", id)}
                placeholder="Set rating"
                noun="rating"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-muted-foreground sm:w-24 sm:text-right">
              Roles
            </span>
            <div className="min-w-0 flex-1">
              <CategoryTagPicker
                entityType="party"
                entityId={party.id}
                dimension={CATEGORY_DIMENSIONS.partyRole}
                edgeRole="member"
                orgId={party.organization_id}
                addLabel="Add role"
                icon={UserRound}
                emptyText="No roles defined."
              />
            </div>
          </div>
        </div>

        <label className="matrx-tap-area mt-1.5 flex min-h-11 cursor-pointer items-center gap-2 border-t border-border pt-2 sm:min-h-0">
          <PhoneOff
            className={cn(
              "h-3.5 w-3.5",
              party.do_not_contact
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          />
          <span className="text-xs text-foreground">Do not contact</span>
          <div className="ml-auto">
            <Switch
              checked={party.do_not_contact}
              onCheckedChange={(v) => void toggleDnc(v)}
              aria-label="Do not contact"
              // The 44px target is the whole row — this <label> — per the
              // matrx-tap-area contract; the painted switch stays switch-sized.
              data-touch-exempt=""
            />
          </div>
        </label>
      </div>
    </SectionCard>
  );
}
