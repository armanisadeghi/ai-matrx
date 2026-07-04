// Kind Registry — browse/search every registered kind (compiled system kinds
// + flexible_data Block Schemas), inspect the reference graph, and export a
// provider-ready JSON Schema with referenced kinds resolved into $defs.
// Super-admin gated by the (admin) layout.

import type { Metadata } from "next";
import KindRegistryAdminClient from "@/features/content-ir/admin/KindRegistryAdminClient";

export const metadata: Metadata = {
  title: "Kind Registry",
  description:
    "Browse every content-ir kind and export provider-ready JSON Schemas.",
};

export default function KindRegistryPage() {
  return <KindRegistryAdminClient />;
}
