// State adapter: subtle issue with serialize logic
// Line 198: if (node.added || (node.dirty && node.description !== undefined))
//
// This condition means: emit if ADDED, OR if (DIRTY AND has description)
// But what if node is DIRTY and description is CLEARED (undefined)?
// Then it won't be emitted, even though it's dirty!

const stateNodes = [
  { id: 'S1', description: 'Start', dirty: true, hasLine: false, raw: undefined },
];

// Change description to undefined (clearing it)
stateNodes[0].description = undefined;

console.log('State after clearing description:');
console.log(stateNodes[0]);

const sourceLines = [];
const emittedState = new Set();

const out = [];
const additions = [];
for (const node of stateNodes) {
  if (emittedState.has(node.id)) continue;
  if (node.added || (node.dirty && node.description !== undefined)) {
    // This condition is FALSE because description is undefined
    // So the state won't be emitted at all!
    additions.push(`  state "${node.description}" as ${node.id}`);
  }
}

console.log('additions:', additions);
console.log('');
console.log('Issue: if a state had a description and we clear it,');
console.log('the state never gets re-emitted, so it stays with the old description!');
