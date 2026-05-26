# SQL Fix Instructions - Quick Reference

## 🚀 How to Run

### **Option 1: Run Everything at Once (RECOMMENDED)**

1. Open Supabase Dashboard → SQL Editor
2. Open file: `FIX_TRACKING_ISSUES.sql`
3. **Copy the ENTIRE file contents**
4. **Paste into SQL Editor**
5. Click **RUN**
6. ✅ Done! All fixes applied.

**What gets fixed:**
- ✅ Success rates: 10000% → 100%
- ✅ Execution metrics will auto-populate from ai_tasks
- ✅ Errors will be tracked on failures
- ✅ Existing data cleaned up
- ✅ Analytics view improved

---

### **Option 2: Run in Sections (If you want to see each fix)**

You can run each section separately if you prefer, but they're all safe to run together.

**Section 1: Success Rate Fix**
- Lines 1-45 in the SQL file
- Fixes the 10000% bug

**Section 2: Link ai_tasks to executions**
- Lines 47-100
- Auto-updates execution records when tasks complete

**Section 3: Error Trigger Fix**
- Lines 102-125
- Makes errors track on UPDATE too

**Section 4: View Update**
- Lines 127-175
- Improves analytics calculations

---

## ✅ Verification

After running, execute these queries to verify:

```sql
-- Should show 0-100%, not 10000%
SELECT name, success_rate FROM prompt_apps;

-- Check if triggers are installed
SELECT trigger_name 
FROM information_schema.triggers 
WHERE trigger_name LIKE '%prompt_app%';

-- Test analytics view
SELECT * FROM prompt_app_analytics LIMIT 3;
```

---

## 📋 What Happens Next

### **Immediate Effects:**
- ✅ Success rates fixed (existing data corrected)
- ✅ Triggers installed and active
- ✅ View updated with better logic

### **Future Executions:**
When users run prompt apps after this fix:
1. Execution record created (like before)
2. Task goes to backend (like before)  
3. **NEW:** When ai_task completes → execution record auto-updates!
4. Metrics, tokens, cost all flow from ai_tasks → prompt_app_executions
5. Errors automatically created if task fails

### **Old Executions:**
❗ Existing execution records **won't** have metrics unless:
- The ai_task is still running (rare)
- You manually update them
- Users re-run the apps

This is expected - the trigger only works going forward.

---

## 🔍 Troubleshooting

### "Trigger already exists" error
**Solution:** The script includes `DROP TRIGGER IF EXISTS`, so this shouldn't happen. But if it does:
```sql
DROP TRIGGER IF EXISTS update_prompt_app_exec_on_task_update ON ai_tasks;
DROP TRIGGER IF EXISTS create_error_on_execution_failure ON prompt_app_executions;
```
Then re-run the script.

### "Function does not exist" error
**Solution:** Make sure you're running the complete script. Functions must be created before triggers.

### "Permission denied" error
**Solution:** You need admin access to create triggers. Make sure you're using the service_role or postgres user in Supabase.

---

## 📝 Next Steps

After running SQL fixes, see `POST_SQL_ACTIONS.md` for:
1. Verifying fingerprint tracking works
2. Adding total latency tracking
3. Testing end-to-end
4. Improving error handling

But the SQL fixes are the **critical** part - everything else is enhancement!

---

## 🎯 Expected Results

Run a test app after applying fixes:

**Before Fix:**
- Success Rate: 10000% 😵
- Execution Time: 0ms
- Tokens: 0
- Cost: $0.0000
- Unique Users: 0
- Errors: 0 (even with known bugs)

**After Fix:**
- Success Rate: 100% ✅
- Execution Time: 2500ms ✅
- Tokens: 850 ✅
- Cost: $0.0042 ✅
- Unique Users: 1 ✅
- Errors: Tracked when they occur ✅

---

## ⚡ Quick Command

If you just want to get it done:

1. Copy entire `FIX_TRACKING_ISSUES.sql` file
2. Paste in Supabase SQL Editor  
3. Click RUN
4. Check success rates → should be 0-100%
5. Run a test app → should get metrics

**Done! 🎉**

