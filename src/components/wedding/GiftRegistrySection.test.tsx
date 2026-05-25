import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GiftRegistrySection from './GiftRegistrySection';
import { WeddingProvider } from '@/contexts/WeddingContext';
import { CartProvider } from '@/contexts/CartContext';
import { BrowserRouter } from 'react-router-dom';

// Default mock configuration with different types of gifts
const mockGifts = [
  {
    id: 'gift-quota-1',
    name: 'Geladeira Frost Free',
    category: 'Cozinha',
    price: 3000,
    image: '',
    isOpenPrice: false,
    isVaquinha: false,
    totalQuotas: 5,
    stock: 3, // 3 left out of 5 (so 2 acquired)
    externalLink: ''
  },
  {
    id: 'gift-quota-sold-out',
    name: 'Forno Elétrico',
    category: 'Cozinha',
    price: 1000,
    image: '',
    isOpenPrice: false,
    isVaquinha: false,
    totalQuotas: 4,
    stock: 0, // all 4 acquired
    externalLink: ''
  },
  {
    id: 'gift-standard',
    name: 'Jogo de Panelas',
    category: 'Cozinha',
    price: 500,
    image: '',
    isOpenPrice: false,
    isVaquinha: false,
    totalQuotas: null,
    stock: 10,
    externalLink: ''
  }
];

const mockConfig = {
  coupleName: 'Danilo & Maria',
  layout: 'classic',
  gifts: mockGifts,
  sections: {
    gifts: true
  }
};

const mockAddItem = vi.fn();

vi.mock('@/contexts/CartContext', () => ({
  useCart: () => ({
    addItem: mockAddItem,
    items: []
  }),
  CartProvider: ({ children }: any) => <div>{children}</div>
}));

vi.mock('@/contexts/WeddingContext', () => ({
  useWedding: () => ({
    config: mockConfig
  }),
  WeddingProvider: ({ children }: any) => <div>{children}</div>
}));

const renderGiftRegistry = () => {
  return render(
    <BrowserRouter>
      <GiftRegistrySection />
    </BrowserRouter>
  );
};

describe('GiftRegistrySection Component (Gift Quotas)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve renderizar as cotas corretamente para presentes fracionados', () => {
    renderGiftRegistry();

    // Deve exibir "2 de 5 cotas adquiridas" (5 - 3 = 2)
    expect(screen.getByText('2 de 5 cotas adquiridas')).toBeInTheDocument();
    
    // Deve calcular e exibir o preço por cota: R$ 3000 / 5 = R$ 600,00
    expect(screen.getByText('R$ 600,00 / cota')).toBeInTheDocument();

    // O botão deve indicar "Adquirir Cota"
    expect(screen.getByRole('button', { name: /Adquirir Cota/i })).toBeInTheDocument();
  });

  it('deve desabilitar e mostrar esgotado para presentes com todas as cotas vendidas', () => {
    renderGiftRegistry();

    // Deve mostrar o botão desabilitado com o texto correto
    const soldOutButton = screen.getByRole('button', { name: /Todas as cotas adquiridas!/i });
    expect(soldOutButton).toBeInTheDocument();
    expect(soldOutButton).toBeDisabled();
  });

  it('deve renderizar presentes normais sem informações de cota', () => {
    renderGiftRegistry();

    // Deve renderizar o presente normal com preço integral
    expect(screen.getByText('Jogo de Panelas')).toBeInTheDocument();
    expect(screen.getByText('R$ 500,00')).toBeInTheDocument();

    // O botão deve indicar "Adicionar ao Carrinho"
    expect(screen.getByRole('button', { name: /Adicionar ao Carrinho/i })).toBeInTheDocument();
  });

  it('deve adicionar o presente fracionado ao carrinho com o preço da cota', () => {
    renderGiftRegistry();

    const acquireQuotaButton = screen.getByRole('button', { name: /Adquirir Cota/i });
    fireEvent.click(acquireQuotaButton);

    // Deve chamar addItem do useCart com as propriedades corretas (objeto original + preço da cota)
    expect(mockAddItem).toHaveBeenCalledTimes(1);
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'gift-quota-1',
        name: 'Geladeira Frost Free',
        price: 3000
      }),
      600
    );
  });
});
