import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

function getTypeScriptErrors() {
  const configPath = './tsconfig.json'; // Adjust path to your tsconfig.json
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, './');

  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });

  const diagnostics = ts.getPreEmitDiagnostics(program);

  const errors = diagnostics.map(diagnostic => ({
    file: diagnostic.file ? diagnostic.file.fileName : null,
    line: diagnostic.file ? ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!).line + 1 : null,
    column: diagnostic.file ? ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!).character + 1 : null,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    code: diagnostic.code,
  }));

  const outputPath = path.join('public', 'type_errors.json');
  fs.writeFileSync(outputPath, JSON.stringify(errors, null, 2));
  console.log(`TypeScript errors written to ${outputPath} (${errors.length} errors)`);
}

getTypeScriptErrors();