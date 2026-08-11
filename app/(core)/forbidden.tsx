// app/(core)/forbidden.tsx — the `forbidden()` boundary inside the AppShell.
//
// (core) routes render under the shell's sidebar + transparent header, so this
// boundary keeps the user in the app rather than dropping them onto a bare
// page. Body wrapper is `h-full overflow-hidden` per the shell contract —
// `.shell-main` is already full viewport.
import { ForbiddenSurface } from "@/features/access-gate/components/ForbiddenSurface";

export default function CoreForbidden() {
  return (
    <div className="h-full overflow-hidden">
      <ForbiddenSurface />
    </div>
  );
}
