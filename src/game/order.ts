import type { PlayerId } from "./types";

/** Histórico de dados de cada jogador na disputa pela ordem de jogada. */
export type OrderRolls = Partial<Record<PlayerId, number[]>>;

export interface OrderResolution {
  /** Jogadores que precisam rolar o dado agora (primeira rolagem ou desempate). */
  pending: PlayerId[];
  /** Ordem final de jogada, do maior para o menor dado — null enquanto houver pendências. */
  order: PlayerId[] | null;
}

/**
 * Cada jogador rola um dado; quem tirar mais começa. Jogadores empatados rolam de novo
 * entre si, quantas vezes for preciso, só para decidir a posição entre eles.
 */
export function resolveOrder(players: PlayerId[], rolls: OrderRolls): OrderResolution {
  const pending: PlayerId[] = [];

  const sortGroup = (group: PlayerId[], depth: number): PlayerId[] => {
    if (group.length === 1) return group;
    const missing = group.filter((id) => (rolls[id]?.length ?? 0) <= depth);
    if (missing.length > 0) {
      pending.push(...missing);
      return group;
    }
    const byValue = new Map<number, PlayerId[]>();
    for (const id of group) {
      const value = rolls[id]![depth]!;
      byValue.set(value, [...(byValue.get(value) ?? []), id]);
    }
    return [...byValue.entries()]
      .sort(([a], [b]) => b - a)
      .flatMap(([, tied]) => sortGroup(tied, depth + 1));
  };

  const order = sortGroup(players, 0);
  return { pending, order: pending.length === 0 ? order : null };
}
