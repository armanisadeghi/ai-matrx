// Simulate journey adapter roundtrip issue

const journeySource = `journey
  title My Journey
  section Setup
    Task 1: 3: Alice
    Task 2: 5: Bob, Charlie
  section Action
    Task 3: 4
`;

// Parse logic from journey.ts
const lines = journeySource.split('\n');
const sections = [];
let currentSection = null;
let sectionCounter = 0;
let taskCounter = 0;
let headerSeen = false;

const TASK_RE = /^(.+?)\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*(?::\s*(.*))?$/;

for (const rawLine of lines) {
  const trimmed = rawLine.trim();
  
  if (!trimmed || trimmed.startsWith('%%')) continue;
  if (!headerSeen) {
    if (trimmed === 'journey') {
      headerSeen = true;
    }
    continue;
  }
  
  if (trimmed.startsWith('title')) continue;
  
  if (trimmed.startsWith('section')) {
    const match = /^section\s+(.+)$/.exec(trimmed);
    if (match) {
      currentSection = { id: `sec${++sectionCounter}`, title: match[1].trim(), tasks: [], raw: rawLine };
      sections.push(currentSection);
      continue;
    }
  }
  
  const task = TASK_RE.exec(trimmed);
  if (task && currentSection) {
    const actors = (task[3] ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const t = {
      id: `j${++taskCounter}`,
      name: task[1].trim(),
      score: Number(task[2]),
      actors,
      raw: rawLine,
    };
    currentSection.tasks.push(t);
  }
}

// Serialize
console.log('Parsed tasks:');
for (const sec of sections) {
  console.log(`Section: ${sec.title}`);
  for (const task of sec.tasks) {
    const actors = task.actors.length > 0 ? `: ${task.actors.join(", ")}` : "";
    const line = `${task.name}: ${task.score}${actors}`;
    console.log(`  Task: "${line}"`);
    console.log(`  Raw:  "${task.raw.trim()}"`);
  }
}
