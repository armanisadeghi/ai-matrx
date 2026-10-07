type UniverDependency = new (...args: never[]) => unknown;

type UniverInjector = {
  has(dependency: UniverDependency): boolean;
  add(dependency: [UniverDependency]): void;
};

/**
 * Register services required by process-global Univer Facade observers.
 *
 * Facade modules can outlive the editor type that first imported them, so a
 * later Univer instance may receive their lifecycle callbacks without loading
 * that type's plugins. Registration is intentionally narrow: callers name only
 * the observer dependencies that are safe for their instance.
 */
export function registerUniverFacadeDependencies(
  injector: UniverInjector,
  dependencies: readonly UniverDependency[],
): void {
  for (const dependency of dependencies) {
    if (!injector.has(dependency)) injector.add([dependency]);
  }
}
