-- Temporary rollout compatibility: production still uses direct invite_links lookup
-- until the staff-RBAC frontend is deployed. Remove this policy in the deployment
-- that switches /auth/invite to get_invite_link(code).

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
