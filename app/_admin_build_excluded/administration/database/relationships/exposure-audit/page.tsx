import { ExposureAuditClient } from "@/features/admin/relationships/components/ExposureAuditClient";

export const metadata = {
  title: "Exposure Audit | Matrx Admin",
};

export default function ExposureAuditPage() {
  return (
    <div className="h-full overflow-hidden p-4">
      <ExposureAuditClient />
    </div>
  );
}
