// scripts/generate-manifest.ts
import path from 'path';

import fs from 'fs/promises';
import { discoverRoutesFromPageFiles } from '../utils/route-discovery/scan-fs';

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

async function generateManifest() {
    try {
        console.log('🚀 Starting manifest generation...');

        const projectRoot = await findProjectRoot(__dirname);

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

        const publicDir = path.join(projectRoot, 'public');
        await fs.mkdir(publicDir, { recursive: true });

        const manifestPath = path.join(publicDir, 'test-directories.json');
        await fs.writeFile(
            manifestPath,
            JSON.stringify(directories, null, 2)
        );

        console.log(`✅ Generated manifest with ${directories.length} directories`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error generating manifest:', error);
        process.exit(1);
    }
}

generateManifest();
