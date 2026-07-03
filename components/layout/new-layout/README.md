# Page-Specific Header Integration

## Quick Setup

### 1. Create Compact Component
Create a new compact header component optimized for main header integration:

```tsx
// features/[feature]/components/[Feature]HeaderCompact.tsx
export function FeatureHeaderCompact(props: FeatureHeaderProps) {
  return (
    <div className="flex items-center gap-2 h-full">
      {/* Mobile - Always dropdown */}
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {/* All actions as dropdown items */}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Desktop - Inline controls with tight spacing */}
      <div className="hidden md:flex items-center gap-1">
        {/* Compact buttons: h-7 w-7 p-0, icons: h-3 w-3 */}
        {/* Progressive disclosure: hide secondary actions on smaller screens */}
      </div>
    </div>
  );
}
```

### 2. Add to PageSpecificHeader.tsx
```tsx
export function FeatureHeader(props: FeatureHeaderProps) {
  const pathname = usePathname();
  
  if (!pathname?.includes('/your/route/pattern')) {
    return null;
  }

  // Dynamic import to avoid SSR issues
  const [Component, setComponent] = useState<any>(null);
  useEffect(() => {
    import('@/features/[feature]/components/[Feature]HeaderCompact').then((module) => {
      setComponent(() => module.FeatureHeaderCompact);
    });
  }, []);

  if (!Component) return null;

  return (
    <PageSpecificHeader>
      <Component {...props} />
    </PageSpecificHeader>
  );
}
```

### 3. Integrate in Feature Page

> **Legacy `ResponsiveLayout` only.** `(core)` AppShell routes use `<PageHeader>` + `h-full` — see `features/shell/components/header/variants/USAGE.md`.

```tsx
// Legacy (transitional) ResponsiveLayout feature page
import { FeatureHeader } from '@/components/layout/new-layout/PageSpecificHeader';

export function FeaturePage() {
  return (
    <div className="h-[calc(100vh-3rem)] lg:h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <FeatureHeader {...headerProps} />
      {/* Rest of your content */}
    </div>
  );
}
```

## Critical Requirements

### Mobile
- **Always use dropdown**: `<div className="md:hidden">` with `DropdownMenu`
- **Single trigger**: One `MoreHorizontal` button
- **Status indicators**: Use small dots/badges, not text

### Desktop  
- **Tight spacing**: `gap-1` or `gap-0.5`, buttons `h-7 w-7 p-0`
- **Small icons**: `h-3 w-3` instead of `h-4 w-4`
- **Progressive disclosure**: Hide secondary actions on smaller screens with `hidden lg:flex`
- **Responsive widths**: Use `max-w-[120px] lg:max-w-[180px] xl:max-w-[240px]`

### Route Detection
- Use `pathname?.includes('/route/pattern')` to match base route and sub-routes
- Example: `/ai/cockpit` matches both `/ai/cockpit` and `/ai/cockpit/[id]`

### Layout Integration
- Portal renders into `#page-specific-header-content`
- Main header left space: `flex-1 min-w-0` available after menu toggle
- Right space reserved: notifications, theme switcher, navigation menu

## Sizing Guidelines
- **Buttons**: `h-7 w-7 p-0` (desktop), `h-8 w-8 p-0` (mobile trigger)
- **Icons**: `h-3 w-3` (desktop), `h-4 w-4` (mobile dropdown)  
- **Text**: `text-sm` (inputs), `text-[10px]` (badges)
- **Gaps**: `gap-1` (main), `gap-0.5` (tight sections)
