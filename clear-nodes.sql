-- Clear all custom nodes from agentstorage
DELETE FROM agentstorage WHERE unique_id LIKE 'minerva_customnode_%';

-- Show remaining count
SELECT COUNT(*) as remaining_custom_nodes FROM agentstorage WHERE unique_id LIKE 'minerva_customnode_%';
