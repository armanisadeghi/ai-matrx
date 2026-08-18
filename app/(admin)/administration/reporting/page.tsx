import { AdminDomainDirectory } from "@/features/admin/components/AdminDomainDirectory";
import { StaticSurfaceRuntimeProvider } from "@/features/surfaces/runtime/StaticSurfaceRuntimeProvider";
import { ADMIN_REPORTING_SURFACE_NAME, createAdminReportingScope } from "@/features/surfaces/manifests/admin-reporting.manifest";

export default function ReportingAdministrationPage() {
  return <StaticSurfaceRuntimeProvider surfaceName={ADMIN_REPORTING_SURFACE_NAME} scope={createAdminReportingScope({ reporting_section: "hub" })}><AdminDomainDirectory domainSlug="reporting" /></StaticSurfaceRuntimeProvider>;
}
