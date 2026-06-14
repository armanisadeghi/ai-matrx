// Test quadrant singleton insertion logic

const quadrantSource = `quadrantChart
  title My Chart
  x-axis Low --> High
  y-axis Low --> High
  quadrant-1 High
  Point A: [0.3, 0.7]
  Point B: [0.8, 0.6]
`;

const lines = quadrantSource.split('\n');
const doc = {
  title: 'My Chart',
  xAxis: 'Low --> High',
  yAxis: 'Low --> High',
  quadrantLabels: ['High', undefined, undefined, undefined],
  points: [],
  sourceLines: [],
  present: new Set(),
};

let headerSeen = false;
let counter = 0;

for (const rawLine of lines) {
  const trimmed = rawLine.trim();
  if (!trimmed) continue;
  
  if (!headerSeen) {
    headerSeen = true;
    doc.sourceLines.push({ text: rawLine, ref: { entity: 'header', id: 'header' } });
    continue;
  }
  
  if (/^title/.test(trimmed)) {
    doc.present.add('title');
    doc.sourceLines.push({ text: rawLine, ref: { entity: 'title', id: 'title' } });
  } else if (/^x-axis/.test(trimmed)) {
    doc.present.add('xAxis');
    doc.sourceLines.push({ text: rawLine, ref: { entity: 'xAxis', id: 'xAxis' } });
  } else if (/^y-axis/.test(trimmed)) {
    doc.present.add('yAxis');
    doc.sourceLines.push({ text: rawLine, ref: { entity: 'yAxis', id: 'yAxis' } });
  } else if (/^quadrant-/.test(trimmed)) {
    const m = /^quadrant-([1-4])/.exec(trimmed);
    if (m) {
      const idx = Number(m[1]) - 1;
      doc.present.add(`q${idx}`);
      doc.sourceLines.push({ text: rawLine, ref: { entity: 'quadrant', id: String(idx) } });
    }
  } else if (/^.+:/.test(trimmed)) {
    const p = { id: `q${++counter}`, label: trimmed.split(':')[0].trim(), x: 0.3, y: 0.7, raw: rawLine };
    doc.points.push(p);
    doc.sourceLines.push({ text: rawLine, ref: { entity: 'point', id: p.id } });
  }
}

// Now serialize
console.log('present Set:', doc.present);

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
      out.push(line.text);
      break;
    case 'xAxis':
      out.push(line.text);
      break;
    case 'yAxis':
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

console.log('After first pass:');
console.log(out.join('\n'));
console.log('');

// Check insertion logic
const inserts = [];
if (doc.title && !doc.present.has('title')) inserts.push(`  title ${doc.title}`);
if (doc.xAxis && !doc.present.has('xAxis')) inserts.push(`  x-axis ${doc.xAxis}`);
if (doc.yAxis && !doc.present.has('yAxis')) inserts.push(`  y-axis ${doc.yAxis}`);

console.log('Inserts needed:', inserts);
console.log('headerIdx:', headerIdx);
console.log('Will insert at position:', headerIdx + 1);

if (inserts.length > 0 && headerIdx >= 0) {
  out.splice(headerIdx + 1, 0, ...inserts);
}

console.log('');
console.log('After insert:');
console.log(out.join('\n'));
