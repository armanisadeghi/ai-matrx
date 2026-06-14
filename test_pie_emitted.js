// Pie adapter: check that deleted slices are properly handled

// Parse:
// pie title My Pie
//   "Slice 1" : 10
//   "Slice 2" : 20

const doc = {
  title: 'My Pie',
  showData: false,
  slices: [
    { id: 'p1', label: 'Slice 1', value: 10, raw: '"Slice 1" : 10' },
    { id: 'p2', label: 'Slice 2', value: 20, raw: '"Slice 2" : 20' },
  ],
  sourceLines: [
    { text: 'pie title My Pie', ref: { entity: 'header', id: 'header' } },
    { text: '  "Slice 1" : 10', ref: { entity: 'slice', id: 'p1' } },
    { text: '  "Slice 2" : 20', ref: { entity: 'slice', id: 'p2' } },
  ],
};

// Delete p1
doc.slices = doc.slices.filter((s) => s.id !== 'p1');

// Serialize
const sliceById = new Map(doc.slices.map((s) => [s.id, s]));
const emitted = new Set();

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
    case 'slice': {
      const slice = sliceById.get(line.ref.id);
      if (!slice) break;  // <-- Don't emit, don't add to emitted set
      emitted.add(slice.id);
      out.push(slice.dirty ? `"${slice.label}" : ${slice.value}` : line.text);
      break;
    }
  }
}

console.log('emitted Set:', emitted);
console.log('');
console.log('Serialized:');
console.log(out.join('\n'));
console.log('');

// Check the additions block
const additions = [];
for (const slice of doc.slices) {
  if (!emitted.has(slice.id) && !slice.raw) {
    // slice.raw exists, so this won't add
    additions.push(`  "${slice.label.replace(/"/g, "'")}" : ${slice.value}`);
  }
}
console.log('additions:', additions);
console.log('Final:');
console.log([...out, ...additions].join('\n'));
