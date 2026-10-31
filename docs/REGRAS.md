# Regras do Domínio · Brasil

Documento de design do jogo: o que já está decidido e o que ainda está em aberto.
Valores marcados com ⚙️ são configuráveis no código (`src/game/rules.ts` e `src/game/brasil.ts`).

## Regras do jogo

1. **Jogadores:** escolhe-se de **2 a 4 jogadores** e o nome de cada um.
2. **Sorteio dos estados:** os 27 estados (26 + DF) são **sorteados** entre os jogadores, o mais
   igualmente possível, com **1 soldado** em cada.

   | Jogadores | Estados por jogador |
   | --------- | ------------------- |
   | 2         | 14, 13              |
   | 3         | 9, 9, 9             |
   | 4         | 7, 7, 7, 6          |

3. **Ordem de jogo:** cada jogador rola um dado; quem tirar mais começa, e a ordem segue do maior
   para o menor. Empatados rolam de novo entre si. **Toda a partida segue essa ordem.**
4. **Rodada inicial:** na ordem, cada jogador coloca **3 soldados** ⚙️ nos seus estados — todos num
   só estado ou divididos entre vários. Ninguém ataca nesta rodada.
5. **Ataque:** começa pelo primeiro da ordem. O jogador:
   1. toca no estado **de onde parte o ataque** (precisa ter 2 ou mais soldados);
   2. toca no estado **que vai receber o ataque** — **só estados que fazem divisa**;
   3. escolhe **com quantos soldados ataca**: de 1 a 3, sempre deixando 1 soldado na origem.

   Pode atacar quantas vezes quiser no seu turno e depois encerra os ataques.

6. **Dados manuais:** cada jogador rola o seu dado no seu lado da mesa.
   1. O **atacante** toca em **"Rolar ataque"** no seu canto: 1 dado **vermelho** por soldado.
   2. Depois, o **defensor** toca em **"Rolar defesa"** no canto dele: 1 dado **amarelo** por
      soldado que tem no estado atacado, até 3.
   3. Os dados são comparados do maior para o menor, em pares: **o maior vence e o empate é da
      defesa**. Quem perde o par perde 1 soldado.

   Antes de rolar o ataque, o atacante ainda pode desistir.

7. **Conquista:** se o estado atacado fica sem soldados, ele passa para o atacante, e os soldados
   que atacaram e sobreviveram entram nele. **Cada conquista vale uma carta** (veja abaixo).
8. **Remanejamento** (opcional): depois dos ataques, o jogador pode mover soldados entre estados
   seus que fazem fronteira, deixando pelo menos 1 em cada. Soldado remanejado não se move de novo
   no mesmo turno.
9. **Reforço:** a partir da **rodada 2**, no começo da sua vez, o jogador ganha **1 soldado a cada
   2 estados** ⚙️ que possui, mais o bônus de cada região que dominar inteira, e pode **trocar
   cartas** por mais soldados.
10. **Vitória:** quem perde todos os estados está fora. **Vence o último jogador vivo.**

### Bônus por região ⚙️

| Região       | Estados                            | Qtde | Bônus |
| ------------ | ---------------------------------- | ---- | ----- |
| Norte        | AC, AM, AP, PA, RO, RR, TO         | 7    | +5    |
| Nordeste     | AL, BA, CE, MA, PB, PE, PI, RN, SE | 9    | +5    |
| Centro-Oeste | DF, GO, MS, MT                     | 4    | +3    |
| Sudeste      | ES, MG, RJ, SP                     | 4    | +3    |
| Sul          | PR, RS, SC                         | 3    | +2    |

### Cartas de troca 🃏

Como no War original, com uma diferença: **as cartas ficam visíveis para todos**, no canto de cada
jogador.

- O baralho tem **29 cartas**: uma para cada estado, com um símbolo — **quadrado ■, triângulo ▲ ou
  bola ●** (9 de cada) — e **2 coringas ★**.
- **Toda vez que conquista um estado, o jogador ganha uma carta** do monte. Quando o monte acaba,
  as cartas já trocadas são embaralhadas e voltam a ser o monte.
- **Troca:** com **3 cartas de símbolos iguais** ou **3 cartas de símbolos diferentes**, o jogador
  pode trocá-las por soldados no início da sua vez (fase de reforço). O coringa vale qualquer
  símbolo.
- **Valor da troca** ⚙️: cresce a cada troca feita na partida — 4, 6, 8, 10, 12, 15, e depois
  +5 a cada troca (20, 25, 30…).
- **Bônus de estado:** se uma das cartas trocadas for de um **estado que o jogador domina**, ele
  ganha **+2 soldados nesse estado** (a carta mostra o selo "+2").
- Com **5 cartas ou mais** ⚙️, a troca é **obrigatória** antes de posicionar os soldados.
- Quem **elimina** um jogador fica com as cartas dele.

## Configurações da mesa (tablet)

- **Mapa no centro, sem bordas**, sobre o "mar" que ocupa a tela toda.
- **Jogadores nos 4 cantos do tablet**, como num tabuleiro físico sobre a mesa. Os jogadores do lado
  de cima veem o seu canto **virado para eles** (girado 180°). Com 2 jogadores, eles ficam em cantos
  opostos, frente a frente.
- **Dados como se fossem físicos**, no canto de cada jogador: **vermelho ataca, amarelo defende**.
  Cada um rola o seu, no seu lado. Eles chacoalham antes de parar; os que perderam a comparação
  ficam apagados. Quem está sendo atacado tem o canto aceso em amarelo.
- **Cartas** visíveis no canto de cada jogador.
- **Soldadinhos como peças físicas**, na borda de cada jogador: os soldados ainda a posicionar
  ficam ali e vão saindo conforme são colocados no mapa.
- O canto do jogador da vez fica aceso na cor dele, com as instruções e os botões da jogada.
- Botões de **tela cheia** (⛶) e **menu** (☰: regras, bônus, histórico e nova partida) sobre o mapa.
- O celular terá um layout próprio depois.

## Em aberto (para decidir)

- [ ] **Ataque entre estados sem divisa** (antigo ataque pelo mar, com penalidade nos dados):
      retirado por enquanto — só se ataca quem faz divisa. A numeração do litoral continua nos
      dados do mapa (`coastIndex`) caso a ideia volte de outra forma.
- [ ] **Bônus por região:** manter? (a regra "1 soldado a cada 2 estados" foi aplicada junto com ele)
- [ ] **Mínimo de reforço:** hoje, quem tem só 1 estado e nenhuma região não recebe soldados.
- [ ] **Cartas:** uma carta por conquista (como pedido) pode render várias cartas por turno; no War
      original é no máximo uma por turno. Manter assim?
- [ ] **Objetivos**, como no War clássico?
