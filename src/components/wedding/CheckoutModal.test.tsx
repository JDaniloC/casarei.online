import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CheckoutModal from './CheckoutModal';
import { WeddingProvider } from '@/contexts/WeddingContext';
import { CartProvider } from '@/contexts/CartContext';
import { BrowserRouter } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

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

const renderCheckoutModal = (extraProps: Partial<React.ComponentProps<typeof CheckoutModal>> = {}) => {
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
        {...extraProps}
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

  it('em link público (isGuestView=false) não pergunta sobre presença e avança sem ela', async () => {
    renderCheckoutModal({ isGuestView: false });

    fireEvent.click(screen.getByText('Continuar'));

    await waitFor(() => {
      expect(screen.getByText('Suas Informações')).toBeInTheDocument();
    });

    // A pergunta de presença não deve existir no fluxo público
    expect(screen.queryByText(/Você vai estar presente no casamento/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Digite seu nome completo'), { target: { value: 'João da Silva' } });
    fireEvent.change(screen.getByPlaceholderText('Digite seu e-mail'), { target: { value: 'joao@email.com' } });
    fireEvent.change(screen.getByPlaceholderText('(11) 99999-9999'), { target: { value: '(11) 99999-9999' } });

    // Sem responder presença, o botão deve habilitar mesmo assim
    expect(screen.getByRole('button', { name: /Ir para Pagamento/i })).not.toBeDisabled();
  });

  it('em convite com maxCompanions=0 não mostra o seletor de quantidade', async () => {
    renderCheckoutModal({ isGuestView: true, maxCompanions: 0 });

    fireEvent.click(screen.getByText('Continuar'));

    await waitFor(() => {
      expect(screen.getByText('Suas Informações')).toBeInTheDocument();
    });

    // Responde presença = sim
    fireEvent.click(screen.getByLabelText('Sim, estarei presente'));

    // O seletor de quantidade não deve aparecer
    expect(screen.queryByLabelText(/Quantidade de pessoas/i)).not.toBeInTheDocument();
  });
});

describe('CheckoutModal Component (maxCompanions > 0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const goToInfoAndConfirmAttendance = async () => {
    fireEvent.click(screen.getByText('Continuar'));

    await waitFor(() => {
      expect(screen.getByText('Suas Informações')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Sim, estarei presente'));
  };

  it('exibe o seletor de acompanhantes com as opções de 0 a maxCompanions', async () => {
    renderCheckoutModal({ isGuestView: true, maxCompanions: 3 });

    await goToInfoAndConfirmAttendance();

    const select = (await screen.findByLabelText(/Quantos acompanhantes/i)) as HTMLSelectElement;
    expect(select).toBeInTheDocument();

    const valores = Array.from(select.options).map((o) => o.value);
    expect(valores).toEqual(['0', '1', '2', '3']);

    // Estado interno (attendanceGuests) começa em 1 pessoa (o titular),
    // então o seletor de acompanhantes deve exibir 0.
    expect(select.value).toBe('0');
  });

  it('ao selecionar N acompanhantes, exibe N campos de nome e envia guest_count = N + 1 no RSVP', async () => {
    renderCheckoutModal({ isGuestView: true, maxCompanions: 3 });

    await goToInfoAndConfirmAttendance();

    fireEvent.change(screen.getByPlaceholderText('Digite seu nome completo'), { target: { value: 'João da Silva' } });
    fireEvent.change(screen.getByPlaceholderText('Digite seu e-mail'), { target: { value: 'joao@email.com' } });
    fireEvent.change(screen.getByPlaceholderText('(11) 99999-9999'), { target: { value: '(11) 99999-9999' } });

    const select = (await screen.findByLabelText(/Quantos acompanhantes/i)) as HTMLSelectElement;

    // Seleciona 2 acompanhantes (valor exibido no seletor)
    fireEvent.change(select, { target: { value: '2' } });
    expect(select.value).toBe('2');

    // Write-back: attendanceGuests interno vira 3 (2 acompanhantes + titular),
    // refletido nos 2 campos de nome exibidos
    const nome1 = await screen.findByPlaceholderText('Nome do acompanhante 1');
    const nome2 = screen.getByPlaceholderText('Nome do acompanhante 2');
    fireEvent.change(nome1, { target: { value: 'Maria' } });
    fireEvent.change(nome2, { target: { value: 'Pedro' } });

    const paymentButton = screen.getByRole('button', { name: /Ir para Pagamento/i });
    expect(paymentButton).not.toBeDisabled();
    fireEvent.click(paymentButton);

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        'submit-rsvp',
        expect.objectContaining({
          body: expect.objectContaining({
            guest_count: 3,
            companion_names: ['Maria', 'Pedro'],
          }),
        })
      );
    });
  });
});
