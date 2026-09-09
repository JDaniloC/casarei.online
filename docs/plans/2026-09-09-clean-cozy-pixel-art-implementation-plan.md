# Plano de Implementação: Unificação Clean Cozy Pixel Art

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Substituir 100% dos renders 3D por uma coleção unificada de Clean Cozy Pixel Art com contorno de 1px, sombreamento cel-shading em 2–4 tons, projeção axonométrica dimétrica 2:1 exata e confinamento rigoroso no footprint do grid.

**Architecture:** Script central em Node.js (`scripts/render_pixel_art_furniture.js`) que processa o acervo de sprites pixel art autênticos com o fator angular dimétrico 2:1 (0.866), outline nítido de 1px, clamping no losango e tratamento de itens específicos (sofá reto 2×1, micro-ondas compacto de bancada, box de chuveiro transparente). Integração direta com `src/utils/isometric.ts` e validação no navegador em `http://localhost:8080/demo`.

**Tech Stack:** Node.js, Sharp, TypeScript, React, TailwindCSS/Vanilla CSS, Vitest, Playwright (browser_subagent).

---

### Task 1: Criar o script de processamento e normalização Clean Cozy Pixel Art (`scripts/render_pixel_art_furniture.js`)

**Files:**
- Create: `scripts/render_pixel_art_furniture.js`

**Step 1: Escrever o script que:**
1. Extrai do commit `36a3744` todos os sprites pixel art com pixel stepping genuíno.
2. Aplica a correção angular de inclinação dimétrica 2:1 (`fator 0.8660`) usando interpolação `nearest-neighbor` (sem borrões).
3. Remove sombras escuras de chão legadas e aplica contorno contínuo de 1px em tons profundos harmônicos.
4. Gera o sofá linear reto 2×1 de 3 lugares.
5. Gera o micro-ondas compacto de bancada isolado (sem mesinha).
6. Limpa o chão do box de chuveiro para transparência total sobre o piso.
7. Gera eletros compactos (`coffee_maker`, `air_fryer`, `robot_vacuum`) e caixa de presente (`generic`) em pixel art.

**Step 2: Executar o script para gerar os 21 assets**
Run: `node scripts/render_pixel_art_furniture.js`
Expected: Todos os 21 assets gravados em `public/assets/iso/` com sucesso e dimensões exatas.

**Step 3: Commit**
```bash
git add scripts/render_pixel_art_furniture.js
git commit -m "feat(assets): add pixel art furniture generator script"
```

---

### Task 2: Atualizar os metadados de dimensões e offsets em `src/utils/isometric.ts`

**Files:**
- Modify: `src/utils/isometric.ts`
- Test: `src/utils/isometric.test.ts`

**Step 1: Ajustar `FURNITURE_PIXEL_SIZES` para refletir as alturas normalizadas em 2:1**
Atualizar `FURNITURE_PIXEL_SIZES` para garantir que os pés e bases fiquem cravados exatamente no chão de cada losango.

**Step 2: Rodar os testes de colisão e posicionamento**
Run: `npm test`
Expected: 65/65 testes passando.

**Step 3: Commit**
```bash
git add src/utils/isometric.ts src/utils/isometric.test.ts
git commit -m "fix(iso): update furniture pixel sizes and offsets for 2:1 pixel art"
```

---

### Task 3: Validação de Compilação e Testes Automatizados

**Files:**
- Test: Suíte completa Vitest e build Vite

**Step 1: Executar a suíte de testes unitários**
Run: `npm test`
Expected: 0 erros, todos os arquivos de teste passando.

**Step 2: Executar a compilação de produção**
Run: `npm run build`
Expected: Exit code 0, build bem-sucedido.

---

### Task 4: Validação Visual no Navegador via Browser Subagent

**Files:**
- Inspecionar: `http://localhost:8080/demo`

**Step 1: Navegar e capturar evidências visuais de todos os cômodos**
- Verificar o Sofá Reto de 3 lugares na Sala com folga frontal para a Mesa de Centro.
- Verificar o Fogão, Geladeira e Micro-ondas na Cozinha com tampos nivelados a 2:1.
- Verificar o Banheiro (Box de chuveiro com piso transparente).
- Verificar Quarto e Lavanderia.
- Confirmar que todos os itens têm contorno nítido de 1px e zero gradiente fotográfico.

**Step 2: Atualizar `docs/plans/task.md` e consolidar walkthrough**
