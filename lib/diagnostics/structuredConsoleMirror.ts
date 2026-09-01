let structuredMirrorDepth = 0;

/**
 * Preserve a deliberate console scream for an incident that already entered a
 * structured capture boundary. The production console adapter consults the
 * synchronous marker so it does not persist the same incident a second time.
 */
export function mirrorCapturedErrorToConsole(...args: unknown[]): void {
  structuredMirrorDepth += 1;
  try {
    console.error(...args);
  } finally {
    structuredMirrorDepth -= 1;
  }
}

export function isStructuredConsoleMirrorActive(): boolean {
  return structuredMirrorDepth > 0;
}
