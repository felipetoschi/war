import type { Rng } from "./types";

export function rollDie(rng: Rng): number {
  return Math.floor(rng() * 6) + 1;
}

export function rollDice(count: number, rng: Rng): number[] {
  return Array.from({ length: count }, () => rollDie(rng)).sort((a, b) => b - a);
}

export interface BattleResult {
  attackRolls: number[];
  defenseRolls: number[];
  attackerLosses: number;
  defenderLosses: number;
}

/**
 * Compara os dados do maior para o menor, par a par.
 * Empates favorecem a defesa.
 */
export function compareRolls(attackRolls: number[], defenseRolls: number[]): BattleResult {
  const attack = [...attackRolls].sort((a, b) => b - a);
  const defense = [...defenseRolls].sort((a, b) => b - a);
  let attackerLosses = 0;
  let defenderLosses = 0;
  const pairs = Math.min(attack.length, defense.length);
  for (let i = 0; i < pairs; i++) {
    if (attack[i]! > defense[i]!) defenderLosses++;
    else attackerLosses++;
  }
  return { attackRolls: attack, defenseRolls: defense, attackerLosses, defenderLosses };
}
