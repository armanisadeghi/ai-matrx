// Browser stand-in for Node built-ins that bundled packages reach behind a runtime isNode check
// (e.g. @ai-matrx/alchemy/operate/pptx inlines pptxgenjs, which does `import("fs")`/`import("https")`).
// Webpack gets the same via resolve.fallback (fs: false); this is Turbopack's equivalent.
module.exports = {};
