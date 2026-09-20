import { checkDirectFromSchema } from './direct-from-schema';
import { checkQualifiedRefs } from './qualified-refs';
import type { Context } from '../types';

function context(source: string): Context {
  return {
    root: '/test',
    snapshot: {
      generatedAt: '2026-09-20', source: 'fixture', provenance: 'rpc',
      tables: new Map([['platform', new Set(['rulebook'])], ['provider', new Set<string>()], ['context', new Set(['scopes'])]]),
      views: new Map(), exposedSchemas: new Set(['platform']),
      relationSchemas: new Map([['rulebook', new Set(['platform'])], ['scopes', new Set(['context'])]]),
    },
    codeFiles: [{ path: 'service.ts', ext: '.ts', lines: source.split('\n'), generated: null }],
    dbTypesSchemas: new Set(['platform']), deadRelations: [], deadOldNames: new Set(),
    warn: false, schemaBinders: new Map(),
  };
}

describe('schema checks distinguish bound clients and program expressions', () => {
  it('resolves a schema constant without treating it as public', () => {
    expect(checkDirectFromSchema(context(`const SCHEMA = "platform";\nsupabase.schema(SCHEMA).from("rulebook");`))).toEqual([]);
  });
  it('still rejects a wrong schema constant', () => {
    expect(checkDirectFromSchema(context(`const SCHEMA = "provider";\nsupabase.schema(SCHEMA).from("rulebook");`))).toHaveLength(1);
  });
  it('resolves a local client factory even when its alias is named sb', () => {
    expect(checkDirectFromSchema(context(`function platformDb() { return createClient().schema("platform"); }\nconst sb = platformDb();\nsb.from("rulebook");`))).toEqual([]);
  });
  it('still checks the table through a local factory', () => {
    expect(checkDirectFromSchema(context(`function platformDb() { return createClient().schema("platform"); }\nconst sb = platformDb();\nsb.from("missing");`))).toHaveLength(1);
  });
  it('prefers an explicitly bound alias over the conventional public name', () => {
    expect(checkDirectFromSchema(context(`const sb = supabase.schema("platform");\nsb.from("rulebook");`))).toEqual([]);
  });
  it('does not confuse a JavaScript join with SQL', () => {
    expect(checkQualifiedRefs(context('const scope = provider.scopes.join(" ");'))).toEqual([]);
  });
  it('still rejects real SQL in strings and templates', () => {
    expect(checkQualifiedRefs(context('const sql = "select * from provider.scopes";'))).toHaveLength(1);
    expect(checkQualifiedRefs(context('const sql = `select * from provider.scopes where id = ${id}`;'))).toHaveLength(1);
  });
  it('does not treat template interpolations as SQL identifiers', () => {
    expect(checkQualifiedRefs(context('const sql = `select * from ${provider.scopes}`;'))).toEqual([]);
  });
});
