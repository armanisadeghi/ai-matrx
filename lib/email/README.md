# Email Service

Centralized **application** email via Resend API (`lib/email/client.ts`).

**Auth email** (signup confirm, password reset) is Supabase → Resend SMTP — not this
client. Two paths, two Resend keys: see `features/email/FEATURE.md`.

## Files

- **client.ts** - Core email sending via Resend, email templates for welcome, invitations, sharing
- **exportService.ts** - "Email to me" features for exporting content (chat responses, table exports, share links)
- **notificationService.ts** - Notification emails with user preference checking (task assignments, comments, messages, due dates)

## Environment Variables

```bash
RESEND_API_KEY=           # app Resend key — NOT the Supabase SMTP (ai-matrx-main) key
EMAIL_FROM=AI Matrx <noreply@aimatrx.com>
EMAIL_ALLOWED_DOMAINS=aimatrx.com,updates.aimatrx.com
ADMIN_EMAIL=admin@aimatrx.com
CRON_SECRET=              # optional — cron endpoints
```

## API Endpoints

### Export/Self-Send Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/chat/email-response` | Required | Email AI chat response to authenticated user |
| `POST /api/export/email-table` | Required | Email table export (CSV/JSON/Markdown) |
| `POST /api/sharing/email-link` | Required | Email share link to yourself |
| `POST /api/public/email` | None | Email AI response from public chat (rate limited) |

### Notification Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/notifications/task-assigned` | Required | Send task assignment notification |
| `POST /api/notifications/comment-added` | Required | Send comment notification |
| `POST /api/notifications/message-received` | Required | Send offline message notification |
| `GET /api/cron/due-date-reminders` | Cron Secret | Process and send due date reminders |

## User Preferences

Email notifications respect user preferences stored in `user_email_preferences`:

| Column | Default | Description |
|--------|---------|-------------|
| `task_notifications` | true | Task assignments, status changes, due dates |
| `comment_notifications` | true | Comments on owned resources |
| `message_notifications` | true | New messages when offline |
| `message_digest` | false | Daily unread message summary |
| `sharing_notifications` | true | When resources are shared |
| `organization_invitations` | true | Org invite emails |
| `resource_updates` | true | Subscribed resource updates |
| `weekly_digest` | true | Weekly activity summary |
| `marketing_emails` | false | Feature updates, promotions |

## Usage Examples

### Email AI Response (Authenticated)
```typescript
await fetch('/api/chat/email-response', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: markdownContent,
    metadata: { taskId, runId, messageId }
  })
});
```

### Send Task Assignment Notification
```typescript
import { sendTaskAssignmentEmail } from '@/lib/email/notificationService';

await sendTaskAssignmentEmail({
  assigneeId: 'user-uuid',
  assignerName: 'John Doe',
  taskTitle: 'Review PR',
  taskId: 'task-uuid',
  taskDescription: 'Please review...'
});
```

### Cron Job Setup (Vercel)

Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/due-date-reminders",
    "schedule": "0 8 * * *"
  }]
}
```

## UI Components

- **EmailPreferences** (`components/user-preferences/EmailPreferences.tsx`) - User preference toggles
- **EmailInputDialog** (`components/dialogs/EmailInputDialog.tsx`) - Email input for public features
- **MessageOptionsMenu** - "Email to me" option in chat menu
- **ExportTableModal** - Email tab for table exports
- **ShareModal** - "Email link" button
- **PresentationExportMenu** - "Email to me" for presentations
