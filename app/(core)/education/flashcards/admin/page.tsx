// app/(core)/education/flashcards/admin/page.tsx
//
// Per-feature admin map for the Flashcards tool. Renders via <FeatureAdminPage>
// (admin-gated, utilitarian). Keep flashcardsAdminMap in sync as routes /
// components are added — the drift warnings on the rendered page flag anything
// under app/(core)/education/flashcards not enumerated there.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import { flashcardsAdminMap } from "@/features/flashcards/admin/flashcardsAdminMap";

export default function FlashcardsAdminPage() {
  return <FeatureAdminPage map={flashcardsAdminMap} />;
}
