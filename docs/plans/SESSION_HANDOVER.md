# Session Handover & Contexto Atual — Casa dos Sonhos Isométrica

> **Data da Última Atualização**: 23/11/2026  
> **Branch**: `feat/house-isometric-assets`  
> **Status de Testes**: 80/80 vitest passando (12 arquivos, 0 falhas, BFS 100% acessível, 0 colisões)  
> **Status de Build**: `npm run build` exit code 0 (2239 módulos compilados)  
> **Evidências Visuais Inspecionadas**: 
> - [`final_house_clean.png`](file:///C:/Users/danil/.gemini/antigravity/brain/8b84fa00-9567-412a-822f-bc770ca8d9ab/scratch/final_house_clean.png)
> - [`final_house_grid.png`](file:///C:/Users/danil/.gemini/antigravity/brain/8b84fa00-9567-412a-822f-bc770ca8d9ab/scratch/final_house_grid.png)

---

## 1. O que foi Concluído e Validado

Concluímos a revisão completa de posição, rotação, encaixe nos tiles isométricos 2:1 e limpeza/adaptação de sprites da Casa Virtual:

1. **Cozinha em L (`x: 0..3, y: 0..3`) e Mesa Modular com 2 Orientações de Cadeira**:
   - Armário planejado (`kitchen_cabinet`) convertido para footprint `1×2` em `(0,0)..(0,1)` na parede NW voltado para **SE (`+X`)**, com `microwave` (sprite pixel art inox) em `(0,0)` e `air_fryer` em `(0,1)` paralelos no tampo de granito.
   - `stove` em `(0,2)` e `dishwasher` em `(0,3)` alinhados na parede NW voltados para **SE (`+X`)** com offsets calibrados (`-4,-2` e `-6,-3`).
   - `sink_counter` em `(1,0)..(2,0)` sob a janela NE (`x=1`) com `coffee_maker` em `(1,0)` e `fridge` em `(3,0)`, todos voltados para **SW (`+Y`)**.
   - Mesa de jantar `2×1` em `(2,2)..(3,2)` com `dining_chair` em `(2,1)` voltada para **SW (`+Y`)** e novo sprite `furniture_dining_chair_back.png` em `(3,3)` voltado para **NE (`-Y`)** via `getFurnitureSpriteKey` (sem duplicata de `dining_table_simple` no catálogo).

2. **Área de Serviço Expandida (`x: 0..3, y: 4..6`)**:
   - `dryer` em `(0,4)`, `laundry_sink` em `(0,5)` sob a janela NW (`y=5`) e `washing_machine` (sprite sólido em pixel art) em `(0,6)` enfileirados na parede NW voltados para **SE (`+X`)**, sem bloqueio entre portas e com offsets `-6,-3`.

3. **Banheiro (`x: 4..5, y: 0..3`) & Quarto (`x: 6..9, y: 0..3`)**:
   - `bathroom_sink` restaurado a partir do sprite original com espelho 100% íntegro (sem retângulo cinza e sem furos) e centralizado no losango `(5,0)`.
   - `toilet` em `(5,2)` orientado para **SW (`+Y`)** no interior do banheiro.
   - Janela NE do quarto movida para `x=6` (acima da cabeceira da cama em `(6,0)`), liberando o guarda-roupa em `(8,0)..(9,0)` (centralizado +16px e sem resíduos).
   - Penteadeira (`vanity`) em `(9,2)` rotacionada para **SW (`+Y`)** para dentro do quarto.

4. **Sala de Estar (`x: 4..9, y: 4..6`)**:
   - `armchair` em `(5,5)` rotacionada para **SE (`+X`)** olhando para a mesa de centro/TV.
   - `sofa` em `(7,6)` ajustado para caber dentro do losango `2×1` sem vazar nas bordas; `robot_vacuum` movido para `(4,6)` livre; `generic` redimensionado e assentado no piso em `(9,5)` (`offsetY: 0`).
   - `ASSET_VERSION = "35"` unificado entre cena, modal e painel; `DEMO_BUYERS` completo.

5. **Engenharia e Qualidade**:
   - Vitest: 80/80 testes passando em 12 arquivos (`ISO_ROOMS`, `findCollisions`, `z-index`, `getFurnitureSpriteKey`, `getRoofPlacement` e acessibilidade BFS).
   - Build: `npm run build` com exit code 0 (2239 módulos).
