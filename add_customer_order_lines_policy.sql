-- Allow customers to view order_lines for their own orders
-- This enables the customer portal to show order details

-- Drop existing conflicting policy if it exists
DROP POLICY IF EXISTS "Customers can view their order lines" ON public.order_lines;

-- Create policy for authenticated customers to view their order_lines
CREATE POLICY "Customers can view their order lines"
ON public.order_lines
FOR SELECT
TO authenticated
USING (
  order_id IN (
    SELECT id FROM public.orders
    WHERE user_id = auth.uid()
  )
);

-- Ensure RLS is enabled
ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY;
