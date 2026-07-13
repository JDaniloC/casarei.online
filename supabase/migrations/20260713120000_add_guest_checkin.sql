-- Check-in no dia do evento: registra quem de fato chegou e quando,
-- dando fechamento ao ciclo do RSVP (confirmou → compareceu).
-- A escrita é restrita ao dono pelo RLS existente da tabela guests
-- (policy "Users can manage their own guests", FOR ALL).
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS checked_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
