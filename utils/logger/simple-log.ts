const INFO = true;
const DEBUG = true;
const VERBOSE = true;

const log = (label: string = '', level: 'INFO' | 'DEBUG' | 'VERBOSE' | null = null, ...args: unknown[]) => {
  // Check debug level
  if (level === null) {
    // Log everything by default
  } else if (level === 'INFO' && !INFO) return;
  else if (level === 'DEBUG' && !DEBUG) return;
  else if (level === 'VERBOSE' && !VERBOSE) return;

  // Get the stack trace
  const stack = new Error().stack?.split('\n');
  // The caller's info is typically in the 3rd line (0: Error, 1: log function, 2: caller)
  const callerLine = stack?.[2] || '';
  const match = callerLine.match(/at\s+(?:.*\s+)?\(?(.+):(\d+):(\d+)\)?$/);
  const origin = match ? `${match[1]}:${match[2]}` : 'unknown location';

  // Format the label
  const formattedLabel = label 
    ? `[${label.toUpperCase().split(/(?=[A-Z])|\s/).join(' ')} ${level || 'DEBUG'} @ ${origin}]` 
    : `[${level || 'DEBUG'} @ ${origin}]`;

  // Log each argument
  args.forEach((value, i) => {
    const formattedValue = typeof value === 'object' && value !== null 
      ? JSON.stringify(value, null, 2) 
      : value;
    console.log(`${formattedLabel}:`, formattedValue);
  });
};