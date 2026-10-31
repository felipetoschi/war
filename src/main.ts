import "./style.css";
import { BRASIL_MAP } from "./game/brasil";
import type { BattleResult } from "./game/dice";
import { getTerritory } from "./game/map";
import {
  attack,
  attackPenalty,
  canAttack,
  createGame,
  currentPlayer,
  endAttackPhase,
  endTurn,
  fortify,
  INITIAL_ARMIES,
  MAX_PLAYERS,
  maxAttackers,
  MIN_PLAYERS,
  movableArmies,
  placeArmies,
  playersToRollForOrder,
  rollForOrder,
  territoriesOf,
} from "./game/rules";
import type { GameState, Player, PlayerId, TerritoryId } from "./game/types";
import { LABELS, STATE_PATHS, VIEW_BOX } from "./ui/brasil-svg";
import { animateDice, dieHtml, ROLL_MS } from "./ui/dice";
import {
  fullscreenSupported,
  isFullscreen,
  onFullscreenChange,
  toggleFullscreen,
} from "./ui/fullscreen";
import { pawnSvg, reserveHtml } from "./ui/pieces";

const map = BRASIL_MAP;
const COLORS = ["#d63c31", "#2f6fd6", "#1f9a52", "#8e44ad"];
const CREDITS = `Mapa: <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noopener">svg-maps</a> (CC BY 4.0)`;

/**
 * Lugares à mesa: cada jogador fica num canto do tablet.
 * Com 2 jogadores, eles ficam frente a frente (cantos opostos).
 * Os de cima veem o painel virado para eles (rotação de 180°).
 */
type Seat = "bl" | "tr" | "br" | "tl";
const SEATS: Seat[] = ["bl", "tr", "br", "tl"];

interface LastBattle {
  from: TerritoryId;
  to: TerritoryId;
  attacker: PlayerId;
  defender: PlayerId;
  battle: BattleResult;
  naval: boolean;
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
let rolling = false;
let selected: TerritoryId | null = null;
let target: TerritoryId | null = null;
let lastBattle: LastBattle | null = null;
let menuOpen = false;
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
const sigla = (id: TerritoryId) => id.toUpperCase();
const stateName = (id: TerritoryId) => getTerritory(map, id).name;
const playerById = (game: GameState, id: string) => game.players.find((p) => p.id === id)!;
const nameOf = (p: Player) => escapeHtml(p.name);

function addLog(message: string) {
  if (deferredLog) {
    deferredLog.push(message);
    return;
  }
  log.unshift(message);
  if (log.length > 80) log.pop();
}

/** Aplica uma jogada com dados: anima a rolagem e só depois mostra o resultado. */
function withDiceRoll(update: () => void) {
  const before = state;
  const id = gameId;
  const messages: string[] = [];
  deferredLog = messages;
  update();
  deferredLog = null;
  frozen = before;
  rolling = true;
  render();
  setTimeout(() => {
    if (id !== gameId) return;
    rolling = false;
    frozen = null;
    messages.forEach(addLog);
    render();
  }, ROLL_MS);
}

function resetToSetup() {
  gameId++;
  rolling = false;
  frozen = null;
  screen = "players";
  state = null;
  selected = null;
  target = null;
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
        <p class="muted">Cada jogador fica num canto do tablet. Os 27 estados serão sorteados e,
          depois, os dados decidem quem começa.</p>
        <button id="deal" class="primary">Sortear os estados 🎲</button>
        <p class="credits">${CREDITS}</p>
      </section>
      ${toolbar()}
    </div>`;
}

// ---- ações no mapa ----
function onTerritoryClick(id: TerritoryId) {
  if (!state || rolling) return;
  const owner = state.territories[id]?.owner;
  const me = currentPlayer(state).id;
  try {
    switch (state.phase) {
      case "placement":
      case "reinforce":
        state = placeArmies(state, map, id, 1);
        break;
      case "attack":
        if (owner === me) {
          target = null;
          if (selected === id) selected = null;
          else if (state.territories[id]!.armies > 1) selected = id;
          else addLog("⚠ Para atacar, o estado precisa de pelo menos 2 soldados");
        } else if (selected && canAttack(state, map, selected, id)) {
          target = target === id ? null : id;
        }
        break;
      case "fortify":
        if (owner !== me) break;
        if (selected && selected !== id && getTerritory(map, selected).neighbors.includes(id)) {
          state = fortify(state, map, selected, id, 1);
          if (movableArmies(state, selected) === 0) selected = null;
        } else {
          selected = selected === id ? null : id;
        }
        break;
      default:
        break;
    }
  } catch (error) {
    addLog(`⚠ ${(error as Error).message}`);
  }
  render();
}

function doAttack(soldiers: number) {
  if (!state || !selected || !target) return;
  const game = state;
  const from = selected;
  const to = target;
  const attacker = currentPlayer(game);
  const defender = playerById(game, game.territories[to]!.owner);
  withDiceRoll(() => {
    const result = attack(game, map, from, to, Math.random, soldiers);
    state = result.state;
    lastBattle = {
      from,
      to,
      attacker: attacker.id,
      defender: defender.id,
      battle: result.battle,
      naval: result.naval,
      conquered: result.conquered,
    };
    const { attackerLosses, defenderLosses } = result.battle;
    addLog(
      `${nameOf(attacker)}: ${sigla(from)} ${result.naval ? "⚓" : "⚔"} ${sigla(to)} com ${soldiers} — ataque perdeu ${attackerLosses}, defesa perdeu ${defenderLosses}` +
        (result.conquered ? ` · ${stateName(to)} conquistado!` : ""),
    );
    if (result.eliminated) {
      addLog(`☠ ${nameOf(defender)} foi eliminado por ${nameOf(attacker)}!`);
    }
    // Mantém a seleção para atacar de novo, se ainda der.
    const canContinue = state.territories[from]!.armies > 1;
    if (result.conquered || !canContinue) target = null;
    if (!canContinue) selected = null;
  });
}

function rollOrder(players: string[]) {
  withDiceRoll(() => {
    for (const id of players) state = rollForOrder(state!, map, id);
    if (state!.phase !== "order") {
      addLog(`Ordem de jogada: ${state!.players.map(nameOf).join(" → ")}`);
    }
  });
}

// ---- mapa ----
function renderBoard(game: GameState): string {
  const targets = new Map<TerritoryId, number>();
  if (selected && !target && game.phase === "attack") {
    for (const t of map.territories) {
      if (canAttack(game, map, selected, t.id)) {
        targets.set(t.id, attackPenalty(map, selected, t.id)!);
      }
    }
  }
  const fortifyTargets = new Set<TerritoryId>();
  if (selected && game.phase === "fortify" && movableArmies(game, selected) > 0) {
    for (const n of getTerritory(map, selected).neighbors) {
      if (game.territories[n]?.owner === currentPlayer(game).id) fortifyTargets.add(n);
    }
  }
  const battle = rolling && lastBattle ? lastBattle : null;
  const placing = game.phase === "placement" || game.phase === "reinforce";
  const me = currentPlayer(game).id;

  const states = map.territories
    .map((t) => {
      const ts = game.territories[t.id]!;
      const classes = ["state"];
      if (selected === t.id || battle?.from === t.id) classes.push("selected");
      if (target === t.id || battle?.to === t.id) classes.push("defending");
      if (targets.has(t.id)) classes.push(targets.get(t.id)! > 0 ? "target-naval" : "target");
      if (fortifyTargets.has(t.id)) classes.push("target");
      if (placing && ts.owner !== me) classes.push("dim");
      return `<path class="${classes.join(" ")}" data-id="${t.id}" d="${STATE_PATHS[t.id]}" fill="${playerById(game, ts.owner).color}"><title>${t.name}</title></path>`;
    })
    .join("");

  const labels = map.territories
    .map((t) => {
      const { x, y, anchor } = LABELS[t.id]!;
      const ts = game.territories[t.id]!;
      const penalty = targets.get(t.id);
      const leader = anchor
        ? `<line class="leader" x1="${anchor.x}" y1="${anchor.y}" x2="${x}" y2="${y}" /><circle class="anchor" cx="${anchor.x}" cy="${anchor.y}" r="2" />`
        : "";
      const penaltyTag = penalty
        ? `<text class="penalty" x="${x + 15}" y="${y + 4}">−${penalty}</text>`
        : "";
      return `
        <g class="label" data-id="${t.id}">
          <circle class="hit" cx="${x}" cy="${y + 6}" r="20" />
          ${leader}
          <circle class="badge" cx="${x}" cy="${y}" r="13" fill="${playerById(game, ts.owner).color}" />
          <text class="armies" x="${x}" y="${y + 4.5}">${ts.armies}</text>
          <text class="sigla" x="${x}" y="${y + 24}">${sigla(t.id)}</text>
          ${penaltyTag}
        </g>`;
    })
    .join("");

  return `<svg class="board" viewBox="${VIEW_BOX}" role="img" aria-label="Mapa do Brasil">${states}${labels}</svg>`;
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

function seatDice(game: GameState, player: Player): string {
  // Na decisão da ordem (e na rodada inicial, para lembrar), cada um vê o próprio dado.
  if (game.phase === "order" || game.phase === "placement") {
    const rolls = state!.orderRolls[player.id] ?? [];
    const before = frozen?.orderRolls[player.id]?.length ?? rolls.length;
    return rolls
      .map((v, i) =>
        dieHtml(v, "neutral", {
          rolling: rolling && game.phase === "order" && i >= before,
          title: i ? "desempate" : "",
        }),
      )
      .join("");
  }
  if (!lastBattle) return "";
  const { battle, attacker, defender } = lastBattle;
  const pairs = Math.min(battle.attackRolls.length, battle.defenseRolls.length);
  const attackWon = (i: number) => battle.effectiveAttackRolls[i]! > battle.defenseRolls[i]!;
  if (player.id === attacker) {
    return battle.attackRolls
      .map((v, i) => {
        const eff = battle.effectiveAttackRolls[i]!;
        const die = dieHtml(eff, "attack", { rolling, lost: i < pairs && !attackWon(i) });
        const note = eff !== v && !rolling ? `<small>${v}−${battle.attackPenalty}</small>` : "";
        return `<span class="die-slot">${die}${note}</span>`;
      })
      .join("");
  }
  if (player.id === defender) {
    return battle.defenseRolls
      .map(
        (v, i) =>
          `<span class="die-slot">${dieHtml(v, "defense", { rolling, lost: i < pairs && attackWon(i) })}</span>`,
      )
      .join("");
  }
  return "";
}

function seatBattleNote(player: Player): string {
  if (!lastBattle || rolling) return "";
  const { battle, attacker, defender, conquered, to } = lastBattle;
  if (player.id === attacker) {
    return `<p class="note">Ataque perdeu ${battle.attackerLosses}${conquered ? ` · conquistou ${stateName(to)}!` : ""}</p>`;
  }
  if (player.id === defender) {
    return `<p class="note">Defesa perdeu ${battle.defenderLosses}${conquered ? ` · perdeu ${stateName(to)}` : ""}</p>`;
  }
  return "";
}

function seatActions(game: GameState, player: Player): string {
  if (game.phase === "order") {
    const pending = playersToRollForOrder(game);
    if (rolling) return "";
    if (pending.includes(player.id)) {
      const tie = (game.orderRolls[player.id]?.length ?? 0) > 0;
      return `${tie ? `<p class="note warn">Empate! Role de novo.</p>` : `<p class="note">Role o dado: quem tirar mais começa.</p>`}
        <button class="primary" data-roll="${player.id}">🎲 Rolar dado</button>`;
    }
    return `<p class="note">Aguardando os outros jogadores…</p>`;
  }
  if (game.phase === "finished") {
    return game.winner === player.id
      ? `<p class="note big">🏆 Você venceu!</p><button id="new-game" class="primary">Nova partida</button>`
      : "";
  }
  if (currentPlayer(game).id !== player.id || rolling) return "";

  switch (game.phase) {
    case "placement":
      return `<p class="note"><b>Rodada inicial:</b> coloque seus ${INITIAL_ARMIES} soldados tocando nos seus estados (pode dividir entre vários).</p>`;
    case "reinforce":
      return `<p class="note"><b>Reforço:</b> coloque ${game.pendingReinforcements} soldado(s) nos seus estados.</p>`;
    case "attack": {
      let step: string;
      if (!selected) {
        step = `<p class="note"><b>Ataque:</b> toque no estado de onde vai partir o ataque.</p>`;
      } else if (!target) {
        step = `<p class="note">De <b>${stateName(selected)}</b>: agora toque no estado que vai receber o ataque.</p>`;
      } else {
        const max = maxAttackers(game, selected);
        const buttons = Array.from(
          { length: max },
          (_, i) =>
            `<button class="chip attack-count" data-attack="${i + 1}">${i + 1}<span>${pawnSvg(player.color).repeat(i + 1)}</span></button>`,
        ).join("");
        const penalty = attackPenalty(map, selected, target)!;
        step = `<p class="note"><b>${stateName(selected)}</b> → <b>${stateName(target)}</b>${penalty ? ` ⚓ −${penalty} nos dados` : ""}<br/>Atacar com quantos soldados?</p>
          <div class="chips">${buttons}</div>`;
      }
      return `${step}<button id="end-attack">Encerrar ataques</button>`;
    }
    case "fortify":
      return `<p class="note"><b>Remanejar</b> (opcional): toque num estado seu e depois num vizinho seu para mover 1 soldado.</p>
        <button id="end-turn" class="primary">Passar a vez</button>`;
    default:
      return "";
  }
}

function renderSeat(game: GameState, seat: Seat): string {
  const player = game.players.find((p) => seats[p.id] === seat);
  if (!player) return `<section class="seat seat-${seat} empty"></section>`;
  const owned = territoriesOf(game, player.id);
  const armies = owned.reduce((sum, id) => sum + game.territories[id]!.armies, 0);
  const isTurn =
    game.phase !== "order" && game.phase !== "finished" && currentPlayer(game).id === player.id;
  const out = owned.length === 0;
  const place =
    game.phase !== "order" ? `<span class="place">${game.players.indexOf(player) + 1}º</span>` : "";
  const classes = ["seat", `seat-${seat}`];
  if (isTurn || (game.phase === "finished" && game.winner === player.id)) classes.push("current");
  if (out) classes.push("out");

  return `
    <section class="${classes.join(" ")}" style="--pc:${player.color}">
      <div class="seat-head">
        ${place}<span class="swatch"></span><b class="seat-name">${nameOf(player)}</b>
        <span class="muted">${out ? "eliminado" : `${owned.length} estados · ${armies} soldados`}</span>
      </div>
      <div class="seat-body">
        <div class="seat-dice">${seatDice(game, player)}</div>
        ${seatBattleNote(player)}
        <div class="seat-actions">${seatActions(game, player)}</div>
      </div>
      <div class="reserve">${reserveHtml(reserveFor(game, player), player.color)}</div>
    </section>`;
}

// ---- centro: status, barra de ferramentas e menu ----
function statusText(game: GameState): string {
  const who = nameOf(currentPlayer(game));
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
      return `🏆 ${nameOf(playerById(game, game.winner!))} venceu!`;
  }
}

function toolbar(): string {
  const fs = fullscreenSupported()
    ? `<button id="fullscreen" class="tool" title="Tela cheia">${isFullscreen() ? "🗗" : "⛶"}</button>`
    : "";
  const menu = screen === "game" ? `<button id="menu" class="tool" title="Menu">☰</button>` : "";
  return `<div class="toolbar">${fs}${menu}</div>`;
}

function renderMenu(): string {
  if (!menuOpen) return "";
  const regions = map.regions
    .map((r) => `<li><span>${r.name}</span><b>+${r.bonus}</b></li>`)
    .join("");
  return `
    <div class="overlay" id="overlay">
      <section class="card menu">
        <h2>Regras rápidas</h2>
        <ol class="rules">
          <li>Os estados são sorteados; os dados decidem a ordem.</li>
          <li>Rodada inicial: cada um coloca ${INITIAL_ARMIES} soldados.</li>
          <li>Ataque: escolha a origem, o alvo e com quantos soldados (até 3). O maior dado vence; empate é da defesa.</li>
          <li>Por mar ⚓: litoral ataca litoral, com penalidade nos dados.</li>
          <li>A partir da rodada 2: 1 soldado a cada 2 estados + bônus de região.</li>
          <li>Vence o último jogador vivo.</li>
        </ol>
        <h3>Bônus por região</h3>
        <ul class="regions">${regions}</ul>
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
    addLog("Os 27 estados foram sorteados entre os jogadores.");
    render();
  });

  // jogo
  on("[data-roll]", (el) => rollOrder([el.dataset.roll!]));
  on("[data-id]", (el) => onTerritoryClick(el.dataset.id!));
  on("[data-attack]", (el) => doAttack(Number(el.dataset.attack)));
  on("#end-attack", () => {
    selected = null;
    target = null;
    state = endAttackPhase(state!);
    render();
  });
  on("#end-turn", () => {
    selected = null;
    target = null;
    lastBattle = null;
    state = endTurn(state!, map);
    render();
  });
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
render();
