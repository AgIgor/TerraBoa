// Constantes e tabelas do jogo. Nada aqui depende do navegador.

export const TILE = 32;
export const MAP_W = 96;
export const MAP_H = 96;

// Tempo: 1 segundo real = 10 minutos de jogo (velocidade 1x). Um dia leva 2,4 min.
// Um dia de jogo equivale mais ou menos a uma semana real (para crescimento de animais).
export const MIN_PER_SEC = 10;
export const DAYS_PER_SEASON = 12;
export const YEAR_DAYS = DAYS_PER_SEASON * 4;
export const MONTHS = ['Set', 'Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'];

// Chão
export const G = { GRASS: 0, WATER: 1, SAND: 2, DIRT: 3, TILLED: 4, PASTURE: 5, PATH: 6, YARD: 7 };
// Objetos sobre o chão
export const O = {
  NONE: 0, TREE: 1, BUSH: 2, ROCK: 3, FENCE: 4, GATE: 5, TROUGH: 6, FEEDER: 7,
  SPRINKLER: 8, HOUSE: 9, COOP: 10, PAIOL: 11, SILO: 12, BRIDGE: 13, LAMP: 14, WELL: 15, ARMAZEM: 16,
};

// O que bloqueia o jogador e os animais
export const BLOCK_PLAYER = new Set([O.TREE, O.ROCK, O.FENCE, O.TROUGH, O.FEEDER, O.SPRINKLER, O.HOUSE, O.COOP, O.PAIOL, O.SILO, O.LAMP, O.WELL, O.ARMAZEM]);
export const BLOCK_ANIMAL = new Set([O.TREE, O.BUSH, O.ROCK, O.FENCE, O.GATE, O.TROUGH, O.FEEDER, O.SPRINKLER, O.HOUSE, O.COOP, O.PAIOL, O.SILO, O.LAMP, O.WELL, O.ARMAZEM]);

// Estações (hemisfério sul, clima de cerrado / sul de Minas). Começa na primavera (setembro).
export const SEASONS = [
  { id: 'primavera', name: 'Primavera', tMean: 23, amp: 11, rainP: 0.40, rainMean: 14 },
  { id: 'verao', name: 'Verão', tMean: 25.5, amp: 9, rainP: 0.58, rainMean: 18 },
  { id: 'outono', name: 'Outono', tMean: 21, amp: 11, rainP: 0.22, rainMean: 10 },
  { id: 'inverno', name: 'Inverno', tMean: 16, amp: 14, rainP: 0.07, rainMean: 6 },
];

// Lavouras. days = dias até a primeira colheita em condições ideais.
// regrow = fração do ciclo em que a planta volta depois de colhida (perenes / rebrota).
// frost = dano de geada (0..1), drought = dano por dia de solo seco.
export const CROPS = {
  milho: {
    name: 'Milho', item: 'milho', seed: 'sem_milho', days: 10, yield: [3, 5],
    tMin: 10, tOpt: [20, 32], tMax: 38, water: 0.40, wilt: 0.12, drought: 0.28, frost: 0.7,
    fertUse: 0.18, regrow: 0, maxHarvests: 1, tall: true,
  },
  soja: {
    name: 'Soja', item: 'soja', seed: 'sem_soja', days: 11, yield: [3, 4],
    tMin: 12, tOpt: [20, 30], tMax: 36, water: 0.42, wilt: 0.14, drought: 0.32, frost: 0.8,
    fertUse: -0.06, regrow: 0, maxHarvests: 1, // soja fixa nitrogênio: devolve fertilidade
  },
  cana: {
    name: 'Cana', item: 'cana', seed: 'muda_cana', days: 28, yield: [6, 9],
    tMin: 12, tOpt: [22, 34], tMax: 40, water: 0.38, wilt: 0.08, drought: 0.10, frost: 0.3,
    fertUse: 0.10, regrow: 0.72, maxHarvests: 6, tall: true,
  },
  cafe: {
    name: 'Café', item: 'cafe', seed: 'muda_cafe', days: 36, yield: [2, 4],
    tMin: 10, tOpt: [18, 27], tMax: 34, water: 0.36, wilt: 0.10, drought: 0.12, frost: 0.6,
    fertUse: 0.08, regrow: 0.66, maxHarvests: 99, perennial: true,
  },
  pimenta: {
    name: 'Pimenta', item: 'pimenta', seed: 'muda_pimenta', days: 14, yield: [1, 2],
    tMin: 13, tOpt: [22, 32], tMax: 37, water: 0.45, wilt: 0.14, drought: 0.30, frost: 0.9,
    fertUse: 0.05, regrow: 0.6, maxHarvests: 5,
  },
};
export const CROP_LIST = ['milho', 'soja', 'cana', 'cafe', 'pimenta'];

// Capim (pastagem). Crescimento por hora em condições ideais.
export const GRASS_CAP = { wild: 0.55, pasture: 1.0 };
export const GRASS_RATE = { wild: 0.005, pasture: 0.013 };

// Animais. forage = unidades de pasto por dia; water = unidades de água por dia.
export const ANIMALS = {
  gado: {
    name: 'Gado', male: 'Boi', female: 'Vaca', young: 'Bezerro',
    forage: 1.2, water: 1.0, speed: 1.1, flee: 3.0, catch: 0.55,
    birthW: [35, 45], adultW: 300, maxW: 560, gain: 5, gestation: 12, litter: [1, 1], breed: 0.16, season: [1.3, 1.1, 0.8, 0.6], rest: 6, cover: 25,
    heat: 32, cold: -5, size: 1.0, market: 'boi', sell: 'arroba', milk: 8, milkItem: 'leite',
  },
  porco: {
    name: 'Porco', male: 'Porco', female: 'Porca', young: 'Leitão',
    forage: 0.4, water: 0.5, speed: 1.2, flee: 2.6, catch: 0.5,
    birthW: [1.5, 2.5], adultW: 80, maxW: 140, gain: 5, gestation: 7, litter: [2, 4], breed: 0.22, season: [1, 1, 1, 0.85], rest: 3, cover: 10,
    heat: 28, cold: 0, size: 0.7, market: 'porco', sell: 'kg',
  },
  galinha: {
    name: 'Galinha', male: 'Galo', female: 'Galinha', young: 'Pintinho',
    forage: 0.08, water: 0.1, speed: 1.5, flee: 2.2, catch: 0.42,
    birthW: [0.05, 0.06], adultW: 1.6, maxW: 2.6, gain: 0.35, gestation: 4, litter: [1, 3], breed: 0.28, season: [1.3, 1.1, 0.8, 0.5], rest: 0, cover: 10,
    heat: 30, cold: 8, size: 0.38, market: 'frango', sell: 'cabeca', eggs: [2, 5], eggItem: 'ovos',
  },
  cavalo: {
    name: 'Cavalo', male: 'Cavalo', female: 'Égua', young: 'Potro',
    forage: 1.0, water: 0.9, speed: 1.7, flee: 3.6, catch: 0.38,
    birthW: [35, 45], adultW: 380, maxW: 480, gain: 4, gestation: 14, litter: [1, 1], breed: 0.1, season: [1.4, 1.1, 0.6, 0.4], rest: 8, cover: 15,
    heat: 33, cold: -5, size: 1.05, market: 'cavalo', sell: 'cabeca',
  },
  ovelha: {
    name: 'Ovelha', male: 'Carneiro', female: 'Ovelha', young: 'Cordeiro',
    forage: 0.25, water: 0.3, speed: 1.2, flee: 2.6, catch: 0.5,
    birthW: [3, 5], adultW: 40, maxW: 70, gain: 2.5, gestation: 8, litter: [1, 2], breed: 0.2, season: [0.6, 0.8, 1.5, 1.0], rest: 4, cover: 30,
    heat: 29, cold: -6, size: 0.6, market: 'cordeiro', sell: 'kg', wool: 0.3,
  },
  cabra: {
    name: 'Cabra', male: 'Bode', female: 'Cabra', young: 'Cabrito',
    forage: 0.25, water: 0.25, speed: 1.35, flee: 2.6, catch: 0.5,
    birthW: [2.5, 4], adultW: 38, maxW: 62, gain: 2.3, gestation: 8, litter: [1, 2], breed: 0.2, season: [0.7, 0.9, 1.4, 1.0], rest: 4, cover: 25,
    heat: 35, cold: 0, size: 0.55, market: 'caprino', sell: 'kg', milk: 2.2, milkItem: 'leite_cabra',
  },
  pato: {
    name: 'Pato', male: 'Pato', female: 'Pata', young: 'Patinho',
    forage: 0.1, water: 0.15, speed: 1.15, flee: 2.4, catch: 0.45,
    birthW: [0.05, 0.07], adultW: 2.8, maxW: 4, gain: 0.5, gestation: 4, litter: [1, 3], breed: 0.25, season: [1.3, 1.1, 0.8, 0.5], rest: 0, cover: 6,
    heat: 33, cold: 2, size: 0.42, market: 'pato', sell: 'cabeca', eggs: [1, 3], eggItem: 'ovos_pato', aquatic: true,
  },
  peru: {
    name: 'Peru', male: 'Peru', female: 'Perua', young: 'Peruzinho',
    forage: 0.15, water: 0.2, speed: 1.15, flee: 2.4, catch: 0.45,
    birthW: [0.06, 0.08], adultW: 8, maxW: 14, gain: 0.9, gestation: 5, litter: [1, 3], breed: 0.2, season: [1.3, 1.1, 0.8, 0.5], rest: 0, cover: 8,
    heat: 31, cold: 4, size: 0.55, market: 'peru', sell: 'kg', eggs: [0, 2], eggItem: 'ovos',
  },
  coelho: {
    name: 'Coelho', male: 'Coelho', female: 'Coelha', young: 'Coelhinho',
    forage: 0.05, water: 0.05, speed: 1.6, flee: 2.8, catch: 0.4,
    birthW: [0.05, 0.08], adultW: 3, maxW: 5, gain: 0.35, gestation: 4, litter: [3, 6], breed: 0.3, season: [1.2, 1, 1, 0.7], rest: 2, cover: 8,
    heat: 28, cold: -2, size: 0.32, market: 'coelho', sell: 'kg',
  },
  lhama: {
    name: 'Lhama', male: 'Lhama macho', female: 'Lhama', young: 'Filhote de lhama',
    forage: 0.6, water: 0.4, speed: 1.3, flee: 3.0, catch: 0.45,
    birthW: [9, 14], adultW: 130, maxW: 200, gain: 2.2, gestation: 14, litter: [1, 1], breed: 0.12, season: [1.3, 1.1, 0.7, 0.6], rest: 8, cover: 20,
    heat: 28, cold: -12, size: 0.85, market: 'lhama', sell: 'cabeca', wool: 0.25, woolItem: 'fibra_lhama',
  },
  bufalo: {
    name: 'Búfalo', male: 'Búfalo', female: 'Búfala', young: 'Bezerro de búfala',
    forage: 1.3, water: 1.3, speed: 1.0, flee: 2.6, catch: 0.5,
    birthW: [35, 45], adultW: 450, maxW: 700, gain: 5, gestation: 13, litter: [1, 1], breed: 0.14, season: [0.8, 0.9, 1.4, 1.1], rest: 7, cover: 25,
    heat: 36, cold: 0, size: 1.15, market: 'bufalo', sell: 'arroba', milk: 6, milkItem: 'leite_bufala', aquatic: true,
  },
};
// 1 saca de milho (ou de ração) vale 0,8 unidade de pasto.
// Quanto alimento (em unidades de pasto) cada saca rende no cocho. Ração é balanceada e rende mais.
export const FEED_VALUE = { racao: 3, milho: 2 };
export const HUNGER_HOURS = 40; // horas para um animal de barriga cheia ficar com fome total

// Itens do inventário
export const ITEMS = {
  milho: { name: 'Milho', unit: 'sc' },
  soja: { name: 'Soja', unit: 'sc' },
  cana: { name: 'Cana', unit: 'fx' },
  cafe: { name: 'Café', unit: 'sc' },
  pimenta: { name: 'Pimenta', unit: 'kg' },
  leite: { name: 'Leite', unit: 'L' },
  leite_cabra: { name: 'Leite de cabra', unit: 'L' },
  la: { name: 'Lã', unit: 'kg' },
  ovos: { name: 'Ovos', unit: 'un' },
  ovos_pato: { name: 'Ovos de pata', unit: 'un' },
  leite_bufala: { name: 'Leite de búfala', unit: 'L' },
  fibra_lhama: { name: 'Fibra de lhama', unit: 'kg' },
  sem_milho: { name: 'Semente de milho', unit: 'un' },
  sem_soja: { name: 'Semente de soja', unit: 'un' },
  muda_cana: { name: 'Muda de cana', unit: 'un' },
  muda_cafe: { name: 'Muda de café', unit: 'un' },
  muda_pimenta: { name: 'Muda de pimenta', unit: 'un' },
  sem_capim: { name: 'Semente de capim', unit: 'un' },
  madeira: { name: 'Madeira', unit: 'un' },
  adubo: { name: 'Adubo', unit: 'sc' },
  racao: { name: 'Ração', unit: 'sc' },
  bebedouro: { name: 'Bebedouro', unit: 'un' },
  aspersor: { name: 'Aspersor', unit: 'un' },
  silo: { name: 'Silo (kit)', unit: 'un' },
  poco: { name: 'Poço (perfuração)', unit: 'un' },
};

// Ferramentas da barra
export const TOOLS = [
  { id: 'mao', name: 'Mão', key: '1', hint: 'Colher, ordenhar, pegar ovos, pôr ração no cocho, dormir' },
  { id: 'enxada', name: 'Enxada', key: '2', hint: 'Arar a terra (clicar em terra arada desfaz), arrancar arbustos, pedras e plantas mortas' },
  { id: 'machado', name: 'Machado', key: '3', hint: 'Cortar árvores (madeira) e desmontar cercas' },
  { id: 'regador', name: 'Regador', key: '4', hint: 'Molhar a terra e apagar fogo. Encha na água. Também enche o bebedouro' },
  { id: 'plantar', name: 'Plantar', key: '5', hint: 'Plantar na terra arada. Capim forma pasto' },
  { id: 'construir', name: 'Construir', key: '6', hint: 'Cercas, porteiras, pontes, lampião, cocho, bebedouro, aspersor, poço, paiol e silo' },
  { id: 'laco', name: 'Laço', key: '7', hint: 'Laçar animal e soltar no seu pasto cercado' },
  { id: 'adubo', name: 'Adubo', key: '8', hint: 'Recupera a fertilidade da terra' },
];
export const PLANT_LIST = [
  { id: 'milho', item: 'sem_milho' },
  { id: 'soja', item: 'sem_soja' },
  { id: 'cana', item: 'muda_cana' },
  { id: 'cafe', item: 'muda_cafe' },
  { id: 'pimenta', item: 'muda_pimenta' },
  { id: 'capim', item: 'sem_capim' },
];
export const BUILD_LIST = [
  { id: 'cerca', name: 'Cerca', obj: O.FENCE, cost: { madeira: 1 } },
  { id: 'porteira', name: 'Porteira', obj: O.GATE, cost: { madeira: 4 } },
  { id: 'cocho', name: 'Cocho', obj: O.FEEDER, cost: { madeira: 5 } },
  { id: 'bebedouro', name: 'Bebedouro', obj: O.TROUGH, cost: { bebedouro: 1 } },
  { id: 'aspersor', name: 'Aspersor', obj: O.SPRINKLER, cost: { aspersor: 1 } },
  { id: 'paiol', name: 'Paiol', obj: O.PAIOL, cost: { madeira: 25 } },
  { id: 'armazem', name: 'Armazém', obj: O.ARMAZEM, cost: { madeira: 35 } },
  { id: 'ponte', name: 'Ponte', obj: O.BRIDGE, cost: { madeira: 6 }, water: true },
  { id: 'lampiao', name: 'Lampião', obj: O.LAMP, cost: { madeira: 3 } },
  { id: 'silo', name: 'Silo', obj: O.SILO, cost: { silo: 1 } },
  { id: 'poco', name: 'Poço', obj: O.WELL, cost: { poco: 1 } },
];

export const REGADOR_MAX = 20;
// Aspersor: raio (tiles), horas em que liga e distância máxima até a água
export const SPRINKLER = { r: 3, hours: [6, 12, 17], water: 12, moist: 0.8 };
export const TROUGH_MAX = 10;
export const FEEDER_MAX = 30;
export const REACH = 2.6; // alcance das ferramentas, em tiles
export const LASSO_REACH = 4.5;
export const MAX_LED = 4; // animais no laço ao mesmo tempo

// Armazenagem de grãos (sacas de milho, soja e café). A casa guarda pouco.
export const GRAINS = ['milho', 'soja', 'cafe'];
export const STORE_BASE = 40;
export const STORE_ADD = { [O.PAIOL]: 80, [O.SILO]: 400 };
// Perecíveis: fração perdida por dia
// Produtos (não grãos): a casa guarda um pouco; cada armazém guarda mais e conserva (resfriado/seco).
export const PRODUCTS = ['leite', 'leite_cabra', 'leite_bufala', 'ovos', 'ovos_pato', 'la', 'fibra_lhama', 'cana', 'pimenta'];
export const PROD_BASE = 20;
export const PROD_ADD = { [O.ARMAZEM]: 150 };
export const STORED_SPOIL = 0.15; // no armazém estraga 15% do normal
export const WORK_HOURS = [6, 18];
export const SALE_FEE = 0.05; // frete quando o peão vende direto
export const SPOIL = { leite: 0.5, leite_cabra: 0.5, leite_bufala: 0.5, ovos: 0.12, ovos_pato: 0.12, cana: 0.25 };

// Montarias e máquinas
export const SPEED = { walk: 4.2, sneak: 1.7, cavalo: 7.5, trator: 3.4 };
export const BUSH_SLOW = 0.4; // fração da velocidade dentro do mato
export const DIESEL_PER_TILE = 0.18;
export const WAGE = 28;       // diária do peão
export const MAX_WORKERS = 8;
export const WORK_TASKS = {
  regar: { name: 'Regar lavouras', hint: 'Molha as lavouras secas. Sem isso, enche bebedouros e colhe.' },
  colher: { name: 'Colher', hint: 'Colhe o que estiver maduro. Sem isso, limpa lavoura morta, rega e recolhe ovos.' },
  tratar: { name: 'Tratar dos bichos', hint: 'Enche cochos e bebedouros, recolhe ovos, ordenha e tosquia.' },
};
