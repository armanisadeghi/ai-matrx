# Voice Recording Troubleshooting System

## Overview

Comprehensive troubleshooting system for microphone access and voice recording issues. Provides detailed diagnostics, actionable solutions, and a user-friendly troubleshooting modal.

## Key Features

### 1. **Microphone Diagnostics** (`utils/microphone-diagnostics.ts`)

Comprehensive system checks including:
- Browser API availability (MediaDevices, getUserMedia)
- HTTPS/secure context validation
- Permission state detection (granted, denied, prompt)
- Device enumeration and availability
- Browser-specific detection (Chrome, Firefox, Safari, iOS, Tesla, etc.)
- Real-time microphone access testing

### 2. **Error Classification & Solutions**

Specific error handling for:
- **Permission Denied**: Browser-specific instructions to reset permissions
- **No Device Found**: Steps to connect and configure microphone
- **Device Busy**: Instructions to close competing applications
- **Security Error**: HTTPS requirement explanation
- **Browser Not Supported**: Update or alternative browser suggestions

### 3. **Troubleshooting Modal** (`components/VoiceTroubleshootingModal.tsx`)

Interactive modal featuring:
- Visual system status cards (4 key checks)
- Detected issues with severity levels (error/warning/info)
- Step-by-step fix instructions
- Browser-specific guidance
- Real-time microphone testing
- Re-run diagnostics capability
- Links to browser help documentation

### 4. **Enhanced Error Handling**

All voice components now include:
- Detailed error codes and messages
- Persistent toast notifications (10s duration)
- "Get Help" button in error toasts
- Automatic troubleshooting modal trigger
- Error state persistence for modal display

## Components Updated

### VoiceTextarea (`components/official/VoiceTextarea.tsx`)
- ✅ Integrated troubleshooting modal
- ✅ Enhanced error handling with error codes
- ✅ Persistent toast with "Get Help" action
- ✅ Error state management

### VoiceInputButton (`components/official/VoiceInputButton.tsx`)
- ✅ Integrated troubleshooting modal
- ✅ Enhanced error handling with error codes
- ✅ Persistent toast with "Get Help" action
- ✅ Error state management

### useSimpleRecorder (`hooks/useSimpleRecorder.ts`)
- ✅ Uses `getErrorSolution()` for detailed error analysis
- ✅ Provides error codes to callbacks
- ✅ Enhanced error logging

### useRecordAndTranscribe (`hooks/useRecordAndTranscribe.ts`)
- ✅ Propagates error codes through the chain
- ✅ Distinguishes recording vs transcription errors
- ✅ Enhanced error callbacks

## Usage

### For Users

When voice input fails:
1. Error toast appears with message and "Get Help" button
2. Click "Get Help" to open troubleshooting modal
3. Review system status and detected issues
4. Follow browser-specific fix instructions
5. Test microphone directly from modal
6. Close and retry recording

### For Developers

```typescript
import { VoiceTextarea } from '@/components/official/VoiceTextarea';
import { runMicrophoneDiagnostics, canUserFixIssue } from '@/features/audio/utils/microphone-diagnostics';

// Run diagnostics programmatically
const diagnostics = await runMicrophoneDiagnostics();
console.log('Permission:', diagnostics.permissionState);
console.log('Issues:', diagnostics.issues);
console.log('Can fix:', canUserFixIssue(diagnostics));

// Components automatically show troubleshooting modal on error
<VoiceTextarea
  value={value}
  onChange={(e) => setValue(e.target.value)}
  onTranscriptionError={(error) => {
    // Error is already handled with modal
    console.log('Error logged:', error);
  }}
/>
```

## Error Codes

### Recording Errors
- `PERMISSION_DENIED` - User denied microphone permission
- `NO_DEVICE` - No microphone found
- `DEVICE_BUSY` - Microphone in use by another application
- `SECURITY_ERROR` - Not on HTTPS
- `AUDIO_SESSION_INCOMPATIBLE` - WebKit (iOS/Safari) refused capture because the page's audio session category was playback-only; the mic manager switches it to play-and-record before capture (browser-audio ≥ 0.4.0), so this code means that switch was rejected
- `NO_MEDIA_DEVICES` - Browser doesn't support MediaDevices API
- `NO_GET_USER_MEDIA` - Browser doesn't support getUserMedia
- `ACCESS_TEST_FAILED` - Permission granted but access still failed

### Transcription Errors
- `TRANSCRIPTION_FAILED` - API returned error
- `TRANSCRIPTION_ERROR` - Network or unexpected error
- `UNKNOWN_ERROR` - Unclassified error

## Browser-Specific Guidance

### Chrome/Edge
- Click lock icon (🔒) in address bar
- Change microphone permission to "Allow"
- Refresh page

### Firefox
- Click microphone icon in address bar
- Remove "Blocked" status
- Refresh page

### Safari (Desktop)
- Safari > Settings > Websites > Microphone
- Find website and set to "Allow"
- Refresh page

### Safari (iOS)
- Settings > Safari > Microphone
- Enable for website
- Also check website-specific permissions in Safari settings

### Tesla Browser
- Similar to Chrome (Chromium-based)
- May require system-level permissions
- Check vehicle settings if available

## Common Issues Solved

1. **"Works first time, fails later"**
   - Solution: Permission state checking and re-request flow

2. **"Silent failures in Tesla/custom browsers"**
   - Solution: Detailed diagnostics and browser detection

3. **"No way to fix permission denied"**
   - Solution: Step-by-step browser-specific instructions

4. **"User doesn't know what went wrong"**
   - Solution: Clear error messages with actionable solutions

5. **"Can't distinguish recording vs transcription errors"**
   - Solution: Specific error codes for each failure point

## Testing Checklist

- [ ] Test in Chrome (desktop/mobile)
- [ ] Test in Firefox
- [ ] Test in Safari (desktop/mobile)
- [ ] Test in Edge
- [ ] Test permission denied scenario
- [ ] Test no microphone scenario
- [ ] Test microphone busy scenario
- [ ] Test on HTTP (should fail with clear message)
- [ ] Test on HTTPS
- [ ] Test permission reset workflow
- [ ] Test in Tesla browser (if available)
- [ ] Test transcription failures (network issues)
- [ ] Verify toast "Get Help" button works
- [ ] Verify modal diagnostics run correctly
- [ ] Verify microphone test works

## Future Enhancements

- [ ] Add permission pre-check before attempting recording
- [ ] Cache permission state in localStorage
- [ ] Add "Never ask again" detection
- [ ] Add audio quality testing
- [ ] Add background noise level detection
- [ ] Add recording duration limits and warnings
- [ ] Add offline detection for transcription
- [ ] Add retry logic with exponential backoff
- [ ] Add telemetry for common failure patterns

