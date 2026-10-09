-- Apply after 202610090001_review_order_crud.sql. Existing orders and inventory are preserved.
begin;
alter table public.dairydash_orders add column if not exists checkout_details jsonb not null default '{}'::jsonb;
alter table public.dairydash_orders add column if not exists delivery_fee_cents integer not null default 0 check (delivery_fee_cents between 0 and 99999999);
alter table public.dairydash_orders add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'cancelled', 'refund_pending', 'refunded'));
update public.dairydash_orders set payment_status = 'cancelled' where status = 'cancelled' and payment_status = 'unpaid';
alter table public.dairydash_orders drop constraint if exists dairydash_orders_status_check;
alter table public.dairydash_orders add constraint dairydash_orders_status_check check (status in ('pending', 'confirmed', 'preparing', 'out_for_delivery', 'completed', 'cancelled'));


create or replace function public.dairydash_order_json(order_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'status', o.status, 'total', o.total_cents / 100.0,
    'createdAt', o.created_at, 'updatedAt', o.updated_at,
    'subtotal', (o.total_cents - o.delivery_fee_cents) / 100.0, 'deliveryFee', o.delivery_fee_cents / 100.0,
    'payment', jsonb_build_object('method', o.checkout_details->>'paymentMethod', 'status', o.payment_status,
      'instructions', coalesce(o.checkout_details->>'paymentInstructions', '')),
    'delivery', jsonb_build_object('address', o.checkout_details->'shippingAddress',
      'notes', coalesce(o.checkout_details->>'deliveryNotes', '')),
    'customer', jsonb_build_object('name', o.customer_name, 'email', o.customer_email,
      'phone', o.customer_phone, 'address', o.delivery_address),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'productId', i.product_id, 'name', i.product_name, 'price', i.unit_price_cents / 100.0,
      'quantity', i.quantity, 'total', i.unit_price_cents::bigint * i.quantity / 100.0
    ) order by i.line_number) from public.dairydash_order_items i where i.order_id = o.id), '[]'::jsonb)
  ) from public.dairydash_orders o where o.id = order_id;
$$;

create or replace function public.dairydash_create_order(
  customer_id uuid, checkout_id uuid, payload_hash text, customer jsonb, lines jsonb, checkout jsonb
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
  if jsonb_typeof(checkout) is distinct from 'object' or
    coalesce((checkout->>'deliveryFeeCents')::integer, 0) not between 0 and 99999999 or
    (checkout ? 'paymentMethod' and checkout->>'paymentMethod' not in ('cash_on_delivery', 'gcash', 'maya', 'bank_transfer')) then
    raise exception using errcode = '22023', message = 'Invalid checkout details';
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
    (user_id, request_id, request_hash, customer_name, customer_email, customer_phone, delivery_address, checkout_details, delivery_fee_cents)
    values (customer_id, checkout_id, payload_hash, customer->>'name', customer->>'email', customer->>'phone', customer->>'address', checkout, coalesce((checkout->>'deliveryFeeCents')::integer, 0))
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
  update public.dairydash_orders o set total_cents = total + coalesce((checkout->>'deliveryFeeCents')::integer, 0) where o.id = order_id;
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
  next_payment text;
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
  if delete_order and saved.status in ('pending', 'confirmed', 'preparing', 'out_for_delivery') then next_status := 'cancelled'; end if;
  next_payment := saved.payment_status;
  if change ? 'paymentStatus' then
    if actor_is_admin is not true or not (
      (saved.payment_status = 'unpaid' and change->>'paymentStatus' = 'paid' and saved.status in ('pending', 'confirmed', 'preparing', 'out_for_delivery')) or
      (saved.payment_status = 'refund_pending' and change->>'paymentStatus' = 'refunded' and saved.status = 'cancelled')
    ) then raise exception using errcode = 'DD010', message = 'Invalid payment transition'; end if;
    next_payment := change->>'paymentStatus';
  end if;
  if actor_is_admin is not true then
    if (delete_order and saved.status not in ('pending', 'cancelled'))
      or (not delete_order and (saved.status <> 'pending' or next_status not in ('pending', 'cancelled'))) then
      raise exception using errcode = 'DD007', message = 'Order cannot be changed at this stage';
    end if;
  end if;
  if (change ? 'customer' and saved.status not in ('pending', 'confirmed')) or
    (next_status <> saved.status and not (
      (saved.status = 'pending' and next_status in ('confirmed', 'cancelled')) or
      (saved.status = 'confirmed' and next_status in ('preparing', 'cancelled')) or
      (saved.status = 'preparing' and next_status in ('out_for_delivery', 'cancelled')) or
      (saved.status = 'out_for_delivery' and next_status in ('completed', 'cancelled'))
    )) then raise exception using errcode = 'DD007', message = 'Invalid order transition'; end if;
  if (next_status = 'completed' or
    (next_status in ('preparing', 'out_for_delivery') and saved.checkout_details->>'paymentMethod' <> 'cash_on_delivery')) and next_payment <> 'paid' then
    raise exception using errcode = 'DD010', message = 'Payment must be verified';
  end if;
  if saved.status in ('pending', 'confirmed', 'preparing', 'out_for_delivery') and next_status = 'cancelled' then
    next_payment := case when next_payment = 'paid' then 'refund_pending' else 'cancelled' end;
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
  if delete_order and next_payment = 'refund_pending' then
    raise exception using errcode = 'DD010', message = 'Refund must be verified before deletion';
  end if;
  update public.dairydash_orders o set status = next_status, payment_status = next_payment,
    checkout_details = case when change ? 'customer' then jsonb_set(o.checkout_details, '{shippingAddress}', 'null'::jsonb) else o.checkout_details end,
    customer_name = case when change ? 'customer' then change->'customer'->>'name' else o.customer_name end,
    customer_email = case when change ? 'customer' then change->'customer'->>'email' else o.customer_email end,
    customer_phone = case when change ? 'customer' then change->'customer'->>'phone' else o.customer_phone end,
    delivery_address = case when change ? 'customer' then change->'customer'->>'address' else o.delivery_address end,
    deleted_at = case when delete_order then clock_timestamp() else null end
    where o.id = saved.id;
  return public.dairydash_order_json(saved.id);
end;
$$;


-- Keep the previous service-only signature for legacy callers.
create or replace function public.dairydash_create_order(customer_id uuid, checkout_id uuid, payload_hash text, customer jsonb, lines jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select public.dairydash_create_order(customer_id, checkout_id, payload_hash, customer, lines,
    '{"paymentMethod":"cash_on_delivery","deliveryFeeCents":0}'::jsonb);
$$;
revoke all on function public.dairydash_create_order(uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.dairydash_create_order(uuid, uuid, text, jsonb, jsonb, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
