import "./style.css";
import { botToAct, chooseBotAction, newBotMemory, type BotAction } from "./game/bot";
import { BRASIL_MAP } from "./game/brasil";
import { hasValidSet, isValidSet, MAX_HAND, OWNED_CARD_BONUS, tradeValue } from "./game/cards";
import type { BattleResult } from "./game/dice";
import { getTerritory } from "./game/map";
import { objectiveById, TERRITORY_GOAL } from "./game/objectives";
import {
  cancelAttack,
  canAttack,
  controlsRegion,
  createGame,
  currentPlayer,
  declareAttack,
  endAttackPhase,
  endTurn,
  fortify,
  INITIAL_ARMIES,
  MAX_PLAYERS,
  maxAttackers,
  MIN_PLAYERS,
  MIN_REINFORCEMENT,
  movableArmies,
  movableTo,
  mustTrade,
  placeArmies,
  playersStillPlacing,
  playersToRollForOrder,
  rollAttack,
  rollDefense,
  rollForOrder,
  skipReinforce,
  territoriesOf,
  tradeCards,
} from "./game/rules";
import type { Card, GameState, Player, PlayerId, TerritoryId } from "./game/types";
import { LABELS, REGION_LABELS, STATE_PATHS, VIEW_BOX } from "./ui/brasil-svg";
import { animateDice, dieHtml, ROLL_MS } from "./ui/dice";
import {
  fullscreenSupported,
  isFullscreen,
  onFullscreenChange,
  toggleFullscreen,
} from "./ui/fullscreen";
import { pawnSvg, reserveHtml } from "./ui/pieces";
import { musicOn, sfx, sfxOn, toggleMusic, toggleSfx, unlockAudio } from "./ui/audio";

const map = BRASIL_MAP;
const COLORS = ["#d63c31", "#2f6fd6", "#1f9a52", "#8e44ad"];
const CREDITS = `Mapa: <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noopener">svg-maps</a> (CC BY 4.0)`;
const SYMBOL_GLYPH: Record<Card["symbol"], string> = {
  square: "■",
  triangle: "▲",
  circle: "●",
  joker: "★",
};
const SYMBOL_NAME: Record<Card["symbol"], string> = {
  square: "quadrado",
  triangle: "triângulo",
  circle: "bola",
  joker: "coringa",
};

/**
 * Lugares à mesa: cada jogador fica num canto do tablet.
 * Jogadores 1 e 2 embaixo (esquerda e direita); 3 e 4 em cima (direita e esquerda),
 * seguindo a volta da mesa. Os de cima veem o painel virado para eles (180°).
 */
type Seat = "bl" | "br" | "tr" | "tl";
const SEATS: Seat[] = ["bl", "br", "tr", "tl"];

interface LastBattle {
  from: TerritoryId;
  to: TerritoryId;
  attacker: PlayerId;
  defender: PlayerId;
  battle: BattleResult;
  conquered: boolean;
}

// ---- estado da interface ----
let screen: "players" | "game" = "players";
let playerCount = 2;
const names: string[] = Array.from({ length: MAX_PLAYERS }, () => "");
let seats: Record<PlayerId, Seat> = {};
let state: GameState | null = null;
/** Enquanto os dados rolam, o tabuleiro mostra o estado de antes da rolagem. */
let frozen: GameState | null = null;
/** Quais dados estão rolando agora. */
let rolling: "order" | "attack" | "defense" | null = null;
let selected: TerritoryId | null = null;
let target: TerritoryId | null = null;
let selectedCards: string[] = [];
let lastBattle: LastBattle | null = null;
let menuOpen = false;
/** Estados que receberam o bônus de +2 da última troca (ficam em destaque no reforço). */
let tradeBonus: TerritoryId[] = [];
/** Cantos fora da ação que o jogador abriu com um toque, para espiar. */
const peeking = new Set<PlayerId>();
/** Quais lugares da tela inicial são bots. */
const botSeats: boolean[] = Array.from({ length: MAX_PLAYERS }, () => false);
let botsPaused = false;
/** Velocidade dos bots: índice em BOT_SPEEDS. */
let botSpeed = 1;
const BOT_SPEEDS = [
  { icon: "🐢", label: "lenta", factor: 1.8 },
  { icon: "▶️", label: "normal", factor: 1 },
  { icon: "⚡", label: "rápida", factor: 0.4 },
];
let botTimer: number | null = null;
let botMemory = newBotMemory();
/** O jogador tocou em "Encerrar ataques" e falta confirmar. */
let confirmEndAttack = false;
const log: string[] = [];
/** Mensagens geradas durante uma rolagem esperam os dados pararem para aparecer. */
let deferredLog: string[] | null = null;
/** Muda a cada nova partida, para descartar rolagens da partida anterior. */
let gameId = 0;

const app = document.querySelector<HTMLDivElement>("#app")!;

// ---- utilitários ----
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const sigla = (id: TerritoryId) => (id === "go" ? "GO/DF" : id.toUpperCase());
const stateName = (id: TerritoryId) => getTerritory(map, id).name;
const playerById = (game: GameState, id: string) => game.players.find((p) => p.id === id)!;
const nameOf = (p: Player) => escapeHtml(p.name);
const cardLabel = (c: Card) =>
  `${c.territory ? sigla(c.territory) : "Coringa"} ${SYMBOL_GLYPH[c.symbol]}`;

function addLog(message: string) {
  if (deferredLog) {
    deferredLog.push(message);
    return;
  }
  log.unshift(message);
  if (log.length > 80) log.pop();
}

/**
 * Aplica uma jogada com dados: toca o som dos dados, anima a rolagem e só depois
 * mostra o resultado (e toca `after`, o som do resultado).
 */
function withDiceRoll(
  kind: NonNullable<typeof rolling>,
  dice: number,
  update: () => void,
  after?: () => void,
) {
  const before = state;
  const id = gameId;
  const messages: string[] = [];
  deferredLog = messages;
  try {
    update();
  } catch (error) {
    deferredLog = null;
    addLog(`⚠ ${(error as Error).message}`);
    render();
    return;
  }
  deferredLog = null;
  frozen = before;
  rolling = kind;
  sfx.dice(dice, ROLL_MS / 1000);
  render();
  setTimeout(() => {
    if (id !== gameId) return;
    rolling = null;
    frozen = null;
    messages.forEach(addLog);
    after?.();
    render();
  }, ROLL_MS);
}

function act(update: () => void) {
  try {
    update();
  } catch (error) {
    addLog(`⚠ ${(error as Error).message}`);
  }
  render();
}

function resetToSetup() {
  confirmEndAttack = false;
  if (botTimer !== null) clearTimeout(botTimer);
  botTimer = null;
  botsPaused = false;
  botMemory = newBotMemory();
  gameId++;
  rolling = null;
  frozen = null;
  screen = "players";
  state = null;
  selected = null;
  target = null;
  selectedCards = [];
  lastBattle = null;
  menuOpen = false;
  tradeBonus = [];
  peeking.clear();
  log.length = 0;
}

// ---- tela de jogadores ----
function renderPlayersScreen(): string {
  const options = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS)
    .map(
      (n) =>
        `<button class="chip ${n === playerCount ? "active" : ""}" data-count="${n}">${n}</button>`,
    )
    .join("");
  const inputs = Array.from(
    { length: playerCount },
    (_, i) => `
      <div class="name-input">
        ${pawnSvg(COLORS[i]!)}
        <input data-name="${i}" maxlength="14" placeholder="${botSeats[i] ? "Bot" : "Jogador"} ${i + 1}" value="${escapeHtml(names[i]!)}" />
        <button class="chip who-toggle ${botSeats[i] ? "active" : ""}" data-bot="${i}">${botSeats[i] ? "🤖 Bot" : "👤 Humano"}</button>
      </div>`,
  ).join("");

  return `
    <div class="setup-screen">
      <section class="card setup">
        <h1>Domínio · Brasil</h1>
        <h2>1. Quantos jogadores?</h2>
        <div class="chips">${options}</div>
        <h2>2. Nome dos jogadores</h2>
        <p class="muted">Toque em 👤/🤖 para escolher quem é humano e quem é bot.</p>
        <div class="names">${inputs}</div>
        <button id="all-bots" class="link">🤖 Só bots (para assistir)</button>
        <p class="muted">Cada jogador fica num canto do tablet. Os 26 territórios serão sorteados e,
          depois, os dados decidem quem começa.</p>
        <button id="deal" class="primary">Sortear os estados 🎲</button>
        <p class="credits">${CREDITS}</p>
      </section>
      ${toolbar()}
    </div>`;
}

// ---- ações ----
function doEndTurn() {
  tradeBonus = [];
  selected = null;
  target = null;
  selectedCards = [];
  lastBattle = null;
  const player = currentPlayer(state!);
  const before = state!.hands[player.id]?.length ?? 0;
  state = endTurn(state!, map);
  const hand = state.hands[player.id] ?? [];
  if (hand.length > before) {
    addLog(`🃏 ${nameOf(player)} ganhou a carta ${cardLabel(hand[hand.length - 1]!)}`);
    sfx.card();
  }
  sfx.turn();
}

// ---- bots ----
const hasBots = () => state?.players.some((p) => p.bot) ?? false;

/** Agenda a próxima ação de bot (uma por vez, com pausa para dar para acompanhar). */
function scheduleBots() {
  if (botTimer !== null || !state || screen !== "game" || rolling || menuOpen || botsPaused) {
    return;
  }
  if (!botToAct(state)) return;
  const placing = state.phase === "placement" || state.phase === "reinforce";
  const delay = (placing ? 380 : 800) * BOT_SPEEDS[botSpeed]!.factor;
  const id = gameId;
  botTimer = window.setTimeout(() => {
    botTimer = null;
    if (id !== gameId || !state || rolling || menuOpen || botsPaused) return;
    const actor = botToAct(state);
    if (actor) runBotAction(chooseBotAction(state, map, actor, botMemory));
  }, delay);
}

function runBotAction(action: BotAction) {
  try {
    switch (action.type) {
      case "roll-order":
        rollOrder(action.players);
        return;
      case "roll-attack":
        onRollAttack();
        return;
      case "roll-defense":
        onRollDefense();
        return;
      case "trade":
        selectedCards = action.cards;
        onTrade();
        return;
      case "place": {
        const wasPlacement = state!.phase === "placement";
        state = placeArmies(state!, map, action.territory, 1);
        sfx.place();
        if (wasPlacement && state.phase !== "placement") {
          addLog("Todos colocaram seus soldados: começa a rodada 1!");
        }
        break;
      }
      case "skip-reinforce":
        state = skipReinforce(state!);
        break;
      case "declare":
        selected = action.from;
        target = action.to;
        lastBattle = null;
        state = declareAttack(state!, map, action.from, action.to, action.soldiers);
        sfx.attack();
        break;
      case "end-attack":
        selected = null;
        target = null;
        state = endAttackPhase(state!);
        break;
      case "fortify":
        selected = action.from;
        state = fortify(state!, map, action.from, action.to, 1);
        sfx.place();
        break;
      case "end-turn":
        doEndTurn();
        break;
    }
  } catch (error) {
    // Não deve acontecer; se acontecer, pausa os bots para não repetir o erro.
    botsPaused = true;
    addLog(`⚠ Bot: ${(error as Error).message} (bots pausados)`);
  }
  render();
}
function onTerritoryClick(id: TerritoryId) {
  if (!state || rolling || state.battle) return;
  if (currentPlayer(state).bot) return; // vez de um bot: só assistir
  const owner = state.territories[id]?.owner;
  confirmEndAttack = false;
  const me = currentPlayer(state).id;
  act(() => {
    switch (state!.phase) {
      case "placement":
        state = placeArmies(state!, map, id, 1);
        sfx.place();
        if (state.phase !== "placement") {
          addLog("Todos colocaram seus soldados: começa a rodada 1!");
        }
        break;
      case "reinforce":
        state = placeArmies(state!, map, id, 1);
        sfx.place();
        break;
      case "attack":
        if (owner === me) {
          target = null;
          if (selected === id) selected = null;
          else if (state!.territories[id]!.armies > 1) selected = id;
          else addLog("⚠ Para atacar, o estado precisa de pelo menos 2 soldados");
        } else if (selected && canAttack(state!, map, selected, id)) {
          target = target === id ? null : id;
        } else if (selected) {
          addLog("⚠ Só dá para atacar um estado que faz divisa");
        }
        break;
      case "fortify":
        if (owner !== me) break;
        if (selected && selected !== id && getTerritory(map, selected).neighbors.includes(id)) {
          state = fortify(state!, map, selected, id, 1);
          sfx.place();
          if (movableArmies(state, selected) === 0) selected = null;
        } else {
          selected = selected === id ? null : id;
        }
        break;
      default:
        break;
    }
  });
}

function onRollAttack() {
  withDiceRoll("attack", state!.battle!.soldiers, () => {
    state = rollAttack(state!);
  });
}

function onRollDefense() {
  const game = state!;
  const pending = game.battle!;
  const attacker = playerById(game, pending.attacker);
  const defender = playerById(game, pending.defender);
  let outcome: ReturnType<typeof rollDefense> | null = null;
  const resultSound = () => {
    if (!outcome) return;
    if (outcome.state.winner) sfx.victory();
    else if (outcome.eliminated) sfx.eliminated();
    else if (outcome.conquered) sfx.conquer();
    else sfx.hold();
  };
  withDiceRoll(
    "defense",
    pending.defenseDice,
    () => {
      const result = rollDefense(game, map);
      outcome = result;
      state = result.state;
      lastBattle = {
        from: pending.from,
        to: pending.to,
        attacker: attacker.id,
        defender: defender.id,
        battle: result.battle,
        conquered: result.conquered,
      };
      const { attackerLosses, defenderLosses } = result.battle;
      addLog(
        `${nameOf(attacker)}: ${sigla(pending.from)} ⚔ ${sigla(pending.to)} com ${pending.soldiers} — ataque perdeu ${attackerLosses}, defesa perdeu ${defenderLosses}` +
          (result.conquered ? ` · ${stateName(pending.to)} conquistado!` : ""),
      );
      if (result.eliminated) {
        addLog(
          `☠ ${nameOf(defender)} foi eliminado por ${nameOf(attacker)}, que ficou com as cartas dele!`,
        );
      }
      // Mantém a seleção para atacar de novo, se ainda der.
      const canContinue = state.territories[pending.from]!.armies > 1;
      if (result.conquered || !canContinue) target = null;
      if (!canContinue) selected = null;
    },
    resultSound,
  );
}

function rollOrder(players: string[]) {
  withDiceRoll("order", players.length, () => {
    for (const id of players) state = rollForOrder(state!, map, id);
    if (state!.phase !== "order") {
      addLog(`Ordem de jogada: ${state!.players.map(nameOf).join(" → ")}`);
    }
  });
}

function onCardClick(id: string) {
  if (!state || state.phase !== "reinforce" || rolling) return;
  selectedCards = selectedCards.includes(id)
    ? selectedCards.filter((c) => c !== id)
    : [...selectedCards, id].slice(-3);
  render();
}

function onTrade() {
  act(() => {
    const player = currentPlayer(state!);
    const result = tradeCards(state!, map, selectedCards);
    state = result.state;
    selectedCards = [];
    tradeBonus = result.bonusTerritories;
    const bonus = result.bonusTerritories.length
      ? ` e +${OWNED_CARD_BONUS} direto em ${result.bonusTerritories.map(sigla).join(", ")}`
      : "";
    addLog(`🃏 ${nameOf(player)} trocou cartas: +${result.armies} soldados${bonus}`);
    sfx.trade();
  });
}

// ---- mapa ----
/**
 * Ação em destaque no mapa: o ataque sendo mirado, a batalha em andamento ou o resultado
 * da última batalha. Os dois estados envolvidos ficam em evidência e o resto esmaece.
 */
interface BoardFocus {
  from: TerritoryId;
  to: TerritoryId;
  stage: "aim" | "battle" | "result";
}

function boardFocus(game: GameState): BoardFocus | null {
  if (game.battle) return { from: game.battle.from, to: game.battle.to, stage: "battle" };
  if (game.phase !== "attack") return null;
  if (
    lastBattle &&
    (!selected || selected === lastBattle.from) &&
    (!target || target === lastBattle.to)
  ) {
    return { from: lastBattle.from, to: lastBattle.to, stage: "result" };
  }
  if (selected && target) return { from: selected, to: target, stage: "aim" };
  return null;
}

/** Seta curva do estado atacante para o atacado, de marcador a marcador. */
function attackArrow(focus: BoardFocus): string {
  const a = LABELS[focus.from]!;
  const b = LABELS[focus.to]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const gap = 19; // raio do marcador + folga
  const x1 = a.x + ux * gap;
  const y1 = a.y + uy * gap;
  const x2 = b.x - ux * (gap + 4);
  const y2 = b.y - uy * (gap + 4);
  // curva para o lado, proporcional à distância
  const bend = Math.min(40, len * 0.22);
  const cx = (x1 + x2) / 2 - uy * bend;
  const cy = (y1 + y2) / 2 + ux * bend;
  const d = `M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  return `<g class="attack-arrow ${focus.stage}">
      <path class="arrow-casing" d="${d}" />
      <path class="arrow-line" d="${d}" marker-end="url(#arrow-head)" />
    </g>`;
}

/** No resultado: quantos soldados cada lado perdeu, ao lado do marcador. */
function lossMarks(focus: BoardFocus): string {
  if (focus.stage !== "result" || !lastBattle) return "";
  const { attackerLosses, defenderLosses } = lastBattle.battle;
  const mark = (id: TerritoryId, n: number, cls: string) => {
    if (n === 0) return "";
    const { x, y } = LABELS[id]!;
    // à esquerda do marcador: à direita fica a borda do mapa, no Nordeste
    return `<text class="loss ${cls}" x="${x - 27}" y="${y + 6}">−${n}</text>`;
  };
  const conquered = lastBattle.conquered
    ? (() => {
        const { x, y } = LABELS[focus.to]!;
        return `<circle class="conquest-burst" cx="${x}" cy="${y}" r="16" />`;
      })()
    : "";
  return `${conquered}${mark(focus.from, attackerLosses, "attacker")}${mark(focus.to, defenderLosses, "defender")}`;
}

function renderBoard(game: GameState): string {
  const targets = new Set<TerritoryId>();
  if (selected && !target && game.phase === "attack" && !game.battle) {
    for (const t of map.territories) {
      if (canAttack(game, map, selected, t.id)) targets.add(t.id);
    }
  }
  if (selected && game.phase === "fortify") {
    for (const n of getTerritory(map, selected).neighbors) {
      const mine = game.territories[n]?.owner === currentPlayer(game).id;
      if (mine && movableTo(game, selected, n) > 0) targets.add(n);
    }
  }
  const focus = boardFocus(game);
  const me = currentPlayer(game).id;
  const involved = (id: TerritoryId) => focus?.from === id || focus?.to === id;
  // Quem está na ação é desenhado por último, para o contorno ficar por cima dos vizinhos.
  const ordered = [...map.territories].sort(
    (a, b) => Number(involved(a.id)) - Number(involved(b.id)),
  );

  const states = ordered
    .map((t) => {
      const ts = game.territories[t.id]!;
      const classes = ["state"];
      if (focus?.from === t.id) classes.push("attacking");
      else if (focus?.to === t.id)
        classes.push(focus.stage === "result" ? "attacked" : "defending");
      else if (selected === t.id) {
        classes.push(game.phase === "attack" ? "attacking" : "selected");
      }
      if (focus?.stage === "result" && focus.to === t.id && lastBattle?.conquered) {
        classes.push("conquered");
      }
      if (targets.has(t.id)) classes.push("target");
      const dim =
        ((game.phase === "placement" || game.phase === "reinforce") && ts.owner !== me) ||
        (focus !== null && !involved(t.id));
      if (dim) classes.push("dim");
      const color = playerById(game, ts.owner).color;
      const path = (cls: string) =>
        `<path class="${cls}" data-id="${t.id}" d="${STATE_PATHS[t.id]}" fill="${color}"><title>${t.name}</title></path>`;
      if (t.id !== "go") return path(classes.join(" "));
      // Goiás/DF: o desenho do DF é pintado por cima, na mesma cor, sem a divisa interna.
      // As duas partes ficam num grupo, para esmaecerem juntas.
      const cls = classes.filter((c) => c !== "dim").join(" ");
      return `<g class="${dim ? "dim" : ""}">${path(cls)}<path class="${cls} merge" data-id="go" d="${STATE_PATHS.df}" fill="${color}" style="stroke:${color}"><title>${t.name}</title></path></g>`;
    })
    .join("");

  const labels = ordered
    .map((t) => {
      const { x, y, anchor } = LABELS[t.id]!;
      const ts = game.territories[t.id]!;
      const leader = anchor
        ? `<line class="leader" x1="${anchor.x}" y1="${anchor.y}" x2="${x}" y2="${y}" /><circle class="anchor" cx="${anchor.x}" cy="${anchor.y}" r="2" />`
        : "";
      const role = focus?.from === t.id ? " fx-from" : focus?.to === t.id ? " fx-to" : "";
      const faded = focus !== null && !involved(t.id) ? " faded" : "";
      const ring = role ? `<circle class="ring" cx="${x}" cy="${y}" r="17" />` : "";
      return `
        <g class="label${role}${faded}" data-id="${t.id}">
          <circle class="hit" cx="${x}" cy="${y + 6}" r="20" />
          ${leader}
          <g class="badge-wrap" style="transform-origin:${x}px ${y}px">
            ${ring}
            <circle class="badge" cx="${x}" cy="${y}" r="13" fill="${playerById(game, ts.owner).color}" />
            <text class="armies" x="${x}" y="${y + 4.5}">${ts.armies}</text>
          </g>
          <text class="sigla" x="${x}" y="${y + 24}">${sigla(t.id)}</text>
        </g>`;
    })
    .join("");

  const arrowDefs = `<defs><marker id="arrow-head" viewBox="0 0 10 10" refX="5" refY="5"
      markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#d63c31" stroke="#fff" stroke-width="1.2" />
    </marker></defs>`;
  const fx = focus ? `${attackArrow(focus)}` : "";
  // Bônus da troca: +2 em cada estado das cartas que o jogador domina (já colocados ali).
  const bonusMarks =
    game.phase === "reinforce"
      ? tradeBonus
          .map((id) => {
            const { x, y } = LABELS[id]!;
            return `<circle class="bonus-ring" cx="${x}" cy="${y}" r="17" /><text class="bonus-mark" x="${x}" y="${y - 20}">+${OWNED_CARD_BONUS}</text>`;
          })
          .join("")
      : "";
  const svgClass = focus ? `board focus-${focus.stage}` : "board";
  return `<svg class="${svgClass}" viewBox="${VIEW_BOX}" role="img" aria-label="Mapa do Brasil">${arrowDefs}${states}${renderRegions(game)}${fx}${labels}${focus ? lossMarks(focus) : ""}${bonusMarks}</svg>`;
}

/**
 * Destaque discreto das regiões: um contorno na cor da região, só do lado de fora dela
 * (máscara), e uma etiqueta com o nome e o bônus — na cor de quem domina a região inteira.
 */
function regionPaths(region: string): string[] {
  return map.territories
    .filter((t) => t.region === region)
    .flatMap((t) => (t.id === "go" ? [STATE_PATHS.go!, STATE_PATHS.df!] : [STATE_PATHS[t.id]!]));
}

function renderRegions(game: GameState): string {
  const defs = map.regions
    .map(
      (
        r,
      ) => `<mask id="fora-${r.id}" maskUnits="userSpaceOnUse" x="-50" y="-50" width="800" height="750">
        <rect x="-50" y="-50" width="800" height="750" fill="white" />
        ${regionPaths(r.id)
          .map((d) => `<path d="${d}" fill="black" />`)
          .join("")}
      </mask>`,
    )
    .join("");
  const outlines = map.regions
    .map(
      (r) => `<g class="region-outline" mask="url(#fora-${r.id})" style="stroke:${r.color}">
        ${regionPaths(r.id)
          .map((d) => `<path d="${d}" />`)
          .join("")}
      </g>`,
    )
    .join("");
  const labels = map.regions
    .map((r) => {
      const pos = REGION_LABELS[r.id]!;
      const owner = game.players.find((p) => controlsRegion(game, map, p.id, r.id));
      const fill = owner ? owner.color : "#ffffffcc";
      const text = owner ? "#fff" : r.color;
      const label = `${r.name} +${r.bonus}`;
      const width = label.length * 6.2 + 14;
      return `<g class="region-label${owner ? " owned" : ""}">
        <rect x="${pos.x - width / 2}" y="${pos.y - 10}" width="${width}" height="18" rx="9"
          fill="${fill}" stroke="${r.color}" />
        <text x="${pos.x}" y="${pos.y + 3.5}" style="fill:${text}">${label}</text>
      </g>`;
    })
    .join("");
  return `<defs>${defs}</defs><g class="regions">${outlines}${labels}</g>`;
}

// ---- cantos dos jogadores ----
/**
 * Quem está na ação agora e tem o canto aberto: quem rola a ordem, o jogador da vez
 * (rodada inicial, reforço, ataque, remanejamento) e quem defende.
 */
function inAction(game: GameState, player: Player): boolean {
  switch (game.phase) {
    case "order":
      return true;
    case "finished":
      return game.winner === player.id;
  }
  if (currentPlayer(game).id === player.id) return true;
  if (game.battle?.defender === player.id) return true;
  // resultado da última batalha: o defensor vê os dados dele
  return lastBattle?.defender === player.id && game.phase === "attack";
}

function reserveFor(game: GameState, player: Player): number {
  const index = game.players.indexOf(player);
  if (game.phase === "order") return INITIAL_ARMIES;
  if (game.phase === "placement") return game.placementLeft[player.id] ?? 0;
  if (game.phase === "reinforce" && index === game.currentPlayerIndex) {
    return game.pendingReinforcements;
  }
  return 0;
}

const diceRow = (values: number[], kind: "attack" | "defense", spin = false, lost?: boolean[]) =>
  values.map((v, i) => dieHtml(v, kind, { rolling: spin, lost: lost?.[i] })).join("");

function seatDice(game: GameState, player: Player): string {
  // Ordem de jogada (e, na rodada inicial, para lembrar): cada um vê o próprio dado.
  if (game.phase === "order" || game.phase === "placement") {
    const rolls = state!.orderRolls[player.id] ?? [];
    // Durante a rolagem, os dados novos são os que o estado anterior (congelado) não tinha.
    const before = frozen ? (frozen.orderRolls[player.id]?.length ?? 0) : rolls.length;
    return rolls
      .map((v, i) =>
        dieHtml(v, "neutral", {
          rolling: rolling === "order" && i >= before,
          title: i ? "desempate" : "",
        }),
      )
      .join("");
  }

  // Ataque em andamento: dados vermelhos com o atacante, amarelos com o defensor.
  const pending = game.battle;
  if (pending) {
    if (player.id === pending.attacker) {
      if (rolling === "attack") return diceRow(state!.battle!.attackRolls!, "attack", true);
      return diceRow(pending.attackRolls ?? Array(pending.soldiers).fill(0), "attack");
    }
    if (player.id === pending.defender) {
      if (rolling === "defense") return diceRow(lastBattle!.battle.defenseRolls, "defense", true);
      return diceRow(Array(pending.defenseDice).fill(0), "defense");
    }
    return "";
  }

  // Resultado do último ataque: os dados que perderam ficam apagados.
  if (!lastBattle) return "";
  const { battle, attacker, defender } = lastBattle;
  const pairs = Math.min(battle.attackRolls.length, battle.defenseRolls.length);
  const attackWon = (i: number) => battle.attackRolls[i]! > battle.defenseRolls[i]!;
  if (player.id === attacker) {
    const lost = battle.attackRolls.map((_, i) => i < pairs && !attackWon(i));
    return diceRow(battle.attackRolls, "attack", false, lost);
  }
  if (player.id === defender) {
    const lost = battle.defenseRolls.map((_, i) => i < pairs && attackWon(i));
    return diceRow(battle.defenseRolls, "defense", false, lost);
  }
  return "";
}

function seatBattleNote(game: GameState, player: Player): string {
  if (!lastBattle || rolling || game.battle) return "";
  const { battle, attacker, defender, conquered, to } = lastBattle;
  if (player.id === attacker) {
    return `<p class="note">Perdeu ${battle.attackerLosses}${conquered ? ` · <b>conquistou ${sigla(to)}!</b>` : ""}</p>`;
  }
  if (player.id === defender) {
    return `<p class="note">Perdeu ${battle.defenderLosses}${conquered ? ` · <b>perdeu ${sigla(to)}</b>` : ""}</p>`;
  }
  return "";
}

function battleActions(game: GameState, player: Player): string | null {
  const pending = game.battle;
  if (!pending || rolling) return null;
  const attacker = playerById(game, pending.attacker);
  if (player.id === pending.attacker) {
    if (!pending.attackRolls) {
      return `<p class="note"><b>${sigla(pending.from)}</b> ⚔ <b>${sigla(pending.to)}</b> · ${pending.soldiers} dado(s)</p>
        <div class="row">
          <button class="primary roll-attack" id="roll-attack">🎲 Rolar ataque</button>
          <button id="cancel-attack" class="small" title="Desistir do ataque">Desistir</button>
        </div>`;
    }
    return `<p class="note">Aguardando a defesa de ${nameOf(playerById(game, pending.defender))}…</p>`;
  }
  if (player.id === pending.defender) {
    if (!pending.attackRolls) {
      return `<p class="note">${nameOf(attacker)} vai atacar <b>${sigla(pending.to)}</b>…</p>`;
    }
    return `<p class="note">Defenda <b>${sigla(pending.to)}</b>! · ${pending.defenseDice} dado(s)</p>
      <button class="primary roll-defense" id="roll-defense">🎲 Rolar defesa</button>`;
  }
  return null;
}

/** Depois da troca: avisa onde foram parar os +2 das cartas de estados do jogador. */
function seatTradeBonus(game: GameState, player: Player): string {
  if (tradeBonus.length === 0 || game.phase !== "reinforce") return "";
  if (currentPlayer(game).id !== player.id) return "";
  return `<p class="note bonus-note">🃏 +${OWNED_CARD_BONUS} já colocados em <b>${tradeBonus.map(sigla).join(", ")}</b> (carta de estado seu).</p>`;
}

function reinforceActions(game: GameState, player: Player): string {
  const hand = game.hands[player.id] ?? [];
  const chosen = hand.filter((c) => selectedCards.includes(c.id));
  const parts: string[] = [];
  if (mustTrade(game)) {
    parts.push(`<p class="note warn">${hand.length} cartas: troque antes de colocar.</p>`);
  }
  if (hasValidSet(hand)) {
    const valid = isValidSet(chosen);
    const ownedChosen = chosen
      .map((c) => c.territory)
      .filter((t): t is TerritoryId => t !== null && game.territories[t]?.owner === player.id);
    const extra = ownedChosen.length
      ? ` + ${OWNED_CARD_BONUS} em ${ownedChosen.map(sigla).join(", ")}`
      : "";
    parts.push(`<p class="note">🃏 Troca (+${tradeValue(game.trades)}): toque em 3 cartas. Carta de estado seu: +${OWNED_CARD_BONUS} nele.</p>
      <button class="primary" id="trade" ${valid ? "" : "disabled"}>Trocar cartas${valid ? ` (+${tradeValue(game.trades)}${extra})` : ""}</button>`);
  }
  if (game.pendingReinforcements > 0) {
    parts.push(
      `<p class="note"><b>Reforço:</b> toque nos seus estados para colocar ${game.pendingReinforcements} soldado(s).</p>`,
    );
  } else if (!mustTrade(game)) {
    parts.push(`<button id="skip-reinforce">Seguir para o ataque</button>`);
  }
  return parts.join("");
}

/** O que aparece no canto de um bot: só o que ele está fazendo (sem botões). */
function botSeatNote(game: GameState, player: Player): string {
  const note = (text: string) => `<p class="note bot-note">${text}</p>`;
  if (game.phase === "order") {
    return playersToRollForOrder(game).includes(player.id) && !rolling
      ? note("🤖 Rolando o dado…")
      : "";
  }
  const battle = game.battle;
  if (battle) {
    const other = (id: string) => nameOf(playerById(game, id));
    if (player.id === battle.attacker) {
      return battle.attackRolls
        ? note(`Aguardando a defesa de ${other(battle.defender)}…`)
        : note(`🤖 Atacando ${stateName(battle.to)} com ${battle.soldiers}…`);
    }
    if (player.id === battle.defender) {
      return battle.attackRolls
        ? note("🤖 Defendendo…")
        : note(`${other(battle.attacker)} vai atacar ${stateName(battle.to)}…`);
    }
    return "";
  }
  if (currentPlayer(game).id !== player.id || rolling) return "";
  const doing: Record<string, string> = {
    placement: `🤖 Colocando os ${INITIAL_ARMIES} soldados…`,
    reinforce: `🤖 Reforçando (${game.pendingReinforcements} soldado(s))…`,
    attack: "🤖 Escolhendo um ataque…",
    fortify: "🤖 Remanejando soldados…",
  };
  return note(doing[game.phase] ?? "");
}

function seatActions(game: GameState, player: Player): string {
  if (player.bot && game.phase !== "finished") return botSeatNote(game, player);
  if (game.phase === "order") {
    if (rolling) return "";
    if (playersToRollForOrder(game).includes(player.id)) {
      const tie = (game.orderRolls[player.id]?.length ?? 0) > 0;
      return `${tie ? `<p class="note warn">Empate! Role de novo.</p>` : `<p class="note">Role o dado: quem tirar mais começa.</p>`}
        <button class="primary" data-roll="${player.id}">🎲 Rolar dado</button>`;
    }
    return `<p class="note">Aguardando os outros jogadores…</p>`;
  }
  if (game.phase === "finished") {
    return game.winner === player.id
      ? `<p class="note big">🏆 Você venceu!</p><p class="note">Por: ${winText(game)}.</p><button id="new-game" class="primary">Nova partida</button>`
      : "";
  }
  const battle = battleActions(game, player);
  if (battle !== null) return battle;
  if (currentPlayer(game).id !== player.id || rolling) return "";

  switch (game.phase) {
    case "placement": {
      const left = game.placementLeft[player.id] ?? 0;
      const others = playersStillPlacing(game).length - 1;
      const after =
        others > 0
          ? `Depois ${others === 1 ? "falta 1 jogador" : `faltam ${others} jogadores`}; a rodada 1 começa quando todos colocarem.`
          : "Você é o último: depois começa a rodada 1.";
      return `<p class="note"><b>Rodada inicial:</b> toque nos seus estados para colocar ${left} soldado(s).</p>
        <p class="note muted">${after}</p>`;
    }
    case "reinforce":
      return reinforceActions(game, player);
    case "attack": {
      const endAttack = `<button id="end-attack" class="small end-attack">Encerrar ataques</button>`;
      let step: string;
      if (!selected) {
        step = `<p class="note"><b>Ataque:</b> toque no estado de onde parte o ataque.</p>`;
      } else if (!target) {
        step = `<p class="note">De <b>${sigla(selected)}</b>: toque no vizinho a atacar.</p>`;
      } else {
        const max = maxAttackers(game, selected);
        const buttons = Array.from(
          { length: max },
          (_, i) =>
            `<button class="chip attack-count" data-attack="${i + 1}">${i + 1}<span>${pawnSvg(player.color).repeat(i + 1)}</span></button>`,
        ).join("");
        // botões de quantidade e "Encerrar" na mesma linha, para caber sem rolar
        step = `<p class="note"><b>${sigla(selected)}</b> → <b>${sigla(target)}</b>: com quantos?</p>
          <div class="chips">${buttons}${confirmEndAttack ? "" : endAttack}</div>`;
      }
      if (confirmEndAttack) {
        return `<p class="note warn">Encerrar os ataques desta vez?</p>
          <div class="confirm">
            <button id="confirm-end-attack" class="primary">Sim, encerrar</button>
            <button id="cancel-end-attack">Continuar</button>
          </div>`;
      }
      return step.includes('id="end-attack"') ? step : `${step}${endAttack}`;
    }
    case "fortify":
      return `<p class="note"><b>Remanejar</b> (opcional): toque num estado seu e depois num vizinho (até 3 por vizinho).</p>
        ${selected ? `<p class="note">De <b>${sigla(selected)}</b>: ${movableArmies(game, selected)} disponível(is).</p>` : ""}
        <button id="end-turn" class="primary">Passar a vez</button>`;
    default:
      return "";
  }
}

function seatObjectives(game: GameState, player: Player): string {
  const ids = game.objectives[player.id] ?? [];
  if (ids.length === 0) return "";
  const items = ids
    .map((id) => {
      const def = objectiveById(map, id);
      const { done, text } = def.progress(game, map, player.id);
      // título curto: "Norte e Sul", "18 territórios"
      const short = def.title.replace(/^Conquistar (o |a )?/, "").replace(/^Ter /, "");
      return `<li class="${done ? "done" : ""}" title="${escapeHtml(def.title)}: ${escapeHtml(def.description)}">
        <span class="obj-title">🎯 ${short}</span>
        <span class="obj-progress">${text}</span>
      </li>`;
    })
    .join("");
  return `<ul class="objectives">${items}</ul>`;
}

function winText(game: GameState): string {
  if (!game.winReason || game.winReason === "ultimo-vivo") return "último jogador vivo";
  return `objetivo "${objectiveById(map, game.winReason).title}"`;
}

function seatHand(game: GameState, player: Player): string {
  const hand = game.hands[player.id] ?? [];
  if (hand.length === 0) return "";
  const canPick = game.phase === "reinforce" && currentPlayer(game).id === player.id && !rolling;
  const cards = hand
    .map((c) => {
      const owned = c.territory && game.territories[c.territory]?.owner === player.id;
      const classes = ["tcard", `sym-${c.symbol}`];
      if (owned) classes.push("owned");
      if (canPick) classes.push("pickable");
      if (canPick && selectedCards.includes(c.id)) classes.push("picked");
      const title = `${c.territory ? stateName(c.territory) : "Coringa"} · ${SYMBOL_NAME[c.symbol]}${owned ? ` · seu estado: +${OWNED_CARD_BONUS} na troca` : ""}`;
      return `<button class="${classes.join(" ")}" ${canPick ? `data-card="${c.id}"` : "disabled"} title="${title}">
        <span class="sym">${SYMBOL_GLYPH[c.symbol]}</span>
        <span class="cname">${c.territory ? sigla(c.territory) : "★"}</span>
      </button>`;
    })
    .join("");
  const warn = hand.length >= MAX_HAND ? " full" : "";
  return `<div class="hand${warn}">${cards}</div>`;
}

/**
 * As cartas só aparecem no canto quando importam: no reforço do jogador da vez (para trocar)
 * ou quando alguém abre o canto para espiar. Fora disso, o placar mostra só quantas são.
 */
function showHand(game: GameState, player: Player): boolean {
  if (peeking.has(player.id)) return true;
  return game.phase === "reinforce" && currentPlayer(game).id === player.id;
}

function handCount(game: GameState, player: Player): string {
  const n = game.hands[player.id]?.length ?? 0;
  return n > 0 ? ` · 🃏${n}` : "";
}

function renderSeat(game: GameState, seat: Seat): string {
  const player = game.players.find((p) => seats[p.id] === seat);
  if (!player) return `<section class="seat seat-${seat} empty"></section>`;
  const owned = territoriesOf(game, player.id);
  const armies = owned.reduce((sum, id) => sum + game.territories[id]!.armies, 0);
  const isTurn =
    game.phase !== "order" && game.phase !== "finished" && currentPlayer(game).id === player.id;
  const isDefending = game.battle?.defender === player.id;
  const out = owned.length === 0;
  const place =
    game.phase !== "order" ? `<span class="place">${game.players.indexOf(player) + 1}º</span>` : "";
  const classes = ["seat", `seat-${seat}`];
  if (isTurn || (game.phase === "finished" && game.winner === player.id)) classes.push("current");
  if (isDefending) classes.push("defending");
  if (out) classes.push("out");
  const head = `<div class="seat-head">
        ${place}<span class="swatch"></span><b class="seat-name">${nameOf(player)}${player.bot ? " 🤖" : ""}</b>
        <span class="muted">${out ? "eliminado" : `${owned.length} estados · ${armies} soldados`}${handCount(game, player)}</span>
      </div>`;

  // Fora da ação, o canto mostra só o nome e o placar; um toque abre para espiar.
  const active = inAction(game, player);
  if (!active && !peeking.has(player.id)) {
    classes.push("collapsed");
    return `<section class="${classes.join(" ")}" style="--pc:${player.color}" data-peek="${player.id}" title="Toque para ver objetivos e cartas">
      ${head.replace('<div class="seat-head">', '<div class="seat-head"><span class="peek-icon">▸</span>')}
    </section>`;
  }
  const reserve = reserveFor(game, player);
  const close = active
    ? ""
    : `<button class="peek-close" data-peek="${player.id}" title="Fechar">✕</button>`;

  return `
    <section class="${classes.join(" ")}" style="--pc:${player.color}">
      ${close}
      <div class="seat-main">
        ${head}
        ${showHand(game, player) ? seatHand(game, player) : ""}
        <div class="seat-body">
          <div class="seat-dice">${seatDice(game, player)}</div>
          <div class="seat-actions">
            ${seatBattleNote(game, player)}
            ${seatTradeBonus(game, player)}
            ${seatActions(game, player)}
          </div>
        </div>
      </div>
      ${reserve > 0 ? `<div class="reserve">${reserveHtml(reserve, player.color)}</div>` : ""}
      ${seatObjectives(game, player)}
    </section>`;
}

// ---- centro: status, barra de ferramentas e menu ----
function statusText(game: GameState): string {
  const who = nameOf(currentPlayer(game));
  if (game.battle) {
    const b = game.battle;
    return `${nameOf(playerById(game, b.attacker))} ataca ${sigla(b.to)} de ${nameOf(playerById(game, b.defender))}`;
  }
  switch (game.phase) {
    case "order":
      return "Quem começa? Cada jogador rola o dado no seu canto";
    case "placement": {
      const done = game.players.length - playersStillPlacing(game).length;
      return `Rodada inicial · ${who} coloca ${INITIAL_ARMIES} soldados · ${done + 1} de ${game.players.length}`;
    }
    case "reinforce":
      return `Rodada ${game.round} · ${who} · Reforço`;
    case "attack":
      return `Rodada ${game.round} · ${who} · Ataque`;
    case "fortify":
      return `Rodada ${game.round} · ${who} · Remanejamento`;
    case "finished":
      return `🏆 ${nameOf(playerById(game, game.winner!))} venceu — ${winText(game)}!`;
  }
}

function toolbar(): string {
  const fs = fullscreenSupported()
    ? `<button id="fullscreen" class="tool" title="Tela cheia">${isFullscreen() ? "🗗" : "⛶"}</button>`
    : "";
  const music = `<button id="toggle-music" class="tool ${musicOn() ? "" : "off"}" title="Música">🎵</button>`;
  const sound = `<button id="toggle-sfx" class="tool" title="Efeitos sonoros">${sfxOn() ? "🔊" : "🔇"}</button>`;
  const menu = screen === "game" ? `<button id="menu" class="tool" title="Menu">☰</button>` : "";
  const speed = BOT_SPEEDS[botSpeed]!;
  const bots =
    screen === "game" && hasBots()
      ? `<button id="toggle-bots" class="tool" title="${botsPaused ? "Continuar" : "Pausar"} os bots">${botsPaused ? "▶" : "⏸"}</button>
         <button id="bot-speed" class="tool" title="Velocidade dos bots: ${speed.label}">${speed.icon}</button>`
      : "";
  return `<div class="toolbar">${bots}${music}${sound}${fs}${menu}</div>`;
}

function renderMenu(): string {
  if (!menuOpen || !state) return "";
  const regions = map.regions
    .map((r) => `<li><span>${r.name}</span><b>+${r.bonus}</b></li>`)
    .join("");
  return `
    <div class="overlay">
      <section class="card menu">
        <h2>Regras rápidas</h2>
        <ol class="rules">
          <li>Os estados são sorteados; os dados decidem a ordem.</li>
          <li>Rodada inicial: um por vez, na ordem, cada um coloca ${INITIAL_ARMIES} soldados; a rodada 1 só começa quando todos tiverem colocado.</li>
          <li>Ataque só a estados vizinhos (que fazem divisa): escolha a origem, o alvo e com quantos soldados (até 3).</li>
          <li>O atacante rola os dados vermelhos e o defensor, os amarelos, cada um no seu canto. O maior vence; empate é da defesa.</li>
          <li>Quem conquistar pelo menos um estado no turno ganha uma carta no fim do turno (■ ▲ ● ou ★ coringa), visível para todos.</li>
          <li>3 cartas iguais ou 3 diferentes valem uma troca por soldados (próxima: +${tradeValue(state.trades)}). Carta de estado seu: +${OWNED_CARD_BONUS} obrigatoriamente nesse estado (colocados na hora). Com ${MAX_HAND} cartas, a troca é obrigatória.</li>
          <li>Remanejar: até 3 soldados de um estado para cada vizinho, sempre deixando 1.</li>
          <li>A partir da rodada 2: 1 soldado a cada 2 estados (no mínimo ${MIN_REINFORCEMENT}) + bônus de região.</li>
          <li>Objetivos abertos: cada jogador tem 2, visíveis no seu canto — conquistar as regiões sorteadas ou ter ${TERRITORY_GOAL} territórios. Vence quem cumprir qualquer um na sua vez, ou o último vivo.</li>
        </ol>
        <h3>Bônus por região</h3>
        <ul class="regions">${regions}</ul>
        <p class="muted">Cartas no monte: ${state.deck.length} · trocadas: ${state.discard.length}</p>
        <h3>Histórico</h3>
        <ul class="log">${log.map((l) => `<li>${l}</li>`).join("") || "<li>—</li>"}</ul>
        <div class="menu-actions">
          <button id="quit">Nova partida</button>
          <button id="close-menu" class="primary">Voltar ao jogo</button>
        </div>
        <p class="credits">${CREDITS}</p>
      </section>
    </div>`;
}

// ---- render principal ----
function render() {
  if (screen === "players" || !state) {
    app.className = "";
    app.innerHTML = renderPlayersScreen();
  } else {
    const view = frozen ?? state;
    app.className = "table";
    app.innerHTML = `
      ${SEATS.map((s) => renderSeat(view, s)).join("")}
      <main class="board-wrap">
        ${renderBoard(view)}
        <div class="status">${statusText(view)}</div>
        ${toolbar()}
      </main>
      ${renderMenu()}`;
  }
  bindEvents();
  animateDice(app);
  scheduleBots();
}

function on(selector: string, handler: (el: HTMLElement) => void) {
  app.querySelectorAll<HTMLElement>(selector).forEach((el) =>
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      handler(el);
    }),
  );
}

function bindEvents() {
  on("#fullscreen", () => void toggleFullscreen());
  on("#toggle-music", () => {
    toggleMusic();
    render();
  });
  on("#toggle-sfx", () => {
    toggleSfx();
    render();
  });
  on("#menu", () => {
    menuOpen = true;
    render();
  });
  on("#close-menu", () => {
    menuOpen = false;
    render();
  });

  // tela de jogadores
  on("[data-count]", (el) => {
    playerCount = Number(el.dataset.count);
    render();
  });
  app
    .querySelectorAll<HTMLInputElement>("[data-name]")
    .forEach((input) =>
      input.addEventListener("input", () => (names[Number(input.dataset.name)] = input.value)),
    );
  on("[data-bot]", (el) => {
    const i = Number(el.dataset.bot);
    botSeats[i] = !botSeats[i];
    render();
  });
  on("#all-bots", () => {
    botSeats.fill(true);
    render();
  });
  on("#toggle-bots", () => {
    botsPaused = !botsPaused;
    render();
  });
  on("#bot-speed", () => {
    botSpeed = (botSpeed + 1) % BOT_SPEEDS.length;
    render();
  });
  on("#deal", () => {
    const players = Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: names[i]!.trim() || `${botSeats[i] ? "Bot" : "Jogador"} ${i + 1}`,
      color: COLORS[i]!,
      bot: botSeats[i],
    }));
    seats = Object.fromEntries(players.map((p, i) => [p.id, SEATS[i]!]));
    state = createGame(map, players);
    screen = "game";
    addLog("Os 26 territórios foram sorteados entre os jogadores.");
    sfx.trade();
    render();
  });

  // jogo
  on("[data-roll]", (el) => rollOrder([el.dataset.roll!]));
  on("[data-id]", (el) => onTerritoryClick(el.dataset.id!));
  on("[data-attack]", (el) =>
    act(() => {
      lastBattle = null;
      state = declareAttack(state!, map, selected!, target!, Number(el.dataset.attack));
      sfx.attack();
    }),
  );
  on("#roll-attack", onRollAttack);
  on("#roll-defense", onRollDefense);
  on("#cancel-attack", () => act(() => (state = cancelAttack(state!))));
  on("[data-card]", (el) => onCardClick(el.dataset.card!));
  on("[data-peek]", (el) => {
    const id = el.dataset.peek!;
    if (peeking.has(id)) peeking.delete(id);
    else peeking.add(id);
    render();
  });
  on("#trade", onTrade);
  on("#skip-reinforce", () => act(() => (state = skipReinforce(state!))));
  on("#end-attack", () => {
    confirmEndAttack = true;
    render();
  });
  on("#cancel-end-attack", () => {
    confirmEndAttack = false;
    render();
  });
  on("#confirm-end-attack", () =>
    act(() => {
      confirmEndAttack = false;
      selected = null;
      target = null;
      state = endAttackPhase(state!);
    }),
  );
  on("#end-turn", () => act(doEndTurn));
  on("#new-game", () => {
    resetToSetup();
    render();
  });
  on("#quit", () => {
    if (confirm("Abandonar a partida atual e começar outra?")) {
      resetToSetup();
      render();
    }
  });
}

onFullscreenChange(render);
// O navegador só libera o som depois do primeiro toque na tela.
document.addEventListener("pointerdown", unlockAudio, { once: true, capture: true });
render();
