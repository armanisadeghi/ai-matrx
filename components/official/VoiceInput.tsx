/**
 * @deprecated Use `ProInput` from `@/components/official/ProInput`.
 *
 * This file remains as a backwards-compatibility shim so existing imports
 * (`VoiceInput`, `VoiceInputProps`, `VoiceInputElement`) continue to
 * work. The implementation moved to `ProInput.tsx` because the component
 * has grown well beyond just voice — it's now the canonical full-feature
 * input (voice, copy, submit, recording protection).
 *
 * New code should import directly from `ProInput`. When all consumers have
 * been updated, this file can be deleted.
 */

export {
  ProInput as VoiceInput,
  type ProInputProps as VoiceInputProps,
  type ProInputElement as VoiceInputElement,
} from "./ProInput";
