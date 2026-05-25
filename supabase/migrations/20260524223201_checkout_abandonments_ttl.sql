-- Adicionar TTL em checkout_abandonments
-- A tabela não tem policy de leitura pública — o expires_at serve para limpeza periódica
ALTER TABLE public.checkout_abandonments
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ
  DEFAULT now() + interval '30 days';
