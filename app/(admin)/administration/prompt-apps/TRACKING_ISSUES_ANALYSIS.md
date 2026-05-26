# Prompt Apps Tracking Issues - Analysis & Fix Plan

## 🔍 Issues Discovered

### 1. **SUCCESS RATE: 10000% BUG** ⚠️
**Problem:** Success rate showing as 10000% instead of 100%

**Root Cause:** Double multiplication by 100
- **Trigger function** (`update_app_success_rate()`): Calculates `(success_count / total) * 100`
- **Analytics view** (`prompt_app_analytics`): ALSO multiplies by 100
- Result: 100% becomes 10000%

**Location:**
```sql
-- File: supabase/migrations/create_prompt_apps_system.sql
-- Line ~499: Trigger multiplies by 100
rate := (success_count::DECIMAL / total_count) * 100;

-- Line ~238: View ALSO multiplies by 100
ROUND((COUNT(*) FILTER (WHERE pae.success = true)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2) 
AS success_rate_percent
```

**Fix:** Remove multiplication from trigger OR view (recommend removing from trigger)

---

### 2. **EXECUTION METRICS NOT RECORDED** ❌
**Problem:** execution_time_ms, tokens_used, and cost all show as 0 or NULL

**Root Cause:** Execution records are created at START but never updated at COMPLETION

**Current Flow:**
1. User submits app → `POST /api/public/apps/[slug]/execute`
2. API creates `prompt_app_executions` record with:
   - `success: true` (optimistic)
   - `execution_time_ms: NULL`
   - `tokens_used: NULL`
   - `cost: NULL`
3. Task submitted to backend via Socket.IO
4. Backend processes task → updates `ai_tasks` table with metrics
5. **🚨 MISSING STEP:** Never updates `prompt_app_executions` with final metrics!

**Files Involved:**
- `app/api/public/apps/[slug]/execute/route.ts` - Creates initial record (lines 255-274)
- `app/api/public/apps/response/[taskId]/route.ts` - Polls for completion (doesn't update executions)
- No trigger or callback updates `prompt_app_executions` when `ai_tasks` completes

**What's Missing:**
```sql
-- Need trigger or API call to do this:
UPDATE prompt_app_executions
SET 
  execution_time_ms = (SELECT total_time FROM ai_tasks WHERE task_id = ...),
  tokens_used = (SELECT tokens_total FROM ai_tasks WHERE task_id = ...),
  cost = (SELECT cost FROM ai_tasks WHERE task_id = ...),
  success = (SELECT CASE WHEN status = 'completed' THEN true ELSE false END FROM ai_tasks...)
WHERE task_id = ...;
```

---

### 3. **UNIQUE USERS SHOWING 0** 👥
**Problem:** 0 unique users despite executions recorded

**Possible Causes:**
1. Fingerprints not being sent from client
2. Fingerprints being sent but as NULL
3. View counting logic is correct but data is empty

**Check:**
- `features/prompt-apps/components/PromptAppPublicRenderer.tsx` - Does it send fingerprint?
- Browser fingerprinting library being used?
- Check actual execution records: `SELECT fingerprint, user_id FROM prompt_app_executions LIMIT 10;`

**View Logic (appears correct):**
```sql
COUNT(DISTINCT pae.fingerprint) AS unique_anonymous_users
```

---

### 4. **ERRORS NOT TRACKED** 🐛
**Problem:** Error count showing 0 despite known bugs

**Root Cause:** Errors only created when `success = false` + `error_type IS NOT NULL`
- Execution records created with `success: true`
- Never updated to `success: false` when task fails
- Trigger never fires

**Current Trigger:**
```sql
CREATE TRIGGER create_error_on_execution_failure
  AFTER INSERT ON prompt_app_executions
  FOR EACH ROW
  WHEN (NEW.success = false)  -- Never true on INSERT!
  EXECUTE FUNCTION create_error_on_failed_execution();
```

**Problem:** Trigger only fires on INSERT, but we insert with `success: true`. Need UPDATE trigger too!

---

### 5. **EXECUTION TIME = TOTAL LATENCY** ⏱️
**Problem:** Even if we record execution_time_ms from ai_tasks, it only measures AI processing time, not total user-perceived latency

**What's Missing:**
- Time from user submit → task creation → queue time → AI processing → response received
- Currently only tracking AI processing time
- Need to track: `TIMESTAMP when API called` → `TIMESTAMP when response fully streamed`

**Proper Tracking:**
```typescript
// In execute endpoint:
const execution_start = Date.now();

// Create execution record with:
metadata: {
  execution_start_time: execution_start
}

// When polling gets completion:
const execution_end = Date.now();
const total_latency_ms = execution_end - execution_start;

// Update execution record:
UPDATE prompt_app_executions 
SET execution_time_ms = total_latency_ms
WHERE task_id = ...
```

---

### 6. **AVG EXECUTION TIME NOT CALCULATED** 📊
**Problem:** `prompt_apps.avg_execution_time_ms` field not being updated

**Current State:**
- Field exists in database
- No trigger or process populates it
- View calculates it but doesn't write back to table

**Fix:** Either:
1. Remove field from table (just use view)
2. Add trigger to update it when executions change

---

## 📋 Fix Priority Order

### **CRITICAL (Fix First)**
1. ✅ Success rate double multiplication
2. ✅ Link ai_tasks completion to prompt_app_executions updates
3. ✅ Update execution records with actual metrics

### **HIGH (Fix Soon)**
4. ✅ Update success=false when tasks fail
5. ✅ Ensure error records are created
6. ✅ Verify fingerprint tracking

### **MEDIUM (Improvement)**
7. ✅ Track total user latency (not just AI time)
8. ✅ Add comprehensive logging

### **LOW (Nice to Have)**
9. ✅ Clean up avg_execution_time_ms field
10. ✅ Add monitoring dashboard

---

## 🔧 Proposed Solutions

### Solution 1: Database Trigger (Recommended)
Create trigger on `ai_tasks` that updates `prompt_app_executions`:

```sql
CREATE OR REPLACE FUNCTION update_prompt_app_execution_from_task()
RETURNS TRIGGER AS $$
DECLARE
  v_execution_record prompt_app_executions%ROWTYPE;
BEGIN
  -- Only process if this is a prompt app execution
  SELECT * INTO v_execution_record
  FROM prompt_app_executions
  WHERE task_id = NEW.task_id;
  
  IF FOUND THEN
    UPDATE prompt_app_executions
    SET 
      execution_time_ms = NEW.total_time,
      tokens_used = NEW.tokens_total,
      cost = NEW.cost,
      success = (NEW.status = 'completed'),
      error_type = CASE 
        WHEN NEW.status = 'failed' THEN 'execution_error'
        ELSE NULL
      END,
      error_message = CASE
        WHEN NEW.status = 'failed' THEN NEW.response_errors::text
        ELSE NULL
      END
    WHERE task_id = NEW.task_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_prompt_app_exec_on_task_update
  AFTER UPDATE OF status, total_time, tokens_total, cost ON ai_tasks
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.total_time IS DISTINCT FROM NEW.total_time)
  EXECUTE FUNCTION update_prompt_app_execution_from_task();
```

### Solution 2: API Endpoint (Alternative)
Add callback endpoint that client calls when task completes:

```typescript
// POST /api/public/apps/executions/[id]/complete
export async function POST(req, { params }) {
  const { id } = params;
  const { task_id } = await req.json();
  
  // Get ai_task metrics
  const task = await getAiTask(task_id);
  
  // Update execution record
  await supabase
    .from('prompt_app_executions')
    .update({
      execution_time_ms: task.total_time,
      tokens_used: task.tokens_total,
      cost: task.cost,
      success: task.status === 'completed'
    })
    .eq('id', id);
}
```

### Solution 3: Client-Side Tracking (For Total Latency)
Track start/end times on client:

```typescript
// In PromptAppPublicRenderer
const executionStart = Date.now();

// Submit task...

// On completion:
const totalLatency = Date.now() - executionStart;

// Update via API
await fetch(`/api/public/apps/executions/${executionId}/complete`, {
  method: 'POST',
  body: JSON.stringify({ 
    task_id,
    total_latency_ms: totalLatency
  })
});
```

---

## 🧪 Testing Plan

1. **Create test app** with simple prompt
2. **Execute 5 times** (mix of success/failure)
3. **Verify analytics:**
   - Success rate = 60-80% (not 10000%)
   - Execution times > 0
   - Token counts > 0
   - Costs > 0
   - Unique users = 1-5
   - Errors = 1-2
4. **Check rate limits table**
5. **Verify triggers fire** (check logs)

---

## 📝 Migration Script Needed

```sql
-- Fix existing success_rate data
UPDATE prompt_apps
SET success_rate = success_rate / 100
WHERE success_rate > 100;

-- Fix trigger
CREATE OR REPLACE FUNCTION update_app_success_rate()
RETURNS TRIGGER AS $$
DECLARE
  success_count INTEGER;
  total_count INTEGER;
  rate DECIMAL(5,2);
BEGIN
  SELECT 
    COUNT(*) FILTER (WHERE success = true),
    COUNT(*)
  INTO success_count, total_count
  FROM prompt_app_executions
  WHERE app_id = NEW.app_id;
  
  IF total_count > 0 THEN
    -- REMOVED * 100 here since view already does it
    rate := (success_count::DECIMAL / total_count);
    
    UPDATE prompt_apps
    SET success_rate = rate
    WHERE id = NEW.app_id;
  END IF;
  
  RETURN NEW;
END;
$$ language 'plpgsql';
```

---

## 🎯 Success Criteria

- [ ] Success rates show 0-100%
- [ ] Execution times > 0 for all completed tasks
- [ ] Token counts > 0 for all completed tasks
- [ ] Costs > 0 for all completed tasks
- [ ] Unique user counts accurate
- [ ] Errors properly recorded on failures
- [ ] Rate limits track properly
- [ ] Admin dashboard shows real data

