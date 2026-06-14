// State adapter: check serialize() line 198
// If a state is dirty AND has a description, does it get emitted?

// Scenario: add a state "S1" without description first (added: true)
// Then set its description to "Initial State" (dirty: true)

const stateNodes = [
  { id: 'S1', description: 'Initial State', dirty: true, added: true, hasLine: false },
];

const sourceLines = [];
const stateById = new Map(stateNodes.map((s) => [s.id, s]));
const emittedState = new Set();

const out = [];

for (const line of sourceLines) {
  // empty, no sourceLines
}

const additions = [];
// From serialize(), lines 196-201:
for (const node of stateNodes) {
  if (emittedState.has(node.id)) continue;
  if (node.added || (node.dirty && node.description !== undefined)) {
    additions.push(`  state "${node.description}" as ${node.id}`); // or colon form
  }
}

console.log('additions:', additions);
console.log('Should emit S1 with description?', stateNodes[0].added || (stateNodes[0].dirty && stateNodes[0].description !== undefined));
