import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import UserLaunchpad from "@/features/launchpad/components/UserLaunchpad";

export default function LaunchpadPage() {
  return (
    <>
      <RecordPageHeader record={{ name: "Launchpad" }} />
      <UserLaunchpad />
    </>
  );
}
