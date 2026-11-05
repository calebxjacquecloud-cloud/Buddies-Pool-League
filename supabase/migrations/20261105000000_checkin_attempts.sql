-- Self check-in from phones (the TV's QR code) is a public write, so the
-- check-in function limits how often one network address can use it.
create table public.checkin_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);
create index checkin_attempts_ip_idx on public.checkin_attempts (ip, created_at desc);

alter table public.checkin_attempts enable row level security;
-- No policies: invisible to the public; only the server (secret key) uses it.
revoke all on public.checkin_attempts from anon, authenticated;
