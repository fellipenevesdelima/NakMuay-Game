# NakMuay

Jogo de gestão de um camp de Muay Thai na Tailândia. Three.js + TypeScript + Vite.

    npm install
    npm run dev     # jogar localmente
    npm test        # testes da simulação
    npm run build   # gera dist/index.html (arquivo único)

- `src/sim/` — regras e dados, sem renderização (testável).
- `src/render/` — cena 3D montada a partir dos dados.
- `src/i18n.ts` — pt-BR, en, th. O tailandês ainda não foi revisado por nativo.

- `src/assets/` — texturas e sprites originais do jogo, gerados por IA (Higgsfield) e reduzidos para o estilo pixel.

Todos os valores em baht são fictícios, para balanceamento.

## Como a cena é desenhada
O camp é uma pintura (gerada para o jogo) com o piso calibrado: as células da simulação são projetadas sobre a pintura,
e pessoas, equipamentos, chuva e luz entram por cima, ordenados por profundidade. Pilares e a parede da frente são
recortes da própria pintura, para ficarem na frente de quem passa atrás. Os personagens usam folhas de sprite de 8 quadros.

## Estado

Fatia 1 do redesign (temporada jogável no nível 1). O jogo não está completo.

**Pronto**
- Tutorial até a primeira luta, que agora abre o camp em vez de encerrar o jogo.
- Tela do camp com seis abas (Semana, Treinadores, Elenco, Manager, Lutas, Academia). Uma decisão avança uma semana.
- Treinador com nível, capacidade, carga (lutadores + turistas), cansaço, confiabilidade, falta e saída. Kratom e aumento.
- Lutador com vida útil em temporadas, corte de peso, sequência de derrotas, nocautes, ânimo e respeito pessoal. Aposentadoria por decisão do jogador.
- Manager com três missões (talentos, contratos de luta, patrocínios). Sem oportunidade nova enquanto está fora.
- Camp de luta de 2, 3 ou 4 semanas dentro da mesma tela, pesagem probabilística, luta de várzea de 5 rounds com nocaute.
- Folha mensal, parcela da dívida, patrocínio, teto de caixa por nível, fim de temporada.
- Torcida, Respeito e Clima no topo. Regras de balanceamento em `src/sim/balance.ts`.

**Parcial**
- Turistas: vagas, preço, procura e carga funcionam; ainda não aparecem no cenário.
- Subida para o nível 2: requisitos e cobrança funcionam; pintura nova, obra e andaimes não existem.
- Candidatos novos (Somsak, Chai, Yod) e adversários gerados usam sprites emprestados.
- Balanceamento: provisório. Um camp com dois lutadores fecha a temporada no azul; com três, aperta.
- Uma luta em preparação por vez.

**Falta**
- Circuitos de estádio, 3 rounds e internacional. Apostas de arquibancada com cotação viva.
- Subida de categoria, ex-lutador virando treinador, níveis 3 a 5, Phuket e Chiang Mai.
- Som (ElevenLabs), eventos narrativos, revisão do tailandês por falante nativo.

## Antes de lançar
- Tailandês sem revisão de nativo.
- Regras reais de repasse de bolsa e de contratos de atletas precisam de checagem jurídica; aqui são valores de jogo.
- Apostas: só créditos fictícios, sem compra, saque ou prêmio. A classificação etária precisa ser revista por plataforma.
