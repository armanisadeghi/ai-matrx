/**
 * Imports each capability provider for its registration side-effect. Imported
 * once from the app providers root so the registry is populated before any
 * agent turn fires.
 *
 * Adding a new surface: drop a provider file in this directory and add an
 * import line below.
 */

import "./sandbox-fs.provider";
import "./editor-state.provider";
