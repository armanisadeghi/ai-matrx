// Quadrant: test inserting multiple new singletons when some already exist

// Parse:
// quadrantChart
//   title My Chart
//   Point A: [0.3, 0.7]

// Then apply: setXAxis("Low --> High")

const doc = {
  title: 'My Chart',
  xAxis: 'Low --> High',
  yAxis: undefined,
  quadrantLabels: [undefined, undefined, undefined, undefined],
  points: [{ id: 'q1', label: 'Point A', x: 0.3, y: 0.7, raw: 'Point A: [0.3, 0.7]' }],
  sourceLines: [
    { text: 'quadrantChart', ref: { entity: 'header', id: 'header' } },
    { text: '  title My Chart', ref: { entity: 'title', id: 'title' } },
    { text: '  Point A: [0.3, 0.7]', ref: { entity: 'point', id: 'q1' } },
  ],
  dirty: { xAxis: true },
  present: new Set(['title']),
};

// Serialize
const pointById = new Map(doc.points.map((p) => [p.id, p]));
const emitted = new Set();
let headerIdx = -1;

const out = [];
for (const line of doc.sourceLines) {
  switch (line.ref.entity) {
    case 'header':
      headerIdx = out.length;
      out.push(line.text);
      break;
    case 'title':
      if (doc.title === undefined) break;
      out.push(line.text);  // not dirty
      break;
    case 'xAxis':
      if (doc.xAxis === undefined) break;
      // xAxis ref exists but NOT in sourceLines, so this won't match
      out.push(doc.dirty.xAxis ? `  x-axis ${doc.xAxis}` : line.text);
      break;
    case 'point':
      emitted.add('q1');
      out.push(line.text);
      break;
  }
}

console.log('After first pass:');
console.log(out.join('\n'));
console.log('headerIdx:', headerIdx);

// Check insertions
const inserts = [];
if (doc.title !== undefined && !doc.present.has('title')) {
  inserts.push(`  title ${doc.title}`);
}
if (doc.xAxis !== undefined && !doc.present.has('xAxis')) {
  inserts.push(`  x-axis ${doc.xAxis}`);
}
if (doc.yAxis !== undefined && !doc.present.has('yAxis')) {
  inserts.push(`  y-axis ${doc.yAxis}`);
}

console.log('');
console.log('inserts:', inserts);

if (inserts.length > 0 && headerIdx >= 0) {
  out.splice(headerIdx + 1, 0, ...inserts);
}

console.log('');
console.log('Final:');
console.log(out.join('\n'));
