# AdvancedMenu

The shared anchored action menu used by message action bars, content blocks,
editors, and other kebab/button menus. Canonical page and row context menus use
`features/context-menu-v3`; `AdvancedMenu` is for explicit action-menu triggers.

## Features

- **Anchored desktop panel.** The panel selects a collision-safe position when
  it opens and keeps that frame throughout submenu navigation. A shorter child
  list must never jump toward the trigger.
- **Stable mobile drawer.** Mobile uses one fixed-height `85dvh` drawer and one
  internal scroll area, so drill-down never grows or shrinks under the user's
  thumb.
- **Live drill-down.** The navigation trail stores item keys and resolves them
  against current items on every render; changing availability is reflected
  while the menu is open.
- **No empty doors.** Hidden children are removed recursively and a submenu
  with no visible destination is omitted.
- **Action feedback.** Async actions receive loading, success, error, and
  optional toast feedback.
- **Viewport safety.** Desktop content is capped at 600px and the available
  viewport height, with internal scrolling and a scroll-more fade.

## Submenus and overflow

- `children` makes a row a submenu trigger. It replaces the current list in
  the same panel and adds an explicit back row; Escape goes back one level
  before closing.
- More than `AUTO_COLLAPSE_THRESHOLD` (20) visible rows automatically folds
  every category after the first behind one submenu row. Pass
  `autoCollapse={false}` only when the caller intentionally owns a flat list.
- A 600px panel on a 768px viewport holds roughly 17 rows. Primary actions
  still belong at the top; scrolling is a safety net, not information design.

## Installation

The component is already in your `components/official` directory. Import it like this:

```tsx
import AdvancedMenu from "@/components/official/AdvancedMenu";
import { useAdvancedMenu } from "@/hooks/use-advanced-menu";
```

## Basic Usage

```tsx
import { Copy, Save } from "lucide-react";
import AdvancedMenu, { MenuItem } from "@/components/official/AdvancedMenu";
import { useAdvancedMenu } from "@/hooks/use-advanced-menu";
import { Button } from "@/components/ui/button";

export function MyComponent() {
  const menu = useAdvancedMenu();

  const items: MenuItem[] = [
    {
      key: "copy",
      icon: Copy,
      iconColor: "text-blue-500 dark:text-blue-400",
      label: "Copy",
      description: "Copy to clipboard",
      action: async () => {
        await navigator.clipboard.writeText("Hello World");
      },
    },
    {
      key: "save",
      icon: Save,
      iconColor: "text-green-500 dark:text-green-400",
      label: "Save",
      description: "Save changes",
      action: () => {
        console.log("Saved!");
      },
    },
  ];

  return (
    <div className="relative">
      <Button onClick={() => menu.open()}>Open Menu</Button>
      <AdvancedMenu {...menu.menuProps} items={items} title="Actions" />
    </div>
  );
}
```

## Props

### AdvancedMenuProps

| Prop              | Type                    | Default         | Description                                |
| ----------------- | ----------------------- | --------------- | ------------------------------------------ |
| `isOpen`          | `boolean`               | Required        | Controls menu visibility                   |
| `onClose`         | `() => void`            | Required        | Called when menu should close              |
| `items`           | `MenuItem[]`            | Required        | Array of menu items                        |
| `title`           | `string`                | `"Options"`     | Menu header title                          |
| `description`     | `string`                | -               | Optional header description                |
| `showHeader`      | `boolean`               | `true`          | Show/hide header section                   |
| `position`        | `string`                | `"bottom-left"` | Menu position (see positions)              |
| `anchorElement`   | `HTMLElement`           | -               | Element to anchor menu to                  |
| `className`       | `string`                | -               | Additional CSS classes                     |
| `width`           | `string`                | `"280px"`       | Minimum menu width                         |
| `maxWidth`        | `string`                | `"320px"`       | Maximum menu width                         |
| `closeOnAction`   | `boolean`               | `true`          | Close menu after action                    |
| `showBackdrop`    | `boolean`               | `true`          | Show backdrop overlay                      |
| `backdropBlur`    | `boolean`               | `true`          | Blur backdrop                              |
| `categorizeItems` | `boolean`               | `true`          | Group items by category                    |
| `autoCollapse`    | `boolean`               | `true`          | Fold overflow categories into submenu rows |
| `onActionStart`   | `(key: string) => void` | -               | Callback when action starts                |
| `onActionSuccess` | `(key: string) => void` | -               | Callback when action succeeds              |
| `onActionError`   | `(key, error) => void`  | -               | Callback when action fails                 |

### MenuItem Interface

| Property         | Type                          | Required | Description                                 |
| ---------------- | ----------------------------- | -------- | ------------------------------------------- |
| `key`            | `string`                      | ✅       | Unique identifier                           |
| `icon`           | `LucideIcon`                  | ✅       | Icon component                              |
| `label`          | `string`                      | ✅       | Display label                               |
| `action`         | `() => void \| Promise<void>` | ✅       | Action to execute                           |
| `iconColor`      | `string`                      | -        | Tailwind color class                        |
| `description`    | `string`                      | -        | Helper text                                 |
| `category`       | `string`                      | -        | Category for grouping                       |
| `disabled`       | `boolean`                     | -        | Disable item                                |
| `hidden`         | `boolean`                     | -        | Omit item                                   |
| `children`       | `MenuItem[]`                  | -        | Render item as a drill-down submenu trigger |
| `showToast`      | `boolean`                     | `true`   | Show toast on action                        |
| `successMessage` | `string`                      | -        | Custom success message                      |
| `errorMessage`   | `string`                      | -        | Custom error message                        |
| `loadingMessage` | `string`                      | -        | Custom loading message                      |

## Position Options

- `"bottom-left"` - Below trigger, aligned left
- `"bottom-right"` - Below trigger, aligned right
- `"top-left"` - Above trigger, aligned left
- `"top-right"` - Above trigger, aligned right
- `"center"` - Centered in viewport

## Advanced Examples

### Categorized Menu

```tsx
const items: MenuItem[] = [
  {
    key: "copy",
    icon: Copy,
    label: "Copy",
    description: "Copy to clipboard",
    category: "Edit",
    action: () => {},
  },
  {
    key: "share",
    icon: Share2,
    label: "Share",
    description: "Share with others",
    category: "Share",
    action: () => {},
  },
];
```

### Context Menu (Right Click)

```tsx
const menu = useAdvancedMenu();

const handleContextMenu = (e: React.MouseEvent) => {
  e.preventDefault();
  menu.open(e.currentTarget as HTMLElement);
};

return (
  <div onContextMenu={handleContextMenu}>
    Right-click me
    <AdvancedMenu {...menu.menuProps} items={items} />
  </div>
);
```

### With Callbacks

```tsx
const menu = useAdvancedMenu({
  onActionStart: (key) => console.log(`${key} started`),
  onActionSuccess: (key) => console.log(`${key} succeeded`),
  onActionError: (key, error) => console.error(`${key} failed`, error),
});
```

### Async Actions

```tsx
const items: MenuItem[] = [
  {
    key: "upload",
    icon: Upload,
    label: "Upload File",
    description: "Upload to server",
    action: async () => {
      await uploadFile();
      // Loading state is automatic
      // Success/error states are automatic
    },
  },
];
```

## Helper Functions

### createMenuItem

Quickly create menu items with less boilerplate:

```tsx
import { createMenuItem } from "@/hooks/use-advanced-menu";

const items = [
  createMenuItem("copy", "Copy", Copy, () => handleCopy()),
  createMenuItem("save", "Save", Save, () => handleSave(), {
    iconColor: "text-green-500",
    description: "Save changes",
  }),
];
```

## Styling

### Custom Colors

```tsx
{
  key: "delete",
  icon: Trash,
  iconColor: "text-red-500 dark:text-red-400",
  label: "Delete",
  action: () => {},
}
```

### Custom Classes

```tsx
<AdvancedMenu {...menu.menuProps} items={items} className="custom-menu-class" />
```

## Best practices

1. Use stable, unique keys at every level; the drill-down trail depends on them.
2. Use concise labels and recognizable Lucide icons. Menu rows do not render
   descriptions.
3. Let the component report action failure; do not swallow errors inside an
   action.
4. Put primary actions first, then group variant families behind submenus.
5. Disable temporarily unavailable actions. Hide actions only when they do not
   apply; a submenu with no visible children is hidden automatically.

## Mobile Behavior

On mobile devices (< 768px):

- The action menu renders as a fixed-height bottom drawer.
- Drill-down replaces the drawer's list in place and provides a 44pt back row.
- One scroll area owns the full list and respects the bottom safe area.

## Accessibility

- Escape backs out of a submenu, then closes the menu.
- Desktop click-outside and mobile drawer dismissal close the menu.
- Submenu triggers expose `aria-haspopup="menu"` and a visible chevron/count.

## Complete Example

The official-components gallery at
`app/(admin)/administration/ui/official-components/component-displays/advanced-menu.tsx`
is the interactive example.

## Troubleshooting

**Menu doesn't appear:**

- Check `isOpen` is `true`
- Pass the real trigger element as `anchorElement`

**Menu gets cut off:**

- The component chooses the side with more room, clamps to viewport edges, and
  scrolls internally when necessary.
- It deliberately keeps the opening frame while the user drills into child
  lists. Do not add submenu state to the positioning effect dependencies.

**Actions don't work:**

- Verify `action` is a function
- Check for JavaScript errors in action
- Ensure `disabled` is not `true`

**Styling issues:**

- Check for conflicting CSS
- Verify Tailwind classes are available
- Ensure dark mode classes are working

## Migration from MessageOptionsMenu

If you're migrating from the old `MessageOptionsMenu`:

```tsx
// Before
<MessageOptionsMenu
  content={content}
  onClose={onClose}
  onShowHtmlPreview={handlePreview}
/>

// After
<AdvancedMenu
  isOpen={isOpen}
  onClose={onClose}
  items={menuItems}
  title="Message Options"
/>
```

## License

Internal component for AI-Matrx Admin. Not for redistribution.

## Change log

- 2026-09-15 — Keep desktop and mobile submenu frames stable, resolve open
  paths against live items, and omit recursively empty submenus.
- 2026-09-12 — Add drill-down submenus and automatic overflow-category folding.
