// Dados virtuais com pontinhos, como os de bozó, e a animação de rolagem.

export const ROLL_MS = 900;

/** Posições dos pontos numa grade 3×3 (0 = canto superior esquerdo, 8 = inferior direito). */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export type DieKind = "attack" | "defense" | "neutral";

function pips(value: number): string {
  const on = new Set(PIPS[value]);
  return Array.from({ length: 9 }, (_, i) => `<i class="${on.has(i) ? "on" : ""}"></i>`).join("");
}

/**
 * HTML de um dado. Com `rolling`, ele chacoalha e troca de face até parar em `value`.
 * `lost` deixa o dado apagado (perdeu a comparação).
 */
export function dieHtml(
  value: number,
  kind: DieKind,
  options: { rolling?: boolean; lost?: boolean; size?: "md" | "lg"; title?: string } = {},
): string {
  const classes = ["die3d", kind, options.size ?? "lg"];
  if (options.rolling) classes.push("rolling");
  if (options.lost && !options.rolling) classes.push("lost");
  const shown = options.rolling ? 1 + Math.floor(Math.random() * 6) : value;
  const title = options.title ? ` title="${options.title}"` : "";
  return `<span class="${classes.join(" ")}" data-final="${value}"${title}>${pips(shown)}</span>`;
}

/** Faz os dados marcados com `.rolling` trocarem de face até o fim da animação. */
export function animateDice(root: ParentNode): void {
  const dice = [...root.querySelectorAll<HTMLElement>(".die3d.rolling")];
  if (dice.length === 0) return;
  const timer = setInterval(() => {
    for (const d of dice) d.innerHTML = pips(1 + Math.floor(Math.random() * 6));
  }, 90);
  setTimeout(() => {
    clearInterval(timer);
    for (const d of dice) d.innerHTML = pips(Number(d.dataset.final));
  }, ROLL_MS - 120);
}
