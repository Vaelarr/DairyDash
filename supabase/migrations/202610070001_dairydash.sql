-- Run once in your Supabase project's SQL Editor before starting the API.
-- Uses dedicated table/function names so other applications in the project are unaffected.
begin;

create table if not exists public.dairydash_products (
  id text primary key,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  category text check (category is null or category in
    ('Fresh Milk', 'Flavored Milk', 'Plant-Based Milk', 'Yogurt', 'Cheese', 'Butter & Cream', 'Other')),
  price_cents integer not null check (price_cents between 1 and 99999999),
  stock integer check (stock is null or stock between 0 and 1000000000),
  description text not null default '' check (char_length(description) <= 200),
  photo text,
  photo_storage_path text,
  catalog_position integer unique check (catalog_position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dairydash_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.dairydash_products(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  rating integer not null check (rating between 1 and 5),
  comment text not null check (char_length(btrim(comment)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists dairydash_reviews_by_product on public.dairydash_reviews(product_id, created_at desc, id);

create table if not exists public.dairydash_settings (
  key text primary key,
  created_at timestamptz not null default now()
);

create or replace function public.dairydash_touch_product()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create or replace trigger dairydash_products_updated
before update on public.dairydash_products for each row execute function public.dairydash_touch_product();

create or replace function public.dairydash_list_products(
  search_text text default '', category_filter text default null, featured_only boolean default false
)
returns setof public.dairydash_products
language sql stable security invoker set search_path = '' as $$
  select p.* from public.dairydash_products p
  where (coalesce(search_text, '') = '' or strpos(lower(p.name), lower(search_text)) > 0
    or strpos(lower(p.description), lower(search_text)) > 0)
    and (category_filter is null or p.category = category_filter)
    and (not featured_only or p.catalog_position is not null)
  order by p.catalog_position asc nulls first, p.created_at desc, p.id desc
  limit case when featured_only then 9 else null end;
$$;

-- The transaction and advisory lock prevent concurrent/repeated seeds from restoring deleted products.
create or replace function public.dairydash_seed_catalog(catalog jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb;
  inserted_id text;
  inserted_ids jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('dairydash.catalog_seed'));
  if exists (select 1 from public.dairydash_settings where key = 'catalog_seeded') then
    return jsonb_build_object('inserted_ids', inserted_ids);
  end if;
  if jsonb_typeof(catalog) is distinct from 'array' or jsonb_array_length(catalog) = 0 then
    raise exception 'Catalog must be a nonempty JSON array';
  end if;
  for item in select value from jsonb_array_elements(catalog) loop
    inserted_id := null;
    insert into public.dairydash_products
      (id, name, category, price_cents, stock, description, photo, photo_storage_path, catalog_position)
    values (item->>'id', item->>'name', item->>'category', (item->>'price_cents')::integer,
      (item->>'stock')::integer, coalesce(item->>'description', ''), item->>'photo',
      item->>'photo_storage_path', (item->>'catalog_position')::integer)
    on conflict (id) do nothing returning id into inserted_id;
    if inserted_id is not null then inserted_ids := inserted_ids || jsonb_build_array(inserted_id); end if;
  end loop;
  insert into public.dairydash_settings(key) values ('catalog_seeded');
  return jsonb_build_object('inserted_ids', inserted_ids);
end;
$$;

-- Browser/native clients use the Express API; only its server key accesses these tables/RPCs.
alter table public.dairydash_products enable row level security;
alter table public.dairydash_reviews enable row level security;
alter table public.dairydash_settings enable row level security;
revoke all on public.dairydash_products, public.dairydash_reviews, public.dairydash_settings from anon, authenticated;
grant select, insert, update, delete on public.dairydash_products, public.dairydash_reviews, public.dairydash_settings to service_role;
revoke all on function public.dairydash_list_products(text, text, boolean) from public, anon, authenticated;
revoke all on function public.dairydash_seed_catalog(jsonb) from public, anon, authenticated;
revoke all on function public.dairydash_touch_product() from public, anon, authenticated;
grant execute on function public.dairydash_list_products(text, text, boolean),
  public.dairydash_seed_catalog(jsonb), public.dairydash_touch_product() to service_role;

-- Public reads are appropriate for catalog photos. Uploads/deletes require the backend key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dairydash-product-images', 'dairydash-product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

commit;
