export interface MandateKeyParts {
  /** The feature/domain namespace before the first dot. */
  feature: string;
  /** The complete step name after the first dot; later dots are preserved. */
  mandate: string;
}

/** Split canonical `<feature>.<mandate>` identity without losing information. */
export function splitMandateKey(mandateKey: string): MandateKeyParts {
  const separator = mandateKey.indexOf(".");
  if (separator <= 0 || separator === mandateKey.length - 1) {
    return { feature: "(unscoped)", mandate: mandateKey };
  }
  return {
    feature: mandateKey.slice(0, separator),
    mandate: mandateKey.slice(separator + 1),
  };
}
