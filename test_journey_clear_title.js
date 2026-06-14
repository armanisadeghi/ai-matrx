// Journey adapter: what if we clear the title (set to undefined)?

// Parse:
// journey
//   title My Journey
//   section S1
//     Task 1: 3

const doc = {
  title: 'My Journey',
  sections: [
    { id: 'sec1', title: 'S1', tasks: [{ id: 'j1', name: 'Task 1', score: 3, actors: [], raw: 'Task 1: 3' }], raw: '  section S1' },
  ],
  sourceLines: [
    { text: 'journey', ref: { entity: 'header', id: 'header' } },
    { text: '  title My Journey', ref: { entity: 'title', id: 'title' } },
    { text: '  section S1', ref: { entity: 'section', id: 'sec1' } },
    { text: '    Task 1: 3', ref: { entity: 'task', id: 'j1' } },
  ],
  regenerateAll: false,
  dirtyTitle: false,
};

// Apply setTitle with empty string
doc.title = undefined;
doc.dirtyTitle = true;

console.log('After clearing title:');
console.log(doc);

// Serialize
const out = [];
for (const line of doc.sourceLines) {
  if (!line.ref) {
    out.push(line.text);
    continue;
  }
  switch (line.ref.entity) {
    case 'title':
      if (doc.title === undefined) break;  // <-- This breaks out, skipping re-emit
      out.push(doc.dirtyTitle ? `  title ${doc.title}` : line.text);
      break;
  }
}

console.log('');
console.log('Serialized (title cleared):');
console.log(out.join('\n'));

// So clearing the title DOES skip re-emitting the title line.
// This is correct behavior: if title is undefined, we don't want a title line.
console.log('');
console.log('This is actually correct! Clearing title should remove the title line.');
