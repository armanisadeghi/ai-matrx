import { BattleSurfaceRuntime } from "@/features/agent-comparison/shared/BattleSurfaceRuntime";
import { SettingsBattlePage } from "@/features/agent-comparison/modes/settings/components/SettingsBattlePage";

export default function SettingsBattleRoute() {
  return (
    <BattleSurfaceRuntime>
      <SettingsBattlePage />
    </BattleSurfaceRuntime>
  );
}
