# AdvancedMenu Component

A beautiful, feature-rich menu component with automatic action feedback, mobile responsiveness, and extensive customization options. Perfect for context menus, dropdown menus, or any interactive menu interface.

## Features

✨ **Beautiful Design**
- Modern glassmorphism effect with backdrop blur
- Smooth animations and transitions
- Professional shadows and borders
- Light and dark mode support

🎯 **Action Feedback**
- Automatic loading states with spinner
- Success states with checkmark
- Error states with visual feedback
- Toast notifications (optional)

📱 **Mobile Responsive**
- Automatic mobile detection
- Centers menu on mobile devices
- Prevents cut-off on small screens
- Touch-friendly interactions

🔧 **Smart Positioning**
- Automatic viewport collision detection
- Adjusts position to prevent cut-off at screen edges
- Switches from bottom to top (and vice versa) when needed
- Switches from left to right (and vice versa) when needed
- Centers menu if too large for viewport or no good position exists
- Constrains maximum height to viewport with internal scrolling
- Recursion prevention: stops adjusting once centered to avoid infinite loops

📏 **It always fits** (defect D6)
- `children` on a `MenuItem` makes that row a SUBMENU TRIGGER: one visible row with a "›" and a child count, drilling into its own panel with a back row (Escape goes back before it closes). Use it for any family of near-identical variants — nine "Save as" formats, five "Copy" formats.
- Overflow safety net: past `AUTO_COLLAPSE_THRESHOLD` (20) visible rows, a categorized menu automatically collapses every category after the first into a submenu row, so no group can be stranded tens of rows below the fold. Opt out with `autoCollapse={false}` only for a menu that must stay flat.
- A 600px desktop panel on a 768px-tall viewport shows about 17 rows. Design to that; the scroll fade is a hint, never the plan.

🎨 **Highly Customizable**
- Multiple positioning options
- Categorized items with headers
- Custom icons and colors
- Flexible styling props

🔒 **Production Ready**
- TypeScript support
- Accessibility features
- Keyboard navigation (Escape to close)
- Click outside to close

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

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` | Required | Controls menu visibility |
| `onClose` | `() => void` | Required | Called when menu should close |
| `items` | `MenuItem[]` | Required | Array of menu items |
| `title` | `string` | `"Options"` | Menu header title |
| `description` | `string` | - | Optional header description |
| `showHeader` | `boolean` | `true` | Show/hide header section |
| `position` | `string` | `"bottom-left"` | Menu position (see positions) |
| `anchorElement` | `HTMLElement` | - | Element to anchor menu to |
| `className` | `string` | - | Additional CSS classes |
| `width` | `string` | `"280px"` | Minimum menu width |
| `maxWidth` | `string` | `"320px"` | Maximum menu width |
| `closeOnAction` | `boolean` | `true` | Close menu after action |
| `showBackdrop` | `boolean` | `true` | Show backdrop overlay |
| `backdropBlur` | `boolean` | `true` | Blur backdrop |
| `categorizeItems` | `boolean` | `true` | Group items by category |
| `forceMobileCenter` | `boolean` | `true` | Center on mobile |
| `onActionStart` | `(key: string) => void` | - | Callback when action starts |
| `onActionSuccess` | `(key: string) => void` | - | Callback when action succeeds |
| `onActionError` | `(key, error) => void` | - | Callback when action fails |

### MenuItem Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `key` | `string` | ✅ | Unique identifier |
| `icon` | `LucideIcon` | ✅ | Icon component |
| `label` | `string` | ✅ | Display label |
| `action` | `() => void \| Promise<void>` | ✅ | Action to execute |
| `iconColor` | `string` | - | Tailwind color class |
| `description` | `string` | - | Helper text |
| `category` | `string` | - | Category for grouping |
| `disabled` | `boolean` | - | Disable item |
| `showToast` | `boolean` | `true` | Show toast on action |
| `successMessage` | `string` | - | Custom success message |
| `errorMessage` | `string` | - | Custom error message |
| `loadingMessage` | `string` | - | Custom loading message |

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
<AdvancedMenu
  {...menu.menuProps}
  items={items}
  className="custom-menu-class"
/>
```

## Best Practices

1. **Use unique keys** - Each item must have a unique key
2. **Provide descriptions** - Help users understand actions
3. **Use appropriate icons** - Choose clear, recognizable icons
4. **Handle errors** - Wrap actions in try-catch for better UX
5. **Show feedback** - Let users know when actions succeed/fail
6. **Categorize logically** - Group related actions together
7. **Disable unavailable actions** - Don't hide, disable with "Soon" badge

## Mobile Behavior

On mobile devices (< 768px):
- Menu automatically centers in viewport
- Adjusts width to fit screen with margins
- Maintains all functionality
- Touch-friendly tap targets

## Accessibility

- ✅ Keyboard navigation (Escape to close)
- ✅ Click outside to close
- ✅ Focus management
- ✅ ARIA labels (coming soon)
- ✅ Screen reader support (coming soon)

## Complete Example

See `AdvancedMenu.example.tsx` for comprehensive examples including:
- Basic usage
- Categorized menus
- Context menus
- Custom positioning
- Disabled items
- Callbacks
- Minimal menus
- Message options menu

## Troubleshooting

**Menu doesn't appear:**
- Check `isOpen` is `true`
- Ensure parent has `relative` positioning

**Menu gets cut off:**
- The component has automatic viewport collision detection that prevents cut-off
- If you still see issues, ensure the menu is rendering within the normal document flow
- The menu will automatically:
  - Switch from `bottom` to `top` if it would overflow the bottom
  - Switch from `top` to `bottom` if it would overflow the top
  - Switch from `left` to `right` if it would overflow the left edge
  - Switch from `right` to `left` if it would overflow the right edge
  - Center itself if the content is too large for the viewport or if no good position exists
  - Constrain its maximum height to fit within the viewport
  - Stop adjusting once centered to prevent infinite recursion loops
- At extreme zoom levels where the menu can't fit above or below, it will automatically center with internal scrolling

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

