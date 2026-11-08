# Terra Boa

Jogo de fazenda top-down em HTML/Canvas. O mundo começa natural (campo, mata, rio, lagoas e bichos soltos) e você vai formando a fazenda: pasto, lavouras e criação.

## Como abrir

Dê dois cliques em `iniciar.bat` (precisa do Python) — abre em http://127.0.0.1:8650/.
Os módulos ES não funcionam abrindo o `index.html` direto do disco.

## O que tem

- **Lavouras:** milho, soja, cana (rebrota), café (perene, primeira colheita demorada) e pimenta (várias colheitas). Cada uma tem faixa de temperatura, necessidade de água, sensibilidade à geada e efeito na fertilidade (soja devolve nitrogênio).
- **Pasto:** capim plantado cresce bem mais que o campo nativo; pasto rapado demais degrada e vira terra nua.
- **Animais:** gado, porco, galinha, cavalo, ovelha e cabra soltos no mapa. Laço pega até 4 de uma vez, em fila; clique num deles com o laço para soltar (Shift para chegar devagar), pasto fechado com cerca e porteira, água (rio ou bebedouro) e cocho com ração/milho. Engordam, dão leite e ovos, dão cria e fogem se o pasto estiver aberto. Calor estressa (sombra de árvore ajuda).
- **Clima:** quatro estações do cerrado/sul de Minas, El Niño/La Niña por ano, veranicos, frentes frias, ondas de calor, geada, chuva por hora, umidade do solo tile a tile e previsão de 5 dias.
- **Mercado:** cada produto tem sazonalidade de safra/entressafra, passeio aleatório, notícias (China, dólar, safra dos EUA, gripe aviária...), choques do clima (geada dispara o café) e o seu próprio volume de venda derrubando o preço. Vende-se na cooperativa. Leite azeda em um dia.
- Dia/noite com lanterna, chuva, relâmpagos, neblina, ipês florindo no fim do inverno. Salva sozinho no navegador.

## Controles

WASD/setas andam, Shift anda devagar, 1–8 ferramentas, Q/R trocam semente ou construção, clique (ou Espaço) usa, E é a mão, M mercado, T tempo, F fazenda, L mapas do solo, P pausa, roda do mouse dá zoom. No celular aparecem joystick e botões.

## Código

- `src/config.js` tabelas (culturas, animais, itens)
- `src/world.js` mapa e geração; `src/climate.js` clima; `src/market.js` preços
- `src/sim.js` solo/lavoura/pasto por hora e dia; `src/animals.js` bichos
- `src/actions.js` ferramentas; `src/game.js` estado, tempo e save
- `src/art.js` + `src/render.js` desenho; `src/ui.js` interface; `src/main.js` controles

A lógica não usa o navegador: `node test/sim.test.mjs` simula anos de clima, mercado, uma lavoura e um pasto com vacas.
