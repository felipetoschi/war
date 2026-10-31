import type { Rng } from "./types";

export function rollDie(rng: Rng): number {
  return Math.floor(rng() * 6) + 1;
}

export function rollDice(count: number, rng: Rng): number[] {
  return Array.from({ length: count }, () => rollDie(rng)).sort((a, b) => b - a);
}

export interface BattleResult {
  /** Dados rolados pelo atacante (antes da penalidade). */
  attackRolls: number[];
  /** Dados do atacante já com a penalidade aplicada (mínimo 1). */
  effectiveAttackRolls: number[];
  defenseRolls: number[];
  /** Pontos subtraídos de cada dado do atacante (ataque naval). */
  attackPenalty: number;
  attackerLosses: number;
  defenderLosses: number;
}

/**
 * Compara os dados do maior para o menor, par a par.
 * Empates favorecem a defesa. `attackPenalty` é subtraído de cada dado do atacante.
 */
export function compareRolls(
  attackRolls: number[],
  defenseRolls: number[],
  attackPenalty = 0,
): BattleResult {
  const attack = [...attackRolls].sort((a, b) => b - a);
  const effective = attack.map((r) => Math.max(1, r - attackPenalty));
  const defense = [...defenseRolls].sort((a, b) => b - a);
  let attackerLosses = 0;
  let defenderLosses = 0;
  const pairs = Math.min(attack.length, defense.length);
  for (let i = 0; i < pairs; i++) {
    if (effective[i]! > defense[i]!) defenderLosses++;
    else attackerLosses++;
  }
  return {
    attackRolls: attack,
    effectiveAttackRolls: effective,
    defenseRolls: defense,
    attackPenalty,
    attackerLosses,
    defenderLosses,
  };
}
