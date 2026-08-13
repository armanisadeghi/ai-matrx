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
