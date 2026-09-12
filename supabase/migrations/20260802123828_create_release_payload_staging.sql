create table if not exists public.__emmy_release_payload (
  migration_name text not null,
  statement_no integer not null,
  chunk_no integer not null,
  payload_base64 text not null,
  primary key (migration_name, statement_no, chunk_no)
);

revoke all on table public.__emmy_release_payload from public, anon, authenticated;
grant all on table public.__emmy_release_payload to service_role;
