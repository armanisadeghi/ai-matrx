// Verify: does }o even exist in Mermaid ER?
// According to Mermaid spec, the valid cardinality tokens are:
// |o, ||, o|, o{, but also: }o, }|
//
// Let me think about what they mean:
// Position 1 (left of --): | means exactly one, o means zero or more
// Position 2 (right side of --): | means exactly one, o means zero or more, { means start of bracket, } means end of bracket
//
// So:
// || = one and only one
// |o = zero or more  (at position 1)
// o| = zero or more (at position 1)
// o{ = zero or more (at position 1, with bracket)
//
// But }o and }| would suggest a CLOSING bracket on the left and something on the right.
// This doesn't make semantic sense unless...
//
// Let me check the Mermaid ER diagram specification more carefully.
// According to Mermaid docs, the cardinality syntax is:
// A ||--|| B (one-to-one)
// A }o--|| B (one-to-many, non-identifying)
// A ||--o{ B (one-to-many, identifying)
//
// So }o means: many (on left) to one (on right)
// And o{ means: one (on left) to many (on right)
//
// When we REVERSE A }o--|| B, we want B ||--o{ A
// Not B }o--|| A
//
// The mirrorCard logic is doing:
// newLeft = mirrorCard(rightCard "||") = "||"
// newRight = mirrorCard(leftCard "}o") = "o}"
//
// But o} is NOT a valid token!

// Wait, let me reread the code. Line 210-214:
// const newLeft = mirrorCard(r.rightCard);    // rightCard=||, so newLeft = ||
// const newRight = mirrorCard(r.leftCard);   // leftCard=}o, so newRight = mirrorCard(}o) = o{
// [r.left, r.right] = [r.right, r.left];      // swap entities
// r.leftCard = newLeft;                       // || 
// r.rightCard = newRight;                     // o{
//
// So after reverse: B || -- o{ A
// But we want: B || -- o{ A
//
// Actually, that's correct! Let me re-verify my understanding:
// Original: A }o--|| B means "A has many B, B has exactly one A"
// After reverse: "B has exactly one A, A has many B" = B ||--o{ A
// Perfect!

// So actually the code is correct. The semantics are:
// A leftCard -- rightCard B means "A->B relationship with left cardinality and right cardinality"
// When reversed: B (rightCard mirrored) -- (leftCard mirrored) A

console.log('Actually, the mirrorCard logic seems correct!');
console.log('Original: A }o -- || B');
console.log('Meaning: A has many, B has exactly one');
console.log('After reverse, we want: B || -- o{ A');
console.log('Meaning: B has exactly one, A has many (from B perspective)');
console.log('');
console.log('Code does:');
console.log('newLeft = mirrorCard(rightCard="||") =', 'mirrorCard("||")');
console.log('newRight = mirrorCard(leftCard="}o") =', 'mirrorCard("}o")');

function mirrorCard(token) {
  return token
    .split("")
    .reverse()
    .map((c) => (c === "{" ? "}" : c === "}" ? "{" : c))
    .join("");
}

console.log('newLeft =', mirrorCard("||"));
console.log('newRight =', mirrorCard("}o"));
