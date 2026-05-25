-- Adiciona colunas para Vaquinha na tabela gifts
ALTER TABLE public.gifts
ADD COLUMN is_vaquinha BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN raised_amount DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Atualizar o valor já arrecadado para presentes existentes (caso existam pedidos aprovados)
UPDATE public.gifts g
SET raised_amount = COALESCE((
  SELECT SUM(i.quantity * i.unit_price)
  FROM public.order_items i
  JOIN public.orders o ON i.order_id = o.id
  WHERE o.status = 'approved' AND i.gift_id = g.id
), 0);

-- Criar a função que será chamada pela trigger
CREATE OR REPLACE FUNCTION update_gift_raised_amount()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Pedido mudou para 'approved'
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
      UPDATE public.gifts g
      SET raised_amount = g.raised_amount + (
        SELECT COALESCE(SUM(quantity * unit_price), 0)
        FROM public.order_items item
        WHERE item.order_id = NEW.id AND item.gift_id = g.id
      )
      WHERE g.id IN (
        SELECT gift_id FROM public.order_items WHERE order_id = NEW.id AND gift_id IS NOT NULL
      );
    -- Pedido mudou de 'approved' para outro status (ex: cancelado, reembolsado)
    ELSIF OLD.status = 'approved' AND NEW.status != 'approved' THEN
      UPDATE public.gifts g
      SET raised_amount = GREATEST(0, g.raised_amount - (
        SELECT COALESCE(SUM(quantity * unit_price), 0)
        FROM public.order_items item
        WHERE item.order_id = NEW.id AND item.gift_id = g.id
      ))
      WHERE g.id IN (
        SELECT gift_id FROM public.order_items WHERE order_id = NEW.id AND gift_id IS NOT NULL
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar a trigger na tabela orders
DROP TRIGGER IF EXISTS trigger_update_gift_raised_amount ON public.orders;
CREATE TRIGGER trigger_update_gift_raised_amount
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION update_gift_raised_amount();
