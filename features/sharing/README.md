# Sharing & Permissions System

Centralized, RLS-backed sharing for any resource. One set of components, one `permissions` table, one pattern.

---

## Architecture Overview

```
Database Layer (RLS)                    Service Layer                       UI Layer
─────────────────────                   ─────────────────                   ─────────
permissions table                       utils/permissions/service.ts        features/sharing/components/
has_permission(type, id, level)         utils/permissions/hooks.ts          ShareButton, ShareModal
is_resource_owner(type, id)             utils/permissions/types.ts          PermissionBadge, PermissionsList
share_resource_with_user()                                                  PublicAccessTab, etc.
get_resource_permissions()
```

**How it works:** RLS policies on every table call `has_permission()` to check the `permissions` table. The UI writes rows to `permissions` via the service layer. The database enforces access automatically.

---

## Quick Start: Add Sharing to a Feature

### Step 1 -- Add the Share Button

Drop a `ShareButton` or `ShareModal` anywhere the resource owner can manage sharing.

```tsx
import { ShareButton } from '@/features/sharing';

<ShareButton
  resourceType="canvas_items"   // Must match a ResourceType
  resourceId={canvas.id}
  resourceName={canvas.title}
  isOwner={isCurrentUserOwner}
/>
```

This renders a button showing sharing status (Private/Shared/Public) that opens the full `ShareModal` with tabs for Users, Organizations, and Public access.

For more control, use `ShareModal` directly:

```tsx
import { ShareModal } from '@/features/sharing';

<ShareModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  resourceType="user_tables"
  resourceId={table.id}
  resourceName={table.name}
  isOwner={isOwner}
/>
```

### Step 2 -- Show Shared Items in List Pages

**This is the most important step.** Without it, users with shared access can never find the resource. There are two patterns:

#### Pattern A: Custom RPC (recommended for complex data)

Create a `get_[resources]_shared_with_me()` RPC that joins `permissions` with your resource table:

```sql
CREATE OR REPLACE FUNCTION get_canvases_shared_with_me()
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  permission_level text,
  owner_email text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id, r.title, r.description,
    p.permission_level::text,
    u.email as owner_email
  FROM permissions p
  JOIN canvas_items r ON r.id = p.resource_id
  JOIN auth.users u ON u.id = r.user_id
  WHERE p.resource_type = 'canvas_items'
    AND p.granted_to_user_id = auth.uid()
  ORDER BY p.created_at DESC;
END;
$$;
```

Then fetch in your server component:

```tsx
// page.tsx (Server Component)
const [ownedResult, sharedResult] = await Promise.all([
  supabase.from('canvas_items').select('*').eq('user_id', user.id),
  supabase.rpc('get_canvases_shared_with_me'),
]);
```

#### Pattern B: Client-side hook (simpler, fewer items)

```tsx
import { useSharedWithMe } from '@/utils/permissions';

const { permissions, loading } = useSharedWithMe('canvas_items');
// permissions[].resourceId gives you the IDs to fetch
```

#### Display in a "Shared with Me" section

Follow the established pattern -- a collapsible section below the user's own items:

```tsx
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Users, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

{sharedItems.length > 0 && (
  <Collapsible open={isSharedOpen} onOpenChange={setIsSharedOpen} className="mt-8">
    <CollapsibleTrigger className="flex items-center gap-2 w-full group mb-4">
      {isSharedOpen ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
      <Users className="w-5 h-5 text-secondary" />
      <h2 className="text-lg font-semibold">Shared with Me</h2>
      <Badge variant="secondary">{sharedItems.length}</Badge>
    </CollapsibleTrigger>
    <CollapsibleContent>
      {/* Render shared items with SharedItemCard or similar */}
    </CollapsibleContent>
  </Collapsible>
)}
```

### Step 3 -- Handle Access on Detail/Edit Pages

When a user navigates to a shared resource, the page needs to know the access level.

#### Option A: Custom RPC (recommended)

```sql
CREATE OR REPLACE FUNCTION get_canvas_access_level(p_canvas_id uuid)
RETURNS TABLE(is_owner boolean, permission_level text, owner_email text, can_edit boolean, can_delete boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_level text;
  v_email text;
BEGIN
  SELECT ci.user_id, u.email INTO v_owner_id, v_email
  FROM canvas_items ci JOIN auth.users u ON u.id = ci.user_id
  WHERE ci.id = p_canvas_id;

  IF v_owner_id = v_user_id THEN
    RETURN QUERY SELECT true, 'admin'::text, v_email, true, true;
    RETURN;
  END IF;

  SELECT p.permission_level::text INTO v_level
  FROM permissions p
  WHERE p.resource_type = 'canvas_items' AND p.resource_id = p_canvas_id
    AND (p.granted_to_user_id = v_user_id OR p.is_public = true)
  ORDER BY CASE p.permission_level WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END DESC
  LIMIT 1;

  RETURN QUERY SELECT false, v_level, v_email, v_level IN ('editor', 'admin'), v_level = 'admin';
END;
$$;
```

#### Option B: Client-side hooks

```tsx
import { useIsOwner, useCanEdit, useCanAdmin } from '@/utils/permissions';

const { isOwner, loading: ownerLoading } = useIsOwner('canvas_items', canvasId);
const { canEdit, loading: editLoading } = useCanEdit('canvas_items', canvasId);
```

#### Adapt the UI based on access

```tsx
// Define an AccessInfo type for your feature
interface AccessInfo {
  isOwner: boolean;
  permissionLevel: 'viewer' | 'editor' | 'admin' | null;
  ownerEmail: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

// In your detail/edit component:
const isShared = !accessInfo.isOwner && accessInfo.permissionLevel !== null;

// Show a banner for shared resources
{isShared && (
  <SharedBanner ownerEmail={accessInfo.ownerEmail} permissionLevel={accessInfo.permissionLevel} />
)}

// Disable editing for viewers
<Editor readOnly={!accessInfo.canEdit} />

// On save: warn shared users, offer "Save as Copy"
const handleSave = () => {
  if (isShared && !hasAcknowledged) {
    setShowWarningModal(true);  // "Edit Original" vs "Save as My Copy"
    return;
  }
  // ...proceed with save
};
```

---

## End-to-End Checklist

When adding sharing to a feature, every item below matters. Missing any one creates a broken experience.

### Database

- [ ] RLS policies use `has_permission(resource_type, resource_id, 'viewer')` for SELECT
- [ ] `resource_type` value matches what the UI passes (e.g., `'canvas_items'`)
- [ ] If the table has an `is_public` column, SELECT policy includes `OR is_public = true`
- [ ] Child tables inherit permissions from parent (e.g., `cx_message` checks `cx_conversation`)

### List/Grid Page (where users find shared items)

- [ ] Fetch shared items (RPC or `useSharedWithMe`) in parallel with owned items
- [ ] Display a "Shared with Me" collapsible section
- [ ] Shared items show owner info and permission badge
- [ ] Search/filter covers both owned and shared items
- [ ] Click behavior adapts: viewers go to view/run, editors go to edit

### Detail/Edit Page (where users interact with shared items)

- [ ] Fetch access level on page load (RPC or hooks)
- [ ] Show a `SharedBanner` with owner email and permission level
- [ ] Disable edit controls for viewers
- [ ] Intercept save for shared resources -- show warning modal
- [ ] Offer "Save as My Copy" for all shared users
- [ ] Offer "Edit Original" only for editor/admin shared users
- [ ] Hide destructive actions (delete) unless `canDelete` is true

### Sharing Management (where owners control access)

- [ ] `ShareButton` or `ShareModal` available on owned resources
- [ ] Only visible to the resource owner
- [ ] All three tabs work: Users, Organizations, Public

---

## Available ResourceTypes

The list below is **derived from the registry** — do not edit it by hand. Run
`pnpm tsx scripts/regen-shareable-registry-snapshot.ts` and copy the snapshot
into the table when the set changes.

| ResourceType | Table | Label | Use Case |
|---|---|---|---|
| `agent` | agx_agent | Agent | AI agents |
| `prompt` | prompts | Prompt | AI prompt templates |
| `note` | notes | Note | User notes |
| `task` | ctx_tasks | Task | Project tasks |
| `cx_conversation` | cx_conversation | Conversation | AI chat conversations |
| `canvas_items` | canvas_items | Canvas | Creative canvases |
| `user_tables` | user_tables | Table | Custom data tables |
| `user_lists` | user_lists | List | Custom lists |
| `transcripts` | transcripts | Transcript | Audio/video transcripts |
| `quiz_sessions` | quiz_sessions | Quiz | Quiz sessions |
| `sandbox_instances` | sandbox_instances | Sandbox | Code sandboxes |
| `user_files` | user_files | File | Uploaded files |
| `prompt_actions` | prompt_actions | Action | Prompt actions |
| `flashcard_data` | flashcard_data | Flashcard | Individual flashcards |

### To add a new resource type

It's two rows + one component:

1. **Apply a DB migration** with a single INSERT into `public.shareable_resource_registry`:
   ```sql
   INSERT INTO public.shareable_resource_registry
     (resource_type, table_name, id_column, owner_column, is_public_column,
      display_label, url_path_template, rls_uses_has_permission, is_active)
   VALUES
     ('<alias>', '<table>', 'id', 'user_id', 'is_public',
      '<Label>', '/<path>/{id}', true, true);
   ```
2. **Mirror the row in `utils/permissions/registry.ts`** (`SHAREABLE_RESOURCE_REGISTRY`).
3. **Refresh the parity snapshot** — `pnpm tsx scripts/regen-shareable-registry-snapshot.ts`.
4. **Drop in `<ShareButton resourceType="<alias>" ... />`** wherever you want sharing.

That's it. No RPC edits, no `getTableName()`, no `ShareModal.getShareUrl()`, no label maps. The validator trigger on `permissions.resource_type` will reject any unregistered type. The TypeScript `ResourceType` union is derived from the registry, so unregistered aliases fail at compile time. The parity test in `utils/permissions/__tests__/registry.parity.test.ts` blocks merge if the DB and TS are out of sync.

---

## Customization Options

### ShareButton Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `resourceType` | `ResourceType` | required | The resource type identifier |
| `resourceId` | `string` | required | UUID of the resource |
| `resourceName` | `string` | required | Display name (shown in modal header) |
| `isOwner` | `boolean` | required | Whether current user owns the resource |
| `variant` | `'default' \| 'outline' \| 'ghost'` | `'outline'` | Button style variant |
| `size` | `'default' \| 'sm' \| 'lg' \| 'icon'` | `'default'` | Button size |
| `showStatus` | `boolean` | `true` | Show Private/Shared/Public label |

### ShareModal Props

| Prop | Type | Description |
|---|---|---|
| `isOpen` | `boolean` | Controls modal visibility |
| `onClose` | `() => void` | Called when modal should close |
| `resourceType` | `ResourceType` | The resource type identifier |
| `resourceId` | `string` | UUID of the resource |
| `resourceName` | `string` | Display name (shown in modal header) |
| `isOwner` | `boolean` | Whether current user owns the resource |

### Available Hooks

```tsx
// Full sharing CRUD (used inside ShareModal)
const { permissions, shareWithUser, shareWithOrg, makePublic, revokeAccess, updateLevel, refresh } = useSharing('canvas_items', id);

// Quick status check (used by ShareButton)
const { isShared, isPublic, userCount, orgCount } = useSharingStatus('canvas_items', id);

// Ownership check
const { isOwner, loading } = useIsOwner('canvas_items', id);

// Access level checks
const { canEdit, loading } = useCanEdit('canvas_items', id);
const { canAdmin, loading } = useCanAdmin('canvas_items', id);

// Full permission check with details
const { hasAccess, level, isOwner } = usePermissionCheck({ resourceType: 'canvas_items', resourceId: id, requiredLevel: 'editor' });

// Get all resources shared with current user
const { permissions, loading } = useSharedWithMe('canvas_items');
```

---

## Key Files

| File | Purpose |
|---|---|
| `utils/permissions/types.ts` | `ResourceType`, `PermissionLevel`, type definitions, helper functions |
| `utils/permissions/service.ts` | Supabase CRUD operations against `permissions` table |
| `utils/permissions/hooks.ts` | React hooks for reactive permission state |
| `features/sharing/components/ShareModal.tsx` | Main sharing dialog (3 tabs) |
| `features/sharing/components/ShareButton.tsx` | Self-contained button + modal |
| `features/sharing/components/PermissionsList.tsx` | Displays/manages current permissions |
| `features/sharing/components/PermissionBadge.tsx` | Visual permission level badges |
| `features/sharing/components/tabs/` | Individual tab content (User, Org, Public) |
| `features/sharing/emailService.ts` | Email notification service |

---

## Reference Implementation

The prompts system (`features/prompts/`) is the gold standard. Study these files:

- **List page:** `app/(authenticated)/ai/prompts/page.tsx` -- parallel fetch of owned + shared
- **Grid with shared section:** `features/prompts/components/layouts/PromptsGrid.tsx`
- **Shared item cards:** `features/prompts/components/layouts/SharedPromptCard.tsx`
- **Access info type:** `features/prompts/types/shared.ts` -- `PromptAccessInfo`
- **Edit page access check:** `app/(authenticated)/ai/prompts/edit/[id]/page.tsx`
- **Save warning modal:** `features/prompts/components/builder/SharedPromptWarningModal.tsx`
- **Shared banner:** `SharedPromptBanner` in the same file
