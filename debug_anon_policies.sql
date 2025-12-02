-- See exactly what the RLS policy is checking
SELECT 
  policyname,
  roles,
  cmd,
  permissive,
  qual as using_check,
  with_check
FROM pg_policies
WHERE tablename = 'orders'
  AND 'anon' = ANY(roles)
ORDER BY policyname;
