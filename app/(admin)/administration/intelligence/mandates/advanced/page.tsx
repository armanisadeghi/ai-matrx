import { AdvancedMandateCrud } from "@/features/mandates/admin/advanced/AdvancedMandateCrud";

export const metadata = {
  title: "Mandate storage — advanced",
  description:
    "Raw rows of mandate.definition / binding / provision / treatment, the shortcut compat view, and app.definition, with full CRUD.",
};

export default function AdvancedMandateStoragePage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)]">
      <AdvancedMandateCrud />
    </div>
  );
}
