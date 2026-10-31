import { describe, expect, it } from "vitest";
import { compareRolls, rollDice } from "./dice";

describe("compareRolls", () => {
  it("empate favorece a defesa", () => {
    expect(compareRolls([4], [4])).toMatchObject({ attackerLosses: 1, defenderLosses: 0 });
  });

  it("compara do maior para o menor", () => {
    const r = compareRolls([2, 6, 3], [5, 3]);
    expect(r.attackRolls).toEqual([6, 3, 2]);
    expect(r).toMatchObject({ attackerLosses: 1, defenderLosses: 1 });
  });

  it("só compara a quantidade mínima de dados", () => {
    expect(compareRolls([6, 6, 6], [1])).toMatchObject({ attackerLosses: 0, defenderLosses: 1 });
  });

  it("aplica a penalidade naval nos dados do atacante, com mínimo 1", () => {
    const r = compareRolls([6, 2], [4, 1], 2);
    expect(r.effectiveAttackRolls).toEqual([4, 1]);
    // 4 x 4 empata (defesa vence), 1 x 1 empata (defesa vence)
    expect(r).toMatchObject({ attackerLosses: 2, defenderLosses: 0 });
  });
});

describe("rollDice", () => {
  it("gera valores entre 1 e 6 em ordem decrescente", () => {
    const values = [0, 0.99, 0.5];
    let i = 0;
    expect(rollDice(3, () => values[i++]!)).toEqual([6, 4, 1]);
  });
});
