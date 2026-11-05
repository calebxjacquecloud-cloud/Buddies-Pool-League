-- One-time: give the current players pool-ball pictures (1-ball to 9-ball,
-- in alphabetical order). Players who already chose a picture keep it.
-- Pool balls are character presets 24-32 ("px:24" = 1 ball ... "px:32" = 9 ball).
with ranked as (
  select id, row_number() over (order by lower(display_name)) as n
  from public.players
  where avatar is null
)
update public.players p
set avatar = 'px:' || (23 + r.n)
from ranked r
where p.id = r.id and r.n <= 9;

-- Refresh any open screens (TV, iPad, phones) so the new pictures show.
update public.tournaments set updated_at = now() where status in ('draft', 'live');
