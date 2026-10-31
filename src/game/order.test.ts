import { describe, expect, it } from "vitest";
import { resolveOrder } from "./order";

describe("resolveOrder", () => {
  it("pede o dado de todos no começo", () => {
    expect(resolveOrder(["a", "b", "c"], {})).toEqual({ pending: ["a", "b", "c"], order: null });
  });

  it("ordena do maior para o menor dado", () => {
    expect(resolveOrder(["a", "b", "c"], { a: [2], b: [6], c: [4] }).order).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("pede desempate só para os empatados", () => {
    const result = resolveOrder(["a", "b", "c"], { a: [5], b: [5], c: [3] });
    expect(result).toEqual({ pending: ["a", "b"], order: null });
  });

  it("resolve o desempate mantendo a posição do grupo", () => {
    const result = resolveOrder(["a", "b", "c"], { a: [5, 2], b: [5, 4], c: [6] });
    expect(result.order).toEqual(["c", "b", "a"]);
  });

  it("repete o desempate enquanto continuar empatado", () => {
    const rolls = { a: [1, 3], b: [1, 3], c: [4] };
    expect(resolveOrder(["a", "b", "c"], rolls).pending).toEqual(["a", "b"]);
    expect(resolveOrder(["a", "b", "c"], { ...rolls, a: [1, 3, 6], b: [1, 3, 2] }).order).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});
