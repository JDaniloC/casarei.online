-- Remove a leitura pública irrestrita da tabela guests.
-- A policy "Public can view guest by token" usava USING (true), expondo nome,
-- telefone, token e passcode de TODOS os convidados de TODOS os casamentos a
-- qualquer anônimo com a anon key (que está no bundle do site).
--
-- A busca por token passa a ser feita pela edge function get-guest-by-token
-- (service role), que retorna apenas o convidado correspondente ao token.
-- O dono continua gerenciando seus convidados pela policy
-- "Users can manage their own guests".
DROP POLICY IF EXISTS "Public can view guest by token" ON public.guests;
