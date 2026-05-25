-- Adicionar coluna de estoque aos presentes
ALTER TABLE public.gifts
ADD COLUMN stock INTEGER DEFAULT NULL;

-- Trigger para reservar o estoque quando o pedido é gerado (inserido em order_items)
CREATE OR REPLACE FUNCTION reserve_gift_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Deduz a quantidade do estoque do presente (se tiver limite de estoque)
  UPDATE public.gifts
  SET stock = stock - NEW.quantity
  WHERE id = NEW.gift_id AND stock IS NOT NULL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_reserve_gift_stock ON public.order_items;
CREATE TRIGGER trigger_reserve_gift_stock
AFTER INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION reserve_gift_stock();

-- Trigger para devolver o estoque caso o pedido seja cancelado ou estornado
CREATE OR REPLACE FUNCTION restore_gift_stock_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IN ('cancelled', 'refunded', 'expired') AND OLD.status NOT IN ('cancelled', 'refunded', 'expired') THEN
      -- Devolver estoque para todos os itens do pedido
      UPDATE public.gifts g
      SET stock = stock + item.quantity
      FROM public.order_items item
      WHERE item.order_id = NEW.id AND g.id = item.gift_id AND g.stock IS NOT NULL;
    ELSIF OLD.status IN ('cancelled', 'refunded', 'expired') AND NEW.status NOT IN ('cancelled', 'refunded', 'expired') THEN
      -- Remover estoque novamente se o pedido for reativado (raro, mas possível)
      UPDATE public.gifts g
      SET stock = stock - item.quantity
      FROM public.order_items item
      WHERE item.order_id = NEW.id AND g.id = item.gift_id AND g.stock IS NOT NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_restore_gift_stock_on_cancel ON public.orders;
CREATE TRIGGER trigger_restore_gift_stock_on_cancel
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION restore_gift_stock_on_cancel();
