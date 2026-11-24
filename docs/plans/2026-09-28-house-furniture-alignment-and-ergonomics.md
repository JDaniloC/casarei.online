# Alinhamento de Móveis na Parede, Ocupação de Quadrados e Reorganização de Suíte e Banheiro — Plano de Implementação

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Fazer todos os móveis ocuparem com rigor os quadrados aos quais pertencem, encostar rente às paredes NW e NE (tanque, secadora, lava-louças, lavadora e guarda-roupa sem vãos), reorganizar a suíte e banheiro conforme a Abordagem A aprovada (cuba 100% livre, vaso sanitário privativo, penteadeira no closet e cama sob a janela) e assentar a poltrona na grade 2:1.

**Architecture:** 
1. Eliminação dos gaps de padding transparente nos sprites da parede NW (`laundry_sink`, `dryer`, `dishwasher`, `washing_machine`) para que assentem rente ao rodapé.
2. Correção de ancoragem traseira do `wardrobe` para encostar na parede de fundo NE sem flutuar verticalmente.
3. Reorganização das coordenadas em `src/utils/isometric.ts` e `src/components/wedding/PublicVirtualHouse.tsx` conforme Abordagem A: guarda-roupa divisório em `(6, 0)`, cama em `(8, 0)`, cuba em `(5, 0)`, vaso em `(4, 2)`, penteadeira em `(6, 2)`, cômoda em `(8, 2)`, lavadora em `(0, 4)` e micro-ondas na península em `(1, 3)`.
4. Correção geométrica do sprite da poltrona para o declive 2:1 ($\pm 0.500$) nos 4 pés.

**Tech Stack:** TypeScript, React, Vite, Vitest, Sharp, Playwright.

---

### Task 93: Calibração de Encosto na Parede NW (Tanque, Secadora, Lava-Louças e Lavadora)

**Files:**
- Modify: `public/assets/iso/furniture_laundry_sink.png`
- Modify: `public/assets/iso/furniture_dryer.png`
- Modify: `public/assets/iso/furniture_dishwasher.png`
- Modify: `public/assets/iso/furniture_washing_machine.png`
- Modify: `src/utils/isometric.ts`
- Modify: `src/components/wedding/PublicVirtualHouse.tsx`

**Step 1: Criar script de corte do padding esquerdo e alinhamento milimétrico na parede NW**
- Remover os 7px a 20px de transparência morta no lado esquerdo dos sprites da parede NW.
- Assegurar que a aresta traseira-esquerda assente exatamente no rodapé da parede NW (`x=0`).

**Step 2: Posicionar a Máquina de Lavar em (0, 4)**
- Mover `washing_machine` de `(1, 4)` para `(0, 4)`, compondo a bancada linear da lavanderia: `(0, 4)` Lavadora + `(0, 5)` Secadora + `(0, 6)` Tanque.
- Liberar 100% do corredor `(1, 4)` para circulação limpa.

**Step 3: Validar colisões e ocupação do quadrado**
- Rodar verificação de colisões e garantir que os 3 itens da lavanderia ocupem estritamente seus tiles 128x64.

---

### Task 94: Calibração de Encosto na Parede NE para o Guarda-Roupa (`wardrobe`)

**Files:**
- Modify: `src/utils/isometric.ts`
- Modify: `public/assets/iso/furniture_wardrobe.png`

**Step 1: Corrigir a ancoragem traseira do guarda-roupa**
- O guarda-roupa possui profundidade menor que um tile completo. Ancorar pela aresta traseira contra o rodapé da parede NE.
- Remover a flutuação vertical (`offsetY: -12`), assentando a base firmemente no chão de madeira.

**Step 2: Verificar matematicamente o contato da base com o rodapé**
- Confirmar que a distância entre a aresta traseira e a linha da parede NE é zero.

---

### Task 95: Reorganização Arquitetônica de Banheiro, Quarto e Cozinha (Abordagem A)

**Files:**
- Modify: `src/utils/isometric.ts`
- Modify: `src/components/wedding/PublicVirtualHouse.tsx`

**Step 1: Aplicar novo layout na Suíte (Quarto)**
- `wardrobe`: `(6, 0)` — Biombo alto de 3 portas separando o banheiro do quarto.
- `bed`: `(8, 0)` — Cama queen de casal encostada na parede NE sob a janela `x=8`.
- `vanity`: `(6, 2)` — Penteadeira camarim com espelho e banqueta desimpedidos no closet privativo.
- `dresser`: `(8, 2)` — Cômoda 6 gavetas aos pés da cama de casal.

**Step 2: Aplicar novo layout no Banheiro**
- `shower`: `(4, 0)` — Box walk-in reservado.
- `bathroom_sink`: `(5, 0)` — Cuba com espelho LED 100% desobstruída e utilizável (zero sobreposição da cama).
- `toilet`: `(4, 2)` — Vaso sanitário protegido pelo biombo do guarda-roupa, privativo e afastado da sala.

**Step 3: Mover Micro-ondas para a Península Gourmet da Cozinha**
- `microwave`: movido de `(2, 0)` para `(1, 3)` no `kitchen_cabinet`.
- A cuba de inox e torneira da pia da cozinha em `(2, 0)` ficam 100% livres e prontas para uso.

---

### Task 96: Geometria e Assentamento da Poltrona (`armchair`) nos Quadradinhos

**Files:**
- Modify: `public/assets/iso/furniture_armchair.png`
- Modify: `src/utils/isometric.ts`

**Step 1: Ajustar a projeção da poltrona para 2:1 autêntico**
- Corrigir a inclinação do lado direito de 45° ($\frac{dy}{dx} = 1.052$) para o declive estrito de $\frac{dy}{dx} = 0.500$.
- Garantir que os 4 pés de madeira assentem nos vértices dos quadradinhos de piso.

---

### Task 97: Validação Automatizada e Verificação Visual com Playwright

**Files:**
- Test: `npx vitest run`
- Build: `npm run build`
- Snapshots: `scripts/snap_live.cjs`

**Step 1: Rodar a suíte de testes vitest**
- Executar `npx vitest run` (esperado: 73/73 testes passando, 0 colisões).

**Step 2: Compilar o bundle de produção**
- Executar `npm run build` (esperado: exit code 0).

**Step 3: Capturar screenshots em alta resolução**
- Executar `scripts/snap_live.cjs` e inspecionar visualmente todos os cômodos (Lavanderia, Cozinha, Banheiro, Quarto e Sala).
