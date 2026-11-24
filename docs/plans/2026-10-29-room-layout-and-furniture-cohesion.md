# Room Layout and Furniture Cohesion Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implementar a nova arquitetura espacial, rotação e coesão ergonômica de todos os móveis e cômodos da Casa dos Sonhos isométrica, eliminando sobreposições, garantindo linha de visão direta na Sala de Estar (Sofá ↔ TV), desobstrução da janela da lavanderia, privacidade do banheiro e conjunto de jantar com cadeiras simétricas.

**Architecture:** Modificação dos sprites canônicos com Sharp (sofá traseiro 2×1, armário com gavetas viradas para a cozinha), rebalanceamento geométrico das 70 células em `ISO_ROOMS`, reorganização das coordenadas em `DEFAULT_FURNITURE_POSITIONS`, sincronização do catálogo demo e validação visual via Playwright.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vite, Vitest, Sharp, Playwright.

---

### Task 1: Gerar e compilar o sprite do Sofá Traseiro 2×1 e Balcão Planejado

**Files:**
- Create: `scripts/generate_sofa_back_and_cabinet.cjs`
- Modify: `public/assets/iso/furniture_sofa.png`
- Modify: `public/assets/iso/furniture_kitchen_cabinet.png`

**Step 1: Write generation script with Sharp**
Criar `scripts/generate_sofa_back_and_cabinet.cjs` desenhando em Clean Cozy Pixel Art 2:1 o sofá visto de costas (192×128) com encosto almofadado cinza, base de carvalho e pés alinhados, e o balcão planejado com gavetas e portas viradas para a face South-East (`+X`).

**Step 2: Run script to generate assets**
Run: `node scripts/generate_sofa_back_and_cabinet.cjs`
Expected: Assets `furniture_sofa.png` e `furniture_kitchen_cabinet.png` atualizados em `public/assets/iso/` com dimensões exatas e canais alfa limpos.

**Step 3: Verify assets with Sharp inspect**
Run: `node -e "const sharp = require('sharp'); Promise.all(['public/assets/iso/furniture_sofa.png', 'public/assets/iso/furniture_kitchen_cabinet.png'].map(f => sharp(f).metadata().then(m => console.log(f, m.width, m.height))));"`
Expected: Dimensões 192×128 (ou 128×128) com 4 canais (RGBA).

---

### Task 2: Rebalancear os Cômodos da Planta Baixa (ISO_ROOMS) em `src/utils/isometric.ts`

**Files:**
- Modify: `src/utils/isometric.ts:160-205`
- Test: `src/utils/isometric.test.ts`

**Step 1: Write failing/boundary test in `isometric.test.ts`**
Verificar que a partição de cômodos contém:
- `kitchen`: 20 células
- `laundry`: 6 células (`0..2, 5..6`)
- `bathroom`: 8 células (`4..5, 0..3`)
- `bedroom`: 16 células (`6..9, 0..3`)
- `living_room`: 20 células (`3..9, 5..6` + `4..9, 4`)
- Total = 70 células exatas, sem sobreposição nem buracos.

**Step 2: Update `ISO_ROOMS` in `src/utils/isometric.ts`**
Ajustar a partição das 70 células em `ISO_ROOMS` e a função auxiliar `getRoomForGrid`.

**Step 3: Run Vitest on `isometric.test.ts`**
Run: `npx vitest run src/utils/isometric.test.ts`
Expected: PASS (todos os testes de cômodos e coordenadas passando).

---

### Task 3: Atualizar Coordenadas Padrão e Catálogo Demo

**Files:**
- Modify: `src/utils/isometric.ts:240-310`
- Modify: `src/components/wedding/PublicVirtualHouse.tsx:40-120`
- Modify: `src/components/wedding/HouseCatalogSettings.tsx`

**Step 1: Update `DEFAULT_FURNITURE_POSITIONS` in `src/utils/isometric.ts`**
Configurar as posições acordadas no Design Doc:
- Sala: `tv_rack: (7, 4)`, `sofa: (7, 6)`, `coffee_table: (6, 5)`, `armchair: (5, 5)`, `robot_vacuum: (4, 5)`, `generic: (9, 5)`
- Cozinha: `sink_counter: (0, 0)`, `stove: (1, 0)`, `fridge: (2, 0)`, `dishwasher: (3, 0)`, `kitchen_cabinet: (1, 3)`, `microwave: (1, 3)`, `air_fryer: (1, 3)`, `dining_table: (2, 2)`, `dining_chair: (1, 2)` e `(3, 2)`
- Banheiro: `shower: (4, 0)`, `bathroom_sink: (5, 0)`, `toilet: (4, 1)`
- Quarto: `bed: (6, 0)`, `wardrobe: (8, 0)`, `dresser: (6, 2)`, `vanity: (9, 2)`
- Lavanderia: `laundry_sink: (0, 6)`, `washing_machine: (1, 6)`, `dryer: (2, 6)`

**Step 2: Sync `DEMO_HOUSE_GIFTS` in `PublicVirtualHouse.tsx`**
Sincronizar a lista de móveis mockados na página demo com as novas coordenadas e as 2 cadeiras de jantar.

**Step 3: Calibrate offsets in `FURNITURE_PIXEL_SIZES` if necessary**
Garantir que as bases e pés fiquem centralizados nos losangos do piso com zero transbordamento.

---

### Task 4: Validação dos Testes Automatizados e Acessibilidade BFS

**Files:**
- Test: `src/utils/isometric.test.ts`
- Test: All vitest files

**Step 1: Run complete test suite**
Run: `npx vitest run`
Expected: 79/79+ testes passando em 12 arquivos (0 colisões de móveis, 0 erros em regras de bancada, conectividade BFS preservada).

---

### Task 5: Validação do Build de Produção

**Files:**
- Run: `npm run build`
Expected: Exit code 0, 2239+ módulos compilados com sucesso.

---

### Task 6: Validação Visual no Navegador e Captura de Evidências

**Files:**
- Create: `scripts/snap_cohesion_verification.cjs`
- Output: `final_layout_desktop.png`, `final_layout_mobile.png`, `final_layout_roof.png`, `final_crop_*.png`

**Step 1: Execute visual capture script via Playwright**
Run: `node scripts/snap_cohesion_verification.cjs`
Expected: Capturas nítidas salvas no diretório de artefatos.

**Step 2: Inspect visual evidence with `read_file`**
Abrir e inspecionar visualmente cada uma das imagens geradas antes de declarar conclusão.
Verificar que cada um dos 5 cômodos e todos os móveis fazem 100% de sentido espacial, ergonômico e estético.
