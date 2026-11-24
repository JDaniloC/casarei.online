# Design Doc — Casa dos Sonhos: Implementação da Abordagem A (Pacote Crítico + Alto)

**Data:** 28/10/2026  
**Status:** Aprovado para Implementação  
**Escopo:** PublicVirtualHouse, DashboardVirtualHouse, isometric.ts e ativos de sprites isométricos.

---

## 1. Visão Geral da Arquitetura

A Abordagem A resolve de forma integrada e sem regressões os 6 problemas críticos e de alta severidade identificados na auditoria:

1. **Restauração de Sprites (Sharp determinístico):**
   - Fechamento de contorno de 1px e preenchimento de planos opacos 2:1 na secadora (`dryer`), máquina de lavar (`washing_machine`), fogão (`stove`) e pia do banheiro (`bathroom_sink`).
   - Espelhamento de `washing_machine` para South-East (alinhada à linha de serviço e voltada para o corredor).
   - Espelhamento de `bathroom_sink` para South-West (encostada na parede NE de fundo `y=0`), com moldura superior do espelho LED completa e sem artefatos.
   - Remoção de artefatos de pixels no tampo da cômoda (`dresser`).
   - Sincronização da versão de cache dos assets (`?v=30`).

2. **Câmera Responsiva `Fit-to-Viewport` & Zoom:**
   - Detecção dinâmica de largura via `ResizeObserver` / dimensões do container.
   - Cálculo automático de escala base: `fitScale = Math.min(1, containerWidth / SCENE_WIDTH)`.
   - Desktop: a casa é centralizada e renderizada sem cortes em 1024px+ (`width: 100%`).
   - Mobile (390px): a casa se ajusta para caber 100% na viewport na carga inicial (`scale ≈ 0.32`), liberando o scroll vertical nativo da página.
   - Controles flutuantes de câmera: Zoom In (`+`), Zoom Out (`-`) e Ajustar à Tela (`Reset`).

3. **Telhado 3D Realista & Encaixe nas Paredes Loft:**
   - Elevação do `zIndex` para `200000`, ficando acima de todos os móveis (`zIndex <= 150750`).
   - Cálculo correto de ancoragem dos beirais respeitando a altura das paredes loft de `192px` (`top: iso.y - 160`).
   - Fechamento volumétrico frontal: quando `showRoof` estiver ativo, renderização de paredes externas frontais para que o piso não pareça voar solto.
   - Adição do item `demo-roof` em `DEMO_HOUSE_GIFTS` para permitir testar e visualizar o telhado no `/demo`.

4. **Visibilidade dos Armários de Enxoval & Tooltips Touch:**
   - Elevação da camada dos botões de Armário de Enxoval para `zIndex: 185000`, posicionados em pontos centrais/desimpedidos de cada cômodo.
   - Suporte a toque/clique em móveis já financiados para abrir card flutuante do presenteador (`activeTooltipGiftId`) fora do stacking context local.

5. **Otimização de Query:**
   - Adição de filtro `.in("gift_id", giftIds)` na query de `order_items` em `PublicVirtualHouse.tsx`.

---

## 2. Plano de Verificação

- **Testes Unitários:** Execução de `npx vitest run` garantindo que todos os 73+ testes continuem passando com 0 colisões.
- **Build de Produção:** Execução de `npm run build` com saída exit code 0.
- **Auditoria Visual Automatizada (Playwright + Sharp):**
  - Captura de screenshot Desktop (1600x1100) confirmando que o quarto e lavanderia não sofrem cortes.
  - Captura de screenshot Mobile (390x844) confirmando que 100% da casa cabe na tela com auto-fit.
  - Captura de screenshot com telhado ativado confirmando `zIndex: 200000` sobre todos os móveis.
  - Varredura de canal alfa comprovando 0 pixels vazados nos sprites reparados.
