-- Apply after 202610080001_orders.sql. Catalog, reviews and order history are preserved.
begin;

alter table public.dairydash_reviews add column if not exists user_id uuid;
alter table public.dairydash_reviews add column if not exists updated_at timestamptz;
update public.dairydash_reviews set updated_at = created_at where updated_at is null;
alter table public.dairydash_reviews alter column updated_at set default now();
alter table public.dairydash_reviews alter column updated_at set not null;
alter table public.dairydash_orders add column if not exists updated_at timestamptz;
update public.dairydash_orders set updated_at = created_at where updated_at is null;
alter table public.dairydash_orders alter column updated_at set default now();
alter table public.dairydash_orders alter column updated_at set not null;
alter table public.dairydash_orders add column if not exists deleted_at timestamptz;
-- NULL means the legacy checkout did not record whether finite stock was reserved.
-- Do not guess: an administrator must verify those reservations before restoring them.
alter table public.dairydash_order_items add column if not exists stock_deducted boolean;

create or replace function public.dairydash_touch_record()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
drop trigger if exists dairydash_reviews_updated_at on public.dairydash_reviews;
create trigger dairydash_reviews_updated_at before update on public.dairydash_reviews
  for each row execute function public.dairydash_touch_record();
drop trigger if exists dairydash_orders_updated_at on public.dairydash_orders;
create trigger dairydash_orders_updated_at before update on public.dairydash_orders
  for each row execute function public.dairydash_touch_record();

create or replace function public.dairydash_manage_review(
  review_id uuid, product_id text, actor_id uuid, actor_is_admin boolean,
  expected_updated_at timestamptz, change jsonb, delete_review boolean
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved public.dairydash_reviews%rowtype;
begin
  select * into saved from public.dairydash_reviews r
    where r.id = review_id and r.product_id = dairydash_manage_review.product_id for update;
  if not found then return null; end if;
  if actor_is_admin is not true and (actor_id is null or saved.user_id is distinct from actor_id) then
    raise exception using errcode = 'DD005', message = 'Review belongs to another author';
  end if;
  if expected_updated_at is null or saved.updated_at <> expected_updated_at then
    raise exception using errcode = 'DD006', message = 'Record changed';
  end if;
  if delete_review then
    delete from public.dairydash_reviews r where r.id = review_id;
  else
    update public.dairydash_reviews r set name = change->>'name', rating = (change->>'rating')::integer,
      comment = change->>'comment' where r.id = review_id returning * into saved;
  end if;
  return to_jsonb(saved);
end;
$$;

create or replace function public.dairydash_order_json(order_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'status', o.status, 'total', o.total_cents / 100.0,
    'createdAt', o.created_at, 'updatedAt', o.updated_at,
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
  where o.id = order_id and o.user_id = customer_id and o.deleted_at is null;
$$;
create or replace function public.dairydash_list_orders(customer_id uuid)
returns setof jsonb language sql stable security invoker set search_path = '' as $$
  select public.dairydash_order_json(o.id) from public.dairydash_orders o
  where o.user_id = customer_id and o.deleted_at is null order by o.created_at desc, o.id desc;
$$;
create or replace function public.dairydash_admin_get_order(order_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select public.dairydash_order_json(o.id) from public.dairydash_orders o
  where o.id = order_id and o.deleted_at is null;
$$;
create or replace function public.dairydash_admin_list_orders()
returns setof jsonb language sql stable security invoker set search_path = '' as $$
  select public.dairydash_order_json(o.id) from public.dairydash_orders o
  where o.deleted_at is null order by o.created_at desc, o.id desc;
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
  perform pg_advisory_xact_lock(hashtextextended(customer_id::text || ':' || checkout_id::text, 0));
  select * into previous from public.dairydash_orders o
    where o.user_id = customer_id and o.request_id = checkout_id;
  if found then
    if previous.deleted_at is not null then
      raise exception using errcode = 'DD008', message = 'Checkout order deleted';
    end if;
    if previous.request_hash <> payload_hash then
      raise exception using errcode = 'DD004', message = 'Checkout request has changed';
    end if;
    return public.dairydash_order_json(previous.id);
  end if;
  if jsonb_typeof(lines) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Invalid checkout lines';
  end if;
  if jsonb_array_length(lines) not between 1 and 50 then
    raise exception using errcode = '22023', message = 'Invalid checkout lines';
  end if;
  if (select count(distinct value->>'productId') from jsonb_array_elements(lines)) <> jsonb_array_length(lines) then
    raise exception using errcode = '22023', message = 'Duplicate checkout lines';
  end if;
  perform p.id from public.dairydash_products p
    where p.id in (select value->>'productId' from jsonb_array_elements(lines)) order by p.id for update;
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
    insert into public.dairydash_order_items (order_id, line_number, product_id, product_name, unit_price_cents, quantity, stock_deducted)
      values (order_id, line_number, product.id, product.name, product.price_cents, quantity, product.stock is not null);
    total := total + product.price_cents::bigint * quantity;
    if product.stock is not null then update public.dairydash_products set stock = stock - quantity where id = product.id; end if;
  end loop;
  update public.dairydash_orders o set total_cents = total where o.id = order_id;
  return public.dairydash_order_json(order_id);
end;
$$;

create or replace function public.dairydash_manage_order(
  order_id uuid, actor_id uuid, actor_is_admin boolean, expected_updated_at timestamptz,
  change jsonb, delete_order boolean
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  saved public.dairydash_orders%rowtype;
  next_status text;
  reservation record;
begin
  select * into saved from public.dairydash_orders o where o.id = order_id and o.deleted_at is null for update;
  if not found then return null; end if;
  -- A foreign customer's order is indistinguishable from a missing order.
  if actor_is_admin is not true and (actor_id is null or saved.user_id is distinct from actor_id) then return null; end if;
  if expected_updated_at is null or saved.updated_at <> expected_updated_at then
    raise exception using errcode = 'DD006', message = 'Record changed';
  end if;
  next_status := coalesce(change->>'status', saved.status);
  if delete_order and saved.status in ('pending', 'confirmed') then next_status := 'cancelled'; end if;
  if actor_is_admin is not true then
    if (delete_order and saved.status not in ('pending', 'cancelled'))
      or (not delete_order and (saved.status <> 'pending' or next_status not in ('pending', 'cancelled'))) then
      raise exception using errcode = 'DD007', message = 'Order cannot be changed at this stage';
    end if;
  end if;
  if (change ? 'customer' and saved.status not in ('pending', 'confirmed')) or
    (next_status <> saved.status and not (
      (saved.status = 'pending' and next_status in ('confirmed', 'cancelled')) or
      (saved.status = 'confirmed' and next_status in ('completed', 'cancelled'))
    )) then raise exception using errcode = 'DD007', message = 'Invalid order transition'; end if;
  if saved.status in ('pending', 'confirmed') and next_status = 'cancelled' then
    perform p.id from public.dairydash_products p where p.id in
      (select i.product_id from public.dairydash_order_items i where i.order_id = saved.id) order by p.id for update;
    for reservation in select p.id, p.stock, i.quantity, i.stock_deducted from public.dairydash_order_items i
      join public.dairydash_products p on p.id = i.product_id where i.order_id = saved.id order by p.id loop
      if reservation.stock is not null then
        if reservation.stock_deducted is null or (reservation.stock_deducted and reservation.stock::bigint + reservation.quantity > 1000000000) then
          raise exception using errcode = 'DD009', message = 'Stock reservation requires administrator verification';
        end if;
        if reservation.stock_deducted then
          update public.dairydash_products p set stock = p.stock + reservation.quantity where p.id = reservation.id;
        end if;
      end if;
    end loop;
  end if;
  update public.dairydash_orders o set status = next_status,
    customer_name = case when change ? 'customer' then change->'customer'->>'name' else o.customer_name end,
    customer_email = case when change ? 'customer' then change->'customer'->>'email' else o.customer_email end,
    customer_phone = case when change ? 'customer' then change->'customer'->>'phone' else o.customer_phone end,
    delivery_address = case when change ? 'customer' then change->'customer'->>'address' else o.delivery_address end,
    deleted_at = case when delete_order then clock_timestamp() else null end
    where o.id = saved.id;
  return public.dairydash_order_json(saved.id);
end;
$$;

revoke all on function public.dairydash_touch_record(),
  public.dairydash_manage_review(uuid, text, uuid, boolean, timestamptz, jsonb, boolean),
  public.dairydash_admin_get_order(uuid), public.dairydash_admin_list_orders(),
  public.dairydash_manage_order(uuid, uuid, boolean, timestamptz, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.dairydash_touch_record(),
  public.dairydash_manage_review(uuid, text, uuid, boolean, timestamptz, jsonb, boolean),
  public.dairydash_admin_get_order(uuid), public.dairydash_admin_list_orders(),
  public.dairydash_manage_order(uuid, uuid, boolean, timestamptz, jsonb, boolean) to service_role;
notify pgrst, 'reload schema';
commit;
