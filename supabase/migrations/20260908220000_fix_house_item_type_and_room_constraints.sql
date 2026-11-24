-- As constraints chk_house_item_type e chk_house_room (20260527022300) ficaram
-- desatualizadas: cobrem só 12 combinações do catálogo original, enquanto
-- HouseCatalogSettings/isometric.ts hoje suportam 33 tipos de item em 5 cômodos
-- (incluindo o cômodo "laundry", que nem existia na lista antiga). Hoje, ativar a
-- maioria dos itens do catálogo (ex: microondas, guarda-roupa, tudo da área de
-- serviço) falha silenciosamente por violar essas constraints.

ALTER TABLE public.gifts DROP CONSTRAINT IF EXISTS chk_house_room;
ALTER TABLE public.gifts
ADD CONSTRAINT chk_house_room CHECK (house_room IN (
    'kitchen', 'bathroom', 'bedroom', 'laundry', 'living_room'
));

ALTER TABLE public.gifts DROP CONSTRAINT IF EXISTS chk_house_item_type;
ALTER TABLE public.gifts
ADD CONSTRAINT chk_house_item_type CHECK (house_item_type IN (
    -- Estruturais
    'foundation', 'floor_coverings', 'walls', 'painting', 'doors_windows',
    'roof', 'electric', 'plumbing',
    -- Cozinha
    'fridge', 'stove', 'microwave', 'sink_counter', 'dining_table',
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
    -- Vínculo livre (modal "Vincular Presente" sem tipo específico)
    'generic'
));
