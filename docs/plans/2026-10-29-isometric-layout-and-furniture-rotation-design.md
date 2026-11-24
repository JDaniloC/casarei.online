# Design Doc — Rebalanceamento Arquitetônico, Rotações e Encaixe Isométrico (Casa dos Sonhos)

> **Data:** 29/10/2026  
> **Status:** Aprovado pelo Usuário  
> **Escopo:** Rebalanceamento da grade 10×7, rotação e direcionamento de móveis/eletros, mesa modular de jantar, calibração milimétrica nos losangos (0px spill) e sincronização Supabase.

---

## 1. Contexto & Objetivos

A inspeção geométrica e visual detalhada da Casa dos Sonhos identificou desalinhamentos críticos de escala, ergonomia e orientação espacial:
1. **Desproporção de Cômodos:** A Cozinha (`16 células`) abrigava 9 itens com 69% de ocupação bruta (sem espaço de manobra), enquanto a Sala (`24 células`) possuía 67% de área ociosa. O Banheiro comprido (`2×4`) deixava a privada colada à mesa de jantar.
2. **Erros de Rotação Espacial:**
   - A máquina de lavar (`washing_machine`) apontava para South-West (`+Y`), com a porta voltada contra a lateral da secadora.
   - O armário da cozinha (`kitchen_cabinet`) abria portas para dentro da lavanderia (`y=4`), e seus eletros de bancada (`air_fryer` e `microwave`) apontavam respectivamente para o banheiro e lavanderia.
   - A cafeteira (`coffee_maker`) apontava para o lado em vez da frente da pia.
   - A geladeira (`fridge`) abria portas contra a bancada da pia em `(1,0)`.
   - O sofá (`sofa`) e a TV (`tv_rack`) estavam em eixos perpendiculares de 90° (quem senta no sofá não olha para a tela).
3. **Desalinhamento nos Quadrados do Chão:**
   - O sofá possuía footprint `1×2` na arte mas `2×1` no código, vazando para fora do piso.
   - O guarda-roupa possuía `offsetX: +34` indevido que transbordava para o quarto.
   - A privada flutuava solta no chão sem parede de apoio.
4. **Mesa Rígida:** O conjunto `2×2` da mesa não permitia modularidade e invadia a circulação do banheiro.

---

## 2. Decisões Arquitetônicas Aprovadas

### 2.1. Planta Baixa Rebalanceada (Grade 10×7, 70 Células)
Preserva o perímetro externo de 10×7 para encaixe 100% nativo do telhado [`roof.png`](file:///c:/Users/danil/Documents/code/casarei.online/public/assets/iso/roof.png):
- **Cozinha (`kitchen`):** `x: 0..3, y: 0..4` (`4×5 = 20 células`, +25% de expansão).
- **Sala de Estar (`living_room`):** `x: 4..9, y: 4..6` (`6×3 = 18 células`, sem salão vazio).
- **Área de Serviço (`laundry`):** `x: 0..3, y: 5..6` (`4×2 = 8 células`).
- **Banheiro (`bathroom`):** `x: 4..5, y: 0..3` (`2×4 = 8 células`, isolado das refeições).
- **Quarto (`bedroom`):** `x: 6..9, y: 0..3` (`4×4 = 16 células`).

### 2.2. Linha de Cozinha Gourmet & Mesa Modular
- **Parede NE (`y=0`):** Geladeira `(0,0)` virada para `+Y SW`, Bancada da Pia `(1..2,0)` com cuba esculpida virada para `+Y SW`, Cafeteira `(1,0)` virada para `+Y SW`, Fogão Cooktop `(3,0)` virado para `+Y SW`.
- **Parede NW (`x=0`):** Lava-Louças `(0,2)` virada para `+X SE`, Armário Gourmet `(0,3)` virado para `+X SE` (interior da cozinha).
- **Eletros de Bancada:** Air Fryer e Micro-ondas sobre o armário apontados para `+X SE` (interior da cozinha).
- **Mesa de Jantar Modular:** Mesa limpa `2×1` (`dining_table`) em `(2,2)` + Cadeiras avulsas `1×1` (`dining_chair`) com `zIndex` real por camada (cadeira norte atrás, cadeira sul na frente).

### 2.3. Sala de Estar Eixo Y (Frente a Frente)
- **Rack + TV (`tv_rack`, `2×1`):** Em `(6,4)-(7,4)` na parede divisória, apontando para `+Y SW`.
- **Sofá 3 Lugares (`sofa`, `2×1`):** Em `(6,6)-(7,6)`, com encosto no observador e assento voltado para `-Y NE` (olhando direto para a TV).
- **Mesa de Centro (`coffee_table`, `1×1`):** Em `(6,5)` entre o sofá e a TV.
- **Poltrona (`armchair`, `1×1`):** Em `(8,5)` virada para `NW (-X)`, fechando o lounge em "L".

### 2.4. Lavanderia, Banheiro e Quarto
- **Lavanderia:** Máquina de lavar `(0,5)` rotacionada para South-East (`+X`), alinhada à secadora `(0,6)` e ao tanque `(1,6)`.
- **Banheiro:** Vaso sanitário `(5,2)` encostado na divisória com o quarto, bacia contida no losango `1×1` sem transbordo.
- **Quarto:** Guarda-roupa `(6,0)-(7,0)` com `offsetX: 0` perfeitamente assentado no piso.

---

## 3. Modelo de Dados & Supabase
Nova migration SQL para atualizar [`chk_house_item_type`](file:///c:/Users/danil/Documents/code/casarei.online/supabase/migrations/20260908220000_fix_house_item_type_and_room_constraints.sql):
- Adição de `'dining_chair'` e `'dining_table_simple'`.
- Atualização das posições padrão em [`DEFAULT_FURNITURE_POSITIONS`](file:///c:/Users/danil/Documents/code/casarei.online/src/utils/isometric.ts#L96-L132) e itens demo em [`DEMO_HOUSE_GIFTS`](file:///c:/Users/danil/Documents/code/casarei.online/src/components/wedding/PublicVirtualHouse.tsx#L69-L113).
