// record-view: none — an admin list of the switch's presses
import { SwitchPressHistory } from "@/features/administration/switch-presses/SwitchPressHistory";

export const metadata = {
  title: "Switch Presses",
  description: "Every press of the old-to-new switches, newest first",
};

export default function SwitchPressesPage() {
  return <SwitchPressHistory />;
}