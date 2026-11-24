# Design Doc — Casa dos Sonhos: Nova Arquitetura Espacial, Rotações e Coesão Visual dos Cômodos

**Data**: 29/10/2026  
**Status**: Aprovado pelo Usuário  
**Autor**: Antigravity & Usuário  

---

## 1. Contexto & Objetivos

A inspeção crítica das capturas visuais da Casa dos Sonhos (`final_layout_desktop.png` e close-ups por cômodo) revelou incoerências de usabilidade espacial, orientação de móveis e privacidade:

1. **Sala de Estar**: O sofá e a TV estavam posicionados em ângulo de 90° (perpendiculares), impossibilitando assistir à TV. A poltrona ficava de costas para a tela.
2. **Cozinha**: O armário planejado com eletros (micro-ondas e air fryer) estava com gavetas voltadas para a área de serviço/banheiro em vez do interior da cozinha. A mesa de jantar continha apenas uma cadeira que apontava para a geladeira.
3. **Banheiro & Quarto**: O guarda-roupa na parede de fundo do quarto projetava sombra e transbordava visualmente sobre a pia e espelho LED do banheiro. O vaso sanitário estava exposto no centro do salão aberto e colado na divisória com a suíte.
4. **Área de Serviço**: A secadora cobria a janela de iluminação natural da parede esquerda e o piso cinza da lavanderia avançava sobre a circulação da sala.

O objetivo deste projeto é reestruturar a planta isométrica (10×7 = 70 células), calibrar os sprites e rotações para que cada cômodo atinja **100% de coerência funcional, ergonômica e estética**.

---

## 2. Arquitetura Espacial e Planta Baixa (ISO_ROOMS)

A malha isométrica total compreende 10 colunas (`x = 0..9`) por 7 linhas (`y = 0..6`) totalizando 70 células:

```
                  PAREDE NORTE-ESTE (y = 0)
     (0,0) Banho/Coz.                        (9,0) Quarto
      ┌───────────┬───────────┬──────────────────────┐
      │  COZINHA  │ BANHEIRO  │        QUARTO        │
      │ Pia,Fogão │ Box (4,0) │ Cama Queen  Guarda-  │
      │ Geladeira │ Pia (5,0) │ (6,0)-(7,1) Roupa    │
      │ L.Louças  │ Vaso(4,1) │             (8,0)    │
      ├───────────┴───────────┼──────────────────────┤
PAREDE│ Armário + Eletros(+X) │ Cômoda     Penteadeira
NORTE-│ Mesa Jantar + 2 Cad.  │ (6,2)       (9,2)    │
OESTE ├───────────┬───────────┴──────────────────────┤
(x=0) │LAVANDERIA │           SALA DE ESTAR          │
      │JanelaLivre│ Painel TV 2×1 (+Y) em (7,4)-(8,4)│
      │Lava/Seca  │ Sofá Traseiro 2×1 (-Y) em (7,6)  │
      │Tanque(0,6)│ Mesa Centro (6,5) + Poltrona(5,5)│
      └───────────┴──────────────────────────────────┘
```

### Divisão de Cômodos:
- **Cozinha** (`kitchen`, 20 células): `x: 0..3, y: 0..4` (Piso cerâmico xadrez branco).
- **Área de Serviço** (`laundry`, 6 células): `x: 0..2, y: 5..6` (Piso vinílico cinza grafite). Delimitação rigorosa para não invadir a sala.
- **Sala de Estar Integrada** (`living_room`, 20 células): `x: 3..9, y: 5..6` e `x: 4..9, y: 4` (Piso tábuas de carvalho).
- **Banheiro** (`bathroom`, 8 células): `x: 4..5, y: 0..3` (Azulejos cerâmicos aqua).
- **Quarto** (`bedroom`, 16 células): `x: 6..9, y: 0..3` (Piso de madeira natural).

---

## 3. Disposição dos Móveis e Ergonomia

### 3.1. Sala de Estar (Frente a Frente 100% Natural)
- **Painel TV OLED 2×1 (`tv_rack`)**: Posicionado em `(7, 4)-(8, 4)` encostado na divisória com o quarto, tela voltada para a frente (`+Y South-West`).
- **Sofá Contemporâneo 2×1 (`sofa`)**: Posicionado em `(7, 6)-(8, 6)` voltado para `-Y North-East` com sprite de visão traseira 3/4. Linha de visão direta e desimpedida para a TV.
- **Mesa de Centro 1×1 (`coffee_table`)**: Posicionada em `(6, 5)` entre o sofá e a TV.
- **Poltrona Escandinava 1×1 (`armchair`)**: Posicionada em `(5, 5)` voltada para o centro do lounge, sem obstruir a visão da TV nem o fluxo da sala.
- **Robô Aspirador (`robot_vacuum`)**: Em `(4, 5)` e Presente (`generic`) em `(9, 5)`.

### 3.2. Cozinha & Sala de Jantar
- **Bancada de Fundo (Parede NW `x=0` e `y=0`)**:
  - Pia dupla inox (`sink_counter`) em `(0, 0)`.
  - Fogão cooktop 4 bocas com forno (`stove`) em `(1, 0)`.
  - Geladeira French Door inox (`fridge`) em `(2, 0)` voltada para a frente da cozinha (`+Y`).
  - Lava-louças moderna (`dishwasher`) em `(3, 0)`.
- **Península Gourmet**:
  - Balcão planejado (`kitchen_cabinet`) em `(1, 3)` com puxadores voltados para `+X` (interior da cozinha).
  - Micro-ondas (`microwave`) e Air Fryer (`air_fryer`) assentados no tampo de granito preto virados para o interior da cozinha.
- **Conjunto de Jantar Modular**:
  - Mesa de jantar 2×1 em carvalho (`dining_table`) em `(2, 2)-(3, 2)`.
  - Duas cadeiras avulsas (`dining_chair`) 1×1 em `(1, 2)` e `(3, 2)` (ou `(2, 1)` e `(2, 3)`), com circulação livre ao redor.

### 3.3. Banheiro & Quarto
- **Banheiro**:
  - Box blindex walk-in alto (`shower`) em `(4, 0)`.
  - Gabinete com cuba esculpida e espelho LED retangular (`bathroom_sink`) em `(5, 0)`. Visão 100% desobstruída.
  - Vaso sanitário monobloco (`toilet`) recuado em `(4, 1)` protegido na área privativa dos azulejos azuis.
- **Quarto**:
  - Cama de casal queen (`bed`) em `(6, 0)-(7, 1)` sob a parede NE com cabeceira elegante.
  - Guarda-roupa 3 portas (`wardrobe`) movido para o canto `(8, 0)-(9, 0)`, eliminando qualquer invasão sobre o espelho do banheiro.
  - Cômoda 6 gavetas (`dresser`) em `(6, 2)-(7, 2)` aos pés da cama com área livre para abertura das gavetas.
  - Penteadeira camarim (`vanity`) em `(9, 2)` compondo suíte integrada.

### 3.4. Área de Serviço
- Tanque inox com esfregador (`laundry_sink`) em `(0, 6)`.
- Máquina de lavar frontal (`washing_machine`) em `(1, 6)`.
- Secadora de roupas (`dryer`) em `(2, 6)`.
- A célula `(0, 5)` fica livre sob a janela da parede NW, permitindo entrada contínua de luz natural sem bloqueios de equipamentos altos.

---

## 4. Engenharia de Sprites & Modificações Gráficas

1. **Sofá com Visão Traseira 3/4 (`furniture_sofa_back.png`)**:
   - Dimensões: 192×128px (pegada 2×1).
   - Base com declive isométrico estrito (+0.500 / -0.500).
   - Encosto acolchoado texturizado em linho cinza contemporâneo, costura visível no topo, topo das almofadas macias, base estrutural de carvalho e pés cônicos chanfrados com sombra de contato grounded.
   - Substituição transparente no asset canônico `furniture_sofa.png` (ou variante controlada).
2. **Balcão Planejado (`furniture_kitchen_cabinet.png`)**:
   - Ajustar orientação de portas e gavetas para South-East (`+X`).
3. **Calibração de Offsets em `FURNITURE_PIXEL_SIZES`**:
   - Garantir que todos os 26 móveis fiquem com pés e bases rigorosamente dentro dos losangos de piso (spill = 0).

---

## 5. Estratégia de Verificação e Evidências

1. **Testes Automatizados**:
   - `npx vitest run`: Validação da suíte completa de 12 arquivos (mínimo 79 testes passando).
   - Verificação de 0 colisões em `isometric.test.ts`.
   - Verificação de acessibilidade BFS (todos os itens essenciais alcançáveis).
   - Verificação de regras de bancada (`isCountertopProperlyPlaced`).
2. **Build de Produção**:
   - `npm run build`: Garantir saída com exit code 0 sem erros de TypeScript ou bundle.
3. **Inspeção Visual com Playwright**:
   - Capturar screenshots em Desktop (1600px unclipped) e Mobile (390px fit).
   - Gerar recortes dos 5 cômodos e inspecionar visualmente via `read_file` antes de confirmar conclusão.
