-- Trigger to automatically sync discount_cents from orders to sales when order is completed
-- This ensures sales always has the discount from the order

CREATE OR REPLACE FUNCTION sync_order_discount_to_sale()
RETURNS TRIGGER AS $$
BEGIN
  -- When an order is marked as completed, update the associated sale with its discount_cents
  IF NEW.status = 'completed' AND NEW.discount_cents > 0 THEN
    UPDATE sales
    SET discount_cents = NEW.discount_cents,
        updated_at = NOW()
    WHERE notes LIKE CONCAT('Order #', SUBSTRING(NEW.id, 1, 8), '%')
    AND discount_cents = 0;  -- Only update if sale currently has 0 discount
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS order_discount_sync_trigger ON orders;
CREATE TRIGGER order_discount_sync_trigger
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION sync_order_discount_to_sale();

-- Note: The application-level fix in orders.ts (completeOrder function) is preferred
-- because it's more reliable and doesn't depend on trigger execution timing
