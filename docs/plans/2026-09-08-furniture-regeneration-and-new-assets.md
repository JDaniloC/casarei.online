# Regeneração de Móveis e Novos Eletrodomésticos Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Regenerar os 7 móveis existentes com orientação/estilo corrigido e adicionar 4 novos eletros clássicos de casamento (cafeteira, air fryer, robô aspirador, lava-louças moderna).

**Architecture:** Geração por IA (`generate_image`) com ângulo isométrico exato 2:1, remoção de fundo por flood-fill com Sharp, padronização de escalas em `isometric.ts` e inclusão nos componentes `PublicVirtualHouse.tsx` e `DashboardVirtualHouse.tsx`.

**Tech Stack:** React, TypeScript, Sharp, Vitest, TailwindCSS.

---

### Task 10: Gerar imagens brutas com IA para os 11 móveis e eletrodomésticos

**Files:**
- Create: `raw_assets/raw_stove.jpg`
- Create: `raw_assets/raw_bathroom_sink.jpg`
- Create: `raw_assets/raw_laundry_sink.jpg`
- Create: `raw_assets/raw_washing_machine.jpg`
- Create: `raw_assets/raw_toilet.jpg`
- Create: `raw_assets/raw_tv_rack.jpg`
- Create: `raw_assets/raw_dining_table.jpg`
- Create: `raw_assets/raw_dishwasher.jpg`
- Create: `raw_assets/raw_coffee_maker.jpg`
- Create: `raw_assets/raw_air_fryer.jpg`
- Create: `raw_assets/raw_robot_vacuum.jpg`

**Step 1: Executar `generate_image` para cada item**
Usar prompts especializados em vista isométrica 2:1 sobre fundo branco sólido limpo sem sombras no chão.

**Step 2: Commit**
`git add raw_assets/`
`git commit -m "feat: generate raw AI assets for furniture and appliances"`

---

### Task 11: Processar e recortar os 11 assets com Sharp

**Files:**
- Modify: `scripts/process_furniture.js`
- Output: `public/assets/iso/furniture_*.png`

**Step 1: Atualizar `scripts/process_furniture.js` com a lista dos 11 novos itens e dimensões alvo**
- `furniture_stove.png`: 128x128
- `furniture_bathroom_sink.png`: 128x128
- `furniture_laundry_sink.png`: 128x128
- `furniture_washing_machine.png`: 128x128
- `furniture_toilet.png`: 80x96
- `furniture_tv_rack.png`: 192x160
- `furniture_dining_table.png`: 256x192
- `furniture_dishwasher.png`: 128x128
- `furniture_coffee_maker.png`: 64x56
- `furniture_air_fryer.png`: 64x56
- `furniture_robot_vacuum.png`: 64x40

**Step 2: Executar processamento**
Run: `node scripts/process_furniture.js`
Expected: 11 arquivos gerados com transparência alfa perfeita e sem bordas brancas.

**Step 3: Commit**
`git add scripts/process_furniture.js public/assets/iso/furniture_*.png`
`git commit -m "feat: process transparent isometric PNGs for 11 furniture items"`

---

### Task 12: Atualizar tipos, footprints e posicionamento no código React

**Files:**
- Modify: `src/utils/isometric.ts`
- Modify: `src/components/wedding/PublicVirtualHouse.tsx`
- Modify: `src/components/wedding/DashboardVirtualHouse.tsx`

**Step 1: Atualizar `isometric.ts`**
- Adicionar `coffee_maker`, `air_fryer`, `robot_vacuum` em `FURNITURE_SIZES`, `FURNITURE_PIXEL_SIZES`, e `FURNITURE_ICONS`.
- Ajustar `toilet` com `w: 80, h: 96, offsetX: 24`.

**Step 2: Atualizar `DEMO_HOUSE_GIFTS` em `PublicVirtualHouse.tsx`**
- Incluir os novos eletrodomésticos e móveis em seus respectivos cômodos com dados de compradores simulados.

**Step 3: Commit**
`git add src/utils/isometric.ts src/components/wedding/PublicVirtualHouse.tsx src/components/wedding/DashboardVirtualHouse.tsx`
`git commit -m "feat: configure furniture sizes and demo layout for new assets"`

---

### Task 13: Validação dos testes automatizados e compilação

**Files:**
- Test: `npm test -- --run`
- Build: `npm run build`

**Step 1: Rodar testes**
Run: `npm test -- --run`
Expected: 11/11 arquivos e 60/60 testes passando.

**Step 2: Rodar build**
Run: `npm run build`
Expected: Exit code 0.

---

### Task 14: Validação visual no navegador e captura de evidências

**Step 1: Navegar para `http://localhost:8080/demo` e capturar screenshots da casa completa decorada**
- Inspecionar a cozinha (fogão orientado, lava-louças, cafeteira, air fryer).
- Inspecionar o banheiro (novo gabinete planejado, vaso sanitário na escala correta).
- Inspecionar a lavanderia (máquina de lavar idêntica à secadora, tanque planejado).
- Inspecionar a sala (rack voltado para o sofá, robô aspirador no chão).
- Atualizar walkthrough e relatar evidências.
