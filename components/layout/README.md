# Quick Actions & Utilities Hub

## Quick access

The header Quick Actions menu is gone (2026-09-30) — it duplicated the
account menu. Quick tools (Scratchpad, Quick Note/Task/Chat/Scribe/Data,
Files, Chat History, Utilities Hub) live in the account menu's **Quick
Access** group: add one to `QUICK_ACCESS_ITEMS` in
`features/shell/components/header/header-right-menu/userMenuItems.constants.ts`.

---

## Utilities Hub

Full-screen tabbed overlay for complex tools.

### Adding New Tabs

Edit `features/quick-actions/components/UtilitiesOverlay.tsx`:

```typescript
const tabs: TabDefinition[] = [
    {
        id: 'notes',
        label: '📝 Notes',
        content: <NotesLayout />,
    },
    {
        id: 'mytab',
        label: '🔧 My Tool',
        content: <MyToolLayout />,
    },
];
```

### When to Use What

**Quick Action Sheet**: Fast in-and-out (forms, quick capture)  
**Utilities Hub Tab**: Complex UI (multi-panel, extended work)

That's it.

