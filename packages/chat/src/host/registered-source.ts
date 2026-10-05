/**
 * host/registered-source — the ONE shape for a host registration that stands in for a
 * platform package the chat package will later depend on directly (PACKAGE-INDEPENDENCE.md
 * §2.3, P21: context sources and compute targets).
 *
 * The registration is a flat namespace keyed by the future package's own export names, so
 * a call site imports `selectActiveScopeIds` from the seam today and from `@ai-matrx/scopes`
 * tomorrow with no other change (P17s3).
 *
 * Resolution happens at CALL time, never at import: the host may register after package
 * modules load, and a test's lazy registration (jest.setup.ts) resolves through that test's
 * own module registry, so its `jest.mock`s still apply.
 *
 * Unregistered: the named generic default runs and says so ONCE (console + host diagnostics,
 * Law 4); an export with no generic default throws, naming itself and the register call.
 */

import { createElement, type ComponentType } from "react";
import { reportUnregisteredHostSlot } from "./diagnostics";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyFn = (...args: any[]) => any;
export type AnyComponent = ComponentType<any>;

export interface RegisteredSource<T extends object> {
  /** The host's registration. Replaces any earlier one; `null` returns to the defaults. */
  register(next: Partial<T> | null): void;
  /** True when the host registered `key`. */
  has(key: keyof T): boolean;
  /** The registered value for `key`, else its generic default (announced once), else throws. */
  get<K extends keyof T>(key: K): T[K];
  /** A function export that resolves `key` on every call. */
  fn<K extends keyof T>(key: K): T[K];
  /** A component export that resolves `key` on every render (unregistered + no default: renders nothing). */
  component<K extends keyof T>(key: K): T[K];
  /** A constant export (object/array) whose reads resolve `key` each time. */
  constant<K extends keyof T>(key: K): T[K];
}

export function createRegisteredSource<T extends object>(
  sourceName: string,
  registerCall: string,
  defaults: Partial<T>,
): RegisteredSource<T> {
  let impl: Partial<T> | null = null;

  const label = (key: keyof T) => `${sourceName}.${String(key)}`;

  function has(key: keyof T): boolean {
    // Read through the registration object itself (never a spread copy): a lazy host
    // registration defines getters that must run at call time.
    return impl != null && key in impl && (impl as any)[key] !== undefined;
  }

  function get<K extends keyof T>(key: K): T[K] {
    if (has(key)) return (impl as any)[key] as T[K];
    if (key in defaults) {
      reportUnregisteredHostSlot(label(key), "its generic default runs");
      return (defaults as any)[key] as T[K];
    }
    reportUnregisteredHostSlot(label(key), "it cannot run");
    throw new Error(
      `The host registered no "${label(key)}" for the chat package (${registerCall}).`,
    );
  }

  function fn<K extends keyof T>(key: K): T[K] {
    const call = (...args: unknown[]) => (get(key) as unknown as AnyFn)(...args);
    return call as unknown as T[K];
  }

  function component<K extends keyof T>(key: K): T[K] {
    const Wrapper = (props: object) => {
      if (!has(key) && !(key in defaults)) {
        reportUnregisteredHostSlot(label(key), "it renders nothing here");
        return null;
      }
      return createElement(get(key) as unknown as AnyComponent, props);
    };
    Wrapper.displayName = `ChatSource(${label(key)})`;
    return Wrapper as unknown as T[K];
  }

  function constant<K extends keyof T>(key: K): T[K] {
    const target = (key in defaults ? (defaults as any)[key] : {}) as object;
    return new Proxy(Array.isArray(target) ? [] : {}, {
      get: (_t, prop) => {
        const value = get(key) as any;
        const out = value?.[prop];
        return typeof out === "function" ? out.bind(value) : out;
      },
      has: (_t, prop) => prop in (get(key) as any),
      ownKeys: () => Reflect.ownKeys(get(key) as any),
      getOwnPropertyDescriptor: (_t, prop) => {
        const d = Reflect.getOwnPropertyDescriptor(get(key) as any, prop);
        return d ? { ...d, configurable: true } : undefined;
      },
    }) as unknown as T[K];
  }

  return {
    register(next) {
      impl = next;
    },
    has,
    get,
    fn,
    component,
    constant,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
