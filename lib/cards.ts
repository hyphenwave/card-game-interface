"use client"

import type { Hex } from "viem"

export const WHOT_DECK: ReadonlyArray<number> = [
  1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14, 65, 66, 67, 68, 69, 71, 72, 74, 75, 76, 77,
  78, 33, 34, 35, 37, 39, 42, 43, 45, 46, 97, 98, 99, 101, 103, 106, 107, 109, 110, 129,
  130, 131, 132, 133, 135, 136, 180, 180, 180, 180, 180,
];

export const CARD_SHAPES = ["Circle", "Triangle", "Cross", "Square", "Star", "Whot"] as const;
export type CardShape = (typeof CARD_SHAPES)[number];

export type OwnedCard = {
  index: number;
  shape: CardShape;
  number: number;
  value: number;
  label: string;
};

export type DeckMapShape = {
  raw: bigint;
  cardBitSize: number;
  mapBits: bigint;
};

export const cardShape = (card: number): CardShape => {
  const shapeIdx = (card >> 5) & 0x07;
  return CARD_SHAPES[shapeIdx] ?? "Circle";
};

export const cardNumber = (card: number): number => card & 0x1f;

export const describeCard = (card: number): string => {
  if (!card) return "Face down";
  const num = cardNumber(card);
  const shape = cardShape(card);
  if (shape === "Whot") return `Whot-${num}`;
  return `${shape} ${num}`;
};

export const matchesCallCard = (callCard: number, card: OwnedCard): boolean => {
  if (!callCard) return true;
  const callShape = cardShape(callCard);
  const callNumber = cardNumber(callCard);
  return card.number === callNumber || card.shape === callShape || card.number === 20;
};

export const decodeDeckMap = (deckMap: bigint | number | Hex): DeckMapShape => {
  const raw = BigInt(deckMap ?? 0);
  const mapBits = raw >> 2n;
  const cardBitSize = 8 - Number(raw & 0x03n);
  return { raw, mapBits, cardBitSize };
};

export const deckMapToIndexes = (
  deckMap: bigint | number | Hex,
  maxCards = 64,
): number[] => {
  const { mapBits } = decodeDeckMap(deckMap);
  const indexes: number[] = [];
  let cursor = mapBits;
  let i = 0;
  while (cursor !== 0n && i < maxCards) {
    if (cursor & 1n) indexes.push(i);
    cursor >>= 1n;
    i++;
  }
  return indexes;
};

export const countDeckCards = (deckMap: bigint | number | Hex): number =>
  deckMapToIndexes(deckMap).length;

export const ownedCardsFromMap = (
  deckMap: bigint | number | Hex,
  deck: ReadonlyArray<number> = WHOT_DECK,
): OwnedCard[] => {
  const indexes = deckMapToIndexes(deckMap, deck.length);
  return indexes.map((idx) => {
    const value = deck[idx] ?? 0;
    return {
      index: idx,
      value,
      shape: cardShape(value),
      number: cardNumber(value),
      label: describeCard(value),
    };
  });
};

export const decodeHandCards = (
  deckMap: bigint | number | Hex,
  hand0: bigint,
  hand1: bigint,
): OwnedCard[] => {
  const { cardBitSize } = decodeDeckMap(deckMap);
  const indexes = deckMapToIndexes(deckMap);
  if (!cardBitSize || cardBitSize > 32) return [];
  const cardsPerWord = Math.floor(256 / cardBitSize);
  if (!cardsPerWord) return [];
  const mask = (1n << BigInt(cardBitSize)) - 1n;
  return indexes.map((idx) => {
    const limb = idx < cardsPerWord ? hand0 : hand1;
    const offset = BigInt((idx % cardsPerWord) * cardBitSize);
    const raw = (limb >> offset) & mask;
    const value = Number(raw);
    return {
      index: idx,
      value,
      shape: cardShape(value),
      number: cardNumber(value),
      label: describeCard(value),
    };
  });
};

export const marketSize = (deckMap: bigint | number | Hex): number =>
  deckMapToIndexes(deckMap).length;
