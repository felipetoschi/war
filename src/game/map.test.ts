import { describe, expect, it } from "vitest";
import { BRASIL_MAP } from "./brasil";

describe("BRASIL_MAP", () => {
  const ids = new Set(BRASIL_MAP.territories.map((t) => t.id));

  it("tem os 26 estados + DF, sem repetição", () => {
    expect(BRASIL_MAP.territories).toHaveLength(27);
    expect(ids.size).toBe(27);
  });

  it("tem as 5 regiões com a quantidade certa de estados", () => {
    const count = (r: string) => BRASIL_MAP.territories.filter((t) => t.region === r).length;
    expect(count("norte")).toBe(7);
    expect(count("nordeste")).toBe(9);
    expect(count("centro-oeste")).toBe(4);
    expect(count("sudeste")).toBe(4);
    expect(count("sul")).toBe(3);
  });

  it("só referencia vizinhos existentes, com fronteiras simétricas", () => {
    for (const t of BRASIL_MAP.territories) {
      for (const n of t.neighbors) {
        expect(ids.has(n), `${t.id} -> ${n}`).toBe(true);
        const other = BRASIL_MAP.territories.find((o) => o.id === n)!;
        expect(other.neighbors, `${n} deveria ter ${t.id}`).toContain(t.id);
      }
    }
  });

  it("é conexo por terra", () => {
    const seen = new Set<string>();
    const queue = ["sp"];
    while (queue.length) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(...BRASIL_MAP.territories.find((t) => t.id === id)!.neighbors);
    }
    expect(seen.size).toBe(27);
  });

  it("ordena os 17 estados litorâneos de 0 a 16, e vizinhos no litoral fazem fronteira", () => {
    const coast = BRASIL_MAP.territories
      .filter((t) => t.coastIndex !== undefined)
      .sort((a, b) => a.coastIndex! - b.coastIndex!);
    expect(coast.map((t) => t.coastIndex)).toEqual([...Array(17).keys()]);
    expect(coast[0]!.id).toBe("ap");
    expect(coast[16]!.id).toBe("rs");
    for (let i = 1; i < coast.length; i++) {
      expect(coast[i]!.neighbors, `${coast[i - 1]!.id}-${coast[i]!.id}`).toContain(
        coast[i - 1]!.id,
      );
    }
  });
});
