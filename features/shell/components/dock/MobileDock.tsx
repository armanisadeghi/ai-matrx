// MobileDock — Default shell dock. Pure Server Component.
// Active state driven by CSS via .shell-root[data-pathname] + data-nav-href.

import MobileDockShell from "./MobileDockShell";
import MobileDockItems from "./MobileDockItems";
import MobileDockVoiceButton from "./MobileDockVoiceButton";

export default function MobileDock({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  return (
    <MobileDockShell>
      <MobileDockItems isAuthenticated={isAuthenticated} />
      <MobileDockVoiceButton />
    </MobileDockShell>
  );
}
