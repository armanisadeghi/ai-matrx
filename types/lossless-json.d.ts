declare module "lossless-json" {
  export class LosslessNumber { value: string; }
  export function parse(value: string): unknown;
  export function stringify(value: unknown): string;
}
