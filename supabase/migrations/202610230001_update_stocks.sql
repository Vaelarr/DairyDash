-- Updates product stock levels strictly between 30 and 50, and assigns standard product categories.
-- Safe to re-run.

begin;

update public.dairydash_products set stock = 45, category = 'Plant-Based Milk' where id = 'seed-almond-bliss';
update public.dairydash_products set stock = 38, category = 'Flavored Milk' where id = 'seed-apple-drops';
update public.dairydash_products set stock = 42, category = 'Fresh Milk' where id = 'seed-astrodairy';
update public.dairydash_products set stock = 35, category = 'Yogurt' where id = 'seed-bananaloo';
update public.dairydash_products set stock = 48, category = 'Flavored Milk' where id = 'seed-cereal-blend';
update public.dairydash_products set stock = 50, category = 'Flavored Milk' where id = 'seed-choccy-mommy';
update public.dairydash_products set stock = 33, category = 'Fresh Milk' where id = 'seed-cloudline';
update public.dairydash_products set stock = 40, category = 'Fresh Milk' where id = 'seed-cresta-de-oro';
update public.dairydash_products set stock = 47, category = 'Fresh Milk' where id = 'seed-dailyblend';
update public.dairydash_products set stock = 36, category = 'Butter & Cream' where id = 'seed-dream-n-cream';
update public.dairydash_products set stock = 44, category = 'Fresh Milk' where id = 'seed-freshmoo';
update public.dairydash_products set stock = 39, category = 'Fresh Milk' where id = 'seed-freshville';
update public.dairydash_products set stock = 31, category = 'Flavored Milk' where id = 'seed-galaspun';
update public.dairydash_products set stock = 46, category = 'Fresh Milk' where id = 'seed-gutentag';
update public.dairydash_products set stock = 34, category = 'Flavored Milk' where id = 'seed-lattevia';
update public.dairydash_products set stock = 43, category = 'Butter & Cream' where id = 'seed-madame-krema';
update public.dairydash_products set stock = 37, category = 'Fresh Milk' where id = 'seed-miruku-suyu';
update public.dairydash_products set stock = 49, category = 'Fresh Milk' where id = 'seed-mjolk-klide';
update public.dairydash_products set stock = 32, category = 'Flavored Milk' where id = 'seed-mocha-mingkal';
update public.dairydash_products set stock = 41, category = 'Flavored Milk' where id = 'seed-nectar-brew';
update public.dairydash_products set stock = 30, category = 'Flavored Milk' where id = 'seed-nectar-mingkal';
update public.dairydash_products set stock = 45, category = 'Fresh Milk' where id = 'seed-nidara';
update public.dairydash_products set stock = 38, category = 'Fresh Milk' where id = 'seed-novalactis';
update public.dairydash_products set stock = 42, category = 'Plant-Based Milk' where id = 'seed-oatsip';
update public.dairydash_products set stock = 36, category = 'Fresh Milk' where id = 'seed-pastureborne';
update public.dairydash_products set stock = 48, category = 'Plant-Based Milk' where id = 'seed-soypure';
update public.dairydash_products set stock = 50, category = 'Flavored Milk' where id = 'seed-strawberry-dreams';
update public.dairydash_products set stock = 33, category = 'Flavored Milk' where id = 'seed-sweetie-swirls';
update public.dairydash_products set stock = 46, category = 'Flavored Milk' where id = 'seed-ube-berry-bear';
update public.dairydash_products set stock = 40, category = 'Butter & Cream' where id = 'seed-velvetpour';

commit;
