# Terra Boa

Jogo de fazenda top-down em HTML/Canvas. O mundo começa natural (campo, mata, rio, lagoas e bichos soltos) e você vai formando a fazenda: pasto, lavouras e criação.

## Como abrir

Dê dois cliques em `iniciar.bat` (precisa do Python) — abre em http://127.0.0.1:8650/ com um servidor que não usa cache (`tools/servidor.py`).
Antes de publicar, rode `python tools/versao.py`: ele carimba a versão de cada módulo no `index.html` para o navegador nunca misturar arquivo velho com novo.
Os módulos ES não funcionam abrindo o `index.html` direto do disco.

## O que tem

- **Lavouras:** milho, soja, cana (rebrota), café (perene, primeira colheita demorada) e pimenta (várias colheitas). Cada uma tem faixa de temperatura, necessidade de água, sensibilidade à geada e efeito na fertilidade (soja devolve nitrogênio).
- **Pasto:** capim plantado cresce bem mais que o campo nativo; pasto rapado demais degrada e vira terra nua.
- **Animais:** gado, porco, galinha, cavalo, ovelha e cabra soltos no mapa. Laço pega até 4 de uma vez, em fila; clique num deles com o laço para soltar (Shift para chegar devagar), pasto fechado com cerca e porteira, água (rio ou bebedouro) e cocho com ração/milho. Engordam, dão leite e ovos, dão cria e fogem se o pasto estiver aberto. Calor estressa (sombra de árvore ajuda).
- **Clima:** quatro estações do cerrado/sul de Minas, El Niño/La Niña por ano, veranicos, frentes frias, ondas de calor, geada, chuva por hora, umidade do solo tile a tile e previsão de 5 dias.
- **Mercado:** cada produto tem sazonalidade de safra/entressafra, passeio aleatório, notícias (China, dólar, safra dos EUA, gripe aviária...), choques do clima (geada dispara o café) e o seu próprio volume de venda derrubando o preço. Vende-se na cooperativa. Leite azeda em um dia.
- Fogo no campo na seca longa, que o vento leva e o aceiro segura; granizo nas tempestades de primavera/verão; lampiões para iluminar a noite.
- 11 espécies: gado, porco, galinha, cavalo, ovelha, cabra, pato, peru, coelho, lhama e búfalo (ovos de pata, fibra de lhama, leite de búfala).
- Manadas selvagens que andam juntas, têm cria e chegam pelas bordas do mapa; cria por estação, descanso pós-parto, ovos férteis que chocam e filhotes que seguem a mãe.
- Peões com tarefa principal e reservas (não ficam parados); quem trata dos bichos recolhe ovos, ordenha e tosquia; cada peão guarda ou vende direto (5% de frete). Armazém (35 madeiras) guarda 150 produtos e conserva.
- Sons gerados na hora (Web Audio, sem arquivos): ferramentas, bichos, passos, chuva, vento, trovão, trator, pássaros, grilos, sapos, cigarras e galo. Botão 🔊 no topo e volume no Menu.
- Jogar junto (até 4, PeerJS): o anfitrião simula e salva; convidados mandam ações e veem o mundo sincronizado. Convidado nunca salva por cima das próprias fazendas.
- Poço: leva água para aspersores (até 12 tiles) e enche o regador longe do rio.
- Dia/noite com lanterna, chuva com respingos, relâmpagos, neblina, ipês florindo no fim do inverno. Vento do dia balança copas, lavouras e arbustos; partículas com gravidade (lascas, folhas, terra, água), sombras de nuvem, fumaça da chaminé e câmera suave — técnicas trazidas do Mata Viva. Salva sozinho no navegador.

## Saves

Cada jogo é uma **fazenda** com nome. O salvamento automático (todo dia e ao fechar a página) grava só na fazenda aberta; criar uma fazenda nova nunca apaga as outras. Em *Minhas fazendas* dá para jogar, renomear, copiar (ponto de volta), exportar para arquivo `.json`, importar e apagar. Ao criar, a prévia mostra o mapa da semente. Os saves do sistema antigo viram fazendas na primeira abertura.

## Controles

WASD/setas andam, Shift anda devagar, 1–8 ferramentas, Q/R trocam semente ou construção, clique (ou Espaço) usa, E é a mão, M mercado, T tempo, F fazenda, L mapas do solo, P pausa, roda do mouse dá zoom. No celular aparecem joystick e botões.

## Código

- `src/config.js` tabelas (culturas, animais, itens)
- `src/world.js` mapa e geração; `src/climate.js` clima; `src/market.js` preços
- `src/sim.js` solo/lavoura/pasto por hora e dia; `src/animals.js` bichos
- `src/actions.js` ferramentas; `src/game.js` estado, tempo e save
- `src/art.js` + `src/render.js` desenho; `src/ui.js` interface; `src/main.js` controles

A lógica não usa o navegador: `node test/sim.test.mjs`, `test/saves.test.mjs` `test/fire.test.mjs` , `test/poco.test.mjs` , `test/cria.test.mjs` , `test/net.test.mjs` e `test/peoes.test.mjs` simula anos de clima, mercado, uma lavoura e um pasto com vacas.
