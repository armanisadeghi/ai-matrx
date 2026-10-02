import { AdminDomainLanding } from "@/features/admin/components/AdminDomainLanding";
import { StaticSurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/StaticSurfaceRuntimeProvider";
import { ADMIN_UTILITIES_SURFACE_NAME, createAdminUtilitiesScope } from "@/features/surfaces/manifests/admin-utilities.manifest";

export default function UtilitiesAdministrationPage() {
  return <StaticSurfaceRuntimeProvider surfaceName={ADMIN_UTILITIES_SURFACE_NAME} scope={createAdminUtilitiesScope({ utilities_section: "hub" })}><AdminDomainLanding domainSlug="utilities" /></StaticSurfaceRuntimeProvider>;
}
