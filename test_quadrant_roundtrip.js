// Simulate a quadrant chart where we setXAxis on a document that already has a title

const input = `quadrantChart
  title My Chart
  quadrant-1 Success
  Point A: [0.3, 0.7]
`;

// Parse
const doc = {
  title: 'My Chart',
  xAxis: undefined,
  yAxis: undefined,
  quadrantLabels: ['Success', undefined, undefined, undefined],
  points: [{ id: 'q1', label: 'Point A', x: 0.3, y: 0.7, raw: 'Point A: [0.3, 0.7]' }],
  sourceLines: [
    { text: 'quadrantChart', ref: { entity: 'header', id: 'header' } },
    { text: '  title My Chart', ref: { entity: 'title', id: 'title' } },
    { text: '  quadrant-1 Success', ref: { entity: 'quadrant', id: '0' } },
    { text: '  Point A: [0.3, 0.7]', ref: { entity: 'point', id: 'q1' } },
  ],
  dirty: {},
  present: new Set(['title', 'q0']),
};

console.log('Original input:');
console.log(input);

// First pass of serialize
const out = [];
let headerIdx = -1;

for (const line of doc.sourceLines) {
  switch (line.ref.entity) {
    case 'header':
      headerIdx = out.length;
      out.push(line.text);
      break;
    case 'title':
      out.push(line.text);
      break;
    case 'quadrant':
      out.push(line.text);
      break;
    case 'point':
      out.push(line.text);
      break;
  }
}

console.log('');
console.log('After first pass, headerIdx:', headerIdx);
console.log('out.length:', out.length);

const inserts = [];
if (doc.title !== undefined && !doc.present.has('title')) {
  inserts.push(`  title ${doc.title}`);
}

console.log('inserts:', inserts);
console.log('Will splice at position:', headerIdx + 1);

// This is where the bug appears: we splice at headerIdx + 1,
// but the title is already at position 1. So nothing changes.
// But if we had an xAxis to insert, it would go AT position 1,
// pushing the title down!

// Let's manually set xAxis to demonstrate:
doc.xAxis = 'Low --> High';
doc.dirty.xAxis = true;

const out2 = [];
let headerIdx2 = -1;

for (const line of doc.sourceLines) {
  switch (line.ref.entity) {
    case 'header':
      headerIdx2 = out2.length;
      out2.push(line.text);
      break;
    case 'title':
      out2.push(line.text);  // not dirty, so re-emit as-is
      break;
    case 'xAxis':
      // This ref doesn't exist in sourceLines, so the switch doesn't match
      break;
    case 'quadrant':
      out2.push(line.text);
      break;
    case 'point':
      out2.push(line.text);
      break;
  }
}

console.log('');
console.log('After adding xAxis, before inserts:');
console.log(out2.join('\n'));

const inserts2 = [];
if (doc.xAxis !== undefined && !doc.present.has('xAxis')) {
  inserts2.push(`  x-axis ${doc.xAxis}`);
}

console.log('');
console.log('inserts2:', inserts2);
console.log('Will splice at position:', headerIdx2 + 1);

if (inserts2.length > 0) {
  out2.splice(headerIdx2 + 1, 0, ...inserts2);
}

console.log('');
console.log('After splice:');
console.log(out2.join('\n'));

console.log('');
console.log('ISSUE: x-axis was inserted at position 1, BEFORE the title!');
