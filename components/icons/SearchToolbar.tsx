import "./search-toolbar.css";

// ---------------------------------------------------------------------------
// SearchToolbar — server-rendered toolbar with CSS-only expandable search.
// SearchGroup — same concept but inside a TapTargetButtonGroup pill.
//
// Both use a hidden checkbox for state. Zero JS for expand/collapse.
// ---------------------------------------------------------------------------

interface SearchToolbarProps {
  id?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  mode?: "inline" | "full-width" | "responsive";
  spread?: boolean;
  placeholder?: string;
  className?: string;
  inputName?: string;
}

let counter = 0;

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SearchTapLabel({ htmlFor }: { htmlFor: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex h-11 w-11 items-center justify-center bg-transparent transition-transform active:scale-95 outline-none cursor-pointer"
      aria-label="Open search"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full matrx-shell-glass transition-colors">
        <SearchIcon className="w-4 h-4 text-foreground" />
      </div>
    </label>
  );
}

function InputBar({
  checkboxId,
  placeholder,
  inputName,
  className,
}: {
  checkboxId: string;
  placeholder: string;
  inputName: string;
  className?: string;
}) {
  return (
    <div className={`stb-input-bar ${className ?? ""}`}>
      <div className="stb-input-bar-inner matrx-shell-glass">
        <SearchIcon className="stb-search-icon-sm text-foreground" />
        <input
          type="search"
          name={inputName}
          placeholder={placeholder}
          className="stb-input text-foreground"
          autoComplete="off"
        />
        <label htmlFor={checkboxId} className="stb-close" aria-label="Close search">
          <CloseIcon className="w-3 h-3 text-muted-foreground" />
        </label>
      </div>
    </div>
  );
}

/**
 * Individual toolbar — search icon sits alongside other buttons.
 * When tapped, input bar expands inline or full-width.
 */
export function SearchToolbar({
  id,
  left,
  right,
  mode = "responsive",
  spread = true,
  placeholder = "Search...",
  className,
  inputName = "search",
}: SearchToolbarProps) {
  const checkboxId = id ?? `stb-${++counter}`;
  const modeClass = mode === "full-width" ? "stb-full-width" : mode === "responsive" ? "stb-responsive" : "";
  const spreadClass = spread ? "stb-spread" : "";

  return (
    <>
      <input type="checkbox" className="stb-toggle" id={checkboxId} />
      <div className={`stb-root ${modeClass} ${spreadClass} ${className ?? ""}`.trim()}>
        {left && <div className="stb-left">{left}</div>}
        <SearchTapLabel htmlFor={checkboxId} />
        <InputBar checkboxId={checkboxId} placeholder={placeholder} inputName={inputName} />
        {right && <div className="stb-right">{right}</div>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// SearchGroup — group pill variant.
// Fixed-size glass pill with icons. Tap search → icons fade, input appears
// in the exact same pill. Zero layout shift.
// ---------------------------------------------------------------------------

interface SearchGroupProps {
  id?: string;
  children: React.ReactNode;
  /** Fill available width on mobile (<640px). Default false. */
  fill?: boolean;
  /** When expanded, pill grows to fill available space instead of fixed overlay. Default true. */
  expand?: boolean;
  placeholder?: string;
  inputName?: string;
  className?: string;
}

/**
 * Group pill with built-in search toggle.
 * Children are TapTargetButtonForGroup icons — one should be a search label.
 * When activated, all icons fade and a search input fills the same pill.
 *
 * Usage:
 *   <SearchGroup id="my-group">
 *     <FilterTapButton variant="group" />
 *     <ArrowDownUpTapButton variant="group" />
 *     <SearchGroupTrigger id="my-group" />
 *     <PlusTapButton variant="group" />
 *   </SearchGroup>
 */
export function SearchGroup({
  id,
  children,
  fill = false,
  expand = true,
  placeholder = "Search...",
  inputName = "search",
  className,
}: SearchGroupProps) {
  const checkboxId = id ?? `stb-g-${++counter}`;
  const fillClass = fill ? "stb-group-fill" : "";
  const expandClass = expand ? "stb-group-expand" : "";

  return (
    <>
      <input type="checkbox" className="stb-toggle" id={checkboxId} />
      <div className={`stb-group ${fillClass} ${expandClass} ${className ?? ""}`.trim()}>
        <div className="stb-group-pill matrx-shell-glass">
          <div className="stb-group-icons">
            {children}
          </div>
          <div className="stb-group-input">
            <SearchIcon className="stb-search-icon-sm text-foreground" />
            <input
              type="search"
              name={inputName}
              placeholder={placeholder}
              className="stb-input text-foreground"
              autoComplete="off"
            />
            <label htmlFor={checkboxId} className="stb-close" aria-label="Close search">
              <CloseIcon className="w-3 h-3 text-muted-foreground" />
            </label>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Drop-in search trigger for SearchGroup. Renders as a group-style
 * icon button that is actually a <label> toggling the checkbox.
 */
export function SearchGroupTrigger({ id }: { id: string }) {
  return (
    <label
      htmlFor={id}
      className="stb-group-trigger flex h-11 w-11 items-center justify-center bg-transparent outline-none cursor-pointer"
      aria-label="Search"
    >
      <div className="flex h-6 w-6 items-center justify-center rounded-full matrx-shell-glass transition-[background,transform] active:scale-95">
        <SearchIcon className="w-4 h-4 text-foreground" />
      </div>
    </label>
  );
}
