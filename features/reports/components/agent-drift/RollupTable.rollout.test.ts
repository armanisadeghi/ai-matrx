import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('canonical table rollout contracts', () => {
  it.each([
    ['app/(admin)/administration/database/sql-functions/components/SqlFunctionsList.tsx', 'sql-functions', 'rowActions'],
    ['app/(admin)/administration/database/sql-functions/components/EnumsList.tsx', 'database-enums', 'Unknown'],
    ['features/reports/components/agent-drift/RollupTable.tsx', 'agent-drift-${mode}', 'onSelect(row.agentId)'],
    ['features/scopes/components/management/OrgScopeTypeSection.tsx', 'org-scopes-${scopeType.id}', 'ScopeValueCell'],
  ])('%s uses the canonical renderer and retains its domain door', (file, id, door) => {
    const source = read(file);
    expect(source).toContain('MatrxDataTable');
    expect(source).toContain(id);
    expect(source).toContain(door);
  });

  // canonicalize-without-destroying (2026-09-30): the scope cards (org home AND the Scopes page — one
  // component since 2026-09-30) are the titled table card, never the bare table dropped inside a
  // padded Card (box in a box, pager for four rows).
  it('scope cards draw the table inside MatrxTableCard, not a padded Card', () => {
    const source = read('features/scopes/components/management/OrgScopeTypeSection.tsx');
    expect(source).toContain('<MatrxTableCard');
    expect(source).not.toMatch(/<Card[\s>]/);
    expect(source).not.toMatch(/pageSize=\{/);
  });
});
