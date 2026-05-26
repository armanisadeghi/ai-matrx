# Guest Tracking System - Quick Installation

## ⚡ Fast Track Setup (10 minutes)

### **Step 1: Install Package** (1 min)
```bash
pnpm add @fingerprintjs/fingerprintjs
```

### **Step 2: Run Database Migration** (2 min)
1. Open Supabase Dashboard → SQL Editor
2. Copy entire `create_global_guest_tracking.sql` file
3. Paste and click **RUN**
4. Verify: `SELECT * FROM guest_executions LIMIT 1;`

### **Step 3: Quick Test** (2 min)
```sql
-- Test the function works
SELECT * FROM check_guest_execution_limit('test_fingerprint_123', 5);

-- Should return: allowed=true, remaining=4, total_used=0
```

### **Step 4: Update Execute Endpoint** (3 min)

Open `app/api/public/apps/[slug]/execute/route.ts` and add at the top:

```typescript
import { checkGuestLimit, recordGuestExecution } from '@/lib/services/guest-limit-service';
```

Then before the app execution logic, add:

```typescript
// Check if user is authenticated
const { data: { user } } = await supabase.auth.getUser();

// For guests, enforce global limit
if (!user) {
    const fingerprint = body.fingerprint;
    
    if (!fingerprint) {
        return NextResponse.json({
            success: false,
            error: { type: 'fingerprint_required', message: 'Fingerprint required' }
        }, { status: 403 });
    }

    const limitStatus = await checkGuestLimit(fingerprint, 5);
    
    if (!limitStatus.allowed) {
        return NextResponse.json({
            success: false,
            limit_reached: true,
            remaining: 0,
            error: { type: 'rate_limit_exceeded', message: 'Daily limit reached' }
        }, { status: 429 });
    }
}
```

After successful task creation, add:

```typescript
// Record execution
if (!user && body.fingerprint) {
    await recordGuestExecution({
        fingerprint: body.fingerprint,
        resourceType: 'prompt_app',
        resourceId: app.id,
        resourceName: app.name,
        taskId,
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0],
        userAgent: request.headers.get('user-agent')
    });
}
```

### **Step 5: Update Public Renderer** (2 min)

Open `features/prompt-apps/components/PromptAppPublicRenderer.tsx`:

Replace the `generateFingerprint()` function:

```typescript
import { getFingerprint } from '@/lib/services/fingerprint-service';

// Remove old generateFingerprint function

// In component:
useEffect(() => {
    (async () => {
        const fp = await getFingerprint();
        setFingerprint(fp);
    })();
}, []);
```

---

## ✅ Verify It Works

### Test 1: Check Fingerprint
```typescript
// In browser console on public app page:
console.log('Fingerprint:', sessionStorage.getItem('guest_fingerprint'));
// Should show a long alphanumeric string
```

### Test 2: Run App 6 Times
1. Run app → Should work (4 left)
2. Run app → Should work (3 left)
3. Run app → Should work (2 left) + Warning appears
4. Run app → Should work (1 left) + Warning
5. Run app → Should work (0 left) + Warning  
6. Run app → **BLOCKED** + Signup modal

### Test 3: Check Database
```sql
SELECT * FROM guest_executions ORDER BY created_at DESC LIMIT 5;
-- Should see your fingerprint with daily_executions = 5

SELECT COUNT(*) FROM guest_execution_log;
-- Should show 5 records
```

---

## 🚨 Troubleshooting

**Fingerprint not generating?**
```bash
# Check package installed
pnpm list @fingerprintjs/fingerprintjs

# If not:
pnpm add @fingerprintjs/fingerprintjs
```

**SQL function not found?**
```sql
-- Check if function exists
SELECT * FROM pg_proc WHERE proname = 'check_guest_execution_limit';

-- If not, re-run migration SQL
```

**Limits not enforcing?**
```typescript
// Add debug logging in execute endpoint:
console.log('Limit check result:', limitStatus);
console.log('User:', user ? 'authenticated' : 'guest');
console.log('Fingerprint:', fingerprint);
```

**UI not showing warnings?**
- Check if `useGuestLimit` hook is imported
- Check browser console for errors
- Verify `GuestLimitWarning` component imported

---

## 📝 Files You'll Edit

**Required:**
1. `app/api/public/apps/[slug]/execute/route.ts` - Add limit checks
2. `features/prompt-apps/components/PromptAppPublicRenderer.tsx` - Use new fingerprint service

**Optional (for full UI):**
3. Add `<GuestLimitWarning />` to renderer
4. Add `<SignupConversionModal />` to renderer  
5. Use `useGuestLimit()` hook for automatic state management

---

## 🎯 Done!

After these steps:
- ✅ FingerprintJS installed
- ✅ Database tracking ready
- ✅ API enforcing global limits
- ✅ Frontend using robust fingerprints

**Next:** Add UI components for warnings and signup conversion (see GUEST_TRACKING_IMPLEMENTATION.md for full guide)

