# Rebalanceamento Arquitetônico, Rotações e Encaixe Isométrico Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Reestruturar a planta baixa e o catálogo de móveis da Casa dos Sonhos, ampliando a cozinha para 20 células, alinhando sofá e TV frente a frente, modularizando a mesa com cadeiras avulsas, corrigindo as rotações de todos os eletros e garantindo encaixe de tolerância zero nos losangos do piso.

**Architecture:** A grade 10×7 é redistribuída em `ISO_ROOMS` mantendo o perímetro do telhado 3D; os sprites desalinhados ou invertidos são rotacionados/calibrados matematicamente nos losangos 2:1 (`FURNITURE_PIXEL_SIZES`); um novo item `dining_chair` modulariza a mesa com controle de `zIndex` em profundidade; e o Supabase é sincronizado via nova migration SQL.

**Tech Stack:** TypeScript, React, Vite, Tailwind CSS, Sharp, Vitest, Playwright, Supabase PostgreSQL.

---

### Task 1: Sincronização do Banco de Dados (Migration Supabase)

**Files:**
- Create: `supabase/migrations/20261029190000_add_dining_chair_to_house_item_type.sql`

**Step 1: Escrever a migration SQL**
Atualizar `chk_house_item_type` para aceitar `'dining_chair'` e `'dining_table_simple'`.

**Step 2: Verificar a migration**
Conferir sintaxe e compatibilidade com os tipos existentes.

---

### Task 2: Rebalanceamento da Planta Baixa em `ISO_ROOMS` e Testes de Grade

**Files:**
- Modify: `src/utils/isometric.ts:15-21`
- Modify: `src/components/wedding/PublicVirtualHouse.tsx`
- Modify: `src/components/wedding/DashboardVirtualHouse.tsx`
- Test: `src/utils/isometric.test.ts`

**Step 1: Escrever o teste unitário com as novas áreas**
Validar que a cozinha tem 20 células (`x: 0..3, y: 0..4`), sala tem 18 células (`x: 4..9, y: 4..6`) e a soma permanece 70 células.

**Step 2: Rodar o teste para confirmar falha**
Run: `npx vitest run src/utils/isometric.test.ts`

**Step 3: Atualizar `ISO_ROOMS` em `src/utils/isometric.ts`**
Aplicar a nova partição arquitetônica aprovada.

**Step 4: Rodar o teste para confirmar sucesso**
Run: `npx vitest run src/utils/isometric.test.ts`

---

### Task 3: Rotação e Alinhamento da Lavanderia e Cozinha (Sharp)

**Files:**
- Modify: `public/assets/iso/furniture_washing_machine.png`
- Modify: `public/assets/iso/furniture_fridge.png`
- Modify: `public/assets/iso/furniture_coffee_maker.png`
- Modify: `public/assets/iso/furniture_kitchen_cabinet.png`
- Modify: `public/assets/iso/furniture_air_fryer.png`
- Modify: `public/assets/iso/furniture_microwave.png`

**Step 1: Criar script de processamento de rotação com Sharp**
- Rotacionar `washing_machine` para South-East (`+X`) alinhada com a secadora.
- Rotacionar `fridge` para South-West (`+Y`) para a bancada linear da parede NE.
- Rotacionar `coffee_maker` para South-West (`+Y`) paralela à bancada da pia.
- Rotacionar `kitchen_cabinet`, `air_fryer` e `microwave` para South-East (`+X`) voltados para o interior da cozinha.

**Step 2: Executar script e validar integridade alfa**
Garantir zero halos brancos e 0 furos.

---

### Task 4: Sala de Estar: Sofá ↔ TV Eixo Y e Calibração dos Footprints

**Files:**
- Modify: `public/assets/iso/furniture_sofa.png`
- Modify: `public/assets/iso/furniture_tv_rack.png`
- Modify: `src/utils/isometric.ts`

**Step 1: Ajustar sprite e footprint do sofá para `2×1` voltado para `-Y NE`**
Sofá com encosto voltado para o observador e assento virado diretamente para a TV.

**Step 2: Centralizar `tv_rack` no footprint `2×1`**
Eliminar sobras laterais assimétricas.

---

### Task 5: Modularização da Mesa de Jantar e Cadeira Avulsa

**Files:**
- Create: `public/assets/iso/furniture_dining_chair.png`
- Modify: `public/assets/iso/furniture_dining_table.png`
- Modify: `src/utils/isometric.ts`
- Modify: `src/components/wedding/HouseCatalogSettings.tsx`
- Modify: `src/components/wedding/PublicVirtualHouse.tsx`

**Step 1: Gerar asset `dining_chair` (1×1) e recalibrar `dining_table` para 2×1 limpo**
Cadeiras com pernas nos vértices e sombra de contato.

**Step 2: Atualizar tipos e catálogo em TypeScript**
Adicionar `dining_chair` aos registros de móveis, tamanhos e preços.

---

### Task 6: Banheiro e Quarto: Privada Calibrada e Guarda-Roupa Sem Vazamento

**Files:**
- Modify: `src/utils/isometric.ts`
- Modify: `public/assets/iso/furniture_toilet.png`

**Step 1: Reposicionar `toilet` para `(5, 2)` e recalibrar centro no losango 1×1**
Caixa acoplada na aresta traseira e bacia contida sem transbordamento.

**Step 2: Remover `offsetX: +34` do `wardrobe`**
Assentar rigorosamente nas células `(6, 0)` e `(7, 0)`.

---

### Task 7: Atualização das Posições Padrão e Catálogo Demo

**Files:**
- Modify: `src/utils/isometric.ts` (`DEFAULT_FURNITURE_POSITIONS`)
- Modify: `src/components/wedding/PublicVirtualHouse.tsx` (`DEMO_HOUSE_GIFTS`)

**Step 1: Atualizar todas as coordenadas padrão com a nova ergonomia**
Garantir circulação 100% desobstruída e zonas funcionais claras.

---

### Task 8: Testes Automatizados de Colisão e Circulação (BFS)

**Files:**
- Test: `src/utils/isometric.test.ts`

**Step 1: Atualizar testes para incluir `dining_chair` e novas áreas de cômodos**
**Step 2: Executar testes**
Run: `npx vitest run`
Expected: 100% dos testes passando sem colisões e sem móveis bloqueados.

---

### Task 9: Validação Visual no Navegador e Evidências

**Files:**
- Script: `scripts/snap_house_v2.cjs`

**Step 1: Rodar build de produção**
Run: `npm run build`
Expected: Exit code 0.

**Step 2: Capturar screenshots via Playwright e inspecionar visualmente**
Verificar Desktop unclipped, Mobile fit e close-up de cada cômodo.
