import { TapTargetButtonGroup } from "@ai-matrx/tap-target";
import {
  PlusTapButton,
  ArrowDownUpTapButton,
  MaximizeTapButton,
  SettingsTapButton,
  SearchTapButton,
} from "@ai-matrx/tap-target/buttons";

export default function AddFilterSearchRow() {
  return (
    <div className="flex items-center">
      <PlusTapButton />

      <TapTargetButtonGroup>
        <ArrowDownUpTapButton variant="group" />
        <MaximizeTapButton variant="group" />
        <SettingsTapButton variant="group" />
      </TapTargetButtonGroup>

      <SearchTapButton />
    </div>
  );
}
