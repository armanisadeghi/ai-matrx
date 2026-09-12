// app/(core)/print/admin/page.tsx
//
// Per-feature admin map for the Print hub. Renders via <FeatureAdminPage>
// (admin-gated, utilitarian). Keep printAdminMap in sync as sections are
// added — the drift warnings on the rendered page flag anything under
// app/(core)/print not enumerated there.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import { printAdminMap } from "@/features/print/admin/printAdminMap";

export default function PrintAdminPage() {
    return <FeatureAdminPage map={printAdminMap} />;
}
