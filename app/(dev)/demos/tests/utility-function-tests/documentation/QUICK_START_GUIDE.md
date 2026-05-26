# Utility Function Registry - Quick Start Guide

## What Is This System?

A dynamic function registry that allows you to:
1. **Register functions** with metadata (name, description, parameters)
2. **Execute functions** with runtime data and dependencies
3. **Compose workflows** by chaining functions into multi-step "applets"
4. **Customize display** with specialized result components

Think of it as a "function-as-a-service" platform built into your application.

---

## Current Status

### ✅ What Works Right Now

1. **15+ Pre-built Functions** including:
   - Date formatting
   - String transformations
   - Email validation
   - Statistics calculations
   - Array operations
   - JSON utilities
   - HTTP requests
   - Local storage operations
   - Database operations (create tables, add rows, etc.)

2. **Four Working Demo Pages:**
   - Function Button Demo - Test individual functions
   - Function Registry Demo - See applet execution
   - Smart Executor Demo - Custom result displays
   - Create Table Templates - Real-world use case

3. **Multi-Step Applets:**
   - Chain functions together
   - Pass data between steps
   - Validate before execution

### ❌ What's Missing (The Big Problem)

**CRITICAL: No Database Persistence**

Functions are only registered in memory (JavaScript code). This means:
- ❌ Functions disappear on page refresh
- ❌ Users can't create custom functions through UI
- ❌ No function library or marketplace
- ❌ Can't save or share workflows

**The database tables exist** (`registered_function` and `registered_functions`) but **no code connects to them**!

---

## How to Use It (Current State)

### 1. Test Individual Functions

Navigate to: `/tests/utility-function-tests/function-button-demo`

```typescript
// Example: Format a date
{
  "date": "2025-01-21T10:30:00Z",
  "format": "yyyy-MM-dd HH:mm:ss"
}
```

Click "Execute" to see the result.

### 2. Browse Available Functions

Navigate to: `/tests/utility-function-tests/function-registry-demo`

- Select a category
- Pick a function
- Fill in parameters
- Execute and see results

### 3. Run Pre-built Applets

Same page as #2 - scroll down to see:
- **Utility Functions Demo**: Shows date formatting, string transforms, etc.
- **Create Customer Table**: Multi-step workflow example

### 4. Create Tables from Templates

Navigate to: `/tests/utility-function-tests/create-table-templates`

- Select a schema template
- Give it a name
- Optionally import flashcard data
- Create and view the table

---

## How to Add a New Function (Code-Based)

### Step 1: Add to Register File

Edit: `utils/ts-function-registry/register-utility-functions.ts`

```typescript
registerFunction(
  {
    name: 'myNewFunction',
    displayName: 'My New Function',
    description: 'What this function does',
    category: 'Utilities',
    parameters: [
      {
        name: 'input',
        type: 'string',
        description: 'Input parameter',
        required: true
      }
    ],
    returnType: 'string'
  },
  async (params: Record<string, any>, dependencies: FunctionDependencies) => {
    // Your function logic here
    return params.input.toUpperCase();
  },
  [] // Required dependencies (e.g., ['supabase', 'fetch'])
);
```

### Step 2: Test It

1. Refresh the page (functions re-register)
2. Go to function-button-demo
3. Select your function from dropdown
4. Test with sample data

---

## How to Create an Applet (Code-Based)

```typescript
const myApplet: AppletLogic = {
  id: 'my-workflow',
  name: 'My Workflow',
  description: 'What this workflow does',
  steps: [
    {
      id: 'step1',
      type: 'function',
      functionName: 'formatDate',
      title: 'Format Today\'s Date',
      parameters: {
        date: new Date().toISOString(),
        format: 'yyyy-MM-dd'
      }
    },
    {
      id: 'step2',
      type: 'function',
      functionName: 'stringTransform',
      title: 'Transform Result',
      parameters: {
        input: '{{step1}}',  // Reference previous step
        transformation: 'uppercase'
      }
    }
  ]
};

// Use AppletRunner component to execute
<AppletRunner applet={myApplet} />
```

---

## Available Function Categories

1. **Utilities**
   - formatDate
   - stringTransform
   - convertData
   - generateRandomData
   - jsonUtility

2. **Validation**
   - validateEmail

3. **Arrays**
   - filterArray
   - arrayOperation

4. **Math**
   - calculateStats

5. **Network**
   - httpRequest

6. **Browser**
   - storageOperation

7. **Schema Templates**
   - createSchemaTemplate
   - getSchemaTemplates
   - getSchemaTemplateById
   - deleteSchemaTemplate
   - updateSchemaTemplate

8. **User Tables**
   - createTable
   - addColumn
   - getTableDetails
   - addRow

---

## Key Components You Can Use

### FunctionButton
Execute any registered function with a button.

```typescript
<FunctionButton
  functionName="formatDate"
  data={{ date: "2025-01-01", format: "yyyy-MM-dd" }}
  dependencies={dependencies}
  buttonText="Format Date"
  onExecuted={(result) => console.log(result)}
/>
```

### SmartFunctionExecutor
Function button + specialized result display.

```typescript
<SmartFunctionExecutor
  functionName="calculateStats"
  data={{ numbers: [1, 2, 3, 4, 5] }}
  dependencies={dependencies}
  resultComponentName="statsDisplay"
  buttonText="Calculate"
/>
```

### AppletRunner
Execute multi-step workflows.

```typescript
<AppletRunner 
  applet={myApplet}
  customDependencies={dependencies}
/>
```

### AppletFunctionPicker
Browse and execute any function.

```typescript
<AppletFunctionPicker dependencies={dependencies} />
```

---

## Dependencies System

Functions can require external dependencies:

```typescript
const dependencies: FunctionDependencies = {
  supabase,              // Database client
  logger: console,        // Logging
  localStorage,           // Browser storage
  fetch                   // HTTP requests
};
```

When registering a function, specify required dependencies:

```typescript
registerFunction(
  metadata,
  executeFunction,
  ['supabase', 'fetch']  // This function needs these
);
```

---

## Result Components

Specialized displays for function results:

1. **jsonViewer** - Generic JSON (works with any function)
2. **dateDisplay** - Pretty date formatting
3. **statsDisplay** - Statistics in grid layout
4. **validationDisplay** - Validation with ✓/✗
5. **randomDataDisplay** - Generated data list
6. **stringTransformDisplay** - Before/after comparison

Create custom result components:

```typescript
registerResultComponent(
  {
    name: 'myDisplay',
    displayName: 'My Display',
    description: 'Custom result renderer',
    supportedFunctions: ['myFunction']
  },
  ({ result, error }) => {
    return <div>{/* Your custom JSX */}</div>;
  }
);
```

---

## Common Use Cases

### 1. Data Transformation Pipeline
```typescript
const pipeline: AppletLogic = {
  steps: [
    { functionName: 'httpRequest', ... },      // Fetch data
    { functionName: 'convertData', ... },       // JSON to CSV
    { functionName: 'storageOperation', ... }   // Save to localStorage
  ]
};
```

### 2. Database Setup Workflow
```typescript
const setup: AppletLogic = {
  steps: [
    { functionName: 'createSchemaTemplate', ... },
    { functionName: 'createTable', ... },
    { functionName: 'addRow', ... }  // Multiple times
  ]
};
```

### 3. Validation & Processing
```typescript
const validate: AppletLogic = {
  steps: [
    { functionName: 'validateEmail', ... },
    { functionName: 'httpRequest', ... },  // If valid, post to API
    { functionName: 'formatDate', ... }    // Format response
  ]
};
```

---

## What Needs to Be Built

### Priority 1: Database Integration (4-6 weeks)

**Goal:** Users can create and save custom functions

**Tasks:**
1. Create database service layer
   - `loadFunctionsFromDatabase()`
   - `saveFunctionToDatabase()`
   - `updateFunctionInDatabase()`
   - `deleteFunctionFromDatabase()`

2. Update function registry
   - Support database-backed functions
   - Lazy loading of function code
   - Caching mechanism

3. Build function management UI
   - Function editor page
   - Code editor component
   - Parameter builder
   - Test execution environment

**Deliverable:** Full CRUD for database-stored functions

### Priority 2: Applet Persistence (2 weeks)

**Goal:** Save and share workflows

**Tasks:**
1. Create applet database table
2. Save/load applet definitions
3. Applet library UI
4. Search and categorization

**Deliverable:** Persistent workflow library

### Priority 3: Security (2-3 weeks)

**Goal:** Safe execution of user code

**Tasks:**
1. Code sandboxing
2. Execution timeouts
3. Permission system
4. Input validation

**Deliverable:** Production-ready security

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│         React Components (UI Layer)              │
│  FunctionButton | AppletRunner | Builder         │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│      Function Registry (Core System)             │
│  - Register functions                            │
│  - Execute with validation                       │
│  - Manage dependencies                           │
└──────────────────┬──────────────────────────────┘
                   │
        ┌──────────┴─────────┐
        │                    │
┌───────▼────────┐  ┌────────▼──────────┐
│  Code-Based    │  │  Database-Backed  │
│  Functions     │  │  Functions        │
│  (Current)     │  │  (TODO)           │
└────────────────┘  └───────────────────┘
```

---

## FAQ

### Q: Can users create functions without writing code?
**A:** Not yet. This requires the database integration and a function builder UI (Priority 1).

### Q: Are applets saved?
**A:** No, they're currently defined in code only. Saving requires Priority 2 work.

### Q: Is it safe to execute user-provided functions?
**A:** No, there's no sandboxing yet. This is a security risk that Priority 3 addresses.

### Q: Can functions call other functions?
**A:** Yes! Use applets to chain functions together.

### Q: Can I use this in production?
**A:** For demo/testing purposes yes, but not for user-facing features until database persistence and security are implemented.

### Q: How do I debug function execution?
**A:** Check browser console for logs. Better debugging tools are on the roadmap.

---

## Next Steps

1. **Explore the demos** - Understand what's possible
2. **Try creating a function** - Follow "How to Add a New Function"
3. **Build a simple applet** - Chain 2-3 functions together
4. **Decide on database integration** - Is this worth completing?

---

## Getting Help

**Code Location:** `app/(authenticated)/tests/utility-function-tests`

**Key Files:**
- Registry: `utils/ts-function-registry/function-registry.ts`
- Functions: `utils/ts-function-registry/register-utility-functions.ts`
- Components: `components/ts-function-registry/`

**Database Tables:**
- `registered_function` (matrixDb)
- `registered_functions` (public)

---

*Last Updated: January 2025*

