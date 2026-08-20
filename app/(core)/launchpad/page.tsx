import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderIconTitle from "@/features/shell/components/header/variants/variants/HeaderIconTitle";
import UserLaunchpad from "@/features/launchpad/components/UserLaunchpad";

export default function LaunchpadPage() {
  return (
    <>
      <PageHeader>
        <HeaderIconTitle icon="Rocket" title="Launchpad" />
      </PageHeader>
      <UserLaunchpad />
    </>
  );
}
