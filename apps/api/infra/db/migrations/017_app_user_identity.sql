-- Browser clients can edit the display name, but cannot change account identity.
BEGIN;
REVOKE UPDATE ON public.app_user FROM PUBLIC, anon, authenticated;
GRANT UPDATE (display_name) ON public.app_user TO authenticated;
COMMIT;
