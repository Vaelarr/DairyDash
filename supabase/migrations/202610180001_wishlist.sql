-- Account-owned wishlist entries. Browser/native clients use the authenticated API.
begin;

create table if not exists public.dairydash_wishlist (
  user_id uuid not null,
  product_id text not null references public.dairydash_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index if not exists dairydash_wishlist_by_user
  on public.dairydash_wishlist(user_id, created_at desc, product_id);

create or replace function public.dairydash_save_wishlist(customer_id uuid, item_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  saved public.dairydash_wishlist;
begin
  insert into public.dairydash_wishlist(user_id, product_id)
    values (customer_id, item_id)
    on conflict (user_id, product_id) do update set product_id = excluded.product_id
    returning * into saved;
  return jsonb_build_object('productId', saved.product_id, 'createdAt', saved.created_at);
end;
$$;

alter table public.dairydash_wishlist enable row level security;
revoke all on public.dairydash_wishlist from public, anon, authenticated;
grant select, insert, update, delete on public.dairydash_wishlist to service_role;
revoke all on function public.dairydash_save_wishlist(uuid, text) from public, anon, authenticated;
grant execute on function public.dairydash_save_wishlist(uuid, text) to service_role;

commit;
