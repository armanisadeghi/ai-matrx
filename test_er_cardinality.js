// Test ER cardinality mirror logic

function mirrorCard(token) {
  return token
    .split("")
    .reverse()
    .map((c) => (c === "{" ? "}" : c === "}" ? "{" : c))
    .join("");
}

const testCases = [
  { token: "||", expected: "||" },
  { token: "|o", expected: "o|" },
  { token: "o|", expected: "|o" },
  { token: "o{", expected: "}o" },
  { token: "}o", expected: "o}" },
  { token: "}|", expected: "|}" },
  { token: "|{", expected: "}{" },
  { token: "{|", expected: "|{" }, // This is NOT valid mermaid, but let's see
];

console.log('Testing mirrorCard:');
for (const tc of testCases) {
  const result = mirrorCard(tc.token);
  const status = result === tc.expected ? '✓' : '✗';
  console.log(`${status} mirrorCard("${tc.token}") = "${result}" (expected "${tc.expected}")`);
}

// Test a real reversal
console.log('\nTest reverseRelationship:');
const rel = {
  left: 'Customer',
  right: 'Order',
  leftCard: '||',
  rightCard: 'o{',
  identifying: true,
};

console.log('Before reverse:', rel);

const newLeft = mirrorCard(rel.rightCard);
const newRight = mirrorCard(rel.leftCard);
rel.left = rel.right;
rel.right = 'Customer';
rel.leftCard = newLeft;
rel.rightCard = newRight;

console.log('After reverse:', rel);
console.log('Expected: Customer o{--Order || (with left/right swapped)');
