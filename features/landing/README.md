# Landing Page & Invitation System

## Overview

The AI Matrx landing page provides an exclusive, invitation-only experience for new users. The system includes a beautiful, modern landing page with three primary user flows:

The page must render the exact product name **AI Matrx** as visible text.
Google OAuth verification compares the consent-screen app name with the public
homepage; metadata-only branding is insufficient.

1. **Login** - Existing users can sign in
2. **Enter Invitation Code** - New users with an invitation code can sign up
3. **Request Access** - Prospective users can request an invitation

## Features

### Landing Page (`app/page.tsx`)
- **Server-Side Rendered (SSR)** for optimal performance and SEO
- **Lazy-loaded modals** for better initial page load
- **Modern, exclusive design** with gradient backgrounds and professional UI
- **Fully responsive** with mobile-first approach
- **System theme detection** - Respects user's OS dark/light mode preference

### Invitation Request System
- **Two-step form process**:
  - Step 1: Required information (Name, Company, Email, Use Case, Role)
  - Step 2: Optional enrichment data (Phone, AI Obstacles, Referral, Current Tools, Recent Projects)
- **Email uniqueness validation**
- **Graceful handling** of existing requests
- **Beautiful success state** with clear messaging

### Invitation Code Validation
- **Real-time validation** of invitation codes
- **Format enforcement**: XXXX-XXXX-XXXX
- **Single-use codes** per successful account creation
- **Expiration support** (optional)
- **Usage tracking**

## Database Schema

### Tables Created

#### `invitation_requests`
Stores user requests for platform access.

**Key Fields:**
- `full_name`, `company`, `email` - Required Step 1 fields
- `use_case` - What they want to build
- `user_type` - Role/profession category
- `status` - pending, approved, rejected, invited, converted
- `step_completed` - 1 or 2
- Optional Step 2 fields for deeper insights

#### `invitation_codes`
Manages invitation codes for signup.

**Key Fields:**
- `code` - Unique invitation code (format: XXXX-XXXX-XXXX)
- `status` - active, used, expired, revoked
- `max_uses` - Default 1 (single-use)
- `current_uses` - Tracks usage count
- `used_by_user_id` - Links to auth.users on use
- `expires_at` - Optional expiration date

### Helper Functions

**`generate_invitation_code()`**
- Generates random codes in format XXXX-XXXX-XXXX
- Excludes similar characters (I, O, 0, 1) to prevent confusion

**`mark_invitation_code_used(code, user_id)`**
- Atomically marks a code as used
- Updates usage counters
- Links to user account
- Returns success/failure

## Installation

### 1. Run Database Migration

```bash
# Using Supabase CLI
supabase migration up create_invitation_system

# Or manually execute the SQL file
# File: supabase/migrations/create_invitation_system.sql
```

### 2. Verify Tables Created

Check that the following tables exist in your Supabase database:
- `invitation_requests`
- `invitation_codes`

### 3. Deploy Application

The landing page is already integrated into `app/page.tsx` and will be live immediately.

## Usage

### For Users

#### Requesting Access
1. Click "Request Access" on the landing page
2. Fill out Step 1 (required fields)
3. Optionally complete Step 2 for priority consideration
4. Wait for invitation email from admin

#### Using an Invitation Code
1. Click "Enter Invitation Code"
2. Enter code in format XXXX-XXXX-XXXX
3. Get redirected to sign-up page with code pre-filled
4. Complete account creation

### For Administrators

#### Reviewing Requests (Manual Process)

Query pending requests:
```sql
SELECT 
  full_name,
  company,
  email,
  use_case,
  user_type,
  created_at
FROM invitation_requests
WHERE status = 'pending'
ORDER BY created_at DESC;
```

#### Generating Invitation Codes

Create a new invitation code:
```sql
INSERT INTO invitation_codes (code, invitation_request_id, status)
VALUES (
  generate_invitation_code(),
  'request-uuid-here',  -- Optional: link to a specific request
  'active'
);

-- Get the generated code
SELECT code FROM invitation_codes 
WHERE invitation_request_id = 'request-uuid-here';
```

Or manually specify a code:
```sql
INSERT INTO invitation_codes (code, status, max_uses)
VALUES ('ABCD-EFGH-JKLM', 'active', 1);
```

#### Approving Requests

```sql
UPDATE invitation_requests
SET 
  status = 'approved',
  notes = 'Approved for early access - great use case',
  reviewed_by = 'admin-user-id',
  reviewed_at = NOW()
WHERE id = 'request-uuid';
```

#### Managing Codes

Revoke a code:
```sql
UPDATE invitation_codes
SET status = 'revoked'
WHERE code = 'XXXX-XXXX-XXXX';
```

Check code usage:
```sql
SELECT 
  code,
  status,
  current_uses,
  max_uses,
  used_by_user_id,
  used_at
FROM invitation_codes
WHERE code = 'XXXX-XXXX-XXXX';
```

## File Structure

```
features/landing/
├── README.md                           # This file
├── index.ts                            # Barrel exports
├── types.ts                            # TypeScript types
├── actions.ts                          # Server actions
└── components/
    ├── InvitationCodeModal.tsx         # Enter invitation code
    └── RequestAccessModal.tsx          # Request access form

app/
├── page.tsx                            # New landing page
└── page-original.tsx                   # Backup of previous homepage

supabase/migrations/
└── create_invitation_system.sql        # Database migration
```

## API Reference

### Server Actions

All actions are located in `features/landing/actions.ts`.

#### `submitInvitationRequestStep1(data)`
Submits Step 1 of invitation request (required fields).

**Parameters:**
- `data: InvitationRequestStep1`

**Returns:**
- `ActionResponse<{ requestId: string }>`

**Example:**
```typescript
const result = await submitInvitationRequestStep1({
  full_name: 'John Smith',
  company: 'Acme Corp',
  email: 'john@acme.com',
  use_case: 'Building AI workflows for sales automation',
  user_type: 'business_executive'
});

if (result.success) {
  console.log('Request ID:', result.data.requestId);
}
```

#### `submitInvitationRequestStep2(requestId, data)`
Submits Step 2 of invitation request (optional fields).

**Parameters:**
- `requestId: string`
- `data: InvitationRequestStep2`

**Returns:**
- `ActionResponse`

#### `validateInvitationCode(code)`
Validates an invitation code.

**Parameters:**
- `code: string` - Format: XXXX-XXXX-XXXX

**Returns:**
- `ActionResponse<{ valid: boolean; codeId?: string }>`

#### `markInvitationCodeUsed(code, userId)`
Marks an invitation code as used (called during signup).

**Parameters:**
- `code: string`
- `userId: string` - auth.users ID

**Returns:**
- `ActionResponse`

## Components

### `<InvitationCodeModal />`
Modal for entering and validating invitation codes.

**Props:**
- `open: boolean` - Controls modal visibility
- `onOpenChange: (open: boolean) => void` - Callback for state changes

**Features:**
- Auto-formats code input (XXXX-XXXX-XXXX)
- Real-time validation
- Error handling with clear messages
- Smooth transitions to signup page

### `<RequestAccessModal />`
Two-step form modal for requesting platform access.

**Props:**
- `open: boolean`
- `onOpenChange: (open: boolean) => void`

**Features:**
- Multi-step form with progress indicator
- Conditional field display (e.g., "Other" specification)
- iOS-friendly input sizes (≥16px to prevent zoom)
- Skip option for Step 2
- Beautiful success state
- Comprehensive validation

## SEO Optimization

The landing page includes:
- **Enhanced metadata** with relevant keywords
- **OpenGraph tags** for social sharing
- **Structured content** for search engines
- **Fast loading** with SSR and lazy-loaded modals
- **Mobile-responsive** design
- **Semantic HTML** structure

## Security Considerations

### Current Implementation (As Requested - Simple)
- Basic email validation
- Code format validation
- SQL injection protection via Supabase SDK
- Row Level Security (RLS) policies enabled

### Future Enhancements (If Needed)
- Rate limiting on request submissions
- CAPTCHA integration
- Email verification for requests
- Admin dashboard for managing requests
- Automated invitation email system
- Analytics tracking

## Performance

### Optimizations Implemented
1. **Server-Side Rendering** - Initial page loads instantly
2. **Lazy Loading** - Modals only load when needed
3. **Code Splitting** - Dynamic imports for modal components
4. **Minimal Dependencies** - Uses existing UI components
5. **Optimized Images** - (Add when logo/images are included)

### Metrics to Monitor
- Page load time (target: < 2s)
- Time to Interactive (target: < 3s)
- Form submission success rate
- Code validation success rate

## Troubleshooting

### Common Issues

**Issue: Invitation code not validating**
- Verify code exists in database: `SELECT * FROM invitation_codes WHERE code = 'XXXX-XXXX-XXXX'`
- Check status is 'active'
- Verify not expired: `expires_at IS NULL OR expires_at > NOW()`
- Check usage count: `current_uses < max_uses`

**Issue: Request submission failing**
- Check email uniqueness
- Verify required fields are filled
- Check database connection
- Review server logs for detailed errors

**Issue: Modal not opening**
- Check browser console for errors
- Verify dynamic imports are loading
- Ensure JavaScript is enabled

## Future Enhancements

Potential features for future iterations:

1. **Admin Dashboard**
   - View and manage all requests
   - Generate codes with one click
   - Email templates for invitations
   - Analytics and insights

2. **Automated Workflows**
   - Auto-generate codes for approved requests
   - Email automation
   - Waitlist management
   - Priority scoring

3. **Enhanced Security**
   - Rate limiting
   - CAPTCHA
   - Email verification
   - IP tracking

4. **Analytics**
   - Conversion tracking
   - Request source attribution
   - User journey analytics
   - A/B testing

## Support

For issues or questions:
1. Check this README
2. Review server logs
3. Query database tables directly
4. Contact development team

---

**Last Updated:** November 20, 2024  
**Version:** 1.0.0  
**Status:** Production Ready
