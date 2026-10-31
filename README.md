# Domínio · Brasil

Jogo de estratégia por turnos, de conquista de territórios, que roda no navegador,
jogado no **mapa do Brasil** — 26 estados + Distrito Federal, agrupados nas 5 regiões.

- De **2 a 5 jogadores** no mesmo aparelho.
- Os 27 estados são **sorteados** entre os jogadores; depois, **dados virtuais** decidem quem começa.
- Dados com pontinhos, estilo bozó, que chacoalham na tela antes do resultado.
- Combate no estilo do War clássico: até 3 dados de ataque contra até 3 de defesa; empate favorece a defesa.
- **Ataque naval ⚓:** estados do litoral atacam outros do litoral, mesmo sem fronteira,
  com penalidade nos dados que aumenta com a distância (ex.: RN → RS tem −3 em cada dado).
- **Objetivo:** ser o último jogador vivo.
- Botão de **tela cheia**.
- Interface pensada para **tablet** (deitado ou em pé). O layout para celular vem depois.

📖 As regras completas, e o que ainda está em aberto, estão em [docs/REGRAS.md](docs/REGRAS.md).

## Desenvolvimento

Requer Node.js 20+ (veja `.nvmrc`).

```bash
npm install
npm run dev        # servidor local em http://localhost:5173
npm test           # testes das regras (Vitest)
npm run typecheck  # checagem de tipos
npm run format     # formata o código com Prettier
npm run build      # build de produção em dist/
```

### Estrutura

```
src/
  game/          # motor do jogo: lógica pura, sem DOM, totalmente testada
    types.ts       # tipos do estado da partida
    brasil.ts      # estados, fronteiras, litoral e regiões
    map.ts         # consultas ao mapa (vizinhança, distância no litoral)
    dice.ts        # rolagem e comparação de dados (com penalidade)
    order.ts       # dados para decidir a ordem de jogada (com desempate)
    rules.ts       # regras: sorteio dos estados, ordem de jogada, reforço, ataque (terra/mar), conquista,
                   # remanejamento, turnos, vitória
  ui/
    brasil-svg.ts  # contornos dos estados e posição dos marcadores
    dice.ts        # dados com pontinhos e animação de rolagem
    fullscreen.ts  # botão de tela cheia
  main.ts          # interface (mapa em SVG)
  style.css
```

O motor de regras é composto por funções puras que recebem um estado e devolvem um novo estado.
A aleatoriedade é injetada (`rng`), o que torna os testes determinísticos e facilita, no futuro,
partidas online e jogadores controlados por IA.

## GitHub

- **CI** (`.github/workflows/ci.yml`): formatação, tipos, testes e build em todo push na `main` e em PRs.
- **Deploy** (`.github/workflows/deploy.yml`): publica o jogo no GitHub Pages a cada push na `main`.
- **Dependabot**: PRs semanais de dependências npm e mensais das Actions, sempre contra a `main`.
- **CODEOWNERS**: @felipetoschi é o revisor padrão.
- Templates de issue (bug / ideia) e de pull request.

### Configuração manual do repositório

Ajustes que só o dono do repositório faz em _Settings_:

1. **General → Default branch:** `main`.
2. **Pages → Build and deployment → Source:** `GitHub Actions`.
   O jogo fica em https://felipetoschi.github.io/war/.
3. **Rules → Rulesets** (opcional): proteger a `main` exigindo PR e o check `check` do CI.
4. **General → About** (engrenagem na página inicial): descrição, site e tópicos.

## Próximos passos

- [ ] Decidir os pontos em aberto de [docs/REGRAS.md](docs/REGRAS.md)
- [ ] Jogadores controlados por IA
- [ ] Salvar/carregar partida
- [ ] Multijogador online

## Créditos

Contornos dos estados: [svg-maps](https://github.com/VictorCazanave/svg-maps), de Victor Cazanave,
sob licença [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
