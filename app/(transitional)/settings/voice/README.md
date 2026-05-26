# Voice & Microphone Settings Page

## Overview

Proactive voice troubleshooting page in Settings that allows users to check their microphone setup before encountering issues.

## Architecture - Zero Duplication

### Core Component: `VoiceDiagnosticsDisplay`
**Location:** `features/audio/components/VoiceDiagnosticsDisplay.tsx`

This is the **single source of truth** for all diagnostic UI and logic. It's used in:

1. **Modal Context** - `VoiceTroubleshootingModal.tsx` (reactive, appears on errors)
2. **Settings Page** - `/settings/voice/page.tsx` (proactive, user-initiated)

### Component Structure

```
VoiceDiagnosticsDisplay (Core)
├── Used by: VoiceTroubleshootingModal (Error Modal)
└── Used by: /settings/voice/page.tsx (Settings Page)
```

### What's Shared

The core `VoiceDiagnosticsDisplay` component provides:
- System status checks (4 cards)
- Issue detection and display
- Browser-specific fix instructions
- Microphone testing
- Re-run diagnostics button
- Browser help links

**All logic, UI, and functionality exists in ONE place.**

### What's Wrapper-Specific

#### Modal (`VoiceTroubleshootingModal.tsx`)
- Dialog container
- "Voice Input Troubleshooting" title
- Auto-runs on open
- Triggered by error toasts

#### Settings Page (`/settings/voice/page.tsx`)
- Full page layout
- Additional context cards:
  - "Where Voice Input Is Used"
  - "Privacy & Security"
- Part of settings navigation
- Always accessible

## User Flows

### Reactive Flow (Error Occurs)
```
Voice input fails →
Persistent error toast with "Get Help" button →
Click "Get Help" →
VoiceTroubleshootingModal opens →
Shows VoiceDiagnosticsDisplay →
User fixes issue →
Closes modal →
Tries voice input again
```

### Proactive Flow (Check Before Use)
```
User opens Settings →
Clicks "Voice & Microphone" →
/settings/voice page loads →
Shows VoiceDiagnosticsDisplay (auto-runs) →
User verifies everything works →
Reads additional context →
Feels confident using voice features
```

## File Locations

### Core Component (Reusable)
- `features/audio/components/VoiceDiagnosticsDisplay.tsx` - **Core UI & Logic**
- `features/audio/utils/microphone-diagnostics.ts` - Diagnostic engine

### Wrappers (Thin)
- `features/audio/components/VoiceTroubleshootingModal.tsx` - Modal wrapper
- `app/(authenticated)/settings/voice/page.tsx` - Settings page wrapper

### Configuration
- `app/(authenticated)/settings/layout.tsx` - Added "Voice & Microphone" to nav

## Benefits of This Architecture

1. **Zero Duplication** - Core logic exists in one place
2. **Easy Maintenance** - Update once, works everywhere
3. **Consistent UX** - Same diagnostics in modal and settings
4. **Flexible** - Easy to add new contexts (e.g., onboarding wizard)
5. **Testable** - Test one component, covers all use cases

## Props API

### VoiceDiagnosticsDisplay
```typescript
interface VoiceDiagnosticsDisplayProps {
  error?: string | null;           // Optional error to display
  errorCode?: string | null;        // Optional error code
  onTestSuccess?: () => void;       // Callback after successful test
  autoRun?: boolean;                // Auto-run diagnostics on mount (default: true)
}
```

## Adding New Contexts

Want to show diagnostics somewhere else? Just import the core component:

```typescript
import { VoiceDiagnosticsDisplay } from '@/features/audio/components/VoiceDiagnosticsDisplay';

// In a wizard:
<VoiceDiagnosticsDisplay autoRun={true} />

// In a help page:
<VoiceDiagnosticsDisplay autoRun={false} />

// With error context:
<VoiceDiagnosticsDisplay 
  error="Permission denied"
  errorCode="PERMISSION_DENIED"
  autoRun={true}
/>
```

## Navigation

Users can access voice settings via:
1. **Settings → Voice & Microphone** (left sidebar)
2. **Direct URL:** `/settings/voice`
3. **Error Toast:** "Get Help" button → Modal

## Future Enhancements

- [ ] Add "Test Recording" with playback
- [ ] Add noise level meter
- [ ] Add echo cancellation test
- [ ] Save diagnostic history
- [ ] Add "Share Diagnostics" for support tickets
- [ ] Add guided setup wizard for first-time users

