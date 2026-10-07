/** Types for `source-roots.cjs` (plain CommonJS so node, tsx and Jest callers all share it). */
export declare const CHAT_PACKAGE_SRC: "../aidream/apps/shared/chat/src";
export declare const FEATURE_ROOTS: readonly string[];
export declare const SOURCE_ROOTS: readonly string[];
export declare const MODULE_ALIASES: readonly (readonly [prefix: string, dir: string])[];
export declare const ALIAS_PREFIX_PATTERN: string;
export declare const FEATURE_ROOT_PATTERN: string;
export declare const FEATURE_SPECIFIER_PATTERN: string;
export declare function featureRegExp(re: RegExp): RegExp;
export declare function aliasTarget(spec: string): string | null;
export declare function isAliasSpecifier(spec: string): boolean;
export declare function existingRoots(repoRoot: string, roots?: readonly string[]): string[];
export declare function featureRoots(repoRoot: string): string[];
export declare function featureRootOf(rel: string): { root: string; rest: string } | null;
export declare function isUnderFeature(file: string, sub: string): boolean;
/** `git <args>` across this repo and the checkouts beside it (`../aidream/...` pathspecs run there). */
export declare function gitFiles(cwd: string, args: readonly string[], opts?: { maxBuffer?: number; prefixPaths?: boolean }): string;
