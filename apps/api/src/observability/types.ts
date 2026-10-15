export interface DatabaseLogRow {
  id?: string;
  created_at?: string | Date;
  level: string;
  event: string;
  function_name?: string | null;
  message?: string | null;
  stack?: string | null;
  request_id?: string | null;
  user_id?: string | null;
  payload?: Record<string, unknown> | null;
}
