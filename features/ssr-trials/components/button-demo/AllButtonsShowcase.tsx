import { TapTargetButtonGroup } from "@ai-matrx/tap-target";
import {
  MenuTapButton,
  PlusTapButton,
  SearchTapButton,
  SettingsTapButton,
  MaximizeTapButton,
  ArrowDownUpTapButton,
  BellTapButton,
  UploadTapButton,
  UndoTapButton,
  RedoTapButton,
  CopyTapButton,
  TrashTapButton,
  ChevronLeftTapButton,
  PanelLeftTapButton,
  PanelRightTapButton,
  SquarePenTapButton,
  FilterTapButton,
  XTapButton,
} from "@ai-matrx/tap-target/buttons";
import {
  SearchToolbar,
  SearchGroup,
  SearchGroupTrigger,
} from "@/components/icons/SearchToolbar";
import {
  MobileFilterBar,
  DesktopToolbar,
  MinimalSearchBar,
  FilterSearchGroup,
  ToolsSearchGroup,
} from "@/components/icons/search-toolbar-presets";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[0.5625rem] text-muted-foreground text-center leading-tight mt-0.5">
      {children}
    </span>
  );
}

export default function AllButtonsShowcase() {
  return (
    <div className="flex flex-col gap-6">
      {/* Row 1 — All icons as standalone glass buttons with labels */}
      <div>
        <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
          All Icons — Glass (default)
        </p>
        <div className="flex flex-wrap items-start gap-x-0">
          <div className="flex flex-col items-center">
            <MenuTapButton />
            <Label>Menu</Label>
          </div>
          <div className="flex flex-col items-center">
            <PlusTapButton />
            <Label>Plus</Label>
          </div>
          <div className="flex flex-col items-center">
            <SearchTapButton />
            <Label>Search</Label>
          </div>
          <div className="flex flex-col items-center">
            <SettingsTapButton />
            <Label>Settings</Label>
          </div>
          <div className="flex flex-col items-center">
            <MaximizeTapButton />
            <Label>Maximize</Label>
          </div>
          <div className="flex flex-col items-center">
            <ArrowDownUpTapButton />
            <Label>Sort</Label>
          </div>
          <div className="flex flex-col items-center">
            <BellTapButton />
            <Label>Bell</Label>
          </div>
          <div className="flex flex-col items-center">
            <UploadTapButton />
            <Label>Upload</Label>
          </div>
          <div className="flex flex-col items-center">
            <UndoTapButton />
            <Label>Undo</Label>
          </div>
          <div className="flex flex-col items-center">
            <RedoTapButton />
            <Label>Redo</Label>
          </div>
          <div className="flex flex-col items-center">
            <CopyTapButton />
            <Label>Copy</Label>
          </div>
          <div className="flex flex-col items-center">
            <TrashTapButton />
            <Label>Trash</Label>
          </div>
          <div className="flex flex-col items-center">
            <ChevronLeftTapButton />
            <Label>ChevLeft</Label>
          </div>
          <div className="flex flex-col items-center">
            <PanelLeftTapButton />
            <Label>PanelL</Label>
          </div>
          <div className="flex flex-col items-center">
            <PanelRightTapButton />
            <Label>PanelR</Label>
          </div>
          <div className="flex flex-col items-center">
            <SquarePenTapButton />
            <Label>SqPen</Label>
          </div>
        </div>
      </div>

      {/* Row 2 — Transparent variant */}
      <div>
        <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
          All Icons — Transparent
        </p>
        <div className="flex flex-wrap items-start gap-x-0">
          <div className="flex flex-col items-center">
            <MenuTapButton variant="transparent" />
            <Label>Menu</Label>
          </div>
          <div className="flex flex-col items-center">
            <PlusTapButton variant="transparent" />
            <Label>Plus</Label>
          </div>
          <div className="flex flex-col items-center">
            <SearchTapButton variant="transparent" />
            <Label>Search</Label>
          </div>
          <div className="flex flex-col items-center">
            <SettingsTapButton variant="transparent" />
            <Label>Settings</Label>
          </div>
          <div className="flex flex-col items-center">
            <MaximizeTapButton variant="transparent" />
            <Label>Maximize</Label>
          </div>
          <div className="flex flex-col items-center">
            <ArrowDownUpTapButton variant="transparent" />
            <Label>Sort</Label>
          </div>
          <div className="flex flex-col items-center">
            <BellTapButton variant="transparent" />
            <Label>Bell</Label>
          </div>
          <div className="flex flex-col items-center">
            <UploadTapButton variant="transparent" />
            <Label>Upload</Label>
          </div>
          <div className="flex flex-col items-center">
            <UndoTapButton variant="transparent" />
            <Label>Undo</Label>
          </div>
          <div className="flex flex-col items-center">
            <RedoTapButton variant="transparent" />
            <Label>Redo</Label>
          </div>
          <div className="flex flex-col items-center">
            <CopyTapButton variant="transparent" />
            <Label>Copy</Label>
          </div>
          <div className="flex flex-col items-center">
            <TrashTapButton variant="transparent" />
            <Label>Trash</Label>
          </div>
          <div className="flex flex-col items-center">
            <ChevronLeftTapButton variant="transparent" />
            <Label>ChevLeft</Label>
          </div>
          <div className="flex flex-col items-center">
            <PanelLeftTapButton variant="transparent" />
            <Label>PanelL</Label>
          </div>
          <div className="flex flex-col items-center">
            <PanelRightTapButton variant="transparent" />
            <Label>PanelR</Label>
          </div>
          <div className="flex flex-col items-center">
            <SquarePenTapButton variant="transparent" />
            <Label>SqPen</Label>
          </div>
        </div>
      </div>

      {/* Row 3 — Group variant inside a TapTargetButtonGroup */}
      <div>
        <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
          All Icons — Group
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <TapTargetButtonGroup>
            <MenuTapButton variant="group" />
            <PlusTapButton variant="group" />
            <SearchTapButton variant="group" />
            <SettingsTapButton variant="group" />
            <MaximizeTapButton variant="group" />
            <ArrowDownUpTapButton variant="group" />
            <BellTapButton variant="group" />
            <UploadTapButton variant="group" />
          </TapTargetButtonGroup>
          <TapTargetButtonGroup>
            <UndoTapButton variant="group" />
            <RedoTapButton variant="group" />
            <CopyTapButton variant="group" />
            <TrashTapButton variant="group" />
            <ChevronLeftTapButton variant="group" />
            <PanelLeftTapButton variant="group" />
            <PanelRightTapButton variant="group" />
            <SquarePenTapButton variant="group" />
          </TapTargetButtonGroup>
        </div>
      </div>

      {/* Row 4 — Solid variant */}
      <div>
        <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
          Select Icons — Solid
        </p>
        <div className="flex flex-wrap items-start gap-x-0">
          <div className="flex flex-col items-center">
            <PlusTapButton variant="solid" />
            <Label>Plus</Label>
          </div>
          <div className="flex flex-col items-center">
            <UploadTapButton variant="solid" />
            <Label>Upload</Label>
          </div>
          <div className="flex flex-col items-center">
            <SearchTapButton variant="solid" />
            <Label>Search</Label>
          </div>
          <div className="flex flex-col items-center">
            <SquarePenTapButton variant="solid" />
            <Label>SqPen</Label>
          </div>
          <div className="flex flex-col items-center">
            <TrashTapButton variant="solid" />
            <Label>Trash</Label>
          </div>
        </div>
      </div>

      {/* Row 5 — New icons: Filter, X */}
      <div>
        <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
          New Icons
        </p>
        <div className="flex flex-wrap items-start gap-x-0">
          <div className="flex flex-col items-center">
            <FilterTapButton />
            <Label>Filter</Label>
          </div>
          <div className="flex flex-col items-center">
            <XTapButton />
            <Label>Close</Label>
          </div>
          <div className="flex flex-col items-center">
            <FilterTapButton variant="transparent" />
            <Label>Filter</Label>
          </div>
          <div className="flex flex-col items-center">
            <XTapButton variant="transparent" />
            <Label>Close</Label>
          </div>
        </div>
      </div>

      {/* ── SearchToolbar demos ──────────────────────────────────── */}

      <div className="border-t border-border pt-6 mt-2">
        <p className="text-xs font-semibold text-foreground mb-4 px-1">
          SearchToolbar — CSS-only expandable search
        </p>

        <div className="mb-6">
          <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
            MobileFilterBar — responsive, spread on mobile
          </p>
          <MobileFilterBar id="demo-mobile" placeholder="Search items..." />
        </div>

        <div className="mb-6">
          <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
            DesktopToolbar — inline expand, no spread
          </p>
          <DesktopToolbar id="demo-desktop" placeholder="Find anything..." />
        </div>

        <div className="mb-6">
          <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
            MinimalSearchBar — full-width expand
          </p>
          <MinimalSearchBar id="demo-minimal" placeholder="Quick search..." />
        </div>

        <div className="mb-6">
          <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
            Custom — spread on mobile
          </p>
          <SearchToolbar
            id="demo-custom"
            mode="responsive"
            placeholder="Search notes..."
            left={
              <>
                <MenuTapButton />
                <SettingsTapButton />
              </>
            }
            right={
              <>
                <BellTapButton />
                <PlusTapButton />
              </>
            }
          />
        </div>

        <div className="mb-6">
          <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
            Custom — spread disabled (stays left-aligned)
          </p>
          <SearchToolbar
            id="demo-no-spread"
            mode="responsive"
            spread={false}
            placeholder="Search notes..."
            left={
              <>
                <MenuTapButton />
                <SettingsTapButton />
              </>
            }
            right={
              <>
                <BellTapButton />
                <PlusTapButton />
              </>
            }
          />
        </div>
      </div>

      {/* ── SearchGroup demos — glass pill, zero layout shift ──────── */}

      <div className="border-t border-border pt-6 mt-2">
        <p className="text-xs font-semibold text-foreground mb-4 px-1">
          SearchGroup — glass pill, zero layout shift
        </p>

        <div className="mb-6">
          <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
            FilterSearchGroup preset — [ Filter | Sort | Search | Settings ]
          </p>
          <FilterSearchGroup id="demo-fsg" placeholder="Filter..." />
        </div>

        <div className="mb-6">
          <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
            ToolsSearchGroup preset — [ Filter | Sort | Search | Maximize |
            Settings ]
          </p>
          <ToolsSearchGroup id="demo-tsg" placeholder="Find tools..." />
        </div>

        <div className="mb-6">
          <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
            Custom SearchGroup — compose your own
          </p>
          <SearchGroup id="demo-custom-group" placeholder="Search...">
            <UndoTapButton variant="group" />
            <RedoTapButton variant="group" />
            <SearchGroupTrigger id="demo-custom-group" />
            <CopyTapButton variant="group" />
            <TrashTapButton variant="group" />
          </SearchGroup>
        </div>

        <div className="mb-6">
          <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
            SearchGroup with fill — stretches on mobile
          </p>
          <SearchGroup id="demo-fill-group" fill placeholder="Search...">
            <FilterTapButton variant="group" />
            <ArrowDownUpTapButton variant="group" />
            <SearchGroupTrigger id="demo-fill-group" />
            <SettingsTapButton variant="group" />
          </SearchGroup>
        </div>

        <div className="mb-6">
          <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
            Standalone + SearchGroup — expand (pill grows to fill space)
          </p>
          <div className="flex items-center w-full">
            <ChevronLeftTapButton />
            <SearchGroup id="demo-expand" placeholder="Search...">
              <FilterTapButton variant="group" />
              <ArrowDownUpTapButton variant="group" />
              <SearchGroupTrigger id="demo-expand" />
              <SettingsTapButton variant="group" />
            </SearchGroup>
            <PlusTapButton />
          </div>
        </div>

        <div className="mb-6">
          <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
            Standalone + SearchGroup — no expand (fixed overlay)
          </p>
          <div className="flex items-center w-full">
            <ChevronLeftTapButton />
            <div className="flex-1 flex justify-center">
              <SearchGroup
                id="demo-no-expand"
                expand={false}
                placeholder="Search..."
              >
                <FilterTapButton variant="group" />
                <ArrowDownUpTapButton variant="group" />
                <SearchGroupTrigger id="demo-no-expand" />
                <SettingsTapButton variant="group" />
              </SearchGroup>
            </div>
            <PlusTapButton />
          </div>
        </div>
      </div>
    </div>
  );
}
