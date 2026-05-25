import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CheckoutModal from './CheckoutModal';
import { WeddingProvider } from '@/contexts/WeddingContext';
import { CartProvider } from '@/contexts/CartContext';
import { BrowserRouter } from 'react-router-dom';

// Mock dependências externas
vi.mock('@mercadopago/sdk-react', () => ({
  initMercadoPago: vi.fn(),
  Payment: () => <div data-testid="mp-payment-form" />
}));

vi.mock('@/contexts/CartContext', () => ({
  useCart: () => ({
    items: [
      { gift: { id: '1', name: 'Presente Teste', price: 100, image: '' }, quantity: 1 }
    ],
    getTotalPrice: () => 100,
    getTotalItems: () => 1,
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
    clearCart: vi.fn(),
    includeEnvelope: false,
    setIncludeEnvelope: vi.fn(),
    envelopePrice: 0,
    giftMessage: '',
    setGiftMessage: vi.fn(),
  }),
  CartProvider: ({ children }: any) => <div>{children}</div>
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { id: 'pref-123', orderId: 'order-123' }, error: null })
    }
  }
}));

vi.mock('@/contexts/WeddingContext', () => ({
  useWedding: () => ({
    config: {
      coupleName: 'Teste & Teste',
      whatsappNumber: '5511999999999',
      paymentWhatsapp: true,
      paymentMercadoPago: true,
      paymentManualPix: true,
    }
  }),
  WeddingProvider: ({ children }: any) => <div>{children}</div>
}));

const renderCheckoutModal = () => {
  return render(
    <BrowserRouter>
      <CheckoutModal 
        isOpen={true} 
        onClose={vi.fn()} 
        weddingId="test-id" 
        mercadoPagoPublicKey="TEST-KEY"
        paymentCreditCard={true}
        paymentPix={true}
        paymentBoleto={false}
      />
    </BrowserRouter>
  );
};

describe('CheckoutModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza o carrinho corretamente com itens', () => {
    renderCheckoutModal();
    
    expect(screen.getByText(/Carrinho/i)).toBeInTheDocument();
    expect(screen.getByText(/Presente Teste/i)).toBeInTheDocument();
    expect(screen.getAllByText('R$ 100,00')[0]).toBeInTheDocument();
  });

  it('permite avançar para a tela de informações do convidado', async () => {
    renderCheckoutModal();
    
    const continueButton = screen.getByText('Continuar');
    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(screen.getByText('Suas Informações')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Digite seu nome completo')).toBeInTheDocument();
    });
  });

  it('permite preencher informações e ir para métodos de pagamento', async () => {
    renderCheckoutModal();
    
    // Avança para Seus Dados
    fireEvent.click(screen.getByText('Continuar'));

    // Preenche formulário
    fireEvent.change(screen.getByPlaceholderText('Digite seu nome completo'), { target: { value: 'João da Silva' } });
    fireEvent.change(screen.getByPlaceholderText('Digite seu e-mail'), { target: { value: 'joao@email.com' } });
    fireEvent.change(screen.getByPlaceholderText('(11) 99999-9999'), { target: { value: '(11) 99999-9999' } });
    
    // Seleciona presença
    const presenceRadio = screen.getByLabelText('Sim, estarei presente');
    fireEvent.click(presenceRadio);

    // Avança para Pagamento
    const paymentButton = screen.getByRole('button', { name: /Ir para Pagamento/i });
    
    // Verifica se não está desabilitado
    expect(paymentButton).not.toBeDisabled();
    
    fireEvent.click(paymentButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Pagamento/i })).toBeInTheDocument();
      // Deve mostrar as opções baseadas na config mockada
      expect(screen.getByText(/Pix/i)).toBeInTheDocument();
      expect(screen.getByText(/Cartão/i)).toBeInTheDocument();
    });
  });
});
