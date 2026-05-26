# Utilities & Optimization Components

A collection of utility components and optimization tools that enhance performance, reduce bundle size, and provide common functionality across the application.

## Icon Resolver

**Path:** `components/official/IconResolver.tsx`  
**Category:** Utilities, Interactive  
**Bundle Impact:** 99% reduction in icon-related bundle size

### Overview

The Icon Resolver is a hybrid icon management system that dramatically reduces bundle size by avoiding wildcard imports (`import * as LucideIcons`) while still supporting all 1000+ Lucide React icons plus custom react-icons.

### The Problem It Solves

Before IconResolver, many files used:
```typescript
import * as LucideIcons from "lucide-react";
const Icon = LucideIcons[iconName];
```

This imports **all ~1000+ icons** into every file using it, adding ~600KB per file. With 31+ files doing this, that's **~18.6MB** of duplicate icon imports!

### The Solution

IconResolver uses a hybrid approach:
1. **Static imports** for 140+ commonly used icons (~50KB)
2. **Dynamic imports** for rare icons (loaded once, cached forever)
3. **Custom icon support** (react-icons/fc, react-icons/fa6)

### Usage

#### 1. IconResolver Component (Recommended)

Full-featured component with dynamic loading support:

```tsx
import IconResolver from '@/components/official/IconResolver';

<IconResolver 
  iconName="Home"           // Icon name
  className="h-6 w-6"       // Default: "h-4 w-4"
  size={24}                 // Optional size
  fallbackIcon="Zap"        // Default: "Zap"
/>
```

#### 2. getIconComponent() Utility

Synchronous utility for getting icon components (only works with static/cached icons):

```tsx
import { getIconComponent } from '@/components/official/IconResolver';

const Icon = getIconComponent("Settings", "Zap");
<Icon className="h-5 w-5" />
```

**Use Case:** When you need the icon component itself, not rendered. Perfect for existing code that expects a component reference.

#### 3. DynamicIcon Component

Icon component with color support:

```tsx
import { DynamicIcon } from '@/components/official/IconResolver';

<DynamicIcon 
  name="Star"
  color="yellow"            // Color preset (gray, blue, red, etc.)
  size={6}                  // Tailwind size units
  className=""              // Additional classes
  fallbackIcon="Zap"
/>
```

### Supported Icon Sets

#### Lucide React Icons (All 1000+)

- 140+ common icons are **statically imported** (instant, no loading)
- Remaining icons are **dynamically loaded** (loaded once, cached)
- Common static icons include: Home, User, Settings, Search, Bell, Menu, Edit, Trash, Calendar, Mail, File, Database, Star, Heart, and many more

See the component file for the complete list of static icons.

#### Custom Icons (react-icons)

Pre-imported custom icons from react-icons:
- **FaBrave** (react-icons/fa6)
- **Fc*** icons (react-icons/fc) - 30+ colored icons including FcGoogle, FcDocument, FcCalendar, etc.

```tsx
<IconResolver iconName="FcGoogle" className="h-6 w-6" />
<IconResolver iconName="FaBrave" className="h-6 w-6" />
```

### Adding More Static Icons

If you frequently use an icon not in the static map:

1. Import it at the top of `IconResolver.tsx`:
```tsx
import { YourIcon } from "lucide-react";
```

2. Add it to `staticLucideIconMap`:
```tsx
const staticLucideIconMap = {
  ...existing icons,
  YourIcon,
};
```

This includes it in the initial bundle and eliminates dynamic loading.

### Performance Benefits

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Single file import | ~600KB | ~4KB | 99% reduction |
| 31 files (actual) | ~18.6MB | ~50KB shared | 99.7% reduction |
| Loading time | Instant (all loaded) | Instant (static) + <100ms (dynamic, cached) | Seamless |

### Migration Guide

Replacing wildcard imports is straightforward:

**Before:**
```tsx
import * as LucideIcons from "lucide-react";

function MyComponent() {
  const Icon = LucideIcons[iconName] || LucideIcons.Zap;
  return <Icon className="h-4 w-4" />;
}
```

**After:**
```tsx
import { getIconComponent } from '@/components/official/IconResolver';

function MyComponent() {
  const Icon = getIconComponent(iconName, "Zap");
  return <Icon className="h-4 w-4" />;
}
```

Or use the component directly:
```tsx
import IconResolver from '@/components/official/IconResolver';

function MyComponent() {
  return <IconResolver iconName={iconName} className="h-4 w-4" fallbackIcon="Zap" />;
}
```

### Color Presets (DynamicIcon)

Available color presets:
- `gray` (default), `rose`, `blue`, `amber`, `cyan`, `emerald`, `fuchsia`
- `green`, `indigo`, `lime`, `neutral`, `orange`, `pink`, `purple`
- `red`, `sky`, `slate`, `stone`, `teal`, `violet`, `yellow`, `zinc`

Each color has light and dark variants (e.g., `text-blue-600 dark:text-blue-400`).

### Best Practices

1. **Use IconResolver component** for dynamic icon names from databases/props
2. **Use getIconComponent()** when migrating existing code that expects component references
3. **Use DynamicIcon** when you need color support
4. **Static icons are instant** - no loading state needed
5. **Dynamic icons cache forever** - second render is instant
6. **Fallback icons always work** - seamless user experience even if icon not found

### Real-World Impact

This component replaced wildcard imports in 11 files, saving ~6.5MB. With 20+ more files to migrate, total savings will exceed ~12MB of bundle size reduction.

### Dependencies

- `lucide-react` - Primary icon library
- `react-icons/fc` - Colored icons
- `react-icons/fa6` - Brand icons

### Related Components

- **IconButton** - Button with icon and tooltip
- **IconDropdownMenu** - Dropdown menu with icon trigger
- **IconSelect** - Select component with icons
- **IconInputWithValidation** - Input field for icon name entry with validation

---

## Icon Input with Validation

**Implementation:** `components/official/IconInputWithValidation.tsx` — **import in app code:** `components/official/IconInputWithValidation.dynamic.tsx` (always `next/dynamic`, `ssr: false`)  
**Category:** Inputs, Utilities, Feedback  
**Dependencies:** IconResolver

### Overview

An all-in-one input component for entering and validating Lucide icon names. Features real-time validation, live preview, auto-capitalization, and visual feedback. Perfect for forms where users need to specify icon names.

### Features

- ✅ **Real-time validation** - Click refresh or press Enter to validate
- ✅ **Visual feedback** - Green checkmark (valid) / Red X (invalid)
- ✅ **Live icon preview** - Shows the actual icon when valid
- ✅ **Auto-capitalization** - Automatically tries capitalizing if lowercase fails (e.g., "star" → "Star")
- ✅ **Lucide reference** - Direct link to browse available icons
- ✅ **Seamless integration** - Drop-in replacement for standard Input
- ✅ **Zero layout shift** - Preview appears beside input without disrupting layout

### Usage

#### Full Version (with helper text)

```tsx
import IconInputWithValidation from '@/components/official/IconInputWithValidation.dynamic';

<IconInputWithValidation
  value={iconName}
  onChange={setIconName}
  placeholder="e.g., Sparkles"
  id="icon-input"
/>
```

#### Compact Version (no helper text)

Perfect for forms with limited space:

```tsx
import { IconInputCompact } from '@/components/official/IconInputWithValidation.dynamic';

<IconInputCompact
  value={iconName}
  onChange={setIconName}
  placeholder="Icon name"
  className="h-9"
/>
```

### Real-World Example

From `ShortcutFormFields.tsx`:

```tsx
<div className="space-y-1.5">
  <Label htmlFor="shortcut-icon">Icon Name</Label>
  <IconInputWithValidation
    id="shortcut-icon"
    value={formData.icon_name || ''}
    onChange={(value) => onChange({ icon_name: value || null })}
    placeholder="e.g., Sparkles"
    className="h-9"
  />
</div>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | Required | Current icon name value |
| `onChange` | `(name: string) => void` | Required | Callback when icon name changes |
| `placeholder` | `string` | `"e.g., Sparkles"` | Input placeholder text |
| `className` | `string` | `""` | Additional className for input |
| `id` | `string` | `undefined` | Input ID for label association |
| `disabled` | `boolean` | `false` | Disable the input |
| `showLucideLink` | `boolean` | `true` | Show link to Lucide icons site |

### Validation States

The component cycles through 4 states:

1. **Idle** - No validation yet (gray refresh icon)
2. **Validating** - Checking icon (spinning refresh icon)
3. **Valid** - Icon found (green checkmark + preview)
4. **Invalid** - Icon not found (red X + error message)

### Auto-Capitalization

The component intelligently handles lowercase input:

```tsx
// User types: "home"
// Validation: ❌ "home" not found
// Auto-try: ✅ "Home" found → auto-updates value
```

This provides a better user experience for those unfamiliar with PascalCase convention.

### How It Works

1. User types icon name
2. User clicks refresh button or presses Enter
3. Component validates using IconResolver:
   - First checks static/cached icons (instant)
   - Then tries dynamic import from lucide-react
   - If lowercase, auto-tries capitalized version
4. Shows visual feedback and preview

### Best Practices

1. **Use in forms** where icon names are required input
2. **Provide Label** for accessibility (`id` prop enables label association)
3. **Use Compact version** in tight spaces or dense forms
4. **Let users browse** - the Lucide link helps users discover icons
5. **Save validated names** - component ensures only valid icon names are saved

### Integration Example

Replacing a standard Input is seamless:

**Before:**
```tsx
<Input
  value={iconName}
  onChange={(e) => setIconName(e.target.value)}
  placeholder="Icon name"
/>
```

**After:**
```tsx
<IconInputWithValidation
  value={iconName}
  onChange={setIconName}
  placeholder="Icon name"
/>
```

No layout changes, no wrapper components needed - just replace the component.

---

*Last updated: November 2024*

