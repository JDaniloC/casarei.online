import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PublicLanding from './PublicLanding';
import { WeddingProvider } from '@/contexts/WeddingContext';
import { CartProvider } from '@/contexts/CartContext';
import { BrowserRouter } from 'react-router-dom';

// Setup Mock for all child components
vi.mock('./PublicHero', () => ({
  default: () => <div data-testid="mock-public-hero">PublicHero</div>
}));

vi.mock('./PublicAbout', () => ({
  default: () => <div data-testid="mock-public-about">PublicAbout</div>
}));

vi.mock('./PublicWeddingInfo', () => ({
  default: () => <div data-testid="mock-public-wedding-info">PublicWeddingInfo</div>
}));

vi.mock('./PublicDressCode', () => ({
  default: () => <div data-testid="mock-public-dress-code">PublicDressCode</div>
}));

vi.mock('./GiftRegistrySection', () => ({
  default: () => <div data-testid="mock-gift-registry-section">GiftRegistrySection</div>
}));

vi.mock('./PublicRSVP', () => ({
  default: () => <div data-testid="mock-public-rsvp">PublicRSVP</div>
}));

vi.mock('./PhotoGallery', () => ({
  default: () => <div data-testid="mock-photo-gallery">PhotoGallery</div>
}));

vi.mock('./PublicMessageWall', () => ({
  default: () => <div data-testid="mock-public-message-wall">PublicMessageWall</div>
}));

vi.mock('./PublicFooter', () => ({
  default: () => <div data-testid="mock-public-footer">PublicFooter</div>
}));

vi.mock('./VideoSection', () => ({
  default: () => <div data-testid="mock-video-section">VideoSection</div>
}));

vi.mock('./CartButton', () => ({
  default: () => <div data-testid="mock-cart-button">CartButton</div>
}));

vi.mock('./CheckoutModal', () => ({
  default: () => <div data-testid="mock-checkout-modal">CheckoutModal</div>
}));

// Default mock configuration for the wedding
const mockConfig = {
  coupleName: 'Danilo & Maria',
  layout: 'classic',
  videoUrl: 'https://youtube.com/watch?v=123',
  sections: {
    about: true,
    weddingInfo: true,
    dressCode: true,
    gifts: true,
    rsvp: true,
    messageWall: true,
    gallery: true,
    video: true,
  }
};

const mockUpdateConfig = vi.fn();
const mockAddGift = vi.fn();
const mockUpdateGift = vi.fn();
const mockRemoveGift = vi.fn();
const mockToggleSection = vi.fn();

vi.mock('@/contexts/WeddingContext', () => ({
  useWedding: () => ({
    config: mockConfig,
    updateConfig: mockUpdateConfig,
    addGift: mockAddGift,
    updateGift: mockUpdateGift,
    removeGift: mockRemoveGift,
    toggleSection: mockToggleSection,
  }),
  WeddingProvider: ({ children }: any) => <div>{children}</div>
}));

const renderPublicLanding = (props: any) => {
  return render(
    <BrowserRouter>
      <PublicLanding {...props} />
    </BrowserRouter>
  );
};

describe('PublicLanding Component (Dual-Link Sharing)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve ocultar seções confidenciais no link público geral (isGuestView = false)', () => {
    renderPublicLanding({
      isGuestView: false,
      weddingId: 'wedding-123'
    });

    // Seções públicas devem estar visíveis
    expect(screen.getByTestId('mock-public-hero')).toBeInTheDocument();
    expect(screen.getByTestId('mock-public-about')).toBeInTheDocument();
    expect(screen.getByTestId('mock-gift-registry-section')).toBeInTheDocument();
    expect(screen.getByTestId('mock-photo-gallery')).toBeInTheDocument();
    expect(screen.getByTestId('mock-video-section')).toBeInTheDocument();

    // Seções de convidados devem estar ocultadas
    expect(screen.queryByTestId('mock-public-wedding-info')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-public-dress-code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-public-rsvp')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-public-message-wall')).not.toBeInTheDocument();
  });

  it('deve exibir todas as seções no link completo do convidado (isGuestView = true)', () => {
    renderPublicLanding({
      isGuestView: true,
      weddingId: 'wedding-123'
    });

    // Todas as seções devem estar totalmente visíveis
    expect(screen.getByTestId('mock-public-hero')).toBeInTheDocument();
    expect(screen.getByTestId('mock-public-about')).toBeInTheDocument();
    expect(screen.getByTestId('mock-public-wedding-info')).toBeInTheDocument();
    expect(screen.getByTestId('mock-public-dress-code')).toBeInTheDocument();
    expect(screen.getByTestId('mock-gift-registry-section')).toBeInTheDocument();
    expect(screen.getByTestId('mock-public-rsvp')).toBeInTheDocument();
    expect(screen.getByTestId('mock-photo-gallery')).toBeInTheDocument();
    expect(screen.getByTestId('mock-public-message-wall')).toBeInTheDocument();
    expect(screen.getByTestId('mock-video-section')).toBeInTheDocument();
  });

  it('deve respeitar as seções desativadas no painel mesmo no link de convidado', () => {
    // Vamos temporariamente desativar a galeria e o dress code nas configurações
    mockConfig.sections.gallery = false;
    mockConfig.sections.dressCode = false;

    renderPublicLanding({
      isGuestView: true,
      weddingId: 'wedding-123'
    });

    // Seções desativadas globalmente devem sumir
    expect(screen.queryByTestId('mock-photo-gallery')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-public-dress-code')).not.toBeInTheDocument();

    // Outras ativas devem continuar
    expect(screen.getByTestId('mock-public-rsvp')).toBeInTheDocument();
    expect(screen.getByTestId('mock-public-wedding-info')).toBeInTheDocument();

    // Resetar mockConfig para os próximos testes
    mockConfig.sections.gallery = true;
    mockConfig.sections.dressCode = true;
  });
});
