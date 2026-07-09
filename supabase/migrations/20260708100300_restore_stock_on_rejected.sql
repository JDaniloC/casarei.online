-- Devolve o estoque também em pedidos recusados (rejected), não só cancelados.
-- Antes a função só reagia a 'cancelled'/'refunded'/'expired' — mas 'refunded'/'expired'
-- não são valores válidos de orders.status (CHECK), e pagamentos recusados deixavam o
-- estoque preso. O estoque continua sendo reservado no INSERT de order_items; esta
-- correção garante a devolução quando o pedido é recusado ou cancelado.
CREATE OR REPLACE FUNCTION restore_gift_stock_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IN ('cancelled', 'rejected') AND OLD.status NOT IN ('cancelled', 'rejected') THEN
      -- Devolve o estoque de todos os itens do pedido
      UPDATE public.gifts g
      SET stock = stock + item.quantity
      FROM public.order_items item
      WHERE item.order_id = NEW.id AND g.id = item.gift_id AND g.stock IS NOT NULL;
    ELSIF OLD.status IN ('cancelled', 'rejected') AND NEW.status NOT IN ('cancelled', 'rejected') THEN
      -- Reserva novamente se o pedido for reativado (raro)
      UPDATE public.gifts g
      SET stock = stock - item.quantity
      FROM public.order_items item
      WHERE item.order_id = NEW.id AND g.id = item.gift_id AND g.stock IS NOT NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
