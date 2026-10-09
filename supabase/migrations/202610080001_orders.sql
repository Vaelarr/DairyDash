-- Apply after 202610070001_dairydash.sql. Existing catalog and reviews are preserved.
begin;

create table if not exists public.dairydash_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  request_id uuid not null,
  request_hash text not null check (char_length(request_hash) = 64),
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 80),
  customer_email text not null check (char_length(customer_email) between 3 and 254),
  customer_phone text not null check (char_length(customer_phone) between 7 and 30),
  delivery_address text not null check (char_length(btrim(delivery_address)) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  total_cents bigint not null default 0 check (total_cents between 0 and 494999995050),
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
create index if not exists dairydash_orders_by_user on public.dairydash_orders(user_id, created_at desc, id desc);

create table if not exists public.dairydash_order_items (
  order_id uuid not null references public.dairydash_orders(id) on delete cascade,
  line_number integer not null,
  product_id text references public.dairydash_products(id) on delete set null,
  product_name text not null,
  unit_price_cents integer not null check (unit_price_cents between 1 and 99999999),
  quantity integer not null check (quantity between 1 and 99),
  primary key (order_id, line_number)
);

create or replace function public.dairydash_order_json(order_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'status', o.status, 'total', o.total_cents / 100.0, 'createdAt', o.created_at,
    'customer', jsonb_build_object('name', o.customer_name, 'email', o.customer_email,
      'phone', o.customer_phone, 'address', o.delivery_address),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'productId', i.product_id, 'name', i.product_name, 'price', i.unit_price_cents / 100.0,
      'quantity', i.quantity, 'total', i.unit_price_cents::bigint * i.quantity / 100.0
    ) order by i.line_number) from public.dairydash_order_items i where i.order_id = o.id), '[]'::jsonb)
  ) from public.dairydash_orders o where o.id = order_id;
$$;

create or replace function public.dairydash_get_order(order_id uuid, customer_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select public.dairydash_order_json(o.id) from public.dairydash_orders o
  where o.id = order_id and o.user_id = customer_id;
$$;

create or replace function public.dairydash_list_orders(customer_id uuid)
returns setof jsonb language sql stable security invoker set search_path = '' as $$
  select public.dairydash_order_json(o.id) from public.dairydash_orders o
  where o.user_id = customer_id order by o.created_at desc, o.id desc;
$$;

create or replace function public.dairydash_create_order(
  customer_id uuid, checkout_id uuid, payload_hash text, customer jsonb, lines jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  previous public.dairydash_orders%rowtype;
  product public.dairydash_products%rowtype;
  line jsonb;
  order_id uuid;
  quantity integer;
  line_number integer := 0;
  total bigint := 0;
begin
  -- Serialize retries of the same checkout before checking stock.
  perform pg_advisory_xact_lock(hashtextextended(customer_id::text || ':' || checkout_id::text, 0));
  select * into previous from public.dairydash_orders o
    where o.user_id = customer_id and o.request_id = checkout_id;
  if found then
    if previous.request_hash <> payload_hash then
      raise exception using errcode = 'DD004', message = 'Checkout request has changed';
    end if;
    return public.dairydash_order_json(previous.id);
  end if;
  if jsonb_typeof(lines) is distinct from 'array' or jsonb_array_length(lines) not between 1 and 50 then
    raise exception using errcode = '22023', message = 'Invalid checkout lines';
  end if;
  if (select count(distinct value->>'productId') from jsonb_array_elements(lines)) <> jsonb_array_length(lines) then
    raise exception using errcode = '22023', message = 'Duplicate checkout lines';
  end if;
  -- Lock products in a consistent order to avoid overselling and deadlocks.
  perform p.id from public.dairydash_products p
    where p.id in (select value->>'productId' from jsonb_array_elements(lines))
    order by p.id for update;
  insert into public.dairydash_orders
    (user_id, request_id, request_hash, customer_name, customer_email, customer_phone, delivery_address)
    values (customer_id, checkout_id, payload_hash, customer->>'name', customer->>'email', customer->>'phone', customer->>'address')
    returning id into order_id;
  for line in select value from jsonb_array_elements(lines) order by value->>'productId' loop
    quantity := (line->>'quantity')::integer;
    if quantity is null or quantity not between 1 and 99 then
      raise exception using errcode = '22023', message = 'Invalid checkout quantity';
    end if;
    select * into product from public.dairydash_products p where p.id = line->>'productId';
    if not found then raise exception using errcode = 'DD001', message = 'Product no longer available'; end if;
    if product.price_cents is distinct from (line->>'priceCents')::integer then
      raise exception using errcode = 'DD003', message = 'Product price changed';
    end if;
    if product.stock is not null and product.stock < quantity then
      raise exception using errcode = 'DD002', message = 'Insufficient stock';
    end if;
    line_number := line_number + 1;
    insert into public.dairydash_order_items (order_id, line_number, product_id, product_name, unit_price_cents, quantity)
      values (order_id, line_number, product.id, product.name, product.price_cents, quantity);
    total := total + product.price_cents::bigint * quantity;
    if product.stock is not null then
      update public.dairydash_products set stock = stock - quantity where id = product.id;
    end if;
  end loop;
  update public.dairydash_orders o set total_cents = total where o.id = order_id;
  return public.dairydash_order_json(order_id);
end;
$$;

alter table public.dairydash_orders enable row level security;
alter table public.dairydash_order_items enable row level security;
revoke all on public.dairydash_orders, public.dairydash_order_items from anon, authenticated;
grant select, insert, update, delete on public.dairydash_orders, public.dairydash_order_items to service_role;
revoke all on function public.dairydash_order_json(uuid), public.dairydash_get_order(uuid, uuid),
  public.dairydash_list_orders(uuid), public.dairydash_create_order(uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.dairydash_order_json(uuid), public.dairydash_get_order(uuid, uuid),
  public.dairydash_list_orders(uuid), public.dairydash_create_order(uuid, uuid, text, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
