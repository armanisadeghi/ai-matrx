export interface ParsedArgument {
  mode: string;
  name: string;
  type: string;
  defaultValue?: string;
}

export function parseArguments(argString: string): ParsedArgument[] {
  if (!argString?.trim()) return [];

  const args: ParsedArgument[] = [];
  let depth = 0;
  let current = "";

  for (const char of argString) {
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;

    if (char === "," && depth === 0) {
      args.push(parseSingleArg(current.trim()));
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) args.push(parseSingleArg(current.trim()));

  return args;
}

const TYPE_INDICATORS = [
  "integer",
  "int",
  "bigint",
  "smallint",
  "serial",
  "bigserial",
  "text",
  "varchar",
  "char",
  "character",
  "name",
  "boolean",
  "bool",
  "uuid",
  "json",
  "jsonb",
  "xml",
  "timestamp",
  "timestamptz",
  "date",
  "time",
  "timetz",
  "interval",
  "numeric",
  "decimal",
  "real",
  "float",
  "double",
  "bytea",
  "oid",
  "regclass",
  "regtype",
  "void",
  "trigger",
  "record",
  "anyelement",
  "anyarray",
  "inet",
  "cidr",
  "macaddr",
  "point",
  "line",
  "lseg",
  "box",
  "path",
  "polygon",
  "circle",
  "int4",
  "int8",
  "int2",
  "float4",
  "float8",
];

function parseSingleArg(raw: string): ParsedArgument {
  const defaultMatch = raw.match(/^(.+?)\s+DEFAULT\s+(.+)$/i);
  const mainPart = defaultMatch ? defaultMatch[1].trim() : raw;
  const defaultValue = defaultMatch ? defaultMatch[2].trim() : undefined;

  const modes = ["INOUT", "IN", "OUT", "VARIADIC"];
  let mode = "IN";
  let rest = mainPart;

  for (const m of modes) {
    if (rest.toUpperCase().startsWith(m + " ")) {
      mode = m;
      rest = rest.slice(m.length).trim();
      break;
    }
  }

  const lastSpace = rest.lastIndexOf(" ");
  if (lastSpace === -1) {
    return { mode, name: "", type: rest, defaultValue };
  }

  const possibleType = rest.slice(lastSpace + 1);
  const possibleName = rest.slice(0, lastSpace);
  const lowerType = possibleType.toLowerCase().replace("[]", "");

  if (
    TYPE_INDICATORS.includes(lowerType) ||
    possibleType.includes(".") ||
    possibleType.endsWith("[]")
  ) {
    return { mode, name: possibleName, type: possibleType, defaultValue };
  }

  return { mode, name: "", type: rest, defaultValue };
}
