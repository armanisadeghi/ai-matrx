# Experimental Routes Manager

A practical, list-based interface for accessing all experimental, demo, and test routes in the application.

## Adding New Routes

To add a new experimental route, edit `experimental-routes-config.ts`:

### Add to Existing Section

```typescript
{
    name: "Prompts",
    baseRoute: "/ai/prompts",
    routes: [
        // ... existing routes
        {
            path: "/ai/prompts/experimental/new-feature",
            name: "New Feature Name",
            description: "What this feature does", // optional
            status: 'active' // optional: 'active' | 'deprecated' | 'in-progress'
        },
    ]
}
```

### Create New Section

```typescript
{
    name: "Chat", // Section name
    description: "Chat feature experiments", // optional
    baseRoute: "/chat", // Base route for this section
    routes: [
        {
            path: "/chat/experimental/new-chat-ui",
            name: "New Chat UI",
            description: "Testing new chat interface design",
            status: 'in-progress'
        },
    ]
}
```

## Features

- **Search**: Type to search across all route names, paths, and descriptions
- **Collapsible Sections**: Click section headers to expand/collapse
- **Status Badges**: Visual indicators for route status (active, in-progress, deprecated)
- **Quick Navigation**: Click any route to navigate directly
- **Route Count**: See how many routes are in each section at a glance

## Route Status Options

- `active` - Route is working and ready for testing
- `in-progress` - Route is under development
- `deprecated` - Route is old/being replaced
- Leave blank for no status badge

## Structure

```
administration/
├── experimental-routes/
│   ├── page.tsx                          # Main experimental routes page
│   └── README.md                         # This file
└── experimental-routes-config.ts         # Route configuration (edit this!)
```

## Tips

1. Keep descriptions short and clear
2. Use descriptive names that indicate what's being tested
3. Group related routes under the same section
4. Update status as routes mature or get deprecated
5. Remove deprecated routes once the feature is moved to production

