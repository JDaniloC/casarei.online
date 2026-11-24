# Paredes Contínuas (Estilo Loft com Janelas) e Escala de Eletrodomésticos Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Reformular as paredes da Casa dos Sonhos para um estilo loft de paredes de fundo contínuas e altas com janelas panorâmicas (sem divisórias internas ou paredes frontais) e redimensionar o micro-ondas para proporção real de bancada.

**Architecture:** Gerar paredes modulares contínuas em SVG/Sharp com inclinação isométrica exata (dx: 64px, dy: 32px), sem pilaretes repetitivos ou tampas bevel; integrar janelas arquitetônicas nas paredes de fundo; redimensionar o asset e os helpers de ancoragem do micro-ondas; atualizar os componentes React `PublicVirtualHouse.tsx` e `DashboardVirtualHouse.tsx`.

**Tech Stack:** React, TypeScript, SVG, Sharp, Vitest, TailwindCSS.

---

### Task 1: Gerar e compilar as novas paredes de fundo altas contínuas (NW e NE com janelas) em SVG/Sharp

**Files:**
- Create: `scripts/generate_walls.js`
- Create: `public/assets/iso/wall_nw_plain.png`
- Create: `public/assets/iso/wall_nw_window.png`
- Create: `public/assets/iso/wall_ne_plain.png`
- Create: `public/assets/iso/wall_ne_window.png`
- Create: `public/assets/iso/wall_corner.png`

**Step 1: Criar script de geração matemática dos segmentos de parede**
- Altura vertical: 160px.
- Largura: 64px por segmento.
- Parede NW: Base inclina de (64, 0) para (0, 32). Topo inclina de (64, -160) para (0, -128). Lados verticais retos para encaixe contínuo perfeito.
- Parede NE: Base inclina de (0, 0) para (64, 32). Topo inclina de (0, -160) para (64, -128).
- Versões com janela: Moldura sofisticada, vidro translúcido com reflexo suave e céu/árvores ao fundo.

**Step 2: Executar script e validar geração**
Run: `node scripts/generate_walls.js`
Expected: 5 novos arquivos PNG gerados em `public/assets/iso/` com 64x192px cada e sem bordas laterais que criem efeito de poste.

**Step 3: Commit**
`git add scripts/generate_walls.js public/assets/iso/wall_*.png`
`git commit -m "feat: generate continuous tall isometric back walls with windows"`

---

### Task 2: Redimensionar e ancorar o Micro-ondas para escala real de bancada

**Files:**
- Modify: `public/assets/iso/furniture_microwave.png`
- Modify: `src/utils/isometric.ts`

**Step 1: Redimensionar `furniture_microwave.png` para 72x54px mantendo alta definição**
Run: `node -e "const sharp = require('sharp'); sharp('public/assets/iso/furniture_microwave.png').resize(72, 54, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toFile('public/assets/iso/furniture_microwave_scaled.png');"`
Substituir `furniture_microwave.png`.

**Step 2: Atualizar `FURNITURE_PIXEL_SIZES.microwave` em `src/utils/isometric.ts`**
- Configurar `{ w: 72, h: 54, offsetX: 28 }`.

**Step 3: Ajustar posição do micro-ondas na demonstração em `PublicVirtualHouse.tsx`**
- Posicionado sobre a bancada / armário da cozinha (`x: 2, y: 0` ou alinhado com o topo do gabinete).

**Step 4: Commit**
`git add public/assets/iso/furniture_microwave.png src/utils/isometric.ts src/components/wedding/PublicVirtualHouse.tsx`
`git commit -m "fix: scale microwave down to realistic countertop size"`

---

### Task 3: Integrar paredes contínuas com janelas nos componentes React

**Files:**
- Modify: `src/components/wedding/PublicVirtualHouse.tsx`
- Modify: `src/components/wedding/DashboardVirtualHouse.tsx`

**Step 1: Substituir renderização das paredes antigas pela nova estrutura loft**
- Parede Noroeste (x=0, y=0..6): segmentos contínuos, com janela na lavanderia em `y=5`.
- Parede Nordeste (y=0, x=0..9): segmentos contínuos, com janelas na cozinha (`x=1`) e no quarto (`x=8`).
- Canto em `(0,0)` conectando as duas faces sem vãos.
- Nenhuma parede frontal ou decorativa nas extremidades baixas.

**Step 2: Commit**
`git add src/components/wedding/PublicVirtualHouse.tsx src/components/wedding/DashboardVirtualHouse.tsx`
`git commit -m "feat: integrate continuous loft back walls with windows into virtual house"`

---

### Task 4: Validação dos testes automatizados e compilação

**Files:**
- Test: `npm test -- --run`
- Build: `npm run build`

**Step 1: Rodar os testes de regressão**
Run: `npm test -- --run`
Expected: 11/11 arquivos e 60/60 testes passando.

**Step 2: Rodar compilação do TypeScript/Vite**
Run: `npm run build`
Expected: Exit code 0 sem erros.

---

### Task 5: Validação visual no navegador e captura de evidências

**Step 1: Navegar para `http://localhost:8080/demo` e capturar a Casa dos Sonhos**
- Verificar que as paredes de fundo são altas, contínuas, elegantes e contêm janelas naturais.
- Verificar que o micro-ondas agora tem tamanho proporcional e realista de bancada.
- Capturar screenshot e atualizar o walkthrough.
