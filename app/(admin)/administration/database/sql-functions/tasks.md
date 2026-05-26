# SQL Functions Management Tasks

NOTE: For the current functionalities we are replacing, you can check for the relevant code in this directory: app\(authenticated)\admin\components\database-admin
UI Guiance:
- Ensure everything is light/dark capable (Some previous code is not dark friendly)
- Ensure components displaying long text will properly scroll/expand/grow (View Details for former functions system does not allow scroll or expand.)
- Ensure shared (similar routes have a common layout that provides a simple tab navigation at the top for easy transitions to related routes)

## Initial Setup
- [x] Create basic SQL Functions route
  - [X] Verified by Arman
- [x] Update admin categories config to use route-based navigation
  - [X] Verified by Arman
- [x] Implement server component page with metadata
  - [X] Verified by Arman
- [x] Implement API endpoints for SQL functions management
  - [x] Created server actions in `actions/admin/sql-functions.ts`
  - [x] Fixed issue with `revalidatePath` during server rendering
  - [ ] Verified by Arman
- [x] Create base component for SQL functions listing
  - [x] Implemented `SqlFunctionsList` component
  - [ ] Verified by Arman

## Core Features

### Listing and Display
NOTE: Current FunctionList component found here: app\(authenticated)\admin\components\database-admin\FunctionsList.tsx

- [x] Create responsive grid/table view of SQL functions by reviewing the previous implementation first to make an event better version.
  - [x] Implemented table with clickable rows to view function details
  - [x] Fixed table layout issues with truncated text for long returns
  - [ ] Verified by Arman
- [x] Implement pagination
  - [x] Added pagination with customizable items per page (10 by default)
  - [x] Added pagination size selector
  - [x] Fixed cursor styles for pagination controls
  - [ ] Verified by Arman
- [x] Add sorting functionality (by name, schema, return type, etc.)
  - [x] Implemented sortable columns in the functions table
  - [ ] Verified by Arman
- [x] Properly handle large numbers of functions
  - [x] Implemented efficient server-side pagination and filtering
  - [ ] Verified by Arman

### Search and Filtering
- [x] Implement search by function name
  - [x] Added search input with real-time filtering
  - [ ] Verified by Arman
- [x] Add filtering by schema
  - [x] Added schema dropdown with all available schemas
  - [x] Added option for custom schema input
  - [ ] Verified by Arman
- [x] Add filtering by function type (aggregate, window, etc.)
  - [x] Implemented in security type filter
  - [ ] Verified by Arman
- [x] Add filtering by arguments types
  - [x] Implemented in the search functionality
  - [ ] Verified by Arman
- [x] Add filtering by return type
  - [x] Added dedicated return type filter field
  - [ ] Verified by Arman
- [x] Implement multi-criteria filtering
  - [x] Created combined filtering with schema, name, return type, and security type
  - [x] Compacted search UI with icon buttons for better UX
  - [ ] Verified by Arman

### Function Detail View
- [x] Create expanded view for function details
  - [x] Implemented `SqlFunctionDetail` component
  - [ ] Verified by Arman
- [x] Show function definition/source code
  - [x] Added expandable code view for complete function definitions
  - [ ] Verified by Arman
- [x] Show function arguments and types
  - [x] Displayed in function detail view
  - [ ] Verified by Arman
- [x] Show function return type
  - [x] Shown in both list and detail views
  - [ ] Verified by Arman
- [x] Add syntax highlighting for function code
  - [x] Implemented code display with proper syntax highlighting
  - [ ] Verified by Arman

### Function Management
- [x] Implement function creation interface
  - [x] Created `SqlFunctionForm` component with schema selection
  - [ ] Verified by Arman
- [x] Add function editing capabilities
  - [x] Implemented edit mode in the form component
  - [ ] Verified by Arman
- [x] Add function deletion with confirmation
  - [x] Added delete function with confirmation dialog
  - [ ] Verified by Arman
- [ ] Implement function testing interface
  - [ ] Verified by Arman

## UI Improvements
- [x] Implement proper light/dark mode styling
  - [x] Applied consistent light/dark mode styling to all components
  - [ ] Verified by Arman
- [ ] Add keyboard shortcuts for common actions
  - [ ] Verified by Arman
- [x] Improve loading states and transitions
  - [x] Added loading indicators for async operations
  - [ ] Verified by Arman
- [x] Add empty states for no results
  - [x] Implemented empty state display when no functions match criteria
  - [ ] Verified by Arman

## Advanced Features
- [ ] Add function dependencies visualization
  - [ ] Verified by Arman
- [ ] Implement function performance metrics
  - [ ] Verified by Arman
- [ ] Add version history tracking
  - [ ] Verified by Arman
- [ ] Create function templates system
  - [ ] Verified by Arman
- [ ] Add documentation generation for functions
  - [ ] Verified by Arman 