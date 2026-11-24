# Atualização dos Assets Isométricos 2D da Casa dos Sonhos Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Regerar e ajustar as imagens de alta prioridade da casa virtual 2D (pisos contínuos e 7 móveis críticos), além de padronizar a ancoragem dimensional no React.

**Architecture:** Pipeline híbrido onde os pisos são gerados com geometria vetorial/SVG exata (128x64 px sem degraus artificiais) e os móveis são gerados com arte isométrica 2D, recortados e posicionados via Sharp (`process_assets.js`) e ancorados nos componentes React (`DashboardVirtualHouse.tsx` e `PublicVirtualHouse.tsx`).

**Tech Stack:** Node.js, Sharp, SVG, React, TypeScript, Tailwind CSS, Vite.

---

### Task 1: Gerar e compilar as 5 texturas de pisos geométricos contínuos (128x64)

**Files:**
- Create: `scripts/generate_floors.js`
- Overwrite: `public/assets/iso/tile_kitchen.png`
- Overwrite: `public/assets/iso/tile_living.png`
- Overwrite: `public/assets/iso/tile_bedroom.png`
- Overwrite: `public/assets/iso/tile_bathroom.png`
- Overwrite: `public/assets/iso/tile_laundry.png`

**Step 1: Criar script de renderização SVG -> PNG com Sharp**
Criar `scripts/generate_floors.js` definindo os caminhos SVG exatos dos losangos isométricos (128x64) com padrões táteis de madeira, porcelanato e ladrilho, sem quina 3D chanfrada na base.

**Step 2: Executar geração dos pisos**
Comando: `node scripts/generate_floors.js`
Expected: 5 arquivos gerados em `public/assets/iso/` com 128x64 px.

**Step 3: Verificar dimensões e integridade dos arquivos**
Comando: `node -e "const fs = require('fs'); ['tile_kitchen','tile_living','tile_bedroom','tile_bathroom','tile_laundry'].forEach(n => { const b = fs.readFileSync('public/assets/iso/' + n + '.png'); console.log(n, b.readUInt32BE(16), b.readUInt32BE(20)); })"`
Expected: Todos 128 x 64.

---

### Task 2: Gerar e processar os 7 móveis de alta prioridade

**Files:**
- Modify: `process_assets.js`
- Overwrite: `public/assets/iso/furniture_dryer.png`
- Overwrite: `public/assets/iso/furniture_wardrobe.png`
- Overwrite: `public/assets/iso/furniture_shower.png`
- Overwrite: `public/assets/iso/furniture_microwave.png`
- Overwrite: `public/assets/iso/furniture_sink_counter.png`
- Overwrite: `public/assets/iso/furniture_kitchen_cabinet.png`
- Overwrite: `public/assets/iso/furniture_generic.png`

**Step 1: Gerar as novas imagens de arte isométrica 2D**
Gerar os 7 itens na pasta `raw_assets/` com fundo transparente e proporções 2D dimétricas:
- `furniture_dryer.png`: Secadora moderna com porta circular frontal única.
- `furniture_wardrobe.png`: Guarda-roupa alto de casal de 2 portas de correr elegantes.
- `furniture_shower.png`: Box em vidro temperado transparente sem chão embutido.
- `furniture_microwave.png`: Micro-ondas de bancada solo em inox e vidro preto.
- `furniture_sink_counter.png`: Pia e bancada com cuba inox (2x1 proporcional).
- `furniture_kitchen_cabinet.png`: Balcão de armários de cozinha (2x1 proporcional).
- `furniture_generic.png`: Caixa de presente clássica dourada/marfim com laço.

**Step 2: Processar as imagens com Sharp**
Comando: `node process_assets.js`
Expected: Todas as imagens redimensionadas para as caixas alvo com `contain` e ancoragem inferior `bottom`.

**Step 3: Verificar dimensões e transparência**
Comando: `node -e "const fs = require('fs'); ['furniture_dryer','furniture_wardrobe','furniture_shower','furniture_microwave','furniture_sink_counter','furniture_kitchen_cabinet','furniture_generic'].forEach(n => { const b = fs.readFileSync('public/assets/iso/' + n + '.png'); console.log(n, b.readUInt32BE(16), b.readUInt32BE(20)); })"`

---

### Task 3: Padronizar dimensões e ancoragem nos componentes React

**Files:**
- Modify: `src/components/wedding/DashboardVirtualHouse.tsx`
- Modify: `src/components/wedding/PublicVirtualHouse.tsx`

**Step 1: Adicionar mapeamento de dimensões explícitas dos móveis**
Assegurar que os contêineres absolutos de móveis posicionados e móveis ghost possuam `width` e `height` definidos de acordo com o asset, evitando colapsos de layout no navegador.

**Step 2: Compilar e validar TypeScript**
Comando: `npm run build`
Expected: Sucesso (código de saída 0).

---

### Task 4: Validação dos testes automatizados e commit

**Files:**
- Test: `src/pages/Dashboard.test.tsx`

**Step 1: Rodar testes unitários existentes**
Comando: `npm run test`
Expected: Todos os testes passando.

**Step 2: Commit das alterações**
Comando: `git add . && git commit -m "feat: atualizacao dos assets isometricos de alta prioridade da casa"`
