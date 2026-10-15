-- Apagar um app_user com biblioteca falhava: a cascata remove library_entry,
-- cujo trigger chamava bump_queue_version para o usuário que já estava sendo
-- apagado, violando a FK de user_queue_state. Ignora usuários inexistentes.
CREATE OR REPLACE FUNCTION bump_queue_version(p_user_ids uuid[]) RETURNS void LANGUAGE sql
  SECURITY DEFINER SET search_path = public, extensions AS $$
  INSERT INTO user_queue_state AS s (user_id, inputs_version, changed_at)
  SELECT DISTINCT u, 2, now() FROM unnest(p_user_ids) AS u
   WHERE u IS NOT NULL AND EXISTS (SELECT 1 FROM app_user WHERE id = u)
  ON CONFLICT (user_id) DO UPDATE
     SET inputs_version = s.inputs_version + 1, changed_at = now();
$$;
