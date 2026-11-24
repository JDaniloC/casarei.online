# Design Document: Paredes Contínuas (Conceito Loft) e Ajuste de Escala de Eletrodomésticos

**Data:** 2026-09-08  
**Status:** Proposto para aprovação  
**Branch:** `feat/house-isometric-assets`

---

## 1. Contexto e Objetivos

Após a implementação dos pisos contínuos e móveis de alta prioridade na Casa dos Sonhos, a validação visual revelou dois pontos críticos de melhoria:
1. **Paredes com aspecto ruim ("terríveis")**:
   - As paredes atuais são meias-paredes baixas com espessuras e tampas individuais em cada segmento de 64px, parecendo blocos de canteiro de obras / estacas repetidas em vez de paredes reais de uma casa.
   - Há paredes baixas nas bordas frontais que obstruem a visão dos cômodos.
   - Não há janelas integradas de forma natural e o canto superior `(0,0)` não se conecta perfeitamente.
2. **Escala de Eletrodomésticos**:
   - O **Micro-ondas** está renderizado no tamanho total de um losango (128x96px), parecendo do mesmo tamanho de um fogão ou de metade da bancada inteira, em vez de um eletrodoméstico compacto de bancada.

O usuário escolheu a seguinte direção:
- **Paredes**: Apenas paredes de fundo altas com janelas, mantendo o interior totalmente aberto (estilo loft/conceito aberto sem divisórias internas e sem paredes frontais).
- **Eletrodomésticos**: Reduzir o Micro-ondas para escala real de bancada (~64px em vez de 128px).

---

## 2. Arquitetura da Solução

### 2.1 Paredes de Fundo Contínuas (Estilo Loft com Janelas)
- **Localização**:
  - **Parede Noroeste (NW)**: Ao longo do limite `x=0` (de `y=0` até `y=6`, compreendendo Cozinha e Lavanderia).
  - **Parede Nordeste (NE)**: Ao longo do limite `y=0` (de `x=0` até `x=9`, compreendendo Cozinha, Banheiro e Quarto).
  - **Bordas Frontais**: 100% abertas, sem nenhum obstáculo à câmera.
- **Geometria e Encaixe Perfeito (Zero Emendas)**:
  - Altura: ~160px de altura vertical (paredes de pé-direito alto aconchegante).
  - Cada segmento tem inclinação isométrica exata (`dx=64px, dy=32px`) na base e no topo, com bordas laterais perfeitamente verticais.
  - O encontro no vértice `(0,0)` terá um módulo de canto interno perfeito de 90° conectando as faces NW e NE.
- **Acabamento Visual Premium**:
  - Tonalidade: Gesso claro acolhedor / off-white texturizado suave.
  - Rodapé elegante: Friso inferior em madeira branca/marfim delimitando o encontro com o piso.
  - Moldura superior limpa: Acabamento de sanca discreto.
  - Janelas panorâmicas com iluminação natural:
    - Janela na Cozinha (`x=1, y=0`), no Quarto (`x=8, y=0`) e na Lavanderia (`x=0, y=5`).
    - Vidro com leve reflexo e vista sutil para copa de árvores / céu claro.

### 2.2 Escala e Ancoragem do Micro-ondas
- **Dimensões em pixels**:
  - Dimensão anterior: `128x96px`.
  - Nova dimensão: `72x54px`.
- **Posicionamento**:
  - Em [`src/utils/isometric.ts`](file:///c:/Users/danil/Documents/code/casarei.online/src/utils/isometric.ts), atualizar `FURNITURE_PIXEL_SIZES.microwave` para `{ w: 72, h: 54, offsetX: 28 }` para ficar perfeitamente apoiado e proporcional à bancada e armários adjacentes.
  - Na demonstração, posicionado sobre o balcão/armário de cozinha.

---

## 3. Plano de Verificação

1. **Geração e Processamento de Assets**:
   - Criar script gerador em SVG/Sharp para os segmentos de parede NW, NE, canto e janelas com transparência limpa e encaixe contínuo.
   - Redimensionar e refinar o asset do micro-ondas para 72x54px mantendo nitidez.
2. **Atualização dos Componentes React**:
   - Em [`PublicVirtualHouse.tsx`](file:///c:/Users/danil/Documents/code/casarei.online/src/components/wedding/PublicVirtualHouse.tsx) e [`DashboardVirtualHouse.tsx`](file:///c:/Users/danil/Documents/code/casarei.online/src/components/wedding/DashboardVirtualHouse.tsx), renderizar exclusivamente as paredes de fundo altas com janelas e o novo canto limpo.
   - Atualizar a escala do micro-ondas nos helpers de dimensões.
3. **Validação Automatizada e Visual**:
   - `npm run build` e `npm test`.
   - Captura via `browser_subagent` em `http://localhost:8080/demo` para comprovar a estética das paredes e o tamanho do micro-ondas.
