# Design Document: Regeneração e Novos Móveis para a Casa dos Sonhos

**Data:** 2026-09-08  
**Status:** Aprovado para planejamento de implementação  
**Branch:** `feat/house-isometric-assets`

---

## 1. Contexto e Objetivos

Com as novas paredes contínuas de fundo e o micro-ondas reescalado, a Casa dos Sonhos alcançou uma base arquitetônica limpa. Agora, precisamos harmonizar o restante do mobiliário e eletrodomésticos, corrigindo orientações invertidas, traços datados e adicionando os presentes mais populares de listas de casamento.

O usuário aprovou:
1. **Regeneração de 7 móveis existentes**:
   - **Fogão**: Moderno inox com cooktop, invertido para orientação compatível com as bancadas (baixo-esquerda).
   - **Gabinete de Banheiro**: Bancada em MDF com cuba de apoio e gaveteiro, eliminando a coluna e o espelho flutuante.
   - **Tanque de Lavanderia**: Tanque embutido com gabinete planejado branco, substituindo a bacia rústica de cimento.
   - **Máquina de Lavar**: Par idêntico da nova secadora (porta circular de vidro, painel digital, acabamento branco/inox).
   - **Vaso Sanitário**: Modelo monobloco/dual-flush com proporções enxutas (~68x80px).
   - **Rack com TV**: Orientação invertida para frente direta ao sofá, com rack ripado/moderno e tela slim.
   - **Mesa de Jantar**: Mesa de madeira nobre contemporânea de 4 lugares com cadeiras estofadas elegantes.
2. **Novos Itens / Modernização de Eletros (4)**:
   - **Lava-louças**: Modelo de embutir em aço inox alinhado aos armários da cozinha.
   - **Cafeteira Expresso**: Máquina de café expresso italiana compacta de bancada.
   - **Air Fryer**: Fritadeira digital preta/inox de bancada.
   - **Robô Aspirador**: Robô aspirador de pó redondo no chão.

---

## 2. Especificações de Dimensões e Ancoragem

| Item | Footprint (Grid) | Dimensões em Pixels (w x h) | Offset X | Orientação / Descrição |
|---|---|---|---|---|
| `furniture_stove.png` | 1x1 | 128 x 128 | 0 | Inox, cooktop 4 bocas, frente voltada para baixo-esquerda |
| `furniture_bathroom_sink.png` | 1x1 | 128 x 128 | 0 | Gabinete branco com cuba quadrada e torneira bica alta |
| `furniture_laundry_sink.png` | 1x1 | 128 x 128 | 0 | Tanque de inox embutido em gabinete planejado branco |
| `furniture_washing_machine.png` | 1x1 | 128 x 128 | 0 | Lavadora moderna branca/inox combinando com a secadora |
| `furniture_toilet.png` | 1x1 | 80 x 96 | 24 | Monobloco dual-flush proporção delicada para banheiro |
| `furniture_tv_rack.png` | 2x1 | 192 x 160 | 0 | Rack moderno virado para o sofá (baixo-direita) |
| `furniture_dining_table.png` | 2x2 | 256 x 192 | -64 | Mesa contemporânea com 4 cadeiras elegantes |
| `furniture_dishwasher.png` | 1x1 | 128 x 128 | 0 | Lava-louças de embutir inox escovado |
| `furniture_coffee_maker.png` | 1x1 | 64 x 56 | 32 | Cafeteira expresso compacta |
| `furniture_air_fryer.png` | 1x1 | 64 x 56 | 32 | Fritadeira sem óleo digital compacta |
| `furniture_robot_vacuum.png` | 1x1 | 64 x 40 | 32 | Robô aspirador preto/inox circular no piso |

---

## 3. Pipeline de Geração e Pós-Processamento

1. **Geração via `generate_image`**:
   - Prompt isométrico padronizado: ângulo 30° / dimetria 2:1, iluminação de estúdio suave, fundo 100% branco `#FFFFFF`, sem sombras no chão, sem paredes ou pisos inclusos.
2. **Processamento via Sharp (`scripts/process_furniture.js`)**:
   - Remoção de fundo branco por flood-fill a partir dos 4 cantos com tolerância de threshold.
   - Trim de pixels transparentes excedentes.
   - Redimensionamento e ancoragem na base inferior da imagem.
3. **Integração no Código React**:
   - Atualizar `FURNITURE_SIZES`, `FURNITURE_PIXEL_SIZES` e `FURNITURE_ICONS` em `src/utils/isometric.ts`.
   - Adicionar os novos itens na lista de demonstração em `PublicVirtualHouse.tsx`.
   - Garantir tipagem no TypeScript.

---

## 4. Verificação

- `npm run build` (exit code 0).
- `npm test -- --run` (60/60 testes passando).
- Inspeção visual no navegador (`http://localhost:8080/demo`) com screenshots capturados via `browser_subagent`.
