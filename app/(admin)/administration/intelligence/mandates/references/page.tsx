import { MandateReferenceBoardView } from "@/features/mandates/admin/MandateReferenceBoardView";

export const metadata = {
  title: "Mandate references | Mandates | Administration",
  description:
    "Per repository: the last complete scan or unverified, open findings with location and remedy, and the conversion list.",
};

export default function MandateReferencesBoardPage() {
  return <MandateReferenceBoardView />;
}
