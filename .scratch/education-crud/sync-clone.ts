import { spawnSync } from 'node:child_process';
import { loadCloneDbEnv, loadCloneRef } from '../../scripts/lib/migration-target';
const root = process.cwd();
const env = loadCloneDbEnv(root, loadCloneRef(root));
const surfaces = ['education-memory', 'education-study-guides', 'education-study-guide', 'education-summaries', 'education-mind-maps', 'education-audio-study', 'education-kits'];
const args = ['exec', 'tsx', 'scripts/sync-surface-manifests-direct.ts', ...process.argv.slice(2), ...surfaces.flatMap(name => ['--surface', `matrx-user/${name}`])];
const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit', env: { ...process.env, SUPABASE_MATRIX_USER: env.user, SUPABASE_MATRIX_PASSWORD: env.password, SUPABASE_MATRIX_HOST: env.host, SUPABASE_MATRIX_PORT: String(env.port), SUPABASE_MATRIX_DATABASE_NAME: env.database } });
process.exit(result.status ?? 1);
