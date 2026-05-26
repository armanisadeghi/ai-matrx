// scripts/generate-manifest.ts
import path from 'path';

import fs from 'fs/promises';

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

        // Entity-isolation migration: /demos/tests is mid-audit. Some test routes
        // moved to (legacy)/legacy/tests because they actually used the
        // entity system; the rest live under (dev)/demos/tests (the consolidated
        // /demos/* URL prefix). Look in both locations and merge — drop
        // duplicates by name.
        const candidatePaths = [
            { path: path.join(projectRoot, 'app', '(dev)', 'demos', 'tests'), urlPrefix: '/demos/tests' },
            { path: path.join(projectRoot, 'app', '(legacy)', 'legacy', 'tests'), urlPrefix: '/legacy/tests' },
        ];

        const seen = new Set<string>();
        const directories: { path: string; name: string }[] = [];

        for (const { path: dirPath, urlPrefix } of candidatePaths) {
            try {
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                for (const dirent of entries) {
                    if (!dirent.isDirectory()) continue;
                    if (seen.has(dirent.name)) continue;
                    seen.add(dirent.name);
                    directories.push({
                        path: `${urlPrefix}/${dirent.name}`,
                        name: dirent.name,
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
