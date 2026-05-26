# Guest Tracking System - Implementation Guide

## 🎯 Overview

Complete replacement of per-app rate limiting with robust, global guest tracking system.

**Key Features:**
- ✅ FingerprintJS for reliable guest identification
- ✅ Global 5 free runs per day (across ALL apps)
- ✅ Progressive warnings (after 3rd run)
- ✅ Beautiful signup conversion at limit
- ✅ Bulletproof tracking - impossible to bypass
- ✅ Authenticated users = unlimited access

---

## 📦 Step 1: Install FingerprintJS

```bash
pnpm add @fingerprintjs/fingerprintjs
```

---

## 🗄️ Step 2: Run Database Migration

Copy and run `create_global_guest_tracking.sql` in Supabase SQL Editor.

**What it creates:**
- `guest_executions` table - One record per unique guest
- `guest_execution_log` table - Detailed history
- Functions for checking/recording executions
- RLS policies for security

---

## 🔧 Step 3: Update Execute Endpoint

Replace the rate limit logic in `/app/api/public/apps/[slug]/execute/route.ts`:

```typescript
import { getFingerprint } from '@/lib/services/fingerprint-service';
import { checkGuestLimit, recordGuestExecution } from '@/lib/services/guest-limit-service';

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const supabase = await createClient();

    try {
        const body = await request.json();
        const { variables = {}, metadata = {} } = body;

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        
        // Get guest fingerprint (even if authenticated, for tracking)
        let fingerprint: string | null = null;
        try {
            fingerprint = await getFingerprint();
        } catch (error) {
            console.error('Failed to get fingerprint:', error);
        }

        // CRITICAL: Check global guest limit for non-authenticated users
        if (!user) {
            if (!fingerprint) {
                return NextResponse.json({
                    success: false,
                    error: {
                        type: 'authentication_required',
                        message: 'Unable to identify guest. Please enable JavaScript or sign in.'
                    }
                }, { status: 403 });
            }

            // Check global limit (5 per day across all apps)
            const limitStatus = await checkGuestLimit(fingerprint, 5);
            
            if (!limitStatus.allowed) {
                return NextResponse.json({
                    success: false,
                    limit_reached: true,
                    remaining: limitStatus.remaining,
                    error: {
                        type: 'rate_limit_exceeded',
                        message: 'Daily limit reached. Please sign up for unlimited access.',
                        details: {
                            remaining: limitStatus.remaining,
                            is_blocked: limitStatus.is_blocked
                        }
                    }
                }, { status: 429 });
            }
        }

        // ... rest of execution logic ...

        // Record execution for tracking
        if (fingerprint) {
            await recordGuestExecution({
                fingerprint,
                resourceType: 'prompt_app',
                resourceId: app.id,
                resourceName: app.name,
                taskId,
                ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0],
                userAgent: request.headers.get('user-agent'),
                referer: request.headers.get('referer')
            });
        }

        return NextResponse.json({
            success: true,
            task_id: taskId,
            socket_config,
            // Include limit info for UI
            guest_limit: fingerprint && !user ? {
                remaining: limitStatus?.remaining || 0,
                total_used: limitStatus?.total_used || 0
            } : null
        });

    } catch (error) {
        // ... error handling ...
    }
}
```

---

## 🎨 Step 4: Update Public Renderer

Replace fingerprinting in `features/prompt-apps/components/PromptAppPublicRenderer.tsx`:

```typescript
import { getFingerprint } from '@/lib/services/fingerprint-service';
import { useGuestLimit } from '@/hooks/useGuestLimit';
import { GuestLimitWarning } from '@/components/guest/GuestLimitWarning';
import { SignupConversionModal } from '@/components/guest/SignupConversionModal';

export function PromptAppPublicRenderer({ app, slug }: PromptAppPublicRendererProps) {
    // Use guest limit hook
    const {
        allowed,
        remaining,
        totalUsed,
        showWarning,
        showSignupModal,
        dismissWarning,
        dismissSignupModal,
        refresh
    } = useGuestLimit();

    const [fingerprint, setFingerprint] = useState<string | null>(null);

    // Initialize fingerprint
    useEffect(() => {
        (async () => {
            const fp = await getFingerprint();
            setFingerprint(fp);
        })();
    }, []);

    const handleExecute = async (variables: Record<string, any>) => {
        // Check if guest is allowed
        if (!allowed) {
            setError({ 
                type: 'rate_limit', 
                message: 'Daily limit reached. Please sign up to continue.' 
            });
            return;
        }

        setIsExecuting(true);
        setError(null);

        try {
            const response = await fetch(`/api/public/apps/${slug}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    variables,
                    fingerprint, // Send fingerprint
                    metadata: {
                        // ... any metadata
                    }
                })
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.limit_reached) {
                    // Trigger signup modal
                    refresh(); // This will update showSignupModal to true
                }
                throw new Error(data.error?.message || 'Execution failed');
            }

            // Refresh limit status after execution
            await refresh();

            // Continue with socket connection...
            if (data.socket_config) {
                await connectToSocket(data.task_id, data.socket_config);
            }

        } catch (error: any) {
            console.error('Execution error:', error);
            setError({ 
                type: 'execution_error', 
                message: error.message 
            });
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <div>
            {/* Show warning after 3rd execution */}
            {showWarning && (
                <GuestLimitWarning 
                    remaining={remaining}
                    onDismiss={dismissWarning}
                    className="mb-4"
                />
            )}

            {/* Show signup modal at limit */}
            <SignupConversionModal
                isOpen={showSignupModal}
                onClose={dismissSignupModal}
                totalUsed={totalUsed}
            />

            {/* Rest of component */}
            {/* ... */}
        </div>
    );
}
```

---

## 🔒 Step 5: Remove Generic User ID System

**Find and remove all references to:**
```typescript
const PUBLIC_USER_ID = '00000000-0000-0000-0000-000000000001';
```

**Replace with:**
```typescript
// Never use generic user IDs
// All guests MUST be tracked via fingerprint
// Authenticated users use their real user ID
```

---

## 🛡️ Step 6: Add Protection Middleware (Optional but Recommended)

Create `/middleware/guestProtection.ts`:

```typescript
/**
 * Middleware to ensure fingerprints are present for non-auth routes
 * Prevents bypassing tracking
 */
export function validateGuestFingerprint(fingerprint: string | null, user: any) {
    // Authenticated users don't need fingerprint validation
    if (user) {
        return { valid: true };
    }

    // Guest must have valid fingerprint
    if (!fingerprint || fingerprint.length < 16) {
        return {
            valid: false,
            error: 'Invalid or missing fingerprint. Please enable JavaScript.'
        };
    }

    return { valid: true };
}
```

---

## ✅ Step 7: Test Everything

### Test Checklist:

**1. Guest Flow:**
- [ ] Run app 1st time → No warning
- [ ] Run app 2nd time → No warning  
- [ ] Run app 3rd time → No warning
- [ ] Run app 4th time → Warning appears ("1 free run left")
- [ ] Run app 5th time → Warning appears ("Last free run!")
- [ ] Try 6th time → Signup modal appears, execution blocked

**2. Warning UI:**
- [ ] Warning shows after 3rd execution
- [ ] Shows correct remaining count
- [ ] Can be dismissed
- [ ] Reappears on page reload

**3. Signup Modal:**
- [ ] Beautiful, welcoming design
- [ ] Shows total executions used
- [ ] Lists benefits clearly
- [ ] "Sign up" button works
- [ ] "Log in" button works
- [ ] Can be dismissed (but limit still enforced)

**4. Authenticated Users:**
- [ ] No warnings shown
- [ ] No limit checking
- [ ] Unlimited access
- [ ] Still tracked for analytics

**5. Cross-App Testing:**
- [ ] Run App A 3 times
- [ ] Run App B 2 times
- [ ] Total = 5, modal should appear on next run of ANY app

**6. Daily Reset:**
- [ ] Wait 24 hours or manually update `daily_reset_at`
- [ ] Guest can run 5 more times
- [ ] Counter resets properly

**7. Fingerprint Persistence:**
- [ ] Close browser, reopen → Same fingerprint
- [ ] Incognito mode → Different fingerprint
- [ ] Different browser → Different fingerprint
- [ ] Clear sessionStorage → Still same fingerprint

---

## 🔍 Verification Queries

```sql
-- Check guest records
SELECT 
    fingerprint,
    total_executions,
    daily_executions,
    daily_reset_at,
    is_blocked,
    created_at,
    last_execution_at
FROM guest_executions
ORDER BY last_execution_at DESC
LIMIT 10;

-- Check execution log
SELECT 
    gel.fingerprint,
    gel.resource_type,
    gel.resource_name,
    gel.success,
    gel.created_at
FROM guest_execution_log gel
ORDER BY gel.created_at DESC
LIMIT 20;

-- Count executions per guest
SELECT 
    fingerprint,
    COUNT(*) as execution_count,
    MAX(created_at) as last_execution
FROM guest_execution_log
GROUP BY fingerprint
ORDER BY execution_count DESC;

-- Check daily limits
SELECT 
    fingerprint,
    daily_executions,
    daily_reset_at,
    CASE 
        WHEN daily_reset_at < DATE_TRUNC('day', NOW()) THEN 'NEEDS RESET'
        WHEN daily_executions >= 5 THEN 'AT LIMIT'
        ELSE 'OK'
    END as status
FROM guest_executions
WHERE daily_executions > 0;
```

---

## 🚨 Security Checklist

- [x] Generic user ID removed everywhere
- [x] Fingerprint required for all guest executions
- [x] Fail closed on fingerprint errors
- [x] Global limits enforced (not per-app)
- [x] Daily reset mechanism
- [x] RLS policies prevent tampering
- [x] Execution log for audit trail
- [x] Authenticated users bypass limits
- [x] No way to execute without tracking

---

## 📊 Monitoring

**Key Metrics to Watch:**

1. **Guest Conversion Rate**
   ```sql
   SELECT 
       COUNT(DISTINCT fingerprint) as total_guests,
       COUNT(DISTINCT converted_to_user_id) as converted_guests,
       ROUND(COUNT(DISTINCT converted_to_user_id)::DECIMAL / COUNT(DISTINCT fingerprint) * 100, 2) as conversion_rate
   FROM guest_executions
   WHERE created_at > NOW() - INTERVAL '30 days';
   ```

2. **Daily Guest Activity**
   ```sql
   SELECT 
       DATE(created_at) as date,
       COUNT(DISTINCT fingerprint) as unique_guests,
       COUNT(*) as total_executions
   FROM guest_execution_log
   GROUP BY DATE(created_at)
   ORDER BY date DESC
   LIMIT 30;
   ```

3. **Limit Hit Rate**
   ```sql
   SELECT 
       COUNT(*) FILTER (WHERE daily_executions >= 5) as at_limit,
       COUNT(*) as total_guests,
       ROUND(COUNT(*) FILTER (WHERE daily_executions >= 5)::DECIMAL / COUNT(*) * 100, 2) as hit_rate_percent
   FROM guest_executions
   WHERE last_execution_at > NOW() - INTERVAL '24 hours';
   ```

---

## 🎯 Success Criteria

- ✅ Zero executions without fingerprint tracking
- ✅ Global 5-run limit enforced across all apps
- ✅ Smooth user experience (no disruption for first 3 runs)
- ✅ High-quality signup conversion flow
- ✅ Authenticated users have unlimited access
- ✅ Comprehensive tracking for analytics and cost control
- ✅ Impossible to bypass limits without technical expertise
- ✅ Daily reset works automatically

---

## 💡 Future Enhancements

1. **Dynamic Limits** - Adjust based on user behavior
2. **Referral Bonuses** - Extra runs for referrals
3. **Email Gate** - Collect email for 10 extra runs before signup
4. **Premium Trial** - 7-day premium trial on signup
5. **Usage Analytics** - Dashboard for guests to see their usage
6. **IP Reputation** - Block known VPN/proxy IPs
7. **Behavioral Analysis** - Detect and block bots
8. **CAPTCHA Integration** - For suspicious patterns

