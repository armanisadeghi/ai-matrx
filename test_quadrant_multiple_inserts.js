// Test inserting multiple singletons at once
// In quadrant serialize(), line 176: out.splice(headerIdx + 1, 0, ...inserts)
// This inserts ALL new singletons at the same position, so they get reversed!

const inserts = ['  title My Title', '  x-axis Low --> High', '  y-axis Bad --> Good', '  quadrant-1 Q1'];
const out = ['quadrantChart'];
const headerIdx = 0;

console.log('Before splice:');
console.log(out);

out.splice(headerIdx + 1, 0, ...inserts);

console.log('After splice:');
console.log(out);

// Expected: after header, then title, xAxis, yAxis, quadrants
// Actual: after header, then ALL of inserts in order
