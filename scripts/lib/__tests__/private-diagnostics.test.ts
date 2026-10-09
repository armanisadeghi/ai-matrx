/** @jest-environment node */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { assertNoPublicDiagnostics, writeLocalDiagnostic, DIAGNOSTIC_NAMES } from '../local-diagnostics';
import { captureTypeScriptErrors, parseTypeDiagnostics, type CompilerResult } from '../../capture-ts-errors';
import { generateManifest } from '../../generate-manifest';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'private-diagnostics-test-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const completed = (stdout: string, status = 2): CompilerResult => ({ stdout, stderr: '', status, signal: null });

it('the real checkout has no public diagnostic artifacts', () => {
  expect(() => assertNoPublicDiagnostics(resolve(__dirname, '../../..'))).not.toThrow();
});

it.each(DIAGNOSTIC_NAMES)('refuses a reintroduced public %s before either producer writes', async name => {
  mkdirSync(join(root, 'public'));
  writeFileSync(join(root, 'public', name), 'internal report');
  const run = jest.fn(() => completed('error TS5074: configuration error'));
  expect(() => captureTypeScriptErrors(root, run)).toThrow('cannot be published');
  expect(run).not.toHaveBeenCalled();
  const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try { await expect(generateManifest(root)).rejects.toThrow('cannot be published'); }
  finally { quiet.mockRestore(); }
  expect(existsSync(join(root, '.matrx', 'diagnostics'))).toBe(false);
});

it('generates actual discovered demo routes privately and preserves their format', async () => {
  const base = join(root, 'app', '(dev)', 'demos', 'tests');
  for (const name of ['beta', 'alpha', '_hidden']) {
    mkdirSync(join(base, name), { recursive: true });
    writeFileSync(join(base, name, 'page.tsx'), 'export default function Page() {}');
  }
  const result = await generateManifest(root);
  expect(JSON.parse(readFileSync(result.manifestPath, 'utf8'))).toEqual([
    { name: 'alpha', path: '/demos/tests/alpha' }, { name: 'beta', path: '/demos/tests/beta' },
  ]);
  expect(result.manifestPath).toBe(join(root, '.matrx', 'diagnostics', 'test-directories.json'));
  expect(existsSync(join(root, 'public'))).toBe(false);
});

it('parses file and file-less compiler errors with multiline details', () => {
  expect(parseTypeDiagnostics('source/path with spaces.ts(12,3): error TS2322: mismatch\n  nested detail\nerror TS5074: config error\n')).toEqual([
    { file: 'source/path with spaces.ts', line: 12, column: 3, code: 2322, message: 'mismatch\n  nested detail' },
    { file: null, line: null, column: null, code: 5074, message: 'config error' },
  ]);
});

it('captures diagnostics privately and preserves the failing compiler exit', () => {
  const result = captureTypeScriptErrors(root, () => completed('sample.ts(4,2): error TS2322: mismatch'));
  const report = JSON.parse(readFileSync(result.path, 'utf8'));
  expect(result.exitCode).toBe(2);
  expect(report).toMatchObject({ status: 'diagnostics', compilerExitCode: 2, signal: null });
  expect(report.diagnostics).toHaveLength(1);
  expect(result.path).toBe(join(root, '.matrx', 'diagnostics', 'type_errors.json'));
});

it.each([70, 137])('retains queue failure exit %i and marks partial diagnostics unavailable', status => {
  const result = captureTypeScriptErrors(root, () => ({ ...completed('sample.ts(1,1): error TS2322: partial', status), stderr: '[tsc-capped] ERROR: compiler stopped' }));
  expect(result.exitCode).toBe(status);
  expect(JSON.parse(readFileSync(result.path, 'utf8')).status).toBe('unavailable');
});

it.each([
  { ...completed('', 0), signal: 'SIGTERM', status: null },
  { ...completed('', 0), error: new Error('buffer exceeded') },
  completed('unexpected failure', 2),
])('records signal, buffer and unparsed failures without reporting clean', value => {
  const result = captureTypeScriptErrors(root, () => value);
  expect(result.exitCode).not.toBe(0);
  expect(JSON.parse(readFileSync(result.path, 'utf8')).status).toBe('unavailable');
});

it('overwrites an earlier clean report with an atomic unavailable result', () => {
  const clean = captureTypeScriptErrors(root, () => completed('', 0));
  expect(clean.exitCode).toBe(0);
  const failed = captureTypeScriptErrors(root, () => { throw new Error('cannot launch'); });
  expect(JSON.parse(readFileSync(failed.path, 'utf8'))).toMatchObject({ status: 'unavailable', compilerExitCode: null });
  expect(readdirSync(join(root, '.matrx', 'diagnostics'))).toEqual(['type_errors.json']);
});

it('writes an ordinary private report without creating public assets', () => {
  const target = writeLocalDiagnostic(root, 'test-directories.json', []);
  expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual([]);
  expect(existsSync(join(root, 'public'))).toBe(false);
});


it('refuses an inconsistent zero exit carrying compiler errors', () => {
  const result = captureTypeScriptErrors(root, () => completed('error TS5074: config error', 0));
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(readFileSync(result.path, 'utf8'))).toMatchObject({ status: 'unavailable', compilerExitCode: 0 });
});

it('every actual Next build and manifest entry point checks private diagnostics first', () => {
  const scripts: Record<string, string> = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf8')).scripts;
  const builds = Object.values(scripts).filter(value => value.includes('next build') || value.includes('scripts/generate-manifest.ts'));
  expect(builds.length).toBeGreaterThanOrEqual(7);
  for (const command of builds) expect(command.startsWith('pnpm check:private-diagnostics && ')).toBe(true);
  expect(scripts['capture-errors']).toBe('tsx scripts/capture-ts-errors.ts');
});
