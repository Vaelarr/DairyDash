import { Product } from '../models/product';

const CATALOG: Omit<Product, 'id'>[] = [
  {
    name: 'Almond Bliss',
    price: '₱299.00',
    description: 'Creamy almond blend with a smooth nutty finish',
    photo: 'assets/Products/AlmondBliss.webp',
  },
  {
    name: 'Apple Drops',
    price: '₱180.00',
    description: 'Crisp apple-flavored dairy delight',
    photo: 'assets/Products/Apple Drops.webp',
  },
  {
    name: 'AstroDairy',
    price: '₱329.00',
    description: 'An adventurous, out-of-this-world dairy blend',
    photo: 'assets/Products/AstroDairy.webp',
  },
  {
    name: 'BananaLoo',
    price: '₱199.00',
    description: 'Creamy probiotic yogurt blend',
    photo: 'assets/Products/BananaLoo.webp',
  },
  {
    name: 'Cereal Blend',
    price: '₱240.00',
    description: 'Crunchy cereal-inspired dairy treat',
    photo: 'assets/Products/Cereal Blend.webp',
  },
  {
    name: 'Choccy Mommy',
    price: '₱349.00',
    description: 'Rich chocolate-flavored dairy drink',
    photo: 'assets/Products/Choccy Mommy.webp',
  },
  {
    name: 'Cloudline',
    price: '₱260.00',
    description: 'Silky milk with a cool, airy finish',
    photo: 'assets/Products/Cloudline.webp',
  },
  {
    name: 'Cresta de Oro',
    price: '₱290.00',
    description: 'Golden, velvety dairy refreshment',
    photo: 'assets/Products/Cresta de Oro.webp',
  },
  {
    name: 'DailyBlend',
    price: '₱269.00',
    description: 'Everyday wellness in a smooth milk bottle',
    photo: 'assets/Products/DailyBlend.webp',
  },
  {
    name: "Dream 'n' Cream",
    price: '₱259.00',
    description: 'A rich, dreamy blend of fresh cream and milk',
    photo: 'assets/Products/DreamnCream.webp',
  },
  {
    name: 'FreshMoo',
    price: '₱299.00',
    description: 'Freshly made and produced milk',
    photo: 'assets/Products/FreshMoo.webp',
  },
  {
    name: 'FreshVille',
    price: '₱279.00',
    description: 'Farm-fresh dairy essentials made daily',
    photo: 'assets/Products/FreshVille.webp',
  },
  {
    name: 'GalaSpun',
    price: '₱230.00',
    description: 'Sweet, spun dairy goodness',
    photo: 'assets/Products/GalaSpun.webp',
  },
  {
    name: 'GutenTag',
    price: '₱210.00',
    description: 'German-inspired creamy classic',
    photo: 'assets/Products/GutenTag.webp',
  },
  {
    name: 'Lattevia',
    price: '₱189.00',
    description: 'A smooth, latte-inspired dairy delight',
    photo: 'assets/Products/Lattevia.webp',
  },
  {
    name: 'Madame Krema',
    price: '₱310.00',
    description: 'Elegant, creamy milk with a luxurious feel',
    photo: 'assets/Products/Madame Krema.webp',
  },
  {
    name: 'Miruku Suyu',
    price: '₱245.00',
    description: 'Light and silky dairy drink from the tropics',
    photo: 'assets/Products/Miruku Suyu.webp',
  },
  {
    name: 'Mjölk Klide',
    price: '₱270.00',
    description: 'A cozy, comforting milk favorite',
    photo: 'assets/Products/Mjölk Klide.webp',
  },
  {
    name: 'Mocha Mingkal',
    price: '₱260.00',
    description: 'Smooth mocha-inspired dairy blend',
    photo: 'assets/Products/Mocha Mingkal.webp',
  },
  {
    name: 'Nectar Brew',
    price: '₱200.00',
    description: 'Honeyed sip with a refreshing finish',
    photo: 'assets/Products/Nectar Brew.webp',
  },
  {
    name: 'Nectar Mingkal',
    price: '₱225.00',
    description: 'Sweet, mellow dairy nectar',
    photo: 'assets/Products/Nectar Mingkal.webp',
  },
  {
    name: 'Nidara',
    price: '₱240.00',
    description: 'Botanical-inspired dairy comfort',
    photo: 'assets/Products/Nidara.webp',
  },
  {
    name: 'NovaLactis',
    price: '₱320.00',
    description: 'Modern milk crafted for everyday energy',
    photo: 'assets/Products/NovaLactis.webp',
  },
  {
    name: 'OatSip',
    price: '₱175.00',
    description: 'Creamy oat-milk fusion',
    photo: 'assets/Products/OatSip.webp',
  },
  {
    name: 'PastureBorne',
    price: '₱219.00',
    description: 'Pure milk sourced straight from open pastures',
    photo: 'assets/Products/PastureBorne.webp',
  },
  {
    name: 'SoyPure',
    price: '₱195.00',
    description: 'Plant-powered soy milk with a smooth finish',
    photo: 'assets/Products/SoyPure.webp',
  },
  {
    name: 'Strawberry Dreams',
    price: '₱150.00',
    description: 'Strawberry flavored milk',
    photo: 'assets/Products/Strawberry Dreams.webp',
  },
  {
    name: 'Sweetie Swirls',
    price: '₱170.00',
    description: 'Sweet dairy swirls with vanilla notes',
    photo: 'assets/Products/Sweetie Swirls.webp',
  },
  {
    name: 'Ube Berry Bear',
    price: '₱220.00',
    description: 'Velvety ube berry favorite',
    photo: 'assets/Products/Ube Berry Bear.webp',
  },
  {
    name: 'VelvetPour',
    price: '₱280.00',
    description: 'Velvety smooth and indulgently rich',
    photo: 'assets/Products/VelvetPour.webp',
  },
];

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Built-in catalog. Ids are derived from the name and must stay stable: saved edits are keyed by them. */
export const SEED_PRODUCTS: Product[] = CATALOG.map((p) => ({ ...p, id: `seed-${slugify(p.name)}` }));
