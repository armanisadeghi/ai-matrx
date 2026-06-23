// BUILD-TIME OPTIMIZATION CONTRACT
// --------------------------------
// `getEmptyGlobalCache` is statically imported by `(authenticated)/layout.tsx`,
// `(core)/layout.tsx` and `(dev)/layout.dev.tsx` — every slim-path route. The
// entity type chain it touches (`entityTypes` → `initialSchemas` 115k LOC,
// `fullRelationships` 2.2k LOC) is purely type-level here, so all imports
// MUST be `import type` to keep the slim path's static graph free of the
// entity system's heavy modules.
import type {
  EntityKeys,
  AutomationEntities,
  UnifiedSchemaCache,
} from "@/types/entityTypes";
import type { SchemaEntity } from "@/types/schema";
import type {
  FullEntityRelationships,
  RelationshipDetails,
} from "@/utils/schema/fullRelationships";

type EmptyNameMap = Partial<Record<EntityKeys, string>>;
type EmptyFieldMap = Partial<Record<EntityKeys, Record<string, string>>>;
type EmptyNestedFieldMap = Partial<
  Record<EntityKeys, Record<string, Record<string, string>>>
>;

function emptyRelationshipDetails(): Partial<RelationshipDetails> {
  return {
    foreignKeys: {},
    referencedBy: {},
  };
}

function emptyFullEntityRelationships(): Omit<
  FullEntityRelationships,
  "relationshipDetails"
> & { relationshipDetails: Partial<RelationshipDetails> } {
  return {
    selfReferential: [],
    manyToMany: [],
    oneToOne: [],
    manyToOne: [],
    oneToMany: [],
    undefined: [],
    inverseReferences: [],
    relationshipDetails: emptyRelationshipDetails(),
  };
}

function emptySchemaEntity(): Partial<SchemaEntity> {
  return {
    schemaType: "table",
    primaryKey: "",
    primaryKeyMetadata: {
      fields: [],
      type: "none",
      database_fields: [],
      where_template: {},
    },
    displayFieldMetadata: { fieldName: null, databaseFieldName: null },
    defaultFetchStrategy: "simple",
    relationships: [],
  };
}

export function getEmptyGlobalCache(): UnifiedSchemaCache {
  return {
    schema: {} as AutomationEntities,
    entityNames: [],
    entitiesWithoutFields: {},
    entityNameToCanonical: {},
    fieldNameToCanonical: {} as Record<EntityKeys, Record<string, string>>,
    entityNameFormats: {} as Record<EntityKeys, Record<string, string>>,
    fieldNameFormats: {} as Record<
      EntityKeys,
      Record<string, Record<string, string>>
    >,
    entityNameToDatabase: {} as Record<EntityKeys, string>,
    entityNameToBackend: {} as Record<EntityKeys, string>,
    entityNametoPretty: {} as Record<EntityKeys, string>,
    fieldNameToDatabase: {} as Record<EntityKeys, Record<string, string>>,
    fieldNameToBackend: {} as Record<EntityKeys, Record<string, string>>,
    fieldNameToPretty: {} as Record<EntityKeys, Record<string, string>>,
    fullEntityRelationships: {} as Record<EntityKeys, FullEntityRelationships>,
  };
}

export {
  emptyFullEntityRelationships,
  emptySchemaEntity,
  emptyRelationshipDetails,
};
export type { EmptyNameMap, EmptyFieldMap, EmptyNestedFieldMap };
