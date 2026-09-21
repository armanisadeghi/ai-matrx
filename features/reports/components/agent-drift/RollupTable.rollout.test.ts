import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('canonical table rollout contracts', () => {
  it.each([
    ['app/(admin)/administration/database/sql-functions/components/SqlFunctionsList.tsx', 'sql-functions', 'onDeleteFunction'],
    ['app/(admin)/administration/database/sql-functions/components/EnumsList.tsx', 'database-enums', 'onDeleteEnum'],
    ['features/reports/components/agent-drift/RollupTable.tsx', 'agent-drift-${mode}', 'onSelect(row.agentId)'],
    ['features/scope-system/components/OrgHomeScopeSection.tsx', 'org-home-scopes-${scopeType.id}', 'ScopeValueCell'],
  ])('%s uses the canonical renderer and retains its domain door', (file, id, door) => {
    const source = read(file);
    expect(source).toContain('MatrxDataTable');
    expect(source).toContain(id);
    expect(source).toContain(door);
  });
});
