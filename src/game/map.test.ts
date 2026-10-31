import { describe, expect, it } from "vitest";
import { AURORA_MAP } from "./map";

describe("AURORA_MAP", () => {
  const ids = new Set(AURORA_MAP.territories.map((t) => t.id));

  it("tem ids de território únicos", () => {
    expect(ids.size).toBe(AURORA_MAP.territories.length);
  });

  it("só referencia vizinhos e continentes existentes", () => {
    const continents = new Set(AURORA_MAP.continents.map((c) => c.id));
    for (const t of AURORA_MAP.territories) {
      expect(continents.has(t.continent), t.id).toBe(true);
      for (const n of t.neighbors) expect(ids.has(n), `${t.id} -> ${n}`).toBe(true);
    }
  });

  it("tem vizinhanças simétricas", () => {
    for (const t of AURORA_MAP.territories) {
      for (const n of t.neighbors) {
        const other = AURORA_MAP.territories.find((o) => o.id === n)!;
        expect(other.neighbors, `${n} deveria ter ${t.id}`).toContain(t.id);
      }
    }
  });

  it("é conexo (todo território é alcançável)", () => {
    const seen = new Set<string>();
    const queue = [AURORA_MAP.territories[0]!.id];
    while (queue.length) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(...AURORA_MAP.territories.find((t) => t.id === id)!.neighbors);
    }
    expect(seen.size).toBe(ids.size);
  });
});
