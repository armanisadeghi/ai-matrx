// features/education/convert/registry.ts
//
// The generator registry behind the converter contract. Generators register
// once (side-effect import of `./generators`) and the dispatch (`runConvert`)
// looks them up by TargetKind. This is the ONLY dispatch table for content
// conversion — features add a generator here, never a parallel path.

import type {
  ConvertGenerator,
  ConvertRequest,
  ConvertContext,
  ConvertResult,
  TargetKind,
} from "./types";

const REGISTRY = new Map<TargetKind, ConvertGenerator>();

/** Register (or replace) the generator for a target kind. */
export function registerGenerator(gen: ConvertGenerator): void {
  REGISTRY.set(gen.targetKind, gen);
}

export function getGenerator(kind: TargetKind): ConvertGenerator | undefined {
  return REGISTRY.get(kind);
}

/** A target is usable when a generator is registered AND marks itself available. */
export function isTargetAvailable(kind: TargetKind): boolean {
  return REGISTRY.get(kind)?.available === true;
}

/** All registered generators (for building the kit picker UI). */
export function listGenerators(): ConvertGenerator[] {
  return [...REGISTRY.values()];
}

/**
 * THE contract entry point: `convertContent`. Resolve the generator for the
 * requested kind and run it. Throws a clear error when no generator is
 * registered or the target is not yet available (progressive enablement).
 */
export async function runConvert(
  request: ConvertRequest,
  ctx: ConvertContext,
): Promise<ConvertResult> {
  const gen = REGISTRY.get(request.targetKind);
  if (!gen) {
    throw new Error(`No generator registered for "${request.targetKind}"`);
  }
  if (!gen.available) {
    throw new Error(`"${gen.label}" is not available yet`);
  }
  return gen.run(request, ctx);
}
