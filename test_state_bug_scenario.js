// State adapter bug scenario:
// 1. Parse a diagram with an inline state (in a transition)
// 2. Apply setStateDescription with empty string
// 3. Serialize

// Step 1: Parse
// stateDiagram-v2
// A --> B

const doc = {
  header: 'stateDiagram-v2',
  states: [
    { id: 'A', hasLine: false, raw: undefined },  // inline in transition
    { id: 'B', hasLine: false, raw: undefined },  // inline in transition
  ],
  transitions: [
    { id: 'st1', from: 'A', to: 'B', raw: 'A --> B' },
  ],
  sourceLines: [
    { text: 'stateDiagram-v2', ref: { entity: 'header', id: 'header' } },
    { text: 'A --> B', ref: { entity: 'transition', id: 'st1' } },
  ],
};

// Step 2: Apply setStateDescription("A", "")
doc.states[0].description = undefined;  // empty string || undefined
doc.states[0].dirty = true;

console.log('After setStateDescription("A", ""):');
console.log('State A:', doc.states[0]);

// Step 3: Serialize
const stateById = new Map(doc.states.map((s) => [s.id, s]));
const emittedState = new Set();
const emittedTransition = new Set();

const out = [];
for (const line of doc.sourceLines) {
  if (!line.ref) {
    out.push(line.text);
    continue;
  }
  switch (line.ref.entity) {
    case 'header':
      out.push(line.text);
      break;
    case 'transition':
      emittedTransition.add('st1');
      out.push(line.text);
      break;
    case 'stateLine':
      // State A has no stateLine in sourceLines, so this doesn't match
      break;
  }
}

console.log('');
console.log('After first pass:');
console.log(out.join('\n'));

// Now check additions
const additions = [];
for (const node of doc.states) {
  if (emittedState.has(node.id)) continue;
  if (node.added || (node.dirty && node.description !== undefined)) {
    // A is dirty, but description is undefined, so this is FALSE
    // A won't be added!
    const func = node.description !== undefined
      ? `state "${node.description}" as ${node.id}`
      : node.id;
    additions.push(`  ${func}`);
  }
}

console.log('additions:', additions);
console.log('');
console.log('BUG CONFIRMED: State A is dirty but never re-emitted!');
console.log('In a roundtrip, the state would be lost from structural editing.');
