/**
 * Microphone Diagnostics Utility
 * 
 * Comprehensive diagnostics and troubleshooting for microphone access
 */

import { acquireMicStream, releaseMicStream } from '../micStream';

export interface DiagnosticResult {
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
  permissionState: 'granted' | 'denied' | 'prompt' | 'unknown';
  availableDevices: MediaDeviceInfo[];
  browserInfo: {
    name: string;
    version: string;
    isMobile: boolean;
    isIOS: boolean;
    isSafari: boolean;
  };
  isSecureContext: boolean;
  canRequestPermission: boolean;
  issues: DiagnosticIssue[];
  recommendations: string[];
}

export interface DiagnosticIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  solution: string;
}

/**
 * Run comprehensive microphone diagnostics
 */
export async function runMicrophoneDiagnostics(): Promise<DiagnosticResult> {
  const result: DiagnosticResult = {
    hasMediaDevices: false,
    hasGetUserMedia: false,
    permissionState: 'unknown',
    availableDevices: [],
    browserInfo: getBrowserInfo(),
    isSecureContext: window.isSecureContext,
    canRequestPermission: false,
    issues: [],
    recommendations: [],
  };

  // Check if MediaDevices API is available
  result.hasMediaDevices = !!navigator.mediaDevices;
  if (!result.hasMediaDevices) {
    result.issues.push({
      severity: 'error',
      code: 'NO_MEDIA_DEVICES',
      message: 'MediaDevices API not available',
      solution: 'Your browser may not support audio recording. Try using Chrome, Firefox, or Safari.',
    });
    return result;
  }

  // Check if getUserMedia is available
  result.hasGetUserMedia = !!navigator.mediaDevices.getUserMedia;
  if (!result.hasGetUserMedia) {
    result.issues.push({
      severity: 'error',
      code: 'NO_GET_USER_MEDIA',
      message: 'getUserMedia not available',
      solution: 'Your browser version may be outdated. Please update your browser.',
    });
    return result;
  }

  // Check secure context (HTTPS)
  if (!result.isSecureContext) {
    result.issues.push({
      severity: 'error',
      code: 'INSECURE_CONTEXT',
      message: 'Microphone access requires HTTPS',
      solution: 'This page must be served over HTTPS to access the microphone.',
    });
    return result;
  }

  // Check permission state (if API is available)
  try {
    if ('permissions' in navigator) {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      result.permissionState = permissionStatus.state;
      
      if (permissionStatus.state === 'denied') {
        result.issues.push({
          severity: 'error',
          code: 'PERMISSION_DENIED',
          message: 'Microphone access is blocked',
          solution: 'You need to allow microphone access in your browser settings.',
        });
      }
    }
  } catch (err) {
    // Permission API not supported or query failed
    console.warn('Permission query failed:', err);
    result.permissionState = 'unknown';
  }

  // Enumerate devices
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    result.availableDevices = devices.filter(device => device.kind === 'audioinput');
    
    if (result.availableDevices.length === 0) {
      result.issues.push({
        severity: 'error',
        code: 'NO_MICROPHONE',
        message: 'No microphone detected',
        solution: 'Please connect a microphone and refresh the page.',
      });
    }
  } catch (err) {
    result.issues.push({
      severity: 'warning',
      code: 'ENUMERATE_FAILED',
      message: 'Could not list audio devices',
      solution: 'Grant microphone permission and refresh the page.',
    });
  }

  // Test actual microphone access (non-invasive)
  if (result.permissionState === 'granted') {
    try {
      // Through the mic singleton — a direct getUserMedia here double-lights
      // the mic beside a live recording and tears down the warm iOS grant.
      await acquireMicStream();
      releaseMicStream();
      result.canRequestPermission = true;
    } catch (err: any) {
      result.canRequestPermission = false;
      result.issues.push({
        severity: 'error',
        code: 'ACCESS_TEST_FAILED',
        message: err.name || 'Microphone access test failed',
        solution: 'Try refreshing the page or checking your browser settings.',
      });
    }
  } else if (result.permissionState === 'prompt') {
    result.canRequestPermission = true;
  }

  // Browser-specific warnings
  if (result.browserInfo.isSafari) {
    result.recommendations.push('Safari may require additional permissions. Check System Preferences > Security & Privacy > Microphone.');
  }

  if (result.browserInfo.isIOS) {
    result.recommendations.push('iOS requires microphone permission at the system level. Check Settings > Safari > Microphone.');
  }

  // Add general recommendations based on issues
  if (result.issues.length === 0 && result.permissionState === 'prompt') {
    result.recommendations.push('Click the microphone button to request permission.');
  }

  return result;
}

/**
 * Get browser information
 */
function getBrowserInfo() {
  const ua = navigator.userAgent;
  const info = {
    name: 'Unknown',
    version: 'Unknown',
    isMobile: /Mobile|Android|iPhone|iPad|iPod/.test(ua),
    isIOS: /iPhone|iPad|iPod/.test(ua),
    isSafari: /^((?!chrome|android).)*safari/i.test(ua),
  };

  // Detect browser name and version
  if (/Chrome/.test(ua) && !/Edge|Edg/.test(ua)) {
    info.name = 'Chrome';
    const match = ua.match(/Chrome\/(\d+)/);
    info.version = match ? match[1] : 'Unknown';
  } else if (/Firefox/.test(ua)) {
    info.name = 'Firefox';
    const match = ua.match(/Firefox\/(\d+)/);
    info.version = match ? match[1] : 'Unknown';
  } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
    info.name = 'Safari';
    const match = ua.match(/Version\/(\d+)/);
    info.version = match ? match[1] : 'Unknown';
  } else if (/Edge|Edg/.test(ua)) {
    info.name = 'Edge';
    const match = ua.match(/Edg?\/(\d+)/);
    info.version = match ? match[1] : 'Unknown';
  }

  return info;
}

/**
 * Get human-readable error message with solution
 */
export function getErrorSolution(error: any): { message: string; solution: string; code: string } {
  const errorName = error?.name || '';
  const errorMessage = error?.message || '';

  // Permission denied
  if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
    return {
      code: 'PERMISSION_DENIED',
      message: 'Microphone access was denied',
      solution: 'Click the microphone button above to grant permission, or check your browser settings.',
    };
  }

  // No microphone found
  if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
    return {
      code: 'NO_DEVICE',
      message: 'No microphone found',
      solution: 'Please connect a microphone and try again.',
    };
  }

  // Microphone in use
  if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
    return {
      code: 'DEVICE_BUSY',
      message: 'Microphone is already in use',
      solution: 'Close other applications using the microphone and try again.',
    };
  }

  // Insecure context
  if (errorName === 'SecurityError') {
    return {
      code: 'SECURITY_ERROR',
      message: 'Microphone access requires HTTPS',
      solution: 'This feature only works on secure (HTTPS) pages.',
    };
  }

  // Generic error
  return {
    code: 'UNKNOWN_ERROR',
    message: errorMessage || 'Failed to access microphone',
    solution: 'Try refreshing the page or check your browser settings.',
  };
}

/**
 * Check if user can potentially fix the issue
 */
export function canUserFixIssue(diagnostics: DiagnosticResult): boolean {
  // User can't fix fundamental browser issues
  if (!diagnostics.hasMediaDevices || !diagnostics.hasGetUserMedia || !diagnostics.isSecureContext) {
    return false;
  }

  // User can fix permission and device issues
  return true;
}

/**
 * Get step-by-step fix instructions based on browser and permission state
 */
export function getFixInstructions(diagnostics: DiagnosticResult): string[] {
  const instructions: string[] = [];
  const { browserInfo, permissionState, issues } = diagnostics;

  // Permission denied - browser-specific instructions
  if (permissionState === 'denied') {
    instructions.push('**Reset Microphone Permission:**');
    
    if (browserInfo.name === 'Chrome' || browserInfo.name === 'Edge') {
      instructions.push('1. Click the lock icon 🔒 in the address bar');
      instructions.push('2. Find "Microphone" and change it to "Allow"');
      instructions.push('3. Refresh this page');
    } else if (browserInfo.name === 'Firefox') {
      instructions.push('1. Click the microphone icon in the address bar');
      instructions.push('2. Remove the "Blocked" status');
      instructions.push('3. Refresh this page');
    } else if (browserInfo.name === 'Safari') {
      instructions.push('1. Go to Safari > Settings > Websites > Microphone');
      instructions.push('2. Find this website and change to "Allow"');
      instructions.push('3. Refresh this page');
      
      if (browserInfo.isMobile) {
        instructions.push('4. On iOS, also check Settings > Safari > Microphone');
      }
    }
  }

  // No microphone found
  if (issues.some(i => i.code === 'NO_MICROPHONE')) {
    instructions.push('**Connect a Microphone:**');
    instructions.push('1. Plug in a microphone or headset');
    instructions.push('2. Refresh this page');
    instructions.push('3. Grant permission when prompted');
  }

  // Browser not supported
  if (!diagnostics.hasMediaDevices || !diagnostics.hasGetUserMedia) {
    instructions.push('**Update Your Browser:**');
    instructions.push('1. Check for browser updates');
    instructions.push('2. Or try Chrome, Firefox, or Safari');
  }

  return instructions;
}

