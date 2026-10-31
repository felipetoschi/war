import type { Card, CardSymbol, GameMap } from "./types";

/**
 * Cartas de troca, como no War original: uma carta por estado, cada uma com um símbolo
 * (quadrado, triângulo ou bola), mais 2 coringas. Aqui as cartas ficam à vista de todos.
 */
export const JOKERS = 2;
const SYMBOLS: CardSymbol[] = ["square", "triangle", "circle"];

/** Baralho completo: 27 estados (9 de cada símbolo) + 2 coringas. */
export function createDeck(map: GameMap): Card[] {
  const cards: Card[] = map.territories.map((t, i) => ({
    id: t.id,
    territory: t.id,
    symbol: SYMBOLS[i % SYMBOLS.length]!,
  }));
  for (let j = 1; j <= JOKERS; j++) {
    cards.push({ id: `coringa-${j}`, territory: null, symbol: "joker" });
  }
  return cards;
}

/**
 * Troca válida: 3 cartas com o mesmo símbolo ou com os 3 símbolos diferentes.
 * O coringa vale qualquer símbolo, então qualquer trio com coringa é válido.
 */
export function isValidSet(cards: Card[]): boolean {
  if (cards.length !== 3) return false;
  if (cards.some((c) => c.symbol === "joker")) return true;
  const distinct = new Set(cards.map((c) => c.symbol)).size;
  return distinct === 1 || distinct === 3;
}

/** Existe alguma troca possível entre as cartas da mão? */
export function hasValidSet(hand: Card[]): boolean {
  for (let a = 0; a < hand.length; a++) {
    for (let b = a + 1; b < hand.length; b++) {
      for (let c = b + 1; c < hand.length; c++) {
        if (isValidSet([hand[a]!, hand[b]!, hand[c]!])) return true;
      }
    }
  }
  return false;
}

/** Soldados de cada troca, crescendo a cada troca feita na partida: 4, 6, 8, 10, 12, 15, 20… */
export function tradeValue(tradesSoFar: number): number {
  const table = [4, 6, 8, 10, 12, 15];
  return table[tradesSoFar] ?? 15 + 5 * (tradesSoFar - table.length + 1);
}

/** Com esta quantidade de cartas (ou mais), o jogador é obrigado a trocar antes de posicionar. */
export const MAX_HAND = 5;

/** Bônus por carta trocada de um estado que o jogador domina: soldados nesse estado. */
export const OWNED_CARD_BONUS = 2;
