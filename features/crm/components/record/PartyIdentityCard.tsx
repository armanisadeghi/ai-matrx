"use client";

// features/crm/components/record/PartyIdentityCard.tsx
//
// Identity: the shared RecordForm in standard-table mode (`@ai-matrx/records-ui`
// StandardRecordForm). The row's own columns and the organization's custom fields
// are ONE form; each value is one write through `entity_row_write` as the person.
// Stage / Rating / Roles / Do-not-contact stay here as the form's children.

import { toast } from "@/lib/toast";
import { IdCard, PhoneOff, UserRound } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CategorySelect } from "@ai-matrx/associations/react";
import { CategoryTagPicker } from "@ai-matrx/associations/react";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useSurfaceWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
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
import { RecordsMount, StandardRecordForm, personActor, recordsDataSource } from "@ai-matrx/records-ui";
import type { StandardColumn } from "@ai-matrx/records-ui";
import { useCustomFieldsHost } from "@/features/unified-data/components/useCustomFieldsHost";
import { createClient } from "@/utils/supabase/client";

interface Props {
  party: PartyListRow;
  onChanged: () => Promise<void>;
}

interface FieldSpec extends StandardColumn {
  personOnly?: boolean;
  companyOnly?: boolean;
}

const FIELDS: FieldSpec[] = [
  { key: "display_name", label: "Name", required: true },
  { key: "first_name", label: "First name", personOnly: true },
  { key: "last_name", label: "Last name", personOnly: true },
  { key: "job_title", label: "Title", personOnly: true },
  { key: "headline", label: "Headline" },
  { key: "legal_name", label: "Legal name", companyOnly: true },
  { key: "primary_domain", label: "Domain", placeholder: "acme.com" },
  { key: "timezone", label: "Timezone", placeholder: "America/Los_Angeles" },
  { key: "date_of_birth", label: "Born", personOnly: true, placeholder: "1984-03-27" },
  { key: "tax_id", label: "Tax ID", companyOnly: true },
  { key: "bio", label: "Bio", multiline: true },
];

export function PartyIdentityCard({ party, onChanged }: Props) {
  const userId = useAppSelector(selectUserId);
  // "Contact" is the CRM's word for a party; own-table offer + dormant-aware agent door are the shared host's.
  const { custom: customHost, dialog: customDialog } = useCustomFieldsHost({
    entityToken: "party",
    organizationId: party.organization_id,
    entityLabel: "Contact",
  });
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
  const columns: StandardColumn[] = FIELDS.filter(
    (f) => !(f.personOnly && !isPerson) && !(f.companyOnly && isPerson),
  ).map((f) => ({
    key: f.key,
    label: f.label,
    ...(f.multiline ? { multiline: true } : {}),
    ...(f.placeholder ? { placeholder: f.placeholder } : {}),
    ...(f.required ? { required: true } : {}),
  }));

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
      <RecordsMount
        letTheStoreDecideRights
        config={{
          dataSource: recordsDataSource(createClient()),
          actor: personActor(userId),
          organizationId: party.organization_id,
        }}
      >
        <StandardRecordForm
          token="entity:party"
          recordId={party.id}
          columns={columns}
          onSaved={() => void onChanged()}
          custom={customHost}
        >
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
        </StandardRecordForm>
        {customDialog}
      </RecordsMount>
    </SectionCard>
  );
}
