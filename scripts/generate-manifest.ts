// scripts/generate-manifest.ts
import path from 'path';

import fs from 'fs/promises';
import { discoverRoutesFromPageFiles } from '../utils/route-discovery/scan-fs';
import { buildAppTree } from '../utils/route-discovery/app-tree';
import { writeFileSync } from 'fs';
import { assertNoPublicDiagnostics, writeLocalDiagnostic } from './lib/local-diagnostics';

async function findProjectRoot(startPath: string) {
    let currentPath = startPath;
    const root = path.parse(currentPath).root;

    while (currentPath !== root) {
        try {
            const packagePath = path.join(currentPath, 'package.json');
            await fs.access(packagePath);
            return currentPath;
        } catch {
            currentPath = path.dirname(currentPath);
        }
    }

    throw new Error('Could not find project root');
}

export async function generateManifest(projectRootOverride?: string) {
    try {
        console.log('🚀 Starting manifest generation...');

        const projectRoot = projectRootOverride ?? await findProjectRoot(__dirname);
        assertNoPublicDiagnostics(projectRoot);

        // Test and experimental routes are consolidated under /demos/tests.
        // Keep this manifest aligned with the only supported route tree.
        const candidatePaths = [
            { path: path.join(projectRoot, 'app', '(dev)', 'demos', 'tests'), urlPrefix: '/demos/tests' },
        ];

        const directories: { path: string; name: string }[] = [];

        for (const { path: dirPath, urlPrefix } of candidatePaths) {
            try {
                await fs.access(dirPath);
                const routeDirectories = new Set(
                    discoverRoutesFromPageFiles(dirPath).map((route) => route.split('/')[0])
                );
                for (const name of [...routeDirectories].sort()) {
                    directories.push({
                        path: `${urlPrefix}/${name}`,
                        name,
                    });
                }
            } catch (err) {
                if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
                // Directory doesn't exist yet — skip it.
            }
        }

        // THE TRACE LAW: production route discovery reads this tree instead of the disk, so no
        // route's server function ships a source folder (utils/route-discovery/app-tree.ts).
        const treePath = path.join(projectRoot, 'utils', 'route-discovery', 'app-tree.generated.json');
        writeFileSync(treePath, JSON.stringify(buildAppTree(path.join(projectRoot, 'app'))) + '\n');
        console.log(`✅ Wrote the app route tree for production route discovery`);

        const manifestPath = writeLocalDiagnostic(projectRoot, 'test-directories.json', directories);

        console.log(`✅ Generated manifest with ${directories.length} directories`);
        return { manifestPath, directories };
    } catch (error) {
        console.error('❌ Error generating manifest:', error);
        throw error;
    }
}

if (require.main === module) {
    void generateManifest().catch(() => { process.exitCode = 1; });
}
