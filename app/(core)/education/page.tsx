// /education — the Education Hub home (list/savior view, never a dead end).
// Server component; all rendering happens in EducationHub (server) so the page
// shell is instant and any future client islands hydrate in place.
import { EducationHub } from "@/features/education/components/landing/EducationHub";

export default function EducationPage() {
  return <EducationHub />;
}
