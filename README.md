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

## Estado
Feito (tutorial completo, só Bangkok): cena das cadeiras, escolha do imóvel, portão, tatame, contratação do coach, missão da olheira,
contratos com consentimento do atleta, escola de treino, primeira manhã, oferta de luta, noite de várzea round a round com
orientação de córner, cotações e apostas fictícias, decisão dos juízes e acerto da bolsa no livro-caixa. Salva a cada decisão.

Parcial: gráficos (cenário em blocos texturizados, sprites sem animação de quadro), som (só o gongo sintetizado).

Planejado: Phuket e Chiang Mai, folha de pagamento no dia 30, dívida, Código do Camp, eventos, mais instalações, narração e música,
os três destinos do camp.

## Antes de lançar
- Tailandês sem revisão de nativo.
- Regras reais de repasse de bolsa e de contratos de atletas precisam de checagem jurídica; aqui são valores de jogo.
- Apostas: só créditos fictícios, sem compra, saque ou prêmio. A classificação etária precisa ser revista por plataforma.
