// Journey adapter: test deleteTask operation

// Initial parse of:
// journey
//   section S1
//     T1: 3
//     T2: 5

const doc = {
  sections: [
    {
      id: 'sec1',
      title: 'S1',
      tasks: [
        { id: 'j1', name: 'T1', score: 3, actors: [], raw: 'T1: 3' },
        { id: 'j2', name: 'T2', score: 5, actors: [], raw: 'T2: 5' },
      ],
    },
  ],
  sourceLines: [
    { text: 'journey', ref: { entity: 'header', id: 'header' } },
    { text: '  section S1', ref: { entity: 'section', id: 'sec1' } },
    { text: '    T1: 3', ref: { entity: 'task', id: 'j1' } },
    { text: '    T2: 5', ref: { entity: 'task', id: 'j2' } },
  ],
};

// Apply deleteTask with id j1
doc.sections[0].tasks = doc.sections[0].tasks.filter((t) => t.id !== 'j1');

console.log('After deleteTask j1:');
console.log('Tasks remaining:', doc.sections[0].tasks.map((t) => t.id));

// Now serialize
const taskById = new Map();
const sectionById = new Map();
for (const section of doc.sections) {
  sectionById.set(section.id, section);
  for (const task of section.tasks) taskById.set(task.id, task);
}

console.log('taskById has:', Array.from(taskById.keys()));

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
    case 'section': {
      const section = sectionById.get(line.ref.id);
      if (!section) break;
      out.push(section.dirty ? `  section ${section.title}` : line.text);
      break;
    }
    case 'task': {
      const task = taskById.get(line.ref.id);
      if (!task) break;  // <-- ISSUE: we skip the task, so the line doesn't appear
      out.push(task.dirty ? `    ${task.name}: ${task.score}` : line.text);
      break;
    }
  }
}

console.log('');
console.log('Serialized:');
console.log(out.join('\n'));
