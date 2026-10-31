// Peças "físicas": soldadinhos na borda de cada jogador.

/** Um soldadinho (cabeça, corpo e base), na cor do jogador. */
export function pawnSvg(color: string): string {
  return `<svg class="pawn" viewBox="0 0 24 32" aria-hidden="true">
    <circle cx="12" cy="7" r="5" fill="${color}" />
    <path d="M6.5 26 L8.8 13.5 Q12 11.2 15.2 13.5 L17.5 26 Z" fill="${color}" />
    <rect x="3" y="25" width="18" height="5.5" rx="2.5" fill="${color}" />
    <path d="M9 5 Q12 2.6 15 5" stroke="#fff6" stroke-width="1.6" fill="none" stroke-linecap="round" />
  </svg>`;
}

/** Fileira de soldadinhos da reserva de um jogador (mostra até `limit` peças). */
export function reserveHtml(count: number, color: string, limit = 12): string {
  if (count <= 0) return "";
  const shown = Math.min(count, limit);
  const extra = count > limit ? `<span class="reserve-extra">+${count - limit}</span>` : "";
  return Array.from({ length: shown }, () => pawnSvg(color)).join("") + extra;
}
