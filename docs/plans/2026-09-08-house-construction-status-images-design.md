# Design de Atualização e Harmonização dos Assets Isométricos 2D

## 1. Contexto e Objetivo
A página da Casa dos Sonhos / Status da Construção da Casa ([`DashboardVirtualHouse.tsx`](file:///c:/Users/danil/Documents/code/casarei.online/src/components/wedding/DashboardVirtualHouse.tsx) e [`PublicVirtualHouse.tsx`](file:///c:/Users/danil/Documents/code/casarei.online/src/components/wedding/PublicVirtualHouse.tsx)) utiliza um grid isométrico (tiles de 128x64 px) para gamificar os presentes de casamento. Diversos assets visuais apresentavam problemas de encaixe, anatomia gerada por IA defeituosa e descontinuidade nos pisos.

Este documento formaliza o design aprovado para regeração das imagens de alta prioridade e ajuste de layout no estilo 2D isométrico.

---

## 2. Diagnóstico dos Problemas Identificados
1. **Pisos com "Efeito Escada"**: As texturas de piso anteriores possuíam chanfro/sombra 3D na borda inferior de cada célula de 128x64 px, criando a sensação de blocos de pedra soltos e desnivelados em vez de um chão uniforme e liso por cômodo.
2. **Erros Anatômicos nos Móveis**:
   - `furniture_dryer.png`: Porta frontal duplicada em duas faces simultaneamente.
   - `furniture_wardrobe.png`: Aparador baixo (credenza) gerado no lugar de um guarda-roupa alto de casal.
   - `furniture_shower.png`: Piso de ladrilho azul embutido dentro da imagem do box, sobrepondo o piso do cômodo.
   - `furniture_microwave.png`: Montado em cima de um banquinho rústico de madeira inadequado.
   - `furniture_sink_counter.png` e `furniture_kitchen_cabinet.png`: Desproporcionais (6 portas, retorno em L), não cabendo nas proporções 2x1 do grid.
   - `furniture_generic.png`: Arquivo vazio de 1x1 pixel (placeholder).
3. **Ancoragem CSS Incompleta**: Falta de largura e altura explícitas nos contêineres absolutos dos móveis no React, dependendo do tamanho intrínseco e causando flutuações de base.

---

## 3. Especificação dos Pisos Geométricos (Tiles 128x64)
Mantemos `tile_foundation.png` como a laje bruta de concreto com profundidade física e recriamos os pisos de acabamento como losangos planos perfeitos com cantos em `(64, 0)`, `(128, 32)`, `(64, 64)`, `(0, 32)`:

- **`tile_living.png`**: Laminado/parquet de madeira carvalho dourado quente com encaixe contínuo sem divisões falsas.
- **`tile_bedroom.png`**: Madeira escura nobre/nogueira aconchegante.
- **`tile_kitchen.png`**: Porcelanato acetinado claro moderno com rejunte fino e sutil.
- **`tile_bathroom.png`**: Ladrilho/pastilha contemporânea em tons neutros/cinza suave.
- **`tile_laundry.png`**: Cimento queimado/piso cinza fosco uniforme.

---

## 4. Especificação dos Móveis de Alta Prioridade
Pipeline: Geração via IA com prompts isométricos 2D dimétricos (30°), recorte de transparência e ancoragem na base via [`process_assets.js`](file:///c:/Users/danil/Documents/code/casarei.online/process_assets.js):

| Item | Grid | Target Box | Especificação Visual |
|---|---|---|---|
| `furniture_dryer.png` | 1x1 | 128x128 px | Secadora frontal com porta circular única em vidro escuro, combinando com a máquina de lavar. |
| `furniture_wardrobe.png` | 2x1 | 192x160 px | Guarda-roupa alto de casal, portas de correr elegantes (madeira ripada ou espelhada). |
| `furniture_shower.png` | 1x2 | 192x160 px | Box de vidro transparente com perfis pretos/inox, chuveiro no teto e **base 100% transparente**. |
| `furniture_microwave.png` | 1x1 | 128x96 px | Micro-ondas solo em inox escovado/preto com display digital, sem bancos ou suportes adicionais. |
| `furniture_sink_counter.png` | 2x1 | 192x128 px | Bancada de 2 portas com cuba inox, torneira alta gourmet e tampo de pedra clara (2x1 proporcional). |
| `furniture_kitchen_cabinet.png` | 2x1 | 192x128 px | Módulo reto de 2 portas/gaveteiro, alinhado em altura e acabamento com a pia. |
| `furniture_generic.png` | 1x1 | 128x128 px | Caixa de presente clássica dourada/champagne com fita de cetim elegante. |

---

## 5. Ancoragem e Ajustes no Código React
Nos componentes [`DashboardVirtualHouse.tsx`](file:///c:/Users/danil/Documents/code/casarei.online/src/components/wedding/DashboardVirtualHouse.tsx) e [`PublicVirtualHouse.tsx`](file:///c:/Users/danil/Documents/code/casarei.online/src/components/wedding/PublicVirtualHouse.tsx):
- O contêiner de cada móvel deve ter dimensões explícitas baseadas em `TARGET_SIZES[furniture.house_item_type]`.
- Ancoragem vertical calculada de forma que a base do objeto repouse exatamente no centro da célula isométrica.

---

## 6. Critérios de Verificação
1. Todos os 12 assets (5 pisos + 7 móveis) presentes e íntegros em `public/assets/iso/`.
2. Pisos renderizando de forma contínua em cada cômodo (sem degraus intermediários).
3. Box de chuveiro exibindo o piso do banheiro por transparência.
4. Secadora, armário de casal, micro-ondas, balcões e presente genérico com proporções e visual corretos.
5. Verificação de build com `npm run build` ou teste do painel e site público.
