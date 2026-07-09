-- Endurece o UPDATE anônimo de pedidos.
-- A policy "Anyone can upload receipt to their order" só restringe receipt_url no
-- WITH CHECK, mas não limita QUAIS colunas podem ser alteradas. Um convidado anônimo
-- que conheça o próprio orderId poderia enviar { status: 'approved', receipt_url: 'x' }
-- e marcar o pedido como pago sem pagar (disparando raised_amount/estoque).
--
-- RLS não filtra por coluna, então usamos GRANT em nível de coluna: o papel anon só
-- pode atualizar receipt_url. O papel authenticated (casal) mantém o UPDATE completo
-- via a policy "Users can update orders for their wedding".

REVOKE UPDATE ON public.orders FROM anon;
GRANT UPDATE (receipt_url) ON public.orders TO anon;
