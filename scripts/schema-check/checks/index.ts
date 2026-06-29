/**
 * Importing this module registers every check (each self-registers on import).
 * Add a new check: drop a file in this folder that calls `registerCheck(...)`,
 * then add it to the import list below. That's the whole extension story.
 *
 * Order here = tier order in the report (loudest classes first).
 */
import "./types-freshness";
import "./api-types-freshness";
import "./schema-exposure";
import "./dead-relations-registry";
import "./dead-relations";
import "./direct-from-schema";
import "./typed-refs";
import "./qualified-refs";
