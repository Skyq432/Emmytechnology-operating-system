drop policy if exists "Temporary public invite validation compatibility" on public.invite_links;
create policy "Temporary public invite validation compatibility"
on public.invite_links
for select
to anon
using (
  status = 'active'
  and (expires_at is null or expires_at > now())
  and (max_uses is null or coalesce(used_count, 0) < max_uses)
);
