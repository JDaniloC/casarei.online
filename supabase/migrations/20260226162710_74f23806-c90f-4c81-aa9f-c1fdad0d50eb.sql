-- Delete duplicate gifts (keep the first one by id for each name)
DELETE FROM gifts 
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY wedding_id, name ORDER BY created_at ASC) as rn
    FROM gifts
  ) t WHERE rn > 1
);

-- Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS gifts_wedding_name_unique ON gifts(wedding_id, name);
