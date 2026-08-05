const products = [
  {
    name: 'Produto Premium',
    price: 'R$ 89,90',
    image: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=900&q=80'
  },
  {
    name: 'Produto Destaque',
    price: 'R$ 129,00',
    image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80'
  },
  {
    name: 'Produto Especial',
    price: 'R$ 74,50',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80'
  }
];

const productsContainer = document.getElementById('products');

products.forEach((product) => {
  const card = document.createElement('article');
  card.className = 'product-card';

  card.innerHTML = `
    <img class="product-image" src="${product.image}" alt="${product.name}" />
    <div class="product-info">
      <h2 class="product-name">${product.name}</h2>
      <p class="product-price">${product.price}</p>
    </div>
  `;

  productsContainer.appendChild(card);
});
