# Design: Unificação Clean Cozy Pixel Art da Casa dos Sonhos

Data: 2026-09-09  
Autor: Equipe Antigravity & Usuário  
Status: Aprovado  

---

## 1. Contexto e Motivação

Durante as iterações de modelagem da Casa Virtual Isométrica, a tentativa de regenerar 18 móveis via inteligência artificial de difusão de imagem gerou itens no formato de **"renders 3D de catálogo fotográfico"**.

Ao inspecionar e ampliar no nível dos pixels os assets originais (como o `armchair`) versus os novos (como o `sofa`), foram constatadas **5 inconsistências estruturais**:

1. **Técnica de renderização incorreta**: Gradientes fotográficos contínuos, micro-texturas realistas (trama de tecido, veio de madeira, reflexos metálicos) e ausência de degraus de pixel (pixel stepping).
2. **Ausência de contorno definido**: Objetos sem contorno que dependem de sombras suaves, fazendo com que "derretam" visualmente no fundo escuro do dashboard.
3. **Sombreamento sem banding**: Centenas de tons interpolados (típico de luz 3D) em vez de faixas de tom discretas por superfície.
4. **Ângulo de câmera "em pé"**: Perspectiva 3/4 com inclinação vertical íngreme (35°–45°), conflitante com a projeção rasa dimétrica 2:1 do piso (`arctan(0.5) ≈ 26.57°`).
5. **Silhueta que desrespeita o footprint**: Sofá gerado em "L" (com chaise) invadindo a célula da mesa de centro, e bases que extrapolavam os limites dos losangos no chão.

Este documento formaliza o design para **unificar 100% dos móveis e eletrodomésticos no estilo Clean Cozy Pixel Art** (inspirado em *Unpacking* e no *Habbo Hotel* moderno), garantindo perfeita coerência visual, contornos nítidos e encaixe matemático na grade.

---

## 2. Princípios Técnicos do Clean Cozy Pixel Art

### 2.1 Projeção Dimétrica Axonométrica 2:1
- **Regra de inclinação**: Toda aresta horizontal no piso ou nos topos dos móveis segue rigorosamente a proporção de `2 pixels horizontais para 1 pixel vertical` (`dx = 2, dy = 1`).
- **Arestas verticais**: Perfeitamente retas e verticais (`dx = 0, dy = 1`).
- **Fator de Normalização Angular**: Modelos com inclinação padrão de 30° recebem o fator de compressão vertical $\frac{\tan(26.565^\circ)}{\tan(30^\circ)} = \frac{\sqrt{3}}{2} \approx 0.8660$, nivelando os tampos e bases com os ladrilhos `128x64`.

### 2.2 Silhueta Fechada com Contorno Nítido de 1px
- **Outline externo**: Linha contínua de 1px de espessura que envolve completamente a silhueta do objeto.
- **Tonalidades harmônicas**: Em vez de um preto cru (`#000000`), utiliza-se tons escuros adaptados ao material:
  - Metais e eletros: Carvão profundo (`#1e232a`)
  - Madeiras: Nogueira escura (`#2b201a`)
  - Estofados e tecidos: Ardósia escura (`#262a30`)
- **Separação de contraste**: O contorno garante separação óptica imediata tanto sobre os pisos claros quanto sobre o fundo escuro do dashboard (`#121418`).

### 2.3 Sombreamento Escalonado (Banding / Cel-Shading)
- Nenhuma superfície terá gradiente contínuo ou interpolação suave.
- Cada material terá de **2 a 4 tons discretos indexados**:
  - **Tom 1 (Highlight/Zenital)**: Superfícies voltadas para cima (tampos, assentos, teto dos aparelhos).
  - **Tom 2 (Tom Médio/Frontal)**: Faces voltadas para o canto inferior-esquerdo (luz principal).
  - **Tom 3 (Sombra/Lateral)**: Faces voltadas para o canto inferior-direito (zona de meia-luz/sombra).
  - **Tom 4 (Acento Escuro)**: Frestas, rebaixos e linhas de junção de gavetas/portas.

### 2.4 Confinamento Matemático do Footprint (Losangos no Chão)
Todos os pontos de contato com o solo (pés, rodapés, bases) devem estar estritamente contidos dentro do losango atribuído ao móvel:
- **Célula 1×1 (128×64)**:
  $$\frac{|x - 64|}{2} + |y - 96| \le 32$$
- **Célula 2×1 (192×96)**:
  Vértices em $(64, 32)$, $(0, 64)$, $(128, 128)$ e $(192, 96)$.
- **Célula 2×2 (256×128)**:
  Base confinada dentro da área combinada de 4 células no piso.

Nenhum pé ou base pode cruzar as arestas externas do losango.

---

## 3. Especificação do Catálogo Unificado (21 Itens)

| Item | Footprint | Dimensões PNG | Estilo e Especificação Visual |
|---|---|---|---|
| **`sofa`** | 2×1 | 192×128 | **Sofá linear reto de 3 lugares** (sem chaise). 3 almofadas de assento, encosto acolchoado, 2 braços simétricos, 4 pés de madeira. Ângulo 2:1 e base confinada no losango 2×1. |
| **`armchair`** | 1×1 | 128×128 | Poltrona clássica cozy pixel art (asset de referência). Base e pés limpos, 1px outline. |
| **`coffee_table`** | 1×1 | 128×80 | Mesa de centro retangular em madeira clara com tampo de vidro e prateleira inferior. |
| **`tv_rack`** | 2×1 | 192×160 | Rack de madeira escura com nichos horizontais e TV de tela plana centralizada. |
| **`bed`** | 2×2 | 256×192 | Cama de casal com cabeceira de madeira ripada, lençol branco e 2 travesseiros com vincos em pixel art. |
| **`wardrobe`** | 2×1 | 192×160 | Guarda-roupa de madeira de 2 portas de correr com puxadores metálicos. |
| **`dresser`** | 2×1 | 192×128 | Cômoda de 4 gavetas largas em madeira com puxadores redondos dourados. |
| **`vanity`** | 1×1 | 128×128 | Penteadeira com espelho oval clássico, gaveta frontal e pernas de madeira torneadas. |
| **`fridge`** | 1×1 | 128×160 | Geladeira duplex/french-door de inox com dispenser de água e puxadores verticais. Tampo nivelado em 2:1. |
| **`stove`** | 1×1 | 128×128 | Fogão 4 bocas com forno e visor de vidro escuro. Tampo com trempes nivelado em 2:1. |
| **`microwave`** | 1×1 | 72×54 | Micro-ondas moderno de bancada (sem mesinha suporte), teclado numérico e porta de vidro. Senta sobre balcões. |
| **`sink_counter`** | 2×1 | 192×128 | Balcão de cozinha de 2 módulos com pia de cuba inox embutida e torneira curva. |
| **`kitchen_cabinet`** | 2×1 | 192×128 | Balcão de cozinha de 2 portas com tampo contínuo de madeira clara. |
| **`dishwasher`** | 1×1 | 128×128 | Lava-louças embutida com painel de botões frontal em aço escovado e puxador horizontal. |
| **`toilet`** | 1×1 | 80×96 | Vaso sanitário de louça branca com caixa acoplada e tampa. |
| **`bathroom_sink`** | 1×1 | 128×128 | Lavatório de coluna com espelho retangular elegante. |
| **`shower`** | 1×2 | 192×160 | Box de vidro temperado translúcido com chuveiro cromado e ralo no chão. **Piso transparente** (lajotas azuis antigas removidas para mostrar o piso real). |
| **`washing_machine`** | 1×1 | 128×128 | Máquina de lavar frontal branca com escotilha circular e painel digital. |
| **`dryer`** | 1×1 | 128×128 | Secadora de roupas combinando com a máquina de lavar. |
| **`laundry_sink`** | 1×1 | 128×128 | Tanque de lavar roupas com cuba profunda e torneira alta. |
| **`dining_table`** | 2×2 | 256×192 | Mesa de jantar de madeira maciça com 4 cadeiras perfeitamente posicionadas em volta. |
| **`coffee_maker`** | 1×1 | 64×56 | Cafeteira de cápsulas compacta para bancada com jarra e acabamento em pixel art. |
| **`air_fryer`** | 1×1 | 64×56 | Fritadeira elétrica sem óleo compacta para bancada com gaveta e timer. |
| **`robot_vacuum`** | 1×1 | 64×40 | Robô aspirador circular sobre o piso com sensores e luz de status. |
| **`generic`** | 1×1 | 128×128 | Caixa de presente decorativa cozy com fita de laço e 1px outline. |

---

## 4. Pipeline de Processamento Automatizado

O script de processamento (`scripts/render_pixel_art_furniture.js`):
1. **Fonte de Sprites**: Recupera os sprites com pixel stepping genuíno do acervo e fontes vetoriais/pixel.
2. **Normalização Angular 2:1**: Aplica o fator dimétrico 0.866 via interpolação de vizinho mais próximo (`nearest-neighbor`), preservando 100% da nitidez dos pixels sem gerar blur/anti-aliasing.
3. **Limpeza e Contorno de 1px**: Remove sombras borradas de chão antigas e aplica contorno exato de 1 pixel em tom profundo.
4. **Alinhamento do Losango**: Posiciona o ponto de ancoragem inferior no pixel de chão correto para o sistema `getFurniturePlacement()`.
5. **Transparência do Box do Chuveiro**: Descontamina o piso do box garantindo que os pisos geométricos do banheiro continuem contínuos por baixo.

---

## 5. Plano de Verificação

1. **Testes Automatizados (`npm test`)**: Todos os 65 testes em `src/utils/isometric.test.ts` e suíte geral devem passar.
2. **Compilação de Produção (`npm run build`)**: Zero erros TypeScript e Vite bundle limpo.
3. **Inspeção Visual via Browser (`browser_subagent`)**:
   - Abrir `http://localhost:8080/demo`
   - Inspecionar a sala (sofá reto 2×1 livre da mesa de centro)
   - Inspecionar a cozinha (micro-ondas na escala certa, fogão e geladeira alinhados aos ladrilhos)
   - Inspecionar o banheiro (box de chuveiro sobre piso real)
   - Confirmar contornos nítidos de 1px em todos os móveis sobre o fundo escuro.
