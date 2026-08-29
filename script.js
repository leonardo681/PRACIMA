const products = [
  {
    category: 'camisetas',
    name: 'Camiseta Jesus',
    price: 'R$ 74,50',
    description: 'Camiseta com mensagem cristã, leve e confortável, ideal para uso no dia a dia com estilo e testemunho.',
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'camisetas',
    name: 'Camiseta Fé e Graça',
    price: 'R$ 69,90',
    description: 'Estampa inspiradora com tema de fé e graça, ideal para evangelizar e expressar a crença com simplicidade e alegria.',
    image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'camisetas',
    name: 'Camiseta Louvor',
    price: 'R$ 79,90',
    description: 'Peça com visual moderno e tema de louvor, perfeita para quem ama adoração, música e expressão de fé.',
    image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'camisetas',
    name: 'Camiseta Cristã Feminina',
    price: 'R$ 82,00',
    description: 'Camiseta com design delicado e mensagem cristã feminina, mantendo conforto, beleza e identidade de fé.',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'camisetas',
    name: 'Camiseta Missionária',
    price: 'R$ 76,50',
    description: 'Camiseta com proposta missionária, ideal para quem deseja anunciar o evangelho com estilo e propósito.',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'camisetas',
    name: 'Camiseta Semeando Esperança',
    price: 'R$ 84,90',
    description: 'Peça com mensagem de esperança e encorajamento, perfeita para quem quer transmitir fé, amor e propósito.',
    image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'camisetas',
    name: 'Camiseta de Evangelismo',
    price: 'R$ 72,00',
    description: 'Modelo com tema de evangelismo e testemunho, ideal para compartilhar a mensagem de Cristo com leveza e autenticidade.',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'livros',
    name: 'Livro de Devocional',
    price: 'R$ 54,90',
    description: 'Livro com textos diários para fortalecer a fé, a oração e a leitura espiritual ao longo da semana.',
    image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'livros',
    name: 'Livro de Histórias Bíblicas',
    price: 'R$ 48,50',
    description: 'Livro educativo com histórias da Bíblia em linguagem simples, ideal para crianças e famílias.',
    image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'livros',
    name: 'Livro de Reflexão Cristã',
    price: 'R$ 62,00',
    description: 'Material com reflexões profundas sobre fé, propósito e vida cristã para leitura pessoal e estudo em grupo.',
    image: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'biblias',
    name: 'Bíblia de Estudo',
    price: 'R$ 89,90',
    description: 'Bíblia com auxílio de estudo, ideal para quem deseja aprofundar a leitura com explicações, referências e reflexão sobre os textos bíblicos.',
    image: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'biblias',
    name: 'Bíblia Premium',
    price: 'R$ 129,00',
    description: 'Modelo premium com acabamento refinado, perfeito para uso pessoal, presente especial e leitura diária com mais conforto.',
    image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'biblias',
    name: 'Bíblia Infantil',
    price: 'R$ 59,90',
    description: 'Bíblia adaptada para crianças, com linguagem simples, histórias bíblicas e ilustrações que tornam a leitura mais acessível.',
    image: 'https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'biblias',
    name: 'Bíblia Compacta',
    price: 'R$ 64,90',
    description: 'Modelo compacto, fácil de levar na bolsa ou mochila, ideal para estudo rápido, viagem e leitura em qualquer lugar.',
    image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'biblias',
    name: 'Bíblia para Adolescentes',
    price: 'R$ 95,00',
    description: 'Bíblia pensada para jovens, com linguagem atual, temas relevantes e conteúdo que conecta a Palavra com a realidade.',
    image: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'biblias',
    name: 'Bíblia em Couro',
    price: 'R$ 149,90',
    description: 'Bíblia em acabamento premium em couro, com estética sofisticada, durabilidade e valor para presente ou uso pessoal.',
    image: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'biblias',
    name: 'Bíblia com Cantos',
    price: 'R$ 110,00',
    description: 'Bíblia com acabamento especial e detalhes cuidadosos, indicada para leitura mais íntima e para quem valoriza qualidade.',
    image: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'outros',
    name: 'Kit de Oração',
    price: 'R$ 48,00',
    description: 'Kit com itens devocionais para apoio na oração, estudo e rotina espiritual do dia a dia.',
    image: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'outros',
    name: 'Caneca Cristã',
    price: 'R$ 39,90',
    description: 'Caneca com mensagem cristã, ideal para café, chá e momentos de reflexão e fé.',
    image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80'
  },
  {
    category: 'outros',
    name: 'Agenda Devocional',
    price: 'R$ 42,50',
    description: 'Agenda para organização pessoal com foco em oração, metas e leitura diária da Palavra.',
    image: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=900&q=80'
  }
];

const categoryOrder = ['camisetas', 'livros', 'biblias', 'outros'];
const categoryLabels = {
  camisetas: 'Camisetas',
  livros: 'Livros',
  biblias: 'Bíblias',
  outros: 'Outros'
};

const productsContainer = document.getElementById('products');
const modal = document.getElementById('product-modal');
const modalImage = document.getElementById('modal-image');
const modalName = document.getElementById('modal-name');
const modalPrice = document.getElementById('modal-price');
const modalDescription = document.getElementById('modal-description');
const modalClose = document.querySelector('.modal-close');
const scrollTopBtn = document.getElementById('scroll-top-btn');

function openModal(product) {
  modalImage.src = product.image;
  modalImage.alt = product.name;
  modalName.textContent = product.name;
  modalPrice.textContent = product.price;
  modalDescription.textContent = product.description;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function renderProducts() {
  categoryOrder.forEach((category) => {
    const group = document.createElement('section');
    group.className = 'category-group';
    group.id = category;

    const title = document.createElement('h2');
    title.className = 'category-title';
    title.textContent = categoryLabels[category];
    group.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'products-grid';

    const items = products.filter((product) => product.category === category);

    items.forEach((product) => {
      const card = document.createElement('article');
      card.className = 'product-card';
      card.tabIndex = 0;

      card.innerHTML = `
        <img class="product-image" src="${product.image}" alt="${product.name}" />
        <div class="product-info">
          <h3 class="product-name">${product.name}</h3>
          <p class="product-price">${product.price}</p>
        </div>
      `;

      card.addEventListener('click', () => openModal(product));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openModal(product);
        }
      });

      grid.appendChild(card);
    });

    group.appendChild(grid);
    productsContainer.appendChild(group);
  });
}

renderProducts();

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (event) => {
  if (event.target.dataset.close === 'true') {
    closeModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
    closeModal();
  }
});

scrollTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

const categoryButtons = document.querySelectorAll('.category-btn');
categoryButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const targetId = button.dataset.target;
    const section = document.getElementById(targetId);

    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
