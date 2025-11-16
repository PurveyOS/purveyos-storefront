-- Step 2: Find ALL tables in your database
-- Run this query to see what tables actually exist:

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE' 
ORDER BY table_name;

-- This will show ALL your table names so we can identify the correct ones