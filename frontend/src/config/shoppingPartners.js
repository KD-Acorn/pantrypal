const SHOPPING_PARTNERS = [
  {
    id: 'amazon_fresh',
    name: 'Amazon Fresh',
    urlTemplate: 'https://www.amazon.com/s?k={ingredient}&i=amazonfresh&tag=mypantryclub-20',
    multiSearchUrl: 'https://www.amazon.com/s?k={items}&i=amazonfresh&tag=mypantryclub-20',
    icon: '🛒',
  },
  {
    id: 'instacart',
    name: 'Instacart',
    urlTemplate: 'https://www.instacart.com/store/s?q={ingredient}',
    multiSearchUrl: 'https://www.instacart.com/store/s?q={items}',
    icon: '🟢',
  },
];

export default SHOPPING_PARTNERS;
