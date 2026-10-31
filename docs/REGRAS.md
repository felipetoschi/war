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
   2. toca no estado **que vai receber o ataque**;
   3. escolhe **com quantos soldados ataca**: de 1 a 3, sempre deixando 1 soldado na origem.

   Pode atacar quantas vezes quiser no seu turno e depois encerra os ataques.

6. **Dados:** cada soldado do ataque rola um dado **vermelho**; o defensor rola um dado **amarelo**
   por soldado que tem no estado, até 3. Os dados são comparados do maior para o menor, em pares:
   **o maior vence e o empate é da defesa**. Quem perde o par perde 1 soldado.
7. **Conquista:** se o estado atacado fica sem soldados, ele passa para o atacante, e os soldados
   que atacaram e sobreviveram entram nele.
8. **Remanejamento** (opcional): depois dos ataques, o jogador pode mover soldados entre estados
   seus que fazem fronteira, deixando pelo menos 1 em cada. Soldado remanejado não se move de novo
   no mesmo turno.
9. **Reforço:** a partir da **rodada 2**, no começo da sua vez, o jogador ganha **1 soldado a cada
   2 estados** ⚙️ que possui, mais o bônus de cada região que dominar inteira.
10. **Vitória:** quem perde todos os estados está fora. **Vence o último jogador vivo.**

### Bônus por região ⚙️

| Região       | Estados                            | Qtde | Bônus |
| ------------ | ---------------------------------- | ---- | ----- |
| Norte        | AC, AM, AP, PA, RO, RR, TO         | 7    | +5    |
| Nordeste     | AL, BA, CE, MA, PB, PE, PI, RN, SE | 9    | +5    |
| Centro-Oeste | DF, GO, MS, MT                     | 4    | +3    |
| Sudeste      | ES, MG, RJ, SP                     | 4    | +3    |
| Sul          | PR, RS, SC                         | 3    | +2    |

### Ataque naval ⚓

Estados do litoral podem atacar **qualquer outro estado do litoral**, mesmo sem fronteira, com
penalidade em cada dado do atacante (o dado nunca fica abaixo de 1). Os 17 estados litorâneos são
numerados de norte a sul, e a distância é a diferença entre os números:

```
AP(0) PA(1) MA(2) PI(3) CE(4) RN(5) PB(6) PE(7) AL(8) SE(9)
BA(10) ES(11) RJ(12) SP(13) PR(14) SC(15) RS(16)
```

| Distância no litoral | Penalidade em cada dado ⚙️ | Exemplo                    |
| -------------------- | -------------------------- | -------------------------- |
| 2 a 4                | −1                         | RJ → PR (2), BA → AL (2)   |
| 5 a 8                | −2                         | BA → RS (6), CE → BA (6)   |
| 9 ou mais            | −3                         | RN → RS (11), AP → SP (13) |

## Configurações da mesa (tablet)

- **Mapa no centro, sem bordas**, sobre o "mar" que ocupa a tela toda.
- **Jogadores nos 4 cantos do tablet**, como num tabuleiro físico sobre a mesa. Os jogadores do lado
  de cima veem o seu canto **virado para eles** (girado 180°). Com 2 jogadores, eles ficam em cantos
  opostos, frente a frente.
- **Dados como se fossem físicos**, no canto de cada jogador: **vermelho ataca, amarelo defende**.
  Eles chacoalham antes de parar; os que perderam a comparação ficam apagados.
- **Soldadinhos como peças físicas**, na borda de cada jogador: os soldados ainda a posicionar
  ficam ali e vão saindo conforme são colocados no mapa.
- O canto do jogador da vez fica aceso na cor dele, com as instruções e os botões da jogada.
- Botões de **tela cheia** (⛶) e **menu** (☰: regras, bônus, histórico e nova partida) sobre o mapa.
- O celular terá um layout próprio depois.

## Em aberto (para decidir)

- [ ] **Bônus por região:** manter? (a regra "1 soldado a cada 2 estados" foi aplicada junto com ele)
- [ ] **Mínimo de reforço:** hoje, quem tem só 1 estado e nenhuma região não recebe soldados.
- [ ] **Remanejamento** e **ataque naval:** manter?
- [ ] **Cartas de território** e **objetivos**, como no War clássico?
