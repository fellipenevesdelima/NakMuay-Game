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
Feito (tutorial completo, só Bangkok): cena das cadeiras, escolha do imóvel, portão, tatame, coach, olheira, contratos com
consentimento, escola de treino, primeira manhã, oferta, camp de luta semana a semana (você decide ou delega ao coach),
pesagem com probabilidade de não bater o peso, noite de várzea round a round com córner e apostas pelo caixa do camp,
decisão dos juízes, acerto da bolsa e folha de pagamento no dia do vencimento. Salva a cada decisão.

Parcial: animações (andar, guarda, ataque e trabalho do coach; faltam corda, clinch em dupla, comemoração, queda),
som (só o gongo sintetizado), efeitos de luta (sem reação a golpe).

Planejado: Phuket e Chiang Mai, dívida, Código do Camp, eventos, mais instalações, narração e música, os três destinos do camp.

## Antes de lançar
- Tailandês sem revisão de nativo.
- Regras reais de repasse de bolsa e de contratos de atletas precisam de checagem jurídica; aqui são valores de jogo.
- Apostas: só créditos fictícios, sem compra, saque ou prêmio. A classificação etária precisa ser revista por plataforma.
