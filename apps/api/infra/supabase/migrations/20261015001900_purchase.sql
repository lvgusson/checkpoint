-- Purchase time belongs to the user's library entry, never to the shared catalog.
ALTER TABLE library_entry ADD COLUMN IF NOT EXISTS purchased_at timestamptz;
