-- Permitir que convidados atualizem o receipt_url dos próprios pedidos
-- O ID do pedido é um UUID aleatório, o que dificulta que um atacante atualize o pedido de outra pessoa
-- Mas para ser seguro, só permitimos atualizar se o receipt_url estiver nulo.

CREATE POLICY "Anyone can upload receipt to their order" 
ON public.orders
FOR UPDATE 
TO public
USING (receipt_url IS NULL)
WITH CHECK (receipt_url IS NOT NULL);
