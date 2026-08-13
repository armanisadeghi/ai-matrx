import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const CRM_ADMIN_MAP: FeatureAdminMap = {
  name: "CRM",
  slug: "crm",
  description:
    "The canonical people-and-companies workspace. CRM records use crm.party; email and phone values use the shared contact-medium and party-contact-point model.",
  docs: [{ label: "CRM FEATURE.md", href: "/features/crm/FEATURE.md" }],
  routeScanPath: "app/(core)/crm",
  routes: [
    {
      url: "/crm",
      label: "People & Companies",
      description:
        "Scoped, server-paginated manager for people and companies with search, filters, sorting, and create actions.",
      filePath: "app/(core)/crm/page.tsx",
      status: "Live",
    },
    {
      url: "/crm/[partyId]",
      label: "CRM record",
      description:
        "The 360-degree person or company record with contact methods, affiliations, activity, notes, files, and tasks.",
      filePath: "app/(core)/crm/[partyId]/page.tsx",
      status: "Live",
    },
    {
      url: "/crm/import",
      label: "CSV import",
      description:
        "Import wizard: source file, column mapping, dedup dry-run preview, then commit through the canonical service (mediums, contact points, affiliations).",
      filePath: "app/(core)/crm/import/page.tsx",
      status: "Live",
    },
    {
      url: "/crm/duplicates",
      label: "Duplicates review",
      description:
        "Merge review queue: scan (auto-merges identity-key collisions via crm_detect_merge_candidates), side-by-side pair comparison, merge/dismiss, and exact unmerge of recent merges.",
      filePath: "app/(core)/crm/duplicates/page.tsx",
      status: "Live",
    },
    {
      url: "/crm/campaigns",
      label: "Campaigns",
      description:
        "Campaign console: create list/email/call campaigns, lifecycle controls, member counts.",
      filePath: "app/(core)/crm/campaigns/page.tsx",
      status: "Live",
    },
    {
      url: "/crm/campaigns/[campaignId]",
      label: "Campaign workspace",
      description:
        "One campaign: status rollup chips, server-paged member roster, enrollment from filters, lifecycle actions.",
      filePath: "app/(core)/crm/campaigns/[campaignId]/page.tsx",
      status: "Live",
    },
    {
      url: "/crm/campaigns/[campaignId]/dial",
      label: "Call queue (power dialer)",
      description:
        "Claim-locked power dialer: next member, DNC/suppression-checked dial targets, call logging to crm.interaction, dispositions with retry windows.",
      filePath: "app/(core)/crm/campaigns/[campaignId]/dial/page.tsx",
      status: "Live",
    },
    {
      url: "/crm/admin",
      label: "CRM feature map",
      description:
        "Super-admin inventory of CRM routes, WindowPanels, and canonical components.",
      filePath: "app/(core)/crm/admin/page.tsx",
      status: "Live",
    },
  ],
  windowPanels: [
    {
      overlayId: "crmManagerWindow",
      description: "Floating version of the complete scoped CRM manager route.",
      status: "Live",
    },
    {
      overlayId: "crmCreatePartyWindow",
      description:
        "Compact create flow for a person or company plus optional email and phone contact methods.",
      status: "Live",
    },
  ],
  components: [
    {
      name: "CrmListPage",
      filePath: "features/crm/components/CrmListPage.tsx",
      description:
        "Shared route/window CRM list core built from the canonical entity-list primitives.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "PartyCreateForm",
      filePath: "features/crm/components/PartyCreateForm.tsx",
      description:
        "Shared party-capture core that writes records and normalized contact methods through the CRM service.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "PartyRecordPage",
      filePath: "features/crm/components/record/PartyRecordPage.tsx",
      description: "Person/company detail workspace and relationship history.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "DuplicateReviewPage",
      filePath: "features/crm/components/dedup/DuplicateReviewPage.tsx",
      description:
        "Merge review queue over crm.merge_candidate + the crm_merge_parties / crm_unmerge_parties RPCs; CandidatePairCard renders each side-by-side comparison.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "MergeStatusCard",
      filePath: "features/crm/components/dedup/MergeStatusCard.tsx",
      description:
        "Record-page dedup surface: merged-into banner, duplicate suggestions, absorbed merges with exact undo.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "CampaignListPage / CampaignDetailPage / CallQueuePage",
      filePath: "features/crm/components/campaigns/",
      description:
        "Campaign console, campaign workspace, and the claim-locked power dialer plus the enrollment dialogs (AddMembersDialog by filter, AddToCampaignDialog from list selection). Data layer in features/crm/campaigns/.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "ImportWizard",
      filePath: "features/crm/components/import/ImportWizard.tsx",
      description:
        "CSV import steps (source, mapping, dry-run preview, results) over the engine in features/crm/import/.",
      tier: "internal",
      status: "Live",
    },
  ],
};

export default function CrmAdminPage() {
  return <FeatureAdminPage map={CRM_ADMIN_MAP} />;
}
