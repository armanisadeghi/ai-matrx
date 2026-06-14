// State: test the case where a state is parsed inline (in a transition)
// and then its description is set.

// Scenario from state.ts parse():
// Line 1: stateDiagram-v2
// Line 2: A --> B
// 
// This creates states A and B with no raw, no hasLine.
// Then later, setStateDescription("A", "Start") is called.

const stateNodes = [
  { id: 'A', description: undefined, hasLine: false, raw: undefined },
  { id: 'B', description: undefined, hasLine: false, raw: undefined },
];

const sourceLines = [
  { text: 'stateDiagram-v2', ref: { entity: 'header', id: 'header' } },
  { text: 'A --> B', ref: { entity: 'transition', id: 'st1' } },
];

// Apply setStateDescription to A
stateNodes[0].description = 'Start';
stateNodes[0].dirty = true;

console.log('State A after setStateDescription:');
console.log(stateNodes[0]);

// Serialize
const emittedState = new Set();
const out = [];

for (const line of sourceLines) {
  switch (line.ref.entity) {
    case 'transition':
      out.push(line.text);
      break;
  }
}

const additions = [];
for (const node of stateNodes) {
  if (emittedState.has(node.id)) continue;
  if (node.added || (node.dirty && node.description !== undefined)) {
    additions.push(`  state "${node.description}" as ${node.id}`);
  }
}

console.log('');
console.log('Serialized:');
console.log([...out, ...additions].join('\n'));
