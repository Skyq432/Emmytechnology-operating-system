-- The new /auth/invite frontend uses get_invite_link(code), so the temporary
-- anonymous direct SELECT policy is no longer needed.

drop policy if exists "Temporary public invite validation compatibility" on public.invite_links;
