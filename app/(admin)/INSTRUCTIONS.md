# Project Development Guidelines

## Core Guidelines:
- My name is Arman and I am the project owner.
- Thank you for your hard work and dedication to the project.
- I'm nice, but I have strict guidelines.

1. Always generate modular code, with reusable parts whenever possible.
 - Modular does not mean, over-modular. It means, that parts of the code that are truly separate should not be bunched together.
2. We use ShadCN, but I hate that ShadCN components require SO MUCH CODE so my preferred way to use them is to create simple 'wrappers' as reusable components that extend most of the functionality, but apply some of the basics so the components don't have to take up 20 lines of code each time!
3. Before trying to use components from scratch, always check the official-components.md file to see if a component already exists.
 - But this documentation is new so many things aren't listed there yet. If you don't see it, STOP and ASK ME please.


## Code Quality Standards

- Write high-quality, clean code that is accurate and complete
- Check types, imports, and references to ensure accuracy 
- When unsure about dependencies, check imports of related pages and fetch related code
- Breaking changes are absolutely forbidden without prior authorization

## Admin UI Layout Principles

- Admin pages should maximize screen real estate:
  - Always use full width and full height layouts (`w-full h-full`)
  - Avoid fixed container sizes that limit space unnecessarily
  - Prefer `container-fluid` over fixed container widths
  - Do not use arbitrary width constraints like `max-w-screen-lg`
- Use grid layouts and sections to organize content when needed, not to constrain it
- Color theming for admin pages:
  - Use slate colors as the primary color palette
  - Standard backgrounds: `bg-slate-100 dark:bg-slate-800`
  - Standard text: `text-slate-800 dark:text-slate-200`
  - Card/panel backgrounds: `bg-white dark:bg-slate-900`
  - Borders: `border-slate-200 dark:border-slate-700`
  - Always provide both light and dark variations
- Admin components should focus on functionality over aesthetics
- Prioritize information density and workflow efficiency

## Recommended UI Components

### Data Visualization

- **AccordionWrapper** (`@/components/matrx/matrx-collapsible/AccordionWrapper`):
  - Use for collapsible sections of content
  - Helps organize complex interfaces without cluttering
  - Includes support for right-side elements and default open state
  - Consistent with design system

- **FullScreenOverlay** (`@/components/official/FullScreenOverlay`):
  - For modal workflows with tabbed content
  - Perfect for complex forms, detailed views, and resource libraries
  - Supports various tab configurations and flexible content layouts
  - Provides consistent UI pattern for deep-dive functionality

### When to Use Each Component

- Use **RawJsonExplorer** when:
  - Displaying API responses or complex structured data
  - User needs to explore and navigate nested data
  - Data structure changes dynamically and needs flexible viewing

- Use **AccordionWrapper** when:
  - Sections of content can be logically grouped
  - UI would be overwhelming if all content was visible
  - Hierarchical organization is needed

- Use **FullScreenOverlay** when:
  - Multiple related views need to be accessible
  - Workflow requires focused attention without leaving the page
  - Templates, reference materials, or complex configuration is needed

## Code Reuse and Avoiding Duplication

- IMPORTANT: Always check for existing implementations before creating new ones
- Guidelines to prevent duplication:
  1. Search the codebase for similar functionality before implementing your own
  2. Check if there are existing hooks, components, or server actions that handle your use case
  3. Look for patterns in how similar features are implemented (e.g., database operations)
  4. Reuse existing hooks and server actions when possible
  5. If implementing new functionality, follow existing patterns
- Common pitfalls to avoid:
  1. Creating duplicate fetch implementations when server actions already exist
  2. Implementing client-side API calls when server actions would be more secure
  3. Reimplementing state management patterns that already exist in hooks
  4. Creating new components that duplicate existing functionality
- If integration with existing code is challenging, consult with Arman before creating parallel implementations

## Next.js 15 App Router Architecture

- Follow the "server-first" approach:
  - Keep page.tsx files as server components whenever possible
  - This allows using metadata exports and other server-only features
  - Create separate client components for interactive parts and import them in the page
- Client component guidelines:
  - Use `'use client'` directive at the top of client component files
  - Place client components in a /components subfolder
  - Client components should be focused on a specific interactive functionality
  - Keep the client boundary as deep in the component tree as possible
- When to use client components:
  - When using React hooks (`useState`, `useEffect`, `useContext`, etc.)
  - When using browser APIs (localStorage, fetch on client, etc.)
  - When using event handlers (onClick, onChange, etc.)
  - When needing interactivity or state management
- IMPORTANT: Never add `'use client'` to page.tsx files that export metadata
- For complex pages:
  - Create a server component for the page (page.tsx)
  - Create client components for interactive elements
  - Keep static UI in the server component
  - Import client components into the server component as needed

## Tailwind CSS Styling Guidelines

- Always provide light and dark variations for all colors
- Example: `text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700`
- While hover and border aren't always needed, always set both regular and dark values for any color
- Prefer slate color palette for admin interfaces

## Route Transition Guidelines

- All administration features are now implemented as routes (migration complete)
- When creating new administration features:
  1. Always implement them as proper Next.js routes (create page.tsx files)
  2. Update the corresponding entry in `app/(authenticated)/(admin-auth)/administration/categories.tsx`
  3. Use the `link` property (not `component`) to reference the route
  4. All features now use the route-based approach
- When adding a new feature to a category, always use the route-based approach with the `link` property
- If creating a new category, ensure all features within use the route-based approach

## Visual Indicators for Features

- All features display visual indicators:
  1. Feature cards display a "Route" badge in the top-right corner
  2. Features use a blue gradient highlight effect on hover
  3. New features display a "New" badge in amber/orange color
- To mark a feature as new:
  1. Add `isNew: true` to the feature entry in `administration/categories.tsx`
  2. This will automatically display the "New" badge on both the card and in the dashboard preview
  3. Remove the `isNew` flag once the feature is no longer considered new

## Category Structure and Styling

- Each category in `administration/categories.tsx` has the following structure:
  ```typescript
  {
    name: "Category Name",
    icon: <IconComponent className="w-6 h-6" />,
    iconColor: "text-color-600", // e.g., "text-blue-600", "text-violet-600"
    features: [...]
  }
  ```
- Category icons use unique colors to help distinguish between different administrative areas:
  - The `iconColor` property defines the icon's text color
  - The system automatically generates matching light backgrounds (e.g., `bg-blue-100 dark:bg-blue-900/20`)
  - Supported colors include: amber, blue, indigo, purple, green, cyan, pink, orange, red, teal, violet
  - When adding new categories, choose a color that isn't already in use for visual distinction

## Task Management Process

- All tasks should be documented in `tasks.md` files within the relevant feature directories
- Each task should have a verification subtask labeled "Verified by Arman"
- Tasks are only considered complete when:
  1. The developer marks the task as completed
  2. Arman verifies and approves the completion
- When reporting on task status, always highlight tasks completed but not yet verified

## Development Workflow

1. Create necessary routes and basic component structures first
2. Document all planned tasks in the relevant tasks.md file
3. Implement features incrementally, marking tasks as completed
4. Request verification from Arman for completed tasks
5. Add new tasks as needed during development

## Feature Requirements

### Database Administration

- SQL Editor for executing custom queries
- Saved queries management with copy/modify/execute functionality
- Stored procedures management
- RLS policies review and modification
- Complex RLS management for users/groups/public

### SQL Functions Management

- Comprehensive listing with search, filter, and sort capabilities
- Light/dark mode compatible UI
- Detailed function information view
- Management capabilities (create, edit, delete)

## Implementation Notes

- Start with basic functionality before adding enhancements
- Use tabbed interfaces for organizing complex sections
- Ensure all UI components are responsive and accessible
- Follow existing project patterns and conventions
- Verify all features with Arman before considering them complete 



## Active Tasklists:
- app\(authenticated)\(admin-auth)\administration\database\tasks.md
- app\(authenticated)\(admin-auth)\administration\database\sql-functions\tasks.md


## NEW Tasklist to be created:
- This directory needs to be moved to the new (admin-auth) folder and all references to it need to be updated: app\(authenticated)\admin\official-components
 - Then, we neeed to create a new tasklist for the new folder.
 - The first task will be to fix the JSON Explorer demo because it's not working.




# Broken Demos:

- **RawJsonExplorer** (`@/components/official/json-explorer/RawJsonExplorer`):
  - Use for displaying and navigating complex JSON structures
  - Provides bookmarking, path navigation, and improved readability
  - Great for API responses and nested data structures
  - Offers interactive exploration features
