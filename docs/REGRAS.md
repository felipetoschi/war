# Regras do Domínio · Brasil

Documento de design do jogo: o que já está decidido e o que ainda está em aberto.
Valores marcados com ⚙️ são configuráveis no código (`src/game/rules.ts` e `src/game/brasil.ts`).

## Regras do jogo

1. **Jogadores:** escolhe-se de **2 a 4 jogadores** e o nome de cada um.
2. **Sorteio dos territórios:** os **26 territórios** — os estados, com **Goiás e Distrito Federal
   juntos como "Goiás/DF"** — são **sorteados** entre os jogadores, o mais igualmente possível,
   com **1 soldado** em cada.

   | Jogadores | Territórios por jogador |
   | --------- | ----------------------- |
   | 2         | 13, 13                  |
   | 3         | 9, 9, 8                 |
   | 4         | 7, 7, 6, 6              |

3. **Ordem de jogo:** cada jogador rola um dado; quem tirar mais começa, e a ordem segue do maior
   para o menor. Empatados rolam de novo entre si. **Toda a partida segue essa ordem.**
4. **Rodada inicial:** **um por vez, na ordem sorteada**, cada jogador coloca **3 soldados** ⚙️
   nos seus estados — todos num só estado ou divididos entre vários. Ninguém ataca nesta rodada.
   **A rodada 1 só começa depois que todos tiverem colocado**, com o primeiro da ordem.
5. **Ataque:** começa pelo primeiro da ordem. O jogador:
   1. toca no estado **de onde parte o ataque** (precisa ter 2 ou mais soldados);
   2. toca no estado **que vai receber o ataque** — **só estados que fazem divisa**;
   3. escolhe **com quantos soldados ataca**: de 1 a 3, sempre deixando 1 soldado na origem.

   Pode atacar quantas vezes quiser no seu turno e depois encerra os ataques — o jogo pede
   **confirmação** ("Sim, encerrar" ou "Continuar atacando") para evitar toque sem querer.

6. **Dados manuais:** cada jogador rola o seu dado no seu lado da mesa.
   1. O **atacante** toca em **"Rolar ataque"** no seu canto: 1 dado **vermelho** por soldado.
   2. Depois, o **defensor** toca em **"Rolar defesa"** no canto dele: 1 dado **amarelo** por
      soldado que tem no estado atacado, até 3.
   3. Os dados são comparados do maior para o menor, em pares: **o maior vence e o empate é da
      defesa**. Quem perde o par perde 1 soldado.

   Antes de rolar o ataque, o atacante ainda pode desistir.

7. **Conquista:** se o estado atacado fica sem soldados, ele passa para o atacante, e os soldados
   que atacaram e sobreviveram entram nele. Quem conquistar pelo menos um estado no turno ganha
   **uma carta** no fim do turno (veja abaixo).
8. **Remanejamento** (opcional): depois dos ataques, o jogador pode mover soldados entre estados
   seus que fazem fronteira:
   - no máximo **3 soldados** ⚙️ de um estado **para cada vizinho**, por turno;
   - nenhum estado fica vazio: sempre fica **pelo menos 1 soldado**;
   - soldado remanejado não se move de novo no mesmo turno.

   Exemplo: um estado com 9 soldados pode mandar 3 para um vizinho, 3 para outro e 2 para um
   terceiro, ficando com 1.

9. **Reforço:** a partir da **rodada 2**, no começo da sua vez, o jogador ganha **1 soldado a cada
   2 estados** ⚙️ que possui — **no mínimo 3** ⚙️, mesmo com poucos estados —, mais o bônus de
   cada região que dominar inteira, e pode **trocar cartas** por mais soldados.
10. **Vitória:** vence quem, **na sua vez**, cumprir **qualquer um dos seus 2 objetivos abertos**
    (veja abaixo) — ou quem for o **último jogador vivo**. Quem perde todos os estados está fora.

### Objetivos abertos 🎯

Simples e visíveis para todos. Cada jogador tem **2 objetivos** no seu canto, com o progresso, e
vence ao cumprir **qualquer um** deles na sua vez:

1. **Um objetivo de região, sorteado** — conquistar regiões inteiras:

   | Objetivo                                     | Territórios |
   | -------------------------------------------- | ----------- |
   | Conquistar o Norte e o Sul                   | 10          |
   | Conquistar o Norte e o Centro-Oeste          | 10          |
   | Conquistar o Norte e o Sudeste               | 11          |
   | Conquistar o Nordeste e o Sul                | 12          |
   | Conquistar o Nordeste e o Centro-Oeste       | 12          |
   | Conquistar o Nordeste e o Sudeste            | 13          |
   | Conquistar o Sudeste, o Sul e o Centro-Oeste | 10          |

2. **Ter 18 territórios** ⚙️ (de 26) — igual para todos.

- O **último vivo** também vence.
- Ninguém recebe o mesmo objetivo de região de outro jogador.
- **Nada de objetivo adiantado:** no sorteio, só entram objetivos que ainda exigem **pelo menos 3
  conquistas** ⚙️.
- Como existem dois caminhos para vencer, saber o objetivo do outro vira estratégia — e não trava
  o jogo.

### Bônus por região ⚙️

As regiões aparecem no mapa com um **contorno discreto** na cor de cada uma e uma etiqueta com o
nome e o bônus; quando alguém domina a região inteira, a etiqueta fica na cor desse jogador.

| Região       | Estados                            | Qtde | Bônus |
| ------------ | ---------------------------------- | ---- | ----- |
| Norte        | AC, AM, AP, PA, RO, RR, TO         | 7    | +5    |
| Nordeste     | AL, BA, CE, MA, PB, PE, PI, RN, SE | 9    | +5    |
| Centro-Oeste | GO/DF, MS, MT                      | 3    | +3    |
| Sudeste      | ES, MG, RJ, SP                     | 4    | +3    |
| Sul          | PR, RS, SC                         | 3    | +2    |

### Cartas de troca 🃏

Como no War original, com uma diferença: **as cartas ficam visíveis para todos**, no canto de cada
jogador.

- O baralho tem **28 cartas**: uma para cada território, com um símbolo — **quadrado ■, triângulo ▲
  ou bola ●** (9, 9 e 8) — e **2 coringas ★**.
- Como no War: quem **conquistar pelo menos um estado no turno** ganha **uma carta** do monte no
  **fim do turno** — no máximo uma por turno, não importa quantas conquistas. Quando o monte
  acaba, as cartas já trocadas são embaralhadas e voltam a ser o monte.
- **Troca:** com **3 cartas de símbolos iguais** ou **3 cartas de símbolos diferentes**, o jogador
  pode trocá-las por soldados no início da sua vez (fase de reforço). O coringa vale qualquer
  símbolo.
- **Valor da troca** ⚙️: cresce a cada troca feita na partida — 4, 6, 8, 10, 12, 15, e depois
  +5 a cada troca (20, 25, 30…).
- **Bônus de estado:** se uma das cartas trocadas for de um **estado que o jogador domina**, ele
  ganha **+2 soldados nesse estado** (a carta mostra o selo "+2"). Esses 2 soldados ficam
  **obrigatoriamente nesse estado**: o jogo os coloca lá na hora da troca, e o estado fica marcado
  no mapa com um anel verde e "+2" durante o reforço. Só os soldados da troca (4, 6, 8…) vão para
  a reserva e podem ser colocados em qualquer estado do jogador.
- Com **5 cartas ou mais** ⚙️, a troca é **obrigatória** antes de posicionar os soldados.
- Quem **elimina** um jogador fica com as cartas dele.

## Configurações da mesa (tablet)

- **Mapa no centro, sem bordas**, sobre o "mar" que ocupa a tela toda. O mapa tem **tamanho fixo**:
  o maior que cabe na tela, deixando só uma faixa mínima para os cantos — ele não muda de tamanho
  durante a partida. Os cantos são compactos e, se faltar espaço, rolam por dentro.
- **Ação em destaque no mapa:** ao escolher um ataque, durante a batalha e no resultado, o estado
  atacante fica com brilho **vermelho**, o atacado pisca em **amarelo**, uma **seta** liga os dois
  e os marcadores deles crescem; o resto do mapa esmaece. No resultado aparecem os soldados
  perdidos de cada lado (−1, −2…) e, na conquista, o estado pisca na cor nova.
- **Jogadores nos 4 cantos do tablet**, como num tabuleiro físico sobre a mesa: o **1º e o 2º
  jogador embaixo** (esquerda e direita) e o **3º e o 4º em cima** (direita e esquerda). Os de cima
  veem o seu canto **virado para eles** (girado 180°).
- **Dados como se fossem físicos**, no canto de cada jogador: **vermelho ataca, amarelo defende**.
  Cada um rola o seu, no seu lado. Eles chacoalham antes de parar; os que perderam a comparação
  ficam apagados. Quem está sendo atacado tem o canto aceso em amarelo.
- **Cartas** e **objetivos** visíveis no canto de cada jogador. Os **objetivos ficam fixos na parte
  de baixo** do canto (título curto e progresso, lado a lado). As cartas aparecem no reforço (para
  trocar) ou ao espiar; fora disso, o placar mostra quantas são (🃏3).
- **Instrução no meio da tela:** o que fazer agora aparece em destaque no centro do mapa, com o
  nome e a cor de quem precisa agir, **virado para o lado dele** (girado 180° para quem está em
  cima). Ex.: "Defenda Rondônia! Role 3 dados amarelos no seu canto". A mensagem não bloqueia o
  toque no mapa.
- **Canto discreto, sem textos:** só o nome e o placar, os dados, os botões da jogada ("Rolar
  ataque", "Rolar defesa", quantos soldados, "Encerrar ataques", "Passar a vez"…) e os objetivos.
  Os soldadinhos de reserva só aparecem quando há soldados a colocar.
- **Só quem está na ação tem o canto aberto:** o jogador da vez (reforço, ataque ou
  remanejamento, ou colocando os soldados da rodada inicial) e quem está defendendo.
  Os outros cantos viram uma etiqueta com o nome, os estados e os soldados — um toque nela abre o
  canto para espiar objetivos e cartas (✕ fecha).
- **Soldadinhos como peças físicas**, na borda de cada jogador: os soldados ainda a posicionar
  ficam ali e vão saindo conforme são colocados no mapa.
- O canto do jogador da vez fica aceso na cor dele, com as instruções e os botões da jogada.
- **Cores claras:** mar azul-claro e cantos cor de papel.
- **Sons** gerados pelo próprio jogo: dados rolando, soldadinho posto, rufar ao declarar ataque,
  clarim na conquista, pancada quando a defesa segura, estrondo na eliminação, cartas, chamada de
  trompa ao passar a vez e fanfarra na vitória.
- **Música de fundo** em loop: trilhas originais de marcha militar (caixa, bumbo, tímpanos e
  metais), que se alternam a cada poucas repetições.
- Botões sobre o mapa: **🎵 música** e **🔊 efeitos** (liga/desliga, fica salvo no aparelho),
  **⛶ tela cheia** e **☰ menu** (regras, bônus, histórico e nova partida).
- O celular terá um layout próprio depois.

## Bots 🤖

Na tela inicial, cada jogador pode ser **👤 Humano** ou **🤖 Bot** — inclusive o primeiro. Com
**"Só bots"**, dá para só assistir a uma partida inteira.

- O bot joga sozinho, passo a passo, com as mesmas animações e sons: rola o dado da ordem, coloca
  soldados, troca cartas, ataca, rola os dados e remaneja.
- **Como o bot pensa** (só com o que está à vista na mesa, como um humano):
  - **soldados:** coloca na fronteira, de preferência perto das regiões do seu objetivo e de
    vizinhos fracos;
  - **cartas:** troca sempre que pode, preferindo cartas de estados seus (+2);
  - **ataque:** só ataca com vantagem clara (mais soldados atacando do que defendendo), dando
    prioridade a alvos do seu objetivo e a estados com 1 soldado; ataca com o máximo de dados;
  - **remanejamento:** leva soldados do interior para a fronteira.
- **Bot × humano:** quando o bot ataca um humano, quem rola a defesa é o humano (no seu canto);
  quando um humano ataca o bot, o bot rola a defesa sozinho.
- Na vez de um bot, os humanos só assistem (o mapa não responde ao toque).
- Botões sobre o mapa (quando há bots): **⏸/▶ pausar e continuar** e **velocidade** (🐢 lenta,
  ▶️ normal, ⚡ rápida).

## Em aberto (para decidir)

- [ ] **Ataque entre estados sem divisa** (antigo ataque pelo mar, com penalidade nos dados):
      retirado por enquanto — só se ataca quem faz divisa. A numeração do litoral continua nos
      dados do mapa (`coastIndex`) caso a ideia volte de outra forma.
- [ ] **Calibrar objetivos:** ajustar os números (18 territórios, mínimo de 3 conquistas no
      sorteio) depois de algumas partidas.
