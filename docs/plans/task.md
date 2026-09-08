| Task | Status | Notes |
|---|---|---|
| Task 1: Gerar e compilar as 5 texturas de pisos geométricos contínuos (128x64) em SVG/Sharp | COMPLETED | Gerados tile_kitchen, tile_living, tile_bedroom, tile_bathroom, tile_laundry e tile_foundation (128x64 exatos, sem frestas) e TILE_Y_OFFSET ajustado para 0 |
| Task 2: Gerar e processar os 7 móveis de alta prioridade com IA e Sharp | COMPLETED | Gerados e processados dryer, wardrobe, shower, microwave, sink_counter, kitchen_cabinet e generic com transparência limpa e dimensões exatas |
| Task 3: Padronizar dimensões e ancoragem nos componentes React | COMPLETED | Helpers FURNITURE_PIXEL_SIZES e getFurniturePlacement integrados em DashboardVirtualHouse.tsx e PublicVirtualHouse.tsx com dimensões explícitas e ancoragem inferior |
| Task 4: Validação dos testes automatizados e compilação | COMPLETED | npm run build passou com sucesso (0 erros) e npm run test passou com 11/11 arquivos e 60/60 testes |
| Task 5: Execução do projeto e validação visual no navegador (demo) | COMPLETED | Servidor dev rodando em http://localhost:8080/demo com renderização isométrica validada e screenshots capturados |
| Task 6: Gerar novas paredes de fundo altas contínuas (NW e NE com janelas) em SVG/Sharp | PENDING | Criar scripts/generate_walls.js e compilar wall_nw_plain, wall_nw_window, wall_ne_plain, wall_ne_window, wall_corner |
| Task 7: Redimensionar e ancorar o Micro-ondas para escala real de bancada | PENDING | Redimensionar furniture_microwave.png para ~72x54px e ajustar offsets em isometric.ts |
| Task 8: Integrar paredes contínuas estilo loft e novo micro-ondas no React | PENDING | Atualizar PublicVirtualHouse.tsx e DashboardVirtualHouse.tsx, removendo paredes frontais e pilaretes |
| Task 9: Validação automatizada e inspeção visual no navegador | PENDING | npm test, npm run build e captura no navegador em localhost:8080/demo |
