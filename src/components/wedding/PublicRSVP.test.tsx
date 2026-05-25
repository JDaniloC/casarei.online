import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PublicRSVP from './PublicRSVP';
import { WeddingProvider } from '@/contexts/WeddingContext';
import { BrowserRouter } from 'react-router-dom';

const mockConfig = {
  coupleName: 'Danilo & Maria',
  whatsappNumber: '11999999999',
  sections: {
    rsvp: true
  }
};

vi.mock('@/contexts/WeddingContext', () => ({
  useWedding: () => ({
    config: mockConfig
  }),
  WeddingProvider: ({ children }: any) => <div>{children}</div>
}));

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn()
    }
  }
}));

const renderRSVP = (weddingId?: string) => {
  return render(
    <BrowserRouter>
      <PublicRSVP weddingId={weddingId || 'wedding-123'} />
    </BrowserRouter>
  );
};

describe('PublicRSVP Component (WhatsApp Fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve exibir o botão de confirmação pelo WhatsApp se o número estiver configurado', () => {
    mockConfig.whatsappNumber = '(11) 99999-9999';

    renderRSVP();

    // Deve exibir o aviso e o botão do WhatsApp
    expect(screen.getByText(/Prefer confirmar pelo WhatsApp ou teve algum problema?/i)).toBeInTheDocument();
    
    const whatsappButton = screen.getByRole('link', { name: /Confirmar pelo WhatsApp/i });
    expect(whatsappButton).toBeInTheDocument();

    // O link deve remover não dígitos e conter o texto de fallback preenchido
    const expectedUrl = `https://wa.me/5511999999999?text=${encodeURIComponent(
      'Olá! Gostaria de falar sobre a confirmação de presença no casamento de Danilo & Maria.'
    )}`;
    expect(whatsappButton).toHaveAttribute('href', expectedUrl);
  });

  it('deve ocultar a seção do WhatsApp se o número não estiver configurado', () => {
    mockConfig.whatsappNumber = '';

    renderRSVP();

    // A seção do WhatsApp e o botão não devem estar presentes
    expect(screen.queryByText(/Prefer confirmar pelo WhatsApp ou teve algum problema?/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Confirmar pelo WhatsApp/i })).not.toBeInTheDocument();
  });
});
