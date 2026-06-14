// Test setXAxis operation on a document that has no x-axis yet

const initialSource = `quadrantChart
  title My Chart
  Point A: [0.3, 0.7]
`;

// After parsing
const doc = {
  title: 'My Chart',
  xAxis: undefined,
  yAxis: undefined,
  quadrantLabels: [undefined, undefined, undefined, undefined],
  points: [{ id: 'q1', label: 'Point A', x: 0.3, y: 0.7, raw: 'Point A: [0.3, 0.7]' }],
  sourceLines: [
    { text: 'quadrantChart', ref: { entity: 'header', id: 'header' } },
    { text: '  title My Chart', ref: { entity: 'title', id: 'title' } },
    { text: '  Point A: [0.3, 0.7]', ref: { entity: 'point', id: 'q1' } },
  ],
  dirty: {},
  present: new Set(['title']),
};

// Apply setXAxis operation
const xAxisText = 'Low --> High';
doc.xAxis = xAxisText;
doc.dirty.xAxis = true;

console.log('After setXAxis operation:');
console.log('xAxis:', doc.xAxis);
console.log('dirty.xAxis:', doc.dirty.xAxis);
console.log('present:', doc.present);

// Now serialize
const out = [];
let headerIdx = -1;

for (const line of doc.sourceLines) {
  if (!line.ref) {
    out.push(line.text);
    continue;
  }
  switch (line.ref.entity) {
    case 'header':
      headerIdx = out.length;
      out.push(line.text);
      break;
    case 'title':
      out.push(doc.dirty.title ? `  title ${doc.title}` : line.text);
      break;
    case 'xAxis':
      if (doc.xAxis === undefined) break;
      out.push(doc.dirty.xAxis ? `  x-axis ${doc.xAxis}` : line.text);
      break;
    case 'point':
      out.push(line.text);
      break;
  }
}

console.log('After first pass:');
console.log(out.join('\n'));
console.log('');

// Check insertion logic
const inserts = [];
if (doc.title && !doc.present.has('title')) inserts.push(`  title ${doc.title}`);
if (doc.xAxis && !doc.present.has('xAxis')) inserts.push(`  x-axis ${doc.xAxis}`);
if (doc.yAxis && !doc.present.has('yAxis')) inserts.push(`  y-axis ${doc.yAxis}`);

console.log('Inserts to add:', inserts);

if (inserts.length > 0 && headerIdx >= 0) {
  out.splice(headerIdx + 1, 0, ...inserts);
}

console.log('');
console.log('Final serialization:');
console.log(out.join('\n'));
