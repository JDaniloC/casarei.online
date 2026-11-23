-- Atualiza chk_house_item_type para incluir dining_chair (cadeira avulsa modular)
-- e dining_table_simple (mesa de jantar 2x1 sem cadeiras), mantendo compatibilidade
-- total com todos os 33 itens do catálogo e etapas de obra.

ALTER TABLE public.gifts DROP CONSTRAINT IF EXISTS chk_house_item_type;
ALTER TABLE public.gifts
ADD CONSTRAINT chk_house_item_type CHECK (house_item_type IN (
    -- Estruturais
    'foundation', 'floor_coverings', 'walls', 'painting', 'doors_windows',
    'roof', 'electric', 'plumbing',
    -- Cozinha
    'fridge', 'stove', 'microwave', 'sink_counter', 'dining_table',
    'dining_table_simple', 'dining_chair',
    'kitchen_cabinet', 'dishwasher',
    -- Sala
    'sofa', 'tv_rack', 'coffee_table', 'armchair',
    -- Quarto
    'bed', 'wardrobe', 'dresser', 'vanity',
    -- Banheiro
    'toilet', 'bathroom_sink', 'shower',
    -- Área de Serviço
    'washing_machine', 'dryer', 'laundry_sink',
    -- Eletrodomésticos de bancada / robôs
    'coffee_maker', 'air_fryer', 'robot_vacuum',
    -- Vínculo livre
    'generic'
));
