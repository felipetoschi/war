import "./style.css";
import { BRASIL_MAP } from "./game/brasil";
import type { BattleResult } from "./game/dice";
import { getTerritory } from "./game/map";
import {
  alivePlayers,
  attack,
  attackPenalty,
  canAttack,
  createGame,
  currentPlayer,
  endAttackPhase,
  endTurn,
  fortify,
  MAX_PLAYERS,
  MIN_PLAYERS,
  movableArmies,
  moveAfterConquest,
  placeArmies,
  playersToRollForOrder,
  rollForOrder,
  territoriesOf,
} from "./game/rules";
import type { GameState, Player, TerritoryId } from "./game/types";
import { LABELS, STATE_PATHS, VIEW_BOX } from "./ui/brasil-svg";
import { animateDice, dieHtml, ROLL_MS } from "./ui/dice";
import {
  fullscreenSupported,
  isFullscreen,
  onFullscreenChange,
  toggleFullscreen,
} from "./ui/fullscreen";

const map = BRASIL_MAP;
const COLORS = ["#d63c31", "#2f6fd6", "#1f9a52", "#e3b021", "#8e44ad"];
const CREDITS = `<p class="credits">Mapa: <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noopener">svg-maps</a> (CC BY 4.0)</p>`;

interface LastBattle {
  from: TerritoryId;
  to: TerritoryId;
  battle: BattleResult;
  naval: boolean;
}

// ---- estado da interface ----
let screen: "players" | "game" = "players";
let playerCount = 3;
const names: string[] = Array.from({ length: MAX_PLAYERS }, () => "");
let state: GameState | null = null;
/** Enquanto os dados rolam, o mapa e o painel mostram o estado de antes da rolagem. */
let frozen: GameState | null = null;
let rolling = false;
let selected: TerritoryId | null = null;
let placeAmount: number | "all" = 1;
let lastBattle: LastBattle | null = null;
const log: string[] = [];

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
const swatch = (p: Player) => `<span class="swatch" style="background:${p.color}"></span>`;
const playerTag = (p: Player) => `${swatch(p)}<b>${escapeHtml(p.name)}</b>`;

/** Mensagens geradas durante uma rolagem esperam os dados pararem para aparecer. */
let deferredLog: string[] | null = null;
/** Muda a cada nova partida, para descartar rolagens da partida anterior. */
let gameId = 0;

function addLog(message: string) {
  if (deferredLog) {
    deferredLog.push(message);
    return;
  }
  log.unshift(message);
  if (log.length > 60) log.pop();
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
  lastBattle = null;
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
        <span class="swatch" style="background:${COLORS[i]}"></span>
        <input data-name="${i}" maxlength="16" placeholder="Jogador ${i + 1}" value="${escapeHtml(names[i]!)}" />
      </label>`,
  ).join("");

  return `
    <div class="center">
      <section class="card setup">
        <h2>1. Quantos jogadores?</h2>
        <div class="chips">${options}</div>
        <h2>2. Nome dos jogadores</h2>
        <div class="names">${inputs}</div>
        <p class="muted">Os 27 estados serão sorteados entre os jogadores. Depois, os dados decidem quem começa.</p>
        <button id="deal" class="primary">Sortear os estados 🎲</button>
      </section>
    </div>
    ${CREDITS}`;
}

// ---- jogo: ações ----
function onTerritoryClick(id: TerritoryId) {
  if (!state || rolling) return;
  const owner = state.territories[id]?.owner;
  const me = currentPlayer(state).id;
  try {
    switch (state.phase) {
      case "placement":
      case "reinforce": {
        const amount =
          placeAmount === "all"
            ? state.pendingReinforcements
            : Math.min(placeAmount, state.pendingReinforcements);
        state = placeArmies(state, map, id, amount);
        break;
      }
      case "attack":
        if (state.pendingMove) break;
        if (owner === me) {
          if (selected === id) selected = null;
          else if (state.territories[id]!.armies > 1) selected = id;
          else addLog("⚠ Para atacar, o estado precisa de pelo menos 2 soldados");
        } else if (selected && canAttack(state, map, selected, id)) {
          doAttack(selected, id);
          return;
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

function doAttack(from: TerritoryId, to: TerritoryId) {
  const game = state!;
  const attacker = currentPlayer(game);
  const defender = playerById(game, game.territories[to]!.owner);
  withDiceRoll(() => {
    const result = attack(game, map, from, to);
    state = result.state;
    lastBattle = { from, to, battle: result.battle, naval: result.naval };
    const { attackerLosses, defenderLosses } = result.battle;
    addLog(
      `${sigla(from)} ${result.naval ? "⚓" : "⚔"} ${sigla(to)}: ataque perdeu ${attackerLosses}, defesa perdeu ${defenderLosses}` +
        (result.conquered ? ` — ${stateName(to)} conquistado!` : ""),
    );
    if (result.eliminated) {
      addLog(`☠ ${escapeHtml(defender.name)} foi eliminado por ${escapeHtml(attacker.name)}!`);
    }
    if (result.conquered || state.territories[from]!.armies < 2) selected = null;
  });
}

function rollOrder(players: string[]) {
  withDiceRoll(() => {
    for (const id of players) state = rollForOrder(state!, map, id);
    if (state!.phase !== "order") {
      addLog(`Ordem de jogada: ${state!.players.map((p) => escapeHtml(p.name)).join(" → ")}`);
    }
  });
}

// ---- jogo: mapa ----
function renderBoard(game: GameState): string {
  const targets = new Map<TerritoryId, number>();
  if (selected && game.phase === "attack") {
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

  const states = map.territories
    .map((t) => {
      const ts = game.territories[t.id]!;
      const classes = ["state"];
      if (selected === t.id || battle?.from === t.id) classes.push("selected");
      if (battle?.to === t.id) classes.push("defending");
      if (targets.has(t.id)) classes.push(targets.get(t.id)! > 0 ? "target-naval" : "target");
      if (fortifyTargets.has(t.id)) classes.push("target");
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

// ---- jogo: lateral esquerda (vez, ações e dados) ----
function renderOrderTray(game: GameState): string {
  const pending = playersToRollForOrder(game);
  const rows = game.players
    .map((p) => {
      const rolls = state!.orderRolls[p.id] ?? [];
      const latest = frozen?.orderRolls[p.id]?.length ?? 0;
      const dice = rolls
        .map((v, i) =>
          dieHtml(v, "neutral", {
            size: "md",
            rolling: rolling && i >= latest,
            title: i > 0 ? "desempate" : "",
          }),
        )
        .join("");
      const button =
        !rolling && pending.includes(p.id)
          ? `<button class="roll" data-roll="${p.id}">🎲 Rolar</button>`
          : "";
      return `<li><span class="who">${playerTag(p)}</span><span class="dice">${dice}</span>${button}</li>`;
    })
    .join("");
  const tie = !rolling && pending.some((id) => (game.orderRolls[id]?.length ?? 0) > 0);
  return `
    <h2>Quem começa?</h2>
    <p>Os estados já foram sorteados. Agora cada jogador rola um dado: <b>quem tirar mais começa</b>.</p>
    ${tie ? `<p class="warn">Empate! Os empatados rolam de novo.</p>` : ""}
    <ul class="order">${rows}</ul>
    ${rolling ? `<p class="muted">Rolando…</p>` : `<button id="roll-all" class="primary">🎲 Rolar para todos</button>`}`;
}

function renderBattleTray(): string {
  if (!lastBattle) {
    return `<div class="tray empty"><p class="muted">Os dados do ataque e da defesa aparecem aqui.</p></div>`;
  }
  const { from, to, battle, naval } = lastBattle;
  const pairs = Math.min(battle.attackRolls.length, battle.defenseRolls.length);
  const attackWon = (i: number) => battle.effectiveAttackRolls[i]! > battle.defenseRolls[i]!;
  const attackDice = battle.attackRolls
    .map((v, i) => {
      const eff = battle.effectiveAttackRolls[i]!;
      const die = dieHtml(eff, "attack", {
        rolling,
        lost: i < pairs && !attackWon(i),
        title: eff !== v ? `tirou ${v}, −${battle.attackPenalty} por mar` : "",
      });
      const note = eff !== v && !rolling ? `<small>${v}−${battle.attackPenalty}</small>` : "";
      return `<span class="die-slot">${die}${note}</span>`;
    })
    .join("");
  const defenseDice = battle.defenseRolls
    .map(
      (v, i) =>
        `<span class="die-slot">${dieHtml(v, "defense", { rolling, lost: i < pairs && attackWon(i) })}</span>`,
    )
    .join("");
  const summary = rolling
    ? "Rolando…"
    : `Ataque perdeu ${battle.attackerLosses} · Defesa perdeu ${battle.defenderLosses}`;
  return `
    <div class="tray">
      <div class="tray-title">${stateName(from)} ${naval ? "⚓" : "⚔"} ${stateName(to)}
        ${naval ? `<span class="muted">(−${battle.attackPenalty} em cada dado do ataque)</span>` : ""}</div>
      <div class="tray-row"><span class="tray-label">Ataque</span>${attackDice}</div>
      <div class="tray-row"><span class="tray-label">Defesa</span>${defenseDice}</div>
      <div class="tray-summary">${summary}</div>
    </div>`;
}

function renderPhase(game: GameState): string {
  const who = playerTag(currentPlayer(game));
  const amountChips = () => {
    const options: (number | "all")[] = [1, 3, "all"];
    return `<div class="chips small">Por toque:
      ${options
        .map(
          (o) =>
            `<button class="chip ${o === placeAmount ? "active" : ""}" data-amount="${o}">${o === "all" ? "Todos" : o}</button>`,
        )
        .join("")}</div>`;
  };

  switch (game.phase) {
    case "order":
      return renderOrderTray(game);
    case "placement":
      return `
        <h2>Rodada inicial</h2>
        <p>${who}, posicione <b>${game.pendingReinforcements}</b> soldado(s) nos seus estados.</p>
        <p class="muted">Metade dos seus estados (mínimo 3) + bônus de região. Nesta rodada ninguém ataca.</p>
        ${amountChips()}`;
    case "reinforce":
      return `
        <h2>Rodada ${game.round} · Reforço</h2>
        <p>${who}, posicione <b>${game.pendingReinforcements}</b> soldado(s) nos seus estados.</p>
        ${amountChips()}`;
    case "attack": {
      if (game.pendingMove) {
        const { to, max } = game.pendingMove;
        const buttons = Array.from(
          { length: max },
          (_, i) => `<button class="chip" data-move="${i + 1}">${i + 1}</button>`,
        ).join("");
        return `
          <h2>Conquista!</h2>
          <p>${who}, quantos soldados mover para <b>${stateName(to)}</b>?</p>
          <div class="chips">${buttons}</div>`;
      }
      const info = selected
        ? `<p>Atacando de <b>${stateName(selected)}</b> (${game.territories[selected]!.armies} soldados). Toque num inimigo destacado.</p>`
        : `<p class="muted">Toque num estado seu com 2+ soldados e depois no inimigo. Por terra: vizinhos. Por mar ⚓: litoral com litoral, com penalidade.</p>`;
      return `
        <h2>Rodada ${game.round} · Ataque</h2>
        <p>Vez de ${who}.</p>
        ${info}
        <button id="end-attack" class="primary" ${rolling ? "disabled" : ""}>Encerrar ataques</button>`;
    }
    case "fortify": {
      const info = selected
        ? `<p>Remanejando de <b>${stateName(selected)}</b> (${movableArmies(game, selected)} disponível). Toque num vizinho seu.</p>`
        : `<p class="muted">Toque num estado seu e depois num vizinho seu para mover 1 soldado. Soldado remanejado não se move de novo neste turno.</p>`;
      return `
        <h2>Rodada ${game.round} · Remanejamento</h2>
        <p>Vez de ${who}.</p>
        ${info}
        <button id="end-turn" class="primary">Passar a vez</button>`;
    }
    case "finished":
      return `
        <h2>🏆 Fim de jogo</h2>
        <p>${playerTag(playerById(game, game.winner!))} é o último jogador vivo e venceu!</p>
        <button id="new-game" class="primary">Nova partida</button>`;
  }
}

function renderLeft(game: GameState): string {
  const showBattle = game.phase === "attack" || (game.phase === "finished" && lastBattle);
  return `
    <aside class="side side-left">
      <section class="box phase">${renderPhase(game)}</section>
      ${showBattle ? `<section class="box">${renderBattleTray()}</section>` : ""}
    </aside>`;
}

// ---- jogo: lateral direita (jogadores, regiões, histórico) ----
function renderRight(game: GameState): string {
  const alive = new Set(alivePlayers(game).map((p) => p.id));
  const ordered = game.phase !== "order";
  const current = currentPlayer(game).id;
  const players = game.players
    .map((p, i) => {
      const owned = territoriesOf(game, p.id);
      const armies = owned.reduce((sum, id) => sum + game.territories[id]!.armies, 0);
      const classes = [
        ordered && p.id === current && game.phase !== "finished" ? "current" : "",
        !alive.has(p.id) ? "out" : "",
      ].join(" ");
      return `<li class="${classes}">${ordered ? `<span class="place">${i + 1}º</span>` : ""}${playerTag(p)}
        <span class="muted">${owned.length} estados · ${armies} soldados</span></li>`;
    })
    .join("");
  const regions = map.regions
    .map((r) => `<li><span>${r.name}</span><b>+${r.bonus}</b></li>`)
    .join("");

  return `
    <aside class="side side-right">
      <section class="box">
        <h3>Jogadores ${ordered ? `<span class="muted">(ordem de jogada)</span>` : ""}</h3>
        <ul class="players">${players}</ul>
        <p class="muted">🎯 Objetivo: ser o último jogador vivo.</p>
      </section>
      <section class="box">
        <h3>Bônus por região</h3>
        <ul class="regions">${regions}</ul>
        <h3>Histórico</h3>
        <ul class="log">${log.map((l) => `<li>${l}</li>`).join("")}</ul>
        <button id="quit" class="link">Nova partida</button>
        ${CREDITS}
      </section>
    </aside>`;
}

// ---- render principal ----
function renderHeader(): string {
  const fsButton = fullscreenSupported()
    ? `<button id="fullscreen" class="icon">${isFullscreen() ? "🗗 Sair da tela cheia" : "⛶ Tela cheia"}</button>`
    : "";
  return `<header class="topbar"><h1>Domínio · Brasil</h1>${fsButton}</header>`;
}

function render() {
  let body: string;
  if (screen === "players" || !state) {
    body = renderPlayersScreen();
  } else {
    // Enquanto os dados rolam, mapa e painéis mostram o estado anterior (suspense!).
    const view = frozen ?? state;
    body = `
      <div class="layout">
        ${renderLeft(view)}
        <main class="board-wrap">${renderBoard(view)}</main>
        ${renderRight(view)}
      </div>`;
  }
  app.className = screen === "game" ? "in-game" : "";
  app.innerHTML = renderHeader() + body;
  bindEvents();
  animateDice(app);
}

function on(selector: string, handler: (el: HTMLElement) => void) {
  app
    .querySelectorAll<HTMLElement>(selector)
    .forEach((el) => el.addEventListener("click", () => handler(el)));
}

function bindEvents() {
  on("#fullscreen", () => void toggleFullscreen());

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
    state = createGame(map, players);
    screen = "game";
    addLog("Os 27 estados foram sorteados entre os jogadores.");
    render();
  });

  // ordem de jogada
  on("[data-roll]", (el) => rollOrder([el.dataset.roll!]));
  on("#roll-all", () => rollOrder(playersToRollForOrder(state!)));

  // jogo
  on("[data-id]", (el) => onTerritoryClick(el.dataset.id!));
  on("[data-amount]", (el) => {
    placeAmount = el.dataset.amount === "all" ? "all" : Number(el.dataset.amount);
    render();
  });
  on("[data-move]", (el) => {
    state = moveAfterConquest(state!, Number(el.dataset.move));
    render();
  });
  on("#end-attack", () => {
    selected = null;
    state = endAttackPhase(state!);
    render();
  });
  on("#end-turn", () => {
    selected = null;
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
