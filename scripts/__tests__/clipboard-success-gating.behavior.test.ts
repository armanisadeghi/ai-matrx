import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

type ExtractedHandler = {
  body: string;
  parameters: string[];
};

function parse(file: string) {
  const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function functionBodyFromInitializer(
  initializer: ts.Expression,
): ts.ConciseBody | undefined {
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
    return initializer.body;
  if (ts.isCallExpression(initializer)) {
    const callback = initializer.arguments.find(
      (argument): argument is ts.ArrowFunction | ts.FunctionExpression =>
        ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
    );
    return callback?.body;
  }
  return undefined;
}

function extractVariableHandler(
  file: string,
  variableName: string,
  containingFunction?: string,
): ExtractedHandler {
  const sourceFile = parse(file);
  let found: ExtractedHandler | undefined;
  function visit(node: ts.Node, owner?: string) {
    let nextOwner = owner;
    if (ts.isFunctionDeclaration(node) && node.name) nextOwner = node.name.text;
    if (
      !found &&
      (!containingFunction || nextOwner === containingFunction) &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === variableName &&
      node.initializer
    ) {
      const body = functionBodyFromInitializer(node.initializer);
      const fn = ts.isCallExpression(node.initializer)
        ? node.initializer.arguments.find(
            (argument): argument is ts.ArrowFunction | ts.FunctionExpression =>
              ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
          )
        : ts.isArrowFunction(node.initializer) ||
            ts.isFunctionExpression(node.initializer)
          ? node.initializer
          : undefined;
      if (body && ts.isBlock(body) && fn) {
        found = {
          body: body.getText(sourceFile),
          parameters: fn.parameters.map((parameter) =>
            parameter.name.getText(sourceFile),
          ),
        };
      }
    }
    ts.forEachChild(node, (child) => visit(child, nextOwner));
  }
  visit(sourceFile);
  if (!found) throw new Error(`Could not extract ${variableName} from ${file}`);
  return found;
}

function extractInlineHandler(
  file: string,
  contains: string,
): ExtractedHandler {
  const sourceFile = parse(file);
  let found: ExtractedHandler | undefined;
  function visit(node: ts.Node) {
    if (
      !found &&
      ts.isArrowFunction(node) &&
      ts.isBlock(node.body) &&
      node.body.getText(sourceFile).includes(contains)
    ) {
      found = {
        body: node.body.getText(sourceFile),
        parameters: node.parameters.map((parameter) =>
          parameter.name.getText(sourceFile),
        ),
      };
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!found)
    throw new Error(
      `Could not extract inline handler containing ${contains} from ${file}`,
    );
  return found;
}

function compile(
  handler: ExtractedHandler,
  dependencies: Record<string, unknown>,
): (...args: unknown[]) => Promise<unknown> {
  const names = Object.keys(dependencies);
  const values = Object.values(dependencies);
  const executable = ts.transpileModule(
    `async function extractedHandler(${handler.parameters.join(",")}) ${handler.body}`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const factory = new Function(
    ...names,
    `${executable}\nreturn extractedHandler;`,
  ) as (...args: unknown[]) => (...args: unknown[]) => Promise<unknown>;
  return factory(...values);
}

function removeBooleanGuard(body: string): string {
  const thenGuard = body.replace(/if\s*\(!copied\)\s*return;/, "");
  if (thenGuard !== body) return thenGuard;
  const awaitGuard = body.replace(
    /if\s*\(!\(await\s+([\s\S]*?)\)\)\s*return;/,
    "await $1;",
  );
  if (awaitGuard === body)
    throw new Error("Expected a clipboard boolean guard to mutate");
  return awaitGuard;
}

type Case = {
  name: string;
  handler: ExtractedHandler;
  args: unknown[];
  dependencies: (
    copyResult: boolean,
    success: jest.Mock,
  ) => Record<string, unknown>;
  expectedSuccessArgument: unknown;
};

const cases: Case[] = [
  {
    name: "public UUID generator copy callback",
    handler: extractVariableHandler(
      "app/(public)/free/uuid/generator/page.tsx",
      "copyToClipboard",
    ),
    args: ["7dbf8c31-3f47-4d6d-a88d-e32a0d72f5b9"],
    dependencies: (copyResult, success) => ({
      copyText: jest.fn().mockResolvedValue(copyResult),
      setCopied: success,
      setTimeout: jest.fn(),
      toast: { success: jest.fn() },
    }),
    expectedSuccessArgument: "7dbf8c31-3f47-4d6d-a88d-e32a0d72f5b9",
  },
  {
    name: "ContextDebugModal copy callback",
    handler: extractVariableHandler(
      "components/debug/ContextDebugModal.tsx",
      "copyToClipboard",
    ),
    args: ["context text", "context"],
    dependencies: (copyResult, success) => ({
      copyText: jest.fn().mockResolvedValue(copyResult),
      setCopiedKey: success,
      setTimeout: jest.fn(),
    }),
    expectedSuccessArgument: "context",
  },
  {
    name: "ResourceDebugIndicator copy callback",
    handler: extractVariableHandler(
      "components/debug/ResourceDebugIndicator.tsx",
      "copyToClipboard",
    ),
    args: [{ id: "resource-7" }, 7],
    dependencies: (copyResult, success) => ({
      copyText: jest.fn().mockResolvedValue(copyResult),
      setCopiedIndex: success,
      setTimeout: jest.fn(),
      toast: { error: jest.fn() },
    }),
    expectedSuccessArgument: 7,
  },
  {
    name: "GuidedChecklist copy callback",
    handler: extractVariableHandler(
      "lib/guided-setup/components/GuidedChecklist.tsx",
      "copy",
      "CopyRow",
    ),
    args: [],
    dependencies: (copyResult, success) => ({
      copyText: jest.fn().mockResolvedValue(copyResult),
      value: { value: "verification token" },
      setCopied: success,
      setTimeout: jest.fn(),
      toast: { error: jest.fn() },
    }),
    expectedSuccessArgument: true,
  },
  {
    name: "InvitationsPanel delivery-link callback",
    handler: extractInlineHandler(
      "components/membership/InvitationsPanel.tsx",
      "Invitation link copied to clipboard",
    ),
    args: [],
    dependencies: (copyResult, success) => ({
      copyText: jest.fn().mockResolvedValue(copyResult),
      deliveryNotice: {
        acceptUrl: "https://www.aimatrx.com/invitations/accept/token",
      },
      toast: { success, error: jest.fn() },
    }),
    expectedSuccessArgument: "Invitation link copied to clipboard",
  },
];

describe.each(cases)(
  "$name",
  ({ handler, args, dependencies, expectedSuccessArgument }) => {
    test("a false copy result cannot emit copied state or a success toast", async () => {
      const success = jest.fn();
      await compile(handler, dependencies(false, success))(...args);
      await Promise.resolve();
      expect(success).not.toHaveBeenCalled();
    });

    test("a true copy result emits the intended success exactly once", async () => {
      const success = jest.fn();
      await compile(handler, dependencies(true, success))(...args);
      await Promise.resolve();
      expect(success).toHaveBeenCalledTimes(1);
      expect(success).toHaveBeenCalledWith(expectedSuccessArgument);
    });

    test("mutation proof: removing the shipped guard reproduces the false-success bug", async () => {
      const success = jest.fn();
      const mutant = { ...handler, body: removeBooleanGuard(handler.body) };
      await compile(mutant, dependencies(false, success))(...args);
      await Promise.resolve();
      expect(success).toHaveBeenCalledTimes(1);
    });
  },
);

describe("useShare copy fallback", () => {
  const handler = extractVariableHandler(
    "features/sharing/hooks/useShare.tsx",
    "copy",
  );

  function dependencies(copyResult: boolean) {
    return {
      copyTextKit: jest.fn().mockResolvedValue(copyResult),
      setFallbackTitle: jest.fn(),
      setFallbackDescription: jest.fn(),
      setFallbackUrl: jest.fn(),
      setCopied: jest.fn(),
      window: { setTimeout: jest.fn() },
    };
  }

  test("false uses the existing manual-copy branch instead of returning undefined", async () => {
    const deps = dependencies(false);
    const outcome = await compile(handler, deps)(
      "https://www.aimatrx.com/share/record",
      {
        title: "Copy record link",
      },
    );
    expect(outcome).toBe("manual");
    expect(deps.setFallbackUrl).toHaveBeenCalledWith(
      "https://www.aimatrx.com/share/record",
    );
    expect(deps.setCopied).not.toHaveBeenCalled();
  });

  test("true returns copied and emits copied state", async () => {
    const deps = dependencies(true);
    const outcome = await compile(
      handler,
      deps,
    )("https://www.aimatrx.com/share/record");
    expect(outcome).toBe("copied");
    expect(deps.setCopied).toHaveBeenCalledWith(true);
    expect(deps.setFallbackUrl).not.toHaveBeenCalled();
  });
});
