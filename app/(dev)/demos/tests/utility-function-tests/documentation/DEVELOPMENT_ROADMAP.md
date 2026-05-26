# Development Roadmap - Utility Function Registry System

## Overview

This document provides a detailed, actionable roadmap for completing the Utility Function Registry system. Tasks are organized by priority with estimated effort and specific implementation guidance.

---

## 🔴 Phase 1: Database Integration (CRITICAL)

**Goal:** Enable persistent, user-created functions stored in database  
**Duration:** 4-6 weeks  
**Blockers:** None - can start immediately  
**Dependencies:** Supabase database access

### 1.1 Database Service Layer (Week 1-2)

#### Task 1.1.1: Create Database Service
**File:** `utils/ts-function-registry/database-service.ts` (NEW)

```typescript
// Functions to implement:
- loadAllFunctions(): Promise<RegisteredFunction[]>
- loadFunctionById(id: string): Promise<RegisteredFunction | null>
- saveFunctionToDatabase(fn: FunctionDefinition): Promise<string>
- updateFunctionInDatabase(id: string, updates: Partial<FunctionDefinition>): Promise<void>
- deleteFunctionFromDatabase(id: string): Promise<void>
- searchFunctions(query: string): Promise<RegisteredFunction[]>
```

**Schema Decision:**
Choose between `registered_function` or `registered_functions` table, or create a new one:

```sql
CREATE TABLE function_registry (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  parameters JSONB NOT NULL,
  code TEXT NOT NULL,
  required_dependencies TEXT[],
  version INTEGER DEFAULT 1,
  is_public BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  tags TEXT[]
);
```

**Acceptance Criteria:**
- [ ] Can save function metadata to database
- [ ] Can load function metadata from database
- [ ] Can update existing functions
- [ ] Can delete functions
- [ ] All operations include error handling
- [ ] TypeScript types match database schema

#### Task 1.1.2: Extend Function Registry
**File:** `utils/ts-function-registry/function-registry.ts` (MODIFY)

**Changes Needed:**

1. Add source tracking to RegisteredFunction:
```typescript
export interface RegisteredFunction {
  metadata: FunctionMetadata;
  execute: (params: Record<string, any>, dependencies: FunctionDependencies) => Promise<any>;
  requiredDependencies: string[];
  source: 'code' | 'database';  // NEW
  databaseId?: string;            // NEW
  version?: number;               // NEW
}
```

2. Add lazy loading support:
```typescript
export async function ensureFunctionLoaded(name: string): Promise<void> {
  const fn = functionRegistry[name];
  if (fn && fn.source === 'database' && !fn.execute) {
    // Load function code from database
    await loadFunctionCode(name);
  }
}
```

3. Add initialization function:
```typescript
export async function initializeRegistry(): Promise<void> {
  // Load metadata for all database functions
  const dbFunctions = await loadAllFunctions();
  
  // Register them in the registry
  dbFunctions.forEach(fn => {
    registerDatabaseFunction(fn);
  });
}
```

**Acceptance Criteria:**
- [ ] Registry supports both code and database functions
- [ ] Database functions load lazily
- [ ] Registry initialization is async-safe
- [ ] No breaking changes to existing code functions

#### Task 1.1.3: Code Execution Engine
**File:** `utils/ts-function-registry/code-executor.ts` (NEW)

**Purpose:** Safely execute user-provided JavaScript code

```typescript
export interface CodeExecutionOptions {
  code: string;
  params: Record<string, any>;
  dependencies: FunctionDependencies;
  timeout?: number;
}

export async function executeUserCode(
  options: CodeExecutionOptions
): Promise<any> {
  // Option 1: Use eval with safety checks
  // Option 2: Use Function constructor
  // Option 3: Use isolated-vm library (recommended)
  
  // Implementation needed
}
```

**Security Considerations:**
- ⚠️ User code can be malicious
- ⚠️ Needs timeout protection
- ⚠️ Needs memory limits
- ⚠️ Should not have direct access to sensitive data

**Recommended Approach:**
```bash
pnpm add isolated-vm
```

**Acceptance Criteria:**
- [ ] Can execute user-provided JavaScript safely
- [ ] Execution times out after configurable duration
- [ ] Limited access to dependencies
- [ ] Error handling returns user-friendly messages
- [ ] Performance is acceptable (<100ms overhead)

### 1.2 Function Management UI (Week 3-4)

#### Task 1.2.1: Function List Page
**File:** `app/(authenticated)/tests/utility-function-tests/manage-functions/page.tsx` (NEW)

**Features:**
- List all functions (code + database)
- Filter by category
- Search by name/description
- Distinguish code vs database functions
- Quick actions: Edit, Delete, Test
- Create new function button

**Components Needed:**
- FunctionListCard
- FunctionFilters
- SearchBar
- ActionButtons

**Acceptance Criteria:**
- [ ] Shows all registered functions
- [ ] Can filter and search
- [ ] Indicates function source (code/database)
- [ ] Mobile-responsive layout
- [ ] Loading and error states

#### Task 1.2.2: Function Editor Page
**File:** `app/(authenticated)/tests/utility-function-tests/manage-functions/[id]/page.tsx` (NEW)

**Features:**
- Code editor with syntax highlighting
- Parameter definition builder
- Function metadata editor
- Dependency selector
- Live testing environment
- Save/Cancel actions

**Recommended Libraries:**
```bash
pnpm add @monaco-editor/react
pnpm add react-hook-form zod
```

**UI Sections:**
1. **Metadata Section**
   - Name (unique validation)
   - Display Name
   - Description
   - Category (dropdown)
   - Tags

2. **Parameters Section**
   - Add/remove parameters
   - Name, type, description, required
   - Default values

3. **Code Editor**
   - Monaco editor
   - Syntax highlighting
   - Auto-completion
   - Error highlighting

4. **Dependencies Section**
   - Checkbox list of available dependencies
   - Supabase, fetch, localStorage, etc.

5. **Test Section**
   - Input parameter values
   - Execute function
   - See results/errors

**Acceptance Criteria:**
- [ ] Can create new function from scratch
- [ ] Can edit existing database functions
- [ ] Code editor has syntax highlighting
- [ ] Parameter builder is intuitive
- [ ] Can test function before saving
- [ ] Validation prevents invalid functions
- [ ] Cannot edit code-based functions

#### Task 1.2.3: Function Templates
**File:** `app/(authenticated)/tests/utility-function-tests/manage-functions/templates/page.tsx` (NEW)

**Purpose:** Provide starter templates for common function types

**Template Categories:**
1. Data Transformation
2. API Integration
3. Validation
4. Calculation
5. String Processing
6. Array Processing

**Example Template:**
```typescript
// API Integration Template
async function execute(params, dependencies) {
  const { url, method = 'GET', body } = params;
  
  const response = await dependencies.fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  
  return await response.json();
}
```

**Acceptance Criteria:**
- [ ] 6+ useful templates available
- [ ] Templates include comments
- [ ] One-click use template
- [ ] Templates are categorized
- [ ] Each template has description

### 1.3 Testing & Polish (Week 5-6)

#### Task 1.3.1: Integration Testing
**File:** `utils/ts-function-registry/__tests__/database-integration.test.ts` (NEW)

**Test Cases:**
1. Save function to database
2. Load function from database
3. Execute database function
4. Update function code
5. Delete function
6. Handle errors gracefully

#### Task 1.3.2: Performance Optimization
**Areas to Optimize:**
1. Add caching layer for function metadata
2. Lazy load function code
3. Debounce search in function list
4. Optimize code editor load time

#### Task 1.3.3: Documentation
**Files to Create:**
1. `FUNCTION_CREATION_GUIDE.md` - How to create functions
2. `API_REFERENCE.md` - API documentation
3. `SECURITY_BEST_PRACTICES.md` - Security guidelines

**Acceptance Criteria:**
- [ ] Integration tests pass
- [ ] Performance meets benchmarks (<500ms to load list)
- [ ] Documentation is complete
- [ ] No console errors
- [ ] Responsive on mobile

---

## 🟡 Phase 2: Applet Persistence (HIGH PRIORITY)

**Goal:** Save and share multi-step workflows  
**Duration:** 2-3 weeks  
**Blockers:** Phase 1 completion  

### 2.1 Database Schema (Week 1)

#### Task 2.1.1: Create Applet Table
```sql
CREATE TABLE applets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL,
  is_public BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  tags TEXT[],
  category TEXT,
  execution_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ
);

-- Add indexes
CREATE INDEX idx_applets_created_by ON applets(created_by);
CREATE INDEX idx_applets_is_public ON applets(is_public);
CREATE INDEX idx_applets_category ON applets(category);
```

#### Task 2.1.2: Create Applet Service
**File:** `utils/ts-function-registry/applet-service.ts` (NEW)

```typescript
// Functions to implement:
- saveApplet(applet: AppletLogic): Promise<string>
- loadApplet(id: string): Promise<AppletLogic>
- listApplets(filters: AppletFilters): Promise<AppletLogic[]>
- updateApplet(id: string, updates: Partial<AppletLogic>): Promise<void>
- deleteApplet(id: string): Promise<void>
- executeAndLogApplet(id: string): Promise<ExecutionResult>
```

**Acceptance Criteria:**
- [ ] Can save applets to database
- [ ] Can load saved applets
- [ ] Can list user's applets
- [ ] Can search/filter applets
- [ ] Can track execution history

### 2.2 Applet Library UI (Week 2)

#### Task 2.2.1: Applet Gallery Page
**File:** `app/(authenticated)/tests/utility-function-tests/applets/page.tsx` (NEW)

**Features:**
- Grid view of applets
- Card with name, description, step count
- Filter by category
- Search by name/description
- Quick actions: Run, Edit, Delete, Duplicate
- Create new applet button

#### Task 2.2.2: Applet Builder Enhancement
**File:** `components/ts-function-registry/AppletBuilder.tsx` (MODIFY)

**Add Features:**
- Save button
- Load button
- Name/description fields
- Category selector
- Public/private toggle
- Tag input

**Acceptance Criteria:**
- [ ] Can save applet being built
- [ ] Can load saved applet for editing
- [ ] UI is intuitive
- [ ] Autosave draft support

### 2.3 Sharing & Permissions (Week 3)

#### Task 2.3.1: Sharing System
**Features:**
- Share applet via link
- Public/private toggle
- Copy/duplicate others' public applets
- View-only vs edit permissions

#### Task 2.3.2: Execution History
**Table:**
```sql
CREATE TABLE applet_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  applet_id UUID REFERENCES applets(id),
  executed_by UUID REFERENCES auth.users(id),
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  success BOOLEAN,
  error_message TEXT,
  execution_time_ms INTEGER
);
```

**Features:**
- View execution history
- Filter by date/status
- See error details
- Performance metrics

---

## 🟡 Phase 3: Security & Permissions (MEDIUM-HIGH PRIORITY)

**Goal:** Safe execution in multi-user environment  
**Duration:** 2-3 weeks  
**Blockers:** Phase 1 completion

### 3.1 Code Sandboxing (Week 1)

#### Task 3.1.1: Implement Sandbox
**File:** `utils/ts-function-registry/sandbox.ts` (NEW)

**Approach Options:**
1. **isolated-vm** - Separate V8 isolate (best security)
2. **vm2** - Sandboxed Node.js VM (good security)
3. **Web Workers** - Browser-based isolation (moderate security)

**Recommended: isolated-vm**
```typescript
import ivm from 'isolated-vm';

export async function executeSandboxed(
  code: string,
  params: any,
  dependencies: any,
  timeoutMs: number = 5000
): Promise<any> {
  const isolate = new ivm.Isolate({ memoryLimit: 128 });
  const context = await isolate.createContext();
  
  // Set up sandbox with limited dependencies
  // Execute code
  // Return result
}
```

**Acceptance Criteria:**
- [ ] User code cannot access process
- [ ] Cannot require arbitrary modules
- [ ] Timeout protection works
- [ ] Memory limits enforced
- [ ] Crashes don't affect server

### 3.2 Permission System (Week 2)

#### Task 3.2.1: Function Permissions
**Table:**
```sql
CREATE TABLE function_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  function_id UUID REFERENCES function_registry(id),
  user_id UUID REFERENCES auth.users(id),
  permission TEXT CHECK (permission IN ('read', 'execute', 'edit', 'admin')),
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Permissions:**
- `read` - Can view function
- `execute` - Can run function
- `edit` - Can modify function
- `admin` - Can delete, change permissions

#### Task 3.2.2: Resource Quotas
**Table:**
```sql
CREATE TABLE user_quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  max_functions INTEGER DEFAULT 10,
  max_applets INTEGER DEFAULT 10,
  max_executions_per_day INTEGER DEFAULT 1000,
  max_execution_time_ms INTEGER DEFAULT 10000,
  executions_today INTEGER DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE
);
```

**Features:**
- Limit functions per user
- Limit executions per day
- Max execution time
- Quota warnings

### 3.3 Audit Logging (Week 3)

#### Task 3.3.1: Audit Log Table
```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Events to Log:**
- Function creation/update/deletion
- Function execution
- Applet creation/update/deletion
- Applet execution
- Permission changes
- Security violations

---

## 🟢 Phase 4: Advanced Features (MEDIUM PRIORITY)

**Goal:** Enhanced workflow capabilities  
**Duration:** 3-4 weeks  
**Blockers:** Phases 1-3 completion

### 4.1 Conditional Logic (Week 1)

#### Task 4.1.1: Conditional Steps
**Enhancement to AppletStep:**
```typescript
interface AppletStep {
  // ... existing fields
  condition?: {
    type: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan';
    left: string;   // Template variable
    right: any;     // Value to compare
  };
}
```

**Example:**
```typescript
{
  id: 'step3',
  functionName: 'sendEmail',
  condition: {
    type: 'equals',
    left: '{{step2.isValid}}',
    right: true
  }
}
```

#### Task 4.1.2: Branch Steps
```typescript
interface BranchStep {
  type: 'branch';
  condition: Condition;
  trueBranch: AppletStep[];
  falseBranch: AppletStep[];
}
```

### 4.2 Loops & Iteration (Week 2)

#### Task 4.2.1: Loop Step Type
```typescript
interface LoopStep {
  type: 'loop';
  iterations: number | string;  // Number or template
  loopVariable: string;
  steps: AppletStep[];
}
```

**Example:**
```typescript
{
  type: 'loop',
  iterations: '{{step1.users}}',  // Array from previous step
  loopVariable: 'user',
  steps: [
    {
      functionName: 'validateEmail',
      parameters: { email: '{{user.email}}' }
    }
  ]
}
```

### 4.3 Parallel Execution (Week 3)

#### Task 4.3.1: Parallel Step Container
```typescript
interface ParallelStep {
  type: 'parallel';
  steps: AppletStep[];
  waitForAll: boolean;  // vs. first to complete
}
```

### 4.4 Error Handling (Week 4)

#### Task 4.4.1: Error Recovery
```typescript
interface AppletStep {
  // ... existing fields
  onError?: {
    action: 'continue' | 'retry' | 'fail' | 'skip';
    retries?: number;
    fallbackValue?: any;
  };
}
```

---

## 🟢 Phase 5: Developer Experience (LOW-MEDIUM PRIORITY)

**Goal:** Better tools for developers  
**Duration:** 2-3 weeks

### 5.1 Debugging Tools (Week 1)

#### Task 5.1.1: Execution Debugger
**Features:**
- Step-by-step execution
- Breakpoints
- Variable inspection
- Execution timeline

#### Task 5.1.2: Console Logs
**Features:**
- Capture console.log from functions
- Display in UI
- Export logs

### 5.2 Testing Framework (Week 2)

#### Task 5.2.1: Function Testing UI
**Features:**
- Define test cases
- Run tests automatically
- Compare expected vs actual
- Test coverage metrics

#### Task 5.2.2: Applet Testing
**Features:**
- Mock step results
- Test individual steps
- Integration testing
- Performance benchmarks

### 5.3 Documentation Generator (Week 3)

#### Task 5.3.1: Auto-generate Docs
**Features:**
- Generate markdown from function metadata
- API reference
- Usage examples
- Export to PDF

---

## 🟣 Phase 6: Polish & Optimization (LOW PRIORITY)

**Goal:** Production-ready polish  
**Duration:** 2 weeks

### 6.1 Performance Optimization

**Tasks:**
1. Add Redis caching for functions
2. Optimize database queries
3. Implement pagination
4. Add lazy loading
5. Minimize bundle size

### 6.2 UI/UX Improvements

**Tasks:**
1. Add keyboard shortcuts
2. Improve mobile experience
3. Add onboarding tour
4. Improve error messages
5. Add accessibility features

### 6.3 Monitoring & Analytics

**Tasks:**
1. Add performance monitoring
2. Track usage metrics
3. Error tracking
4. User analytics
5. Cost monitoring

---

## Implementation Checklist

### Before Starting
- [ ] Review existing code thoroughly
- [ ] Understand database schema
- [ ] Set up local development environment
- [ ] Create feature branch

### Phase 1 (Database Integration)
- [ ] Database service layer complete
- [ ] Function registry enhanced
- [ ] Code execution engine working
- [ ] Function list page built
- [ ] Function editor built
- [ ] Function templates available
- [ ] Integration tests passing
- [ ] Performance optimized
- [ ] Documentation written

### Phase 2 (Applet Persistence)
- [ ] Database schema created
- [ ] Applet service implemented
- [ ] Applet gallery page built
- [ ] Applet builder enhanced
- [ ] Sharing system working
- [ ] Execution history tracking

### Phase 3 (Security)
- [ ] Code sandboxing implemented
- [ ] Permission system working
- [ ] Resource quotas enforced
- [ ] Audit logging active
- [ ] Security tests passing

### Phase 4 (Advanced Features)
- [ ] Conditional logic working
- [ ] Loops implemented
- [ ] Parallel execution working
- [ ] Error handling robust

### Phase 5 (Developer Experience)
- [ ] Debugging tools available
- [ ] Testing framework built
- [ ] Documentation generator working

### Phase 6 (Polish)
- [ ] Performance optimized
- [ ] UI/UX improved
- [ ] Monitoring active
- [ ] Ready for production

---

## Success Metrics

### Functionality Metrics
- [ ] Can create function in <2 minutes
- [ ] Can create applet in <5 minutes
- [ ] Function execution <500ms
- [ ] UI loads in <1 second
- [ ] Zero security vulnerabilities

### User Experience Metrics
- [ ] 95%+ uptime
- [ ] <100ms UI response time
- [ ] Mobile-responsive
- [ ] Accessibility score >90
- [ ] Error rate <1%

### Business Metrics
- [ ] 10+ users actively creating functions
- [ ] 100+ function executions per day
- [ ] 50+ saved applets
- [ ] User satisfaction >4/5

---

## Risk Mitigation

### Technical Risks

1. **Security vulnerabilities in user code execution**
   - Mitigation: Use isolated-vm, strict sandboxing
   - Fallback: Disable user code creation temporarily

2. **Performance degradation with many functions**
   - Mitigation: Caching, lazy loading, pagination
   - Fallback: Limit functions per user

3. **Database schema changes needed**
   - Mitigation: Use migrations, version database schema
   - Fallback: Keep old schema, add new columns

### Project Risks

1. **Scope creep**
   - Mitigation: Stick to roadmap, defer nice-to-haves
   - Fallback: Ship MVP first

2. **Integration complexity**
   - Mitigation: Thorough testing, incremental rollout
   - Fallback: Feature flags, gradual migration

3. **Resource constraints**
   - Mitigation: Prioritize ruthlessly, cut scope if needed
   - Fallback: Phase 1 only, gather feedback

---

## Dependencies & Prerequisites

### Technical Dependencies
- ✅ Supabase database access
- ✅ React 18+
- ✅ TypeScript
- ✅ Next.js 15
- ⚠️ Need to add: isolated-vm or vm2
- ⚠️ Need to add: Monaco editor
- ⚠️ Need to add: react-hook-form

### Team Dependencies
- Need: 1 senior developer (full-time, 12-16 weeks)
- Nice to have: UX designer (part-time, 2-4 weeks)
- Nice to have: Security reviewer (1 week)

### Infrastructure Dependencies
- Database migrations approved
- Staging environment available
- CI/CD pipeline configured
- Monitoring tools set up

---

## Go/No-Go Decision Factors

### Go if:
- ✅ This will be a core platform feature
- ✅ Resources available for 3-4 month commitment
- ✅ Product-market fit validated
- ✅ Security requirements can be met
- ✅ Business value exceeds cost

### No-Go if:
- ❌ Just an internal tool (use simpler solution)
- ❌ Resources unavailable
- ❌ Alternative solutions exist
- ❌ Security cannot be guaranteed
- ❌ Maintenance burden too high

---

*Last Updated: January 2025*  
*Estimated Total Effort: 12-16 weeks*  
*Risk Level: Medium*  
*Business Value: High (if completed)*

