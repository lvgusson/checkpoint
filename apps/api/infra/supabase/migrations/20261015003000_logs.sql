CREATE TABLE IF NOT EXISTS public.logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL,
  event text NOT NULL,
  function_name text,
  message text,
  stack text,
  request_id text,
  user_id text,
  payload jsonb
);
CREATE INDEX IF NOT EXISTS logs_created_at_idx ON public.logs(created_at DESC);
CREATE INDEX IF NOT EXISTS logs_level_idx ON public.logs(level);
GRANT ALL ON public.logs TO service_role, postgres;
GRANT INSERT ON public.logs TO anon, authenticated;
