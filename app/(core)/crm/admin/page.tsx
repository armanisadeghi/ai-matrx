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
        "Scoped, server-paginated manager for people and companies with search, filters, sorting, create actions, saved smart views (?view=<id> opens one), and bulk work-queue actions (outreach list, do-not-contact, allow contact, delete).",
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
      url: "/crm/outreach-lists",
      label: "Outreach Lists",
      description:
        "Outreach list console: create list/email/call outreach lists, lifecycle controls, member counts.",
      filePath: "app/(core)/crm/outreach-lists/page.tsx",
      status: "Live",
    },
    {
      url: "/crm/outreach-lists/[listId]",
      label: "Outreach list workspace",
      description:
        "One list: status rollup chips, server-paged member roster, enrollment from a filter or a saved smart view (with provenance back to the view that filled it), lifecycle actions.",
      filePath: "app/(core)/crm/outreach-lists/[listId]/page.tsx",
      status: "Live",
    },
    {
      url: "/crm/outreach-lists/[listId]/dial",
      label: "Call queue (power dialer)",
      description:
        "Claim-locked power dialer: next member, DNC/suppression-checked dial targets, call logging to crm.interaction, dispositions with retry windows.",
      filePath: "app/(core)/crm/outreach-lists/[listId]/dial/page.tsx",
      status: "Live",
    },
    {
      url: "/crm/sending-identities",
      label: "Sending mailboxes",
      description:
        "THE RIGHT TO SEND: the mailboxes this org may send outreach from. Connect a mailbox, prove domain ownership by DNS, verify SPF/DKIM/DMARC, warm up, watch health. Backed by aidream /sending-identities (server-side DNS + OAuth mailbox work the browser cannot do). Includes the per-org emergency stop.",
      filePath: "app/(core)/crm/sending-identities/page.tsx",
      status: "Live",
    },
    {
      url: "/crm/sending-identities/[identityId]",
      label: "Sending mailbox detail",
      description:
        "One mailbox: every blocking problem beside its one-click fix, the copy-and-paste DNS proof record, SPF/DKIM/DMARC verdicts, the 28-day warm-up ramp, rolling deliverability health, sending limits, and the full send/bounce/complaint audit trail.",
      filePath: "app/(core)/crm/sending-identities/[identityId]/page.tsx",
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
      name: "ExpertStatusCard",
      filePath: "features/crm/components/record/ExpertStatusCard.tsx",
      description:
        "Record-page expert surface: the registered/approved/vetted ladder, the research confidence that proposed it, and a door to every topic this person is an expert for. Renders nothing for a non-expert.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "SavedViewBar",
      filePath: "features/crm/components/saved-views/SavedViewBar.tsx",
      description:
        "Smart-view bar on the CRM list: chips over crm.saved_view, applied through the same setters the human controls call, with dirty detection, update/rename/share/delete, and /crm?view=<id> as a linkable destination.",
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
      name: "OutreachListsPage / OutreachListDetailPage / CallQueuePage",
      filePath: "features/crm/components/outreach-lists/",
      description:
        "Outreach list console, outreach list workspace, and the claim-locked power dialer plus the enrollment dialogs (AddMembersDialog by filter, AddToOutreachListDialog from list selection). Data layer in features/crm/outreach-lists/.",
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
