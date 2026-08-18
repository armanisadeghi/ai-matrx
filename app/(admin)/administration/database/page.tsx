import { DatabaseHubLanding } from "@/features/administration/database-hub/DatabaseHubLanding";

export const metadata = {
  title: "Database Tools Hub",
  description:
    "Unified database administration — SQL tools, legacy dashboard, canonicalization, and schema visualizers",
};

export default function DatabaseAdminPage() {
  return <DatabaseHubLanding />;
}
