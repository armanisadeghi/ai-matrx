/**
 * Print Studio — realistic sample payloads.
 *
 * Every section starts populated: an empty demo proves nothing, and Arman
 * should be able to hit Print on arrival. Kept out of the components so the
 * rows stay easy to read and swap.
 */

import type { Flashcard } from "@ai-matrx/print/flashcards";

export const SAMPLE_ORIGIN = "https://aimatrx.com";
export const SAMPLE_CODE = "a1B2c3";
export const SAMPLE_GTIN = "4006381333931";

/** Rows keyed by label-format preset id, matching each preset's declared fields. */
export const SAMPLE_FORMAT_ROWS: Record<string, Record<string, string>[]> = {
    "qr-only": [
        { qrValue: "https://aimatrx.com/l/a1B2c3" },
        { qrValue: "https://aimatrx.com/l/d4E5f6" },
        { qrValue: "https://aimatrx.com/l/g7H8i9" },
        { qrValue: "https://aimatrx.com/l/j1K2l3" },
    ],
    "qr-caption": [
        { qrValue: "https://aimatrx.com/l/a1B2c3", caption: "Pallet A-14" },
        { qrValue: "https://aimatrx.com/l/d4E5f6", caption: "Pallet A-15" },
        { qrValue: "https://aimatrx.com/l/g7H8i9", caption: "Pallet B-01" },
        { qrValue: "https://aimatrx.com/l/j1K2l3", caption: "Pallet B-02" },
    ],
    garment: [
        { qrValue: "https://aimatrx.com/l/TS001XL", size: "XL", sku: "TS-001", color: "Black", price: "$29" },
        { qrValue: "https://aimatrx.com/l/TS001L", size: "L", sku: "TS-001", color: "Black", price: "$29" },
        { qrValue: "https://aimatrx.com/l/TS002M", size: "M", sku: "TS-002", color: "Heather Gray", price: "$32" },
        { qrValue: "https://aimatrx.com/l/HD400S", size: "S", sku: "HD-400", color: "Navy", price: "$58" },
    ],
    "asset-spec": [
        {
            qrValue: "https://aimatrx.com/l/AST-88213",
            title: "Dell Latitude 5540",
            spec1: "Intel Core i7-1365U",
            spec2: "32 GB DDR5",
            spec3: "1 TB NVMe SSD",
            spec4: "Asset AST-88213",
        },
        {
            qrValue: "https://aimatrx.com/l/AST-88214",
            title: "Dell Latitude 5540",
            spec1: "Intel Core i5-1345U",
            spec2: "16 GB DDR5",
            spec3: "512 GB NVMe SSD",
            spec4: "Asset AST-88214",
        },
        {
            qrValue: "https://aimatrx.com/l/AST-90011",
            title: "HP EliteBook 840 G10",
            spec1: "Intel Core i7-1355U",
            spec2: "16 GB DDR5",
            spec3: "512 GB NVMe SSD",
            spec4: "Asset AST-90011",
        },
    ],
};

export const SAMPLE_DECK_TITLE = "Cellular Biology 101";

export const SAMPLE_FLASHCARDS: Flashcard[] = [
    { front: "What is the powerhouse of the cell?", back: "The mitochondrion — it produces ATP via oxidative phosphorylation." },
    { front: "Define osmosis.", back: "Net movement of water across a semipermeable membrane toward higher solute concentration." },
    { front: "Which organelle packages proteins for secretion?", back: "The Golgi apparatus." },
    { front: "What does the rough endoplasmic reticulum do?", back: "Synthesizes and folds proteins; 'rough' from the bound ribosomes." },
    { front: "Name the four phases of mitosis, in order.", back: "Prophase, metaphase, anaphase, telophase." },
    { front: "What is the fluid mosaic model?", back: "A membrane described as a fluid phospholipid bilayer with proteins drifting within it." },
    { front: "Where does glycolysis take place?", back: "In the cytosol — no oxygen and no organelle required." },
    { front: "What is the role of the lysosome?", back: "Digests macromolecules and worn organelles using hydrolytic enzymes at low pH." },
    { front: "Distinguish prokaryote from eukaryote.", back: "Prokaryotes have no nucleus or membrane-bound organelles; eukaryotes have both." },
    { front: "What molecule carries amino acids to the ribosome?", back: "Transfer RNA (tRNA), matched to the codon by its anticodon." },
];

export const SAMPLE_MARKDOWN = `# Quarterly Field Report

Prepared for the operations review. Every figure below is illustrative.

## Summary

The intake lane processed **12,480 units** across four sites, a 14% increase
over the previous quarter. Label rejection at the dock fell to 0.3% after the
switch to spec quiet zones.

## Site throughput

| Site | Units | Rejection |
| --- | ---: | ---: |
| Phoenix | 5,120 | 0.2% |
| Denver | 3,940 | 0.3% |
| Atlanta | 2,210 | 0.4% |
| Newark | 1,210 | 0.5% |

## What changed

1. Error correction level M became the floor on every printed code.
2. Calibration sheets are printed once per stock change.
3. Asset-spec labels now carry the serial in the human-readable line.

> Codes that scan on a design monitor and fail at a dock door are almost always
> a quiet-zone problem, not a printer problem.
`;
