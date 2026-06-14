// The issue with my test above: I didn't understand the mirroring correctly.
// For ER syntax: A leftCard -- rightCard B
// When we reverse to B -- A, we need:
// B rightCard (mirrored) -- leftCard (mirrored) A
//
// But the current code does:
// newLeft = mirrorCard(rightCard)
// newRight = mirrorCard(leftCard)
// [left, right] = [right, left]
// leftCard = newLeft
// rightCard = newRight
//
// So if we had: A || -- o{ B
// We want after reverse: B ... A
// The relationship is: "A has 1..1 B has 0..many"
// After reverse: "B has 0..many A has 1..1"
// So the syntax should be: B o{ -- || A
//
// But that's weird. Let me check Mermaid cardinality semantics:
// || = one and only one
// |o = one or zero
// o| = zero or one (same as |o)
// o{ = zero or many
// }o = many to one  (wait, is this valid?)
// }| = many (wait, is this valid?)
//
// Actually, Mermaid ER uses just TWO characters per side:
// |o, ||, o{, }o are the primary ones
//
// Let me reconsider: if we reverse a relationship, the cardinality tokens
// should ALSO be reversed positionally AND have their bracket sides flipped.

// Original: Customer || -- o{ Order
// This means: Customer has 1..1, Order has 0..many
// After reverse: Order ... Customer
// Correct would be: Order o{ -- || Customer
// So leftCard=o{, rightCard=||

// The mirrorCard function should:
// || -> || (symmetric)
// |o -> o| (flip position)
// o{ -> }o (flip position AND flip bracket direction)
// }o -> o{ (flip position AND flip bracket direction)

function mirrorCard(token) {
  return token
    .split("")
    .reverse()
    .map((c) => (c === "{" ? "}" : c === "}" ? "{" : c))
    .join("");
}

console.log('Testing mirrorCard semantics:');
console.log('|| -> ||:', mirrorCard("||"));
console.log('|o -> o|:', mirrorCard("|o"));
console.log('o{ -> }o:', mirrorCard("o{"));
console.log('}o -> o{:', mirrorCard("}o"));

// So for: Customer || -- o{ Order
// newLeft = mirrorCard("o{") = "}o"  <- WRONG, should be "o{"
// newRight = mirrorCard("||") = "||"  <- correct
console.log('\nActual test:');
console.log('Original: Customer || -- o{ Order');
console.log('newLeft = mirrorCard("o{") =', mirrorCard("o{"));
console.log('newRight = mirrorCard("||") =', mirrorCard("||"));
console.log('After reverse: Order', mirrorCard("o{"), '--', mirrorCard("||"), 'Customer');
console.log('Which is: Order }o -- || Customer');
console.log('');
console.log('But the CORRECT semantics should be: Order o{ -- || Customer');
