import { SearchToolbar, SearchGroup, SearchGroupTrigger } from "./SearchToolbar";
import {
  ChevronLeftTapButton,
  FilterTapButton,
  ArrowDownUpTapButton,
  PlusTapButton,
  MenuTapButton,
  SettingsTapButton,
  MaximizeTapButton,
} from "@ai-matrx/tap-target/buttons";

// ---------------------------------------------------------------------------
// Ready-to-use toolbar presets — server components.
// ---------------------------------------------------------------------------

/** ( < ) ( Filter ) ( Sort ) ( Search→input ) ( + ) — responsive */
export function MobileFilterBar({
  id,
  placeholder,
}: {
  id?: string;
  placeholder?: string;
}) {
  return (
    <SearchToolbar
      id={id}
      placeholder={placeholder ?? "Search..."}
      left={
        <>
          <ChevronLeftTapButton variant="transparent" />
          <FilterTapButton variant="transparent" />
          <ArrowDownUpTapButton variant="transparent" />
        </>
      }
      right={<PlusTapButton variant="transparent" />}
    />
  );
}

/** ( Menu ) ( Filter ) ( Settings ) ( Maximize ) ( Search→input ) ( + ) — inline */
export function DesktopToolbar({
  id,
  placeholder,
}: {
  id?: string;
  placeholder?: string;
}) {
  return (
    <SearchToolbar
      id={id}
      mode="inline"
      spread={false}
      placeholder={placeholder ?? "Search..."}
      left={
        <>
          <MenuTapButton />
          <FilterTapButton />
          <SettingsTapButton />
          <MaximizeTapButton />
        </>
      }
      right={<PlusTapButton />}
    />
  );
}

/** ( Search→input ) ( + ) — full-width expand */
export function MinimalSearchBar({
  id,
  placeholder,
}: {
  id?: string;
  placeholder?: string;
}) {
  return (
    <SearchToolbar
      id={id}
      mode="full-width"
      placeholder={placeholder ?? "Search..."}
      right={<PlusTapButton variant="transparent" />}
    />
  );
}

// ---------------------------------------------------------------------------
// Group presets — glass pill, zero layout shift on search expand.
// ---------------------------------------------------------------------------

/** Group pill: [ Filter | Sort | Search | Settings ] — search replaces all icons */
export function FilterSearchGroup({
  id = "fsg",
  placeholder,
}: {
  id?: string;
  placeholder?: string;
}) {
  return (
    <SearchGroup id={id} placeholder={placeholder ?? "Search..."}>
      <FilterTapButton variant="group" />
      <ArrowDownUpTapButton variant="group" />
      <SearchGroupTrigger id={id} />
      <SettingsTapButton variant="group" />
    </SearchGroup>
  );
}

/** Group pill: [ Filter | Sort | Search | Maximize | Settings ] */
export function ToolsSearchGroup({
  id = "tsg",
  placeholder,
}: {
  id?: string;
  placeholder?: string;
}) {
  return (
    <SearchGroup id={id} placeholder={placeholder ?? "Search..."}>
      <FilterTapButton variant="group" />
      <ArrowDownUpTapButton variant="group" />
      <SearchGroupTrigger id={id} />
      <MaximizeTapButton variant="group" />
      <SettingsTapButton variant="group" />
    </SearchGroup>
  );
}
