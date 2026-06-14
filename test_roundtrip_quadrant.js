// Test: quadrant roundtrip where we add axes after initial parse

const input = `quadrantChart
  title My Chart
  Point A: [0.3, 0.7]`;

// Parse
const doc = {
  title: 'My Chart',
  xAxis: undefined,
  yAxis: undefined,
  quadrantLabels: [undefined, undefined, undefined, undefined],
  points: [{ id: 'q1', label: 'Point A', x: 0.3, y: 0.7, raw: 'Point A: [0.3, 0.7]' }],
  sourceLines: [
    { text: 'quadrantChart', ref: { entity: 'header' } },
    { text: '  title My Chart', ref: { entity: 'title' } },
    { text: '  Point A: [0.3, 0.7]', ref: { entity: 'point', id: 'q1' } },
  ],
  dirty: {},
  present: new Set(['title']),
};

console.log('Original input:');
console.log(input);

// Apply setXAxis and setYAxis
doc.xAxis = 'Low --> High';
doc.yAxis = 'Slow --> Fast';
doc.dirty.xAxis = true;
doc.dirty.yAxis = true;

// Serialize
const pointById = new Map(doc.points.map((p) => [p.id, p]));
const emitted = new Set();
let headerIdx = -1;

const out = [];
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
      out.push(line.text);
      break;
    case 'xAxis':
      // Not in sourceLines, so no match
      break;
    case 'yAxis':
      // Not in sourceLines, so no match
      break;
    case 'point':
      emitted.add('q1');
      out.push(line.text);
      break;
  }
}

console.log('');
console.log('After first pass, headerIdx:', headerIdx);

const inserts = [];
if (doc.xAxis !== undefined && !doc.present.has('xAxis')) {
  inserts.push(`  x-axis ${doc.xAxis}`);
}
if (doc.yAxis !== undefined && !doc.present.has('yAxis')) {
  inserts.push(`  y-axis ${doc.yAxis}`);
}

console.log('inserts:', inserts);

if (inserts.length > 0 && headerIdx >= 0) {
  out.splice(headerIdx + 1, 0, ...inserts);
}

const serialized = [...out].join('\n');
console.log('');
console.log('Serialized:');
console.log(serialized);

console.log('');
console.log('Expected:');
console.log(`quadrantChart
  title My Chart
  x-axis Low --> High
  y-axis Slow --> Fast
  Point A: [0.3, 0.7]`);

console.log('');
console.log('ISSUE: The axes were inserted right after header, BEFORE the title!');
