import { TapTargetButtonGroup } from "@ai-matrx/design-system/tap-target";
import {
  BellTapButton,
  PlusTapButton,
  ArrowDownUpTapButton,
  MaximizeTapButton,
  SettingsTapButton,
  SearchTapButton,
  UploadTapButton,
  UndoTapButton,
  RedoTapButton,
  CopyTapButton,
  TrashTapButton,
} from "@ai-matrx/design-system/tap-target/buttons";

export default function ButtonRow() {
  return (
    <div className="flex items-center">
      <BellTapButton />

      <TapTargetButtonGroup>
        <PlusTapButton variant="group" />
        <ArrowDownUpTapButton variant="group" />
        <MaximizeTapButton variant="group" />
        <SettingsTapButton variant="group" />
        <SearchTapButton variant="group" />
      </TapTargetButtonGroup>

      <UploadTapButton />

      <TapTargetButtonGroup>
        <UndoTapButton variant="group" />
        <RedoTapButton variant="group" />
        <CopyTapButton variant="group" />
        <TrashTapButton variant="group" />
      </TapTargetButtonGroup>
    </div>
  );
}
