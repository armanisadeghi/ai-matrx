// Test: roundtrip with the state bug

const input = `stateDiagram-v2
A --> B
A : Start`;

// Parse (simplified)
const doc = {
  header: 'stateDiagram-v2',
  states: [
    { id: 'A', description: 'Start', hasLine: true, raw: 'A : Start', dirty: false },
    { id: 'B', hasLine: false, raw: undefined, dirty: false },
  ],
  transitions: [
    { id: 'st1', from: 'A', to: 'B', raw: 'A --> B', dirty: false },
  ],
  sourceLines: [
    { text: 'stateDiagram-v2', ref: { entity: 'header' } },
    { text: 'A --> B', ref: { entity: 'transition', id: 'st1' } },
    { text: 'A : Start', ref: { entity: 'stateLine', id: 'A' } },
  ],
};

// Apply setStateDescription("A", "") to clear the description
doc.states[0].description = undefined;
doc.states[0].dirty = true;

console.log('After setStateDescription("A", ""):');
console.log('State A:', doc.states[0]);

// Serialize
const stateById = new Map(doc.states.map((s) => [s.id, s]));
const transitionById = new Map(doc.transitions.map((t) => [t.id, t]));
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
    case 'transition': {
      const t = transitionById.get(line.ref.id);
      if (!t) break;
      emittedTransition.add(t.id);
      out.push(t.dirty ? `${t.from} --> ${t.to}` : line.text);
      break;
    }
    case 'stateLine': {
      const node = stateById.get(line.ref.id);
      if (!node) break;
      emittedState.add(node.id);
      if (node.dirty) {
        // Bug: this re-emits the dirty state
        // But if description was cleared, should emit bare name
        out.push(`${node.id}${node.description !== undefined ? ` : ${node.description}` : ''}`);
      } else {
        out.push(line.text);
      }
      break;
    }
  }
}

console.log('');
console.log('After first pass:');
console.log(out.join('\n'));

// Check additions
const additions = [];
for (const node of doc.states) {
  if (emittedState.has(node.id)) continue;
  if (node.added || (node.dirty && node.description !== undefined)) {
    // A is dirty but description is undefined, so this is FALSE
    additions.push(`  ${node.id}`);
  }
}

console.log('');
console.log('additions:', additions);

const serialized = [...out, ...additions].join('\n');
console.log('');
console.log('Serialized:');
console.log(serialized);

console.log('');
console.log('ISSUE: A : Start became A (correct), but state B is still missing!');
console.log('The roundtrip test would FAIL because sourceLines emitted A with no description.');
