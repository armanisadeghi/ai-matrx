# Settings Area

Unified settings and account management for AI Matrx.

## Structure

```
/settings
├── layout.tsx              # Shared layout with sidebar navigation
├── page.tsx                # Root page (redirects to profile)
├── profile/
│   └── page.tsx           # User profile management
├── preferences/
│   └── page.tsx           # App preferences (uses PreferencesPage component)
├── organizations/
│   └── page.tsx           # Organization list and management
└── extension/
    └── page.tsx           # Chrome extension authentication
```

## Adding a New Settings Page

1. Create a new folder under `/settings` (e.g., `/settings/security`)
2. Create a `page.tsx` file in that folder
3. Add navigation item to `layout.tsx`:
   ```tsx
   {
     title: 'Security',
     href: '/settings/security',
     icon: <Shield className="h-4 w-4" />,
     description: 'Security and privacy settings',
   }
   ```
4. Follow the standardized layout pattern:
   ```tsx
   export default function SecurityPage() {
     return (
       <div className="p-6 md:p-8 max-w-5xl mx-auto">
         {/* Your content */}
       </div>
     );
   }
   ```

## Design Guidelines

- **Container:** Use responsive padding: `p-4 md:p-6 lg:p-8`
- **Max Width:** Use `max-w-5xl` to `max-w-7xl` depending on content needs
- **Cards:** Use shadcn Card components with responsive padding
- **Spacing:** Use responsive gap spacing (`gap-4 md:gap-6`)
- **Buttons:** Add `w-full md:w-auto` for full-width mobile buttons
- **Text:** Use responsive text sizes (`text-xl md:text-2xl`)
- **Images:** Scale appropriately for mobile (`h-20 w-20 md:h-24 md:w-24`)
- **Backgrounds:** Rely on layout's `bg-textured` background

### Mobile-First Checklist
- ✅ Responsive padding and margins
- ✅ Touch-friendly button sizes (min 44x44px)
- ✅ Readable text sizes on small screens
- ✅ Proper spacing between interactive elements
- ✅ Full-width buttons on mobile where appropriate
- ✅ Centered content on mobile, left-aligned on desktop

## Navigation

All settings navigation is handled by the shared `layout.tsx`. The layout provides:
- Consistent header with back button
- **Desktop:** Fixed sidebar navigation (always visible)
- **Mobile:** Hamburger menu with sheet navigation (slide-out drawer)
- Active state management and current page title display
- Fully responsive mobile layout with optimized touch targets

## Related Documentation

- See `SETTINGS_CONSOLIDATION.md` for migration details
- See component docs in `/components/user-preferences` for preferences components
- See `/features/organizations` for organization management features

