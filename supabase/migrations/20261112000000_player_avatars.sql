-- Player pictures: a pixel character ("px:<n>") or an uploaded photo URL.
-- NULL means the player's default character.
alter table public.players
  add column if not exists avatar text
  check (avatar is null or (char_length(avatar) <= 500 and (avatar ~ '^px:[0-9]{1,3}$' or avatar ~ '^https://')));

-- Public bucket for uploaded photos (small JPEGs, resized on the phone).
-- Anyone can view; only the server (secret key) can upload or delete.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 262144, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end;
$$;
