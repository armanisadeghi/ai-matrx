import PageHeader from "@/features/shell/components/header/PageHeader";
import { SettingsBattlePage } from "@/features/agent-comparison/modes/settings/components/SettingsBattlePage";

export const metadata = { title: "Settings Battle | AI Matrx" };

export default function SettingsBattleRoute() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-medium">Settings Battle</span>
        </div>
      </PageHeader>
      <SettingsBattlePage />
    </>
  );
}
