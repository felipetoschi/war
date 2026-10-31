import "./style.css";
import { BRASIL_MAP } from "./game/brasil";
import { hasValidSet, isValidSet, MAX_HAND, OWNED_CARD_BONUS, tradeValue } from "./game/cards";
import type { BattleResult } from "./game/dice";
import { getTerritory } from "./game/map";
import { objectiveById } from "./game/objectives";
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
  movableArmies,
  movableTo,
  mustTrade,
  placeArmies,
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
      <label class="name-input">
        ${pawnSvg(COLORS[i]!)}
        <input data-name="${i}" maxlength="14" placeholder="Jogador ${i + 1}" value="${escapeHtml(names[i]!)}" />
      </label>`,
  ).join("");

  return `
    <div class="setup-screen">
      <section class="card setup">
        <h1>Domínio · Brasil</h1>
        <h2>1. Quantos jogadores?</h2>
        <div class="chips">${options}</div>
        <h2>2. Nome dos jogadores</h2>
        <div class="names">${inputs}</div>
        <p class="muted">Cada jogador fica num canto do tablet. Os 26 territórios serão sorteados e,
          depois, os dados decidem quem começa.</p>
        <button id="deal" class="primary">Sortear os estados 🎲</button>
        <p class="credits">${CREDITS}</p>
      </section>
      ${toolbar()}
    </div>`;
}

// ---- ações ----
function onTerritoryClick(id: TerritoryId) {
  if (!state || rolling || state.battle) return;
  confirmEndAttack = false;
  const owner = state.territories[id]?.owner;
  const me = currentPlayer(state).id;
  act(() => {
    switch (state!.phase) {
      case "placement":
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
    const bonus = result.bonusTerritories.length
      ? ` e +${OWNED_CARD_BONUS} em ${result.bonusTerritories.map(sigla).join(", ")}`
      : "";
    addLog(`🃏 ${nameOf(player)} trocou cartas: +${result.armies} soldados${bonus}`);
    sfx.trade();
  });
}

// ---- mapa ----
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
  const fighting = game.battle ?? (rolling === "defense" ? lastBattle : null);
  const placing = game.phase === "placement" || game.phase === "reinforce";
  const me = currentPlayer(game).id;

  const states = map.territories
    .map((t) => {
      const ts = game.territories[t.id]!;
      const classes = ["state"];
      if (selected === t.id || fighting?.from === t.id) classes.push("selected");
      if (target === t.id || fighting?.to === t.id) classes.push("defending");
      if (targets.has(t.id)) classes.push("target");
      const dim = placing && ts.owner !== me;
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

  const labels = map.territories
    .map((t) => {
      const { x, y, anchor } = LABELS[t.id]!;
      const ts = game.territories[t.id]!;
      const leader = anchor
        ? `<line class="leader" x1="${anchor.x}" y1="${anchor.y}" x2="${x}" y2="${y}" /><circle class="anchor" cx="${anchor.x}" cy="${anchor.y}" r="2" />`
        : "";
      return `
        <g class="label" data-id="${t.id}">
          <circle class="hit" cx="${x}" cy="${y + 6}" r="20" />
          ${leader}
          <circle class="badge" cx="${x}" cy="${y}" r="13" fill="${playerById(game, ts.owner).color}" />
          <text class="armies" x="${x}" y="${y + 4.5}">${ts.armies}</text>
          <text class="sigla" x="${x}" y="${y + 24}">${sigla(t.id)}</text>
        </g>`;
    })
    .join("");

  return `<svg class="board" viewBox="${VIEW_BOX}" role="img" aria-label="Mapa do Brasil">${states}${renderRegions(game)}${labels}</svg>`;
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
function reserveFor(game: GameState, player: Player): number {
  const index = game.players.indexOf(player);
  if (game.phase === "order") return INITIAL_ARMIES;
  if (game.phase === "placement") {
    if (index < game.currentPlayerIndex) return 0;
    return index === game.currentPlayerIndex ? game.pendingReinforcements : INITIAL_ARMIES;
  }
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
    return `<p class="note">Ataque perdeu ${battle.attackerLosses}${conquered ? ` · conquistou ${stateName(to)}!` : ""}</p>`;
  }
  if (player.id === defender) {
    return `<p class="note">Defesa perdeu ${battle.defenderLosses}${conquered ? ` · perdeu ${stateName(to)}` : ""}</p>`;
  }
  return "";
}

function battleActions(game: GameState, player: Player): string | null {
  const pending = game.battle;
  if (!pending || rolling) return null;
  const attacker = playerById(game, pending.attacker);
  if (player.id === pending.attacker) {
    if (!pending.attackRolls) {
      return `<p class="note"><b>${stateName(pending.from)}</b> ⚔ <b>${stateName(pending.to)}</b> com ${pending.soldiers} soldado(s).<br/>Role seus dados vermelhos!</p>
        <button class="primary roll-attack" id="roll-attack">🎲 Rolar ataque</button>
        <button id="cancel-attack">Desistir</button>`;
    }
    return `<p class="note">Aguardando a defesa de ${nameOf(playerById(game, pending.defender))}…</p>`;
  }
  if (player.id === pending.defender) {
    if (!pending.attackRolls) {
      return `<p class="note">${nameOf(attacker)} vai atacar <b>${stateName(pending.to)}</b>…</p>`;
    }
    return `<p class="note">Você está sendo atacado em <b>${stateName(pending.to)}</b>!<br/>Role seus ${pending.defenseDice} dado(s) amarelo(s).</p>
      <button class="primary roll-defense" id="roll-defense">🎲 Rolar defesa</button>`;
  }
  return null;
}

function reinforceActions(game: GameState, player: Player): string {
  const hand = game.hands[player.id] ?? [];
  const chosen = hand.filter((c) => selectedCards.includes(c.id));
  const parts: string[] = [];
  if (mustTrade(game)) {
    parts.push(
      `<p class="note warn">Você tem ${hand.length} cartas: é obrigatório trocar antes de posicionar.</p>`,
    );
  }
  if (hasValidSet(hand)) {
    const valid = isValidSet(chosen);
    parts.push(`<p class="note">🃏 Troca disponível (+${tradeValue(game.trades)} soldados): toque em 3 cartas.</p>
      <button class="primary" id="trade" ${valid ? "" : "disabled"}>Trocar cartas</button>`);
  }
  if (game.pendingReinforcements > 0) {
    parts.push(
      `<p class="note"><b>Reforço:</b> coloque ${game.pendingReinforcements} soldado(s) nos seus estados.</p>`,
    );
  } else if (!mustTrade(game)) {
    parts.push(`<button id="skip-reinforce">Seguir para o ataque</button>`);
  }
  return parts.join("");
}

function seatActions(game: GameState, player: Player): string {
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
    case "placement":
      return `<p class="note"><b>Rodada inicial:</b> coloque seus ${INITIAL_ARMIES} soldados tocando nos seus estados (pode dividir entre vários).</p>`;
    case "reinforce":
      return reinforceActions(game, player);
    case "attack": {
      let step: string;
      if (!selected) {
        step = `<p class="note"><b>Ataque:</b> toque no estado de onde vai partir o ataque.</p>`;
      } else if (!target) {
        step = `<p class="note">De <b>${stateName(selected)}</b>: agora toque no estado vizinho que vai receber o ataque.</p>`;
      } else {
        const max = maxAttackers(game, selected);
        const buttons = Array.from(
          { length: max },
          (_, i) =>
            `<button class="chip attack-count" data-attack="${i + 1}">${i + 1}<span>${pawnSvg(player.color).repeat(i + 1)}</span></button>`,
        ).join("");
        step = `<p class="note"><b>${stateName(selected)}</b> → <b>${stateName(target)}</b><br/>Atacar com quantos soldados?</p>
          <div class="chips">${buttons}</div>`;
      }
      if (confirmEndAttack) {
        return `<p class="note warn">Encerrar os ataques? Depois disso não dá para atacar de novo nesta vez.</p>
          <div class="confirm">
            <button id="confirm-end-attack" class="primary">Sim, encerrar</button>
            <button id="cancel-end-attack">Continuar atacando</button>
          </div>`;
      }
      return `${step}<button id="end-attack">Encerrar ataques</button>`;
    }
    case "fortify":
      return `<p class="note"><b>Remanejar</b> (opcional): toque num estado seu e depois num vizinho seu para mover 1 soldado. Máximo de 3 para cada vizinho, e sempre fica 1 em cada estado.</p>
        ${selected ? `<p class="note">De <b>${stateName(selected)}</b>: ${movableArmies(game, selected)} soldado(s) disponível(is).</p>` : ""}
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
      const def = objectiveById(id);
      const { done, text } = def.progress(game, map, player.id);
      const target =
        id === "cacada" && game.huntTargets[player.id]
          ? ` <span class="target-name">(alvo: ${nameOf(playerById(game, game.huntTargets[player.id]!))})</span>`
          : "";
      return `<li class="${done ? "done" : ""}" title="${escapeHtml(def.description)}">
        <span class="obj-title">🎯 ${def.title}${target}</span>
        <span class="obj-progress">${text}</span>
      </li>`;
    })
    .join("");
  return `<ul class="objectives">${items}</ul>`;
}

function winText(game: GameState): string {
  if (!game.winReason || game.winReason === "ultimo-vivo") return "último jogador vivo";
  return `objetivo "${objectiveById(game.winReason).title}"`;
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

  return `
    <section class="${classes.join(" ")}" style="--pc:${player.color}">
      <div class="seat-head">
        ${place}<span class="swatch"></span><b class="seat-name">${nameOf(player)}</b>
        <span class="muted">${out ? "eliminado" : `${owned.length} estados · ${armies} soldados`}</span>
      </div>
      ${seatObjectives(game, player)}
      ${seatHand(game, player)}
      <div class="seat-body">
        <div class="seat-dice">${seatDice(game, player)}</div>
        ${seatBattleNote(game, player)}
        <div class="seat-actions">${seatActions(game, player)}</div>
      </div>
      <div class="reserve">${reserveHtml(reserveFor(game, player), player.color)}</div>
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
    case "placement":
      return `Rodada inicial · ${who} coloca ${INITIAL_ARMIES} soldados`;
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
  return `<div class="toolbar">${music}${sound}${fs}${menu}</div>`;
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
          <li>Rodada inicial: cada um coloca ${INITIAL_ARMIES} soldados.</li>
          <li>Ataque só a estados vizinhos (que fazem divisa): escolha a origem, o alvo e com quantos soldados (até 3).</li>
          <li>O atacante rola os dados vermelhos e o defensor, os amarelos, cada um no seu canto. O maior vence; empate é da defesa.</li>
          <li>Quem conquistar pelo menos um estado no turno ganha uma carta no fim do turno (■ ▲ ● ou ★ coringa), visível para todos.</li>
          <li>3 cartas iguais ou 3 diferentes valem uma troca por soldados (próxima: +${tradeValue(state.trades)}). Carta de estado seu: +${OWNED_CARD_BONUS} nele. Com ${MAX_HAND} cartas, a troca é obrigatória.</li>
          <li>Remanejar: até 3 soldados de um estado para cada vizinho, sempre deixando 1.</li>
          <li>A partir da rodada 2: 1 soldado a cada 2 estados + bônus de região.</li>
          <li>Objetivos abertos: cada jogador tem 2 objetivos, visíveis no seu canto. Vence quem cumprir qualquer um deles na sua vez — ou quem for o último vivo.</li>
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
  on("#deal", () => {
    const players = Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: names[i]!.trim() || `Jogador ${i + 1}`,
      color: COLORS[i]!,
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
  on("#end-turn", () =>
    act(() => {
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
    }),
  );
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
