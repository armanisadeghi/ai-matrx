const ENTRYPOINT = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*):([A-Za-z_][A-Za-z0-9_]*)$/;

const PYPROJECT_ENTRYPOINT_RUNNER =
  "import importlib,sys; module,callable_name=sys.argv[1].split(':',1); getattr(importlib.import_module(module), callable_name)()";

export interface PyprojectScript {
  name: string;
  entrypoint: string;
}

/** Parses only standard, callable `[project.scripts]` / Poetry entrypoints. */
export function parsePyprojectScripts(content: string): PyprojectScript[] {
  const result: PyprojectScript[] = [];
  let inScriptsSection = false;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inScriptsSection =
        line === "[project.scripts]" || line === "[tool.poetry.scripts]";
      continue;
    }
    if (!inScriptsSection) continue;
    const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*["']([^"']+)["']\s*$/);
    if (match && ENTRYPOINT.test(match[2])) {
      result.push({ name: match[1], entrypoint: match[2] });
    }
  }
  return result;
}

/** Safe shell command for a declared Python console entrypoint. */
export function pyprojectEntrypointCommand(entrypoint: string): string | null {
  if (!ENTRYPOINT.test(entrypoint)) return null;
  return `python -c ${shellQuote(PYPROJECT_ENTRYPOINT_RUNNER)} ${shellQuote(entrypoint)}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
