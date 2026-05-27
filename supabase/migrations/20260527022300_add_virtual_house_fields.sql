-- Migration to add spatial and customization fields to gifts
ALTER TABLE public.gifts
ADD COLUMN house_item_type TEXT DEFAULT NULL,
ADD COLUMN house_room TEXT DEFAULT NULL,
ADD COLUMN house_position_x INTEGER DEFAULT NULL,
ADD COLUMN house_position_y INTEGER DEFAULT NULL;

-- Validate room groupings
ALTER TABLE public.gifts
ADD CONSTRAINT chk_house_room CHECK (house_room IN ('kitchen', 'living_room', 'bedroom', 'bathroom'));

-- Validate core placeable catalog types
ALTER TABLE public.gifts
ADD CONSTRAINT chk_house_item_type CHECK (house_item_type IN (
    'foundation', 'walls', 'doors_windows', 'roof', 'electric', 'plumbing',
    'fridge', 'stove', 'dining_table', 'sofa', 'tv', 'bed'
));
