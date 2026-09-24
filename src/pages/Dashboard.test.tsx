import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Dashboard from './Dashboard';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';

// Mock dependências externas
vi.mock('@/components/wedding/DashboardHistory', () => ({
  default: () => <div data-testid="mock-dashboard-history">DashboardHistory</div>
}));
// A visão de convidados é pesada e tem testes próprios: aqui só interessa que a aba a monta.
vi.mock('@/components/wedding/DashboardGuests', () => ({
  default: ({ weddingId }: { weddingId: string }) => (
    <div data-testid="mock-dashboard-guests" data-wedding-id={weddingId}>DashboardGuests</div>
  ),
}));
// Cliente da API do painel de fotos: o painel de verdade é montado, o backend não.
const driveApi = vi.hoisted(() => ({
  getStatus: vi.fn(),
  enable: vi.fn(),
  setEnabled: vi.fn(),
  rotateToken: vi.fn(),
  listFiles: vi.fn(),
  getSummary: vi.fn(),
  getThumbnails: vi.fn(),
}));
vi.mock('@/lib/driveAdminApi', () => driveApi);
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
}));

// Casamento que a consulta da carga inicial devolve. `null` (o padrão) mantém o
// comportamento dos testes de CSV: sem casamento carregado e sem weddingId.
const dashboardState = vi.hoisted(() => ({ wedding: null as Record<string, unknown> | null }));

const mockAddGift = vi.fn();
const mockUpdateConfig = vi.fn();
const mockToggleSection = vi.fn();

const mockConfig = {
  coupleName: 'Danilo & Maria',
  layout: 'classic',
  gifts: [],
  sections: {
    gifts: true,
    about: true,
    weddingInfo: true,
    dressCode: true,
    rsvp: true,
    messageWall: true,
    gallery: true,
    video: true,
  }
};

vi.mock('@/contexts/WeddingContext', () => ({
  useWedding: () => ({
    config: mockConfig,
    updateConfig: mockUpdateConfig,
    addGift: mockAddGift,
    updateGift: vi.fn(),
    removeGift: vi.fn(),
    toggleSection: mockToggleSection,
  }),
  WeddingProvider: ({ children }: any) => <div>{children}</div>
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-123', email: 'test@example.com' },
    signOut: vi.fn(),
  })
}));

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast
  })
}));

// Mock Supabase clients
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn(() => Promise.resolve({ data: dashboardState.wedding, error: null })),
          single: vi.fn().mockResolvedValue({
            data: {
              couple_name: 'Danilo & Maria',
              layout: 'classic',
              sections: { gifts: true }
            },
            error: null
          })
        })
      })
    }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null })
    }
  }
}));

// Mock URL methods for downloading
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test');
global.URL.revokeObjectURL = vi.fn();

const renderDashboard = () => {
  return render(
    <BrowserRouter>
      <Dashboard />
    </BrowserRouter>
  );
};

describe('Dashboard Component (CSV Import & Template Download)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve permitir baixar o arquivo modelo de CSV', async () => {
    renderDashboard();

    // Entra na aba Configurações/Configurar Site
    const configTab = screen.getByRole('button', { name: /Configurar Site/i });
    fireEvent.click(configTab);

    // Entra na subaba Presentes
    const giftsSubTab = screen.getByRole('button', { name: /Presentes & Pix/i });
    fireEvent.click(giftsSubTab);

    // O botão "Importar CSV" deve estar visível (isso confirma que chegamos na aba certa)
    const importButton = screen.getByRole('button', { name: /Importar CSV/i });
    expect(importButton).toBeInTheDocument();

    // Procura o input de arquivo do CSV especificamente usando o atributo accept=".csv"
    const fileInput = document.querySelector('input[accept=".csv"]');
    expect(fileInput).toBeInTheDocument();
  });

  it('deve realizar o parse do arquivo CSV e chamar addGift para cada linha válida', async () => {
    renderDashboard();

    // Vai para a aba de presentes
    fireEvent.click(screen.getByRole('button', { name: /Configurar Site/i }));
    fireEvent.click(screen.getByRole('button', { name: /Presentes & Pix/i }));

    const fileInput = document.querySelector('input[accept=".csv"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    // Criar um arquivo de CSV mockado e definir explicitamente o método .text() para garantir compatibilidade com JSDOM
    const csvContent = `Nome,Categoria,Preco,Link,Imagem
Geladeira Frost Free,Cozinha,3299.90,https://www.example.com/geladeira,https://www.example.com/geladeira.jpg
Jogo de Panelas Antiaderente,Cozinha,499.00,,
`;
    const file = new File([csvContent], 'presentes.csv', { type: 'text/csv' });
    file.text = () => Promise.resolve(csvContent);

    // Simular upload de arquivo
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Esperar processamento e asserções
    await waitFor(() => {
      // Deve chamar o toast informando "Lendo arquivo..."
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Lendo arquivo...',
      }));

      // Deve ter chamado o addGift para os 2 presentes válidos do CSV
      expect(mockAddGift).toHaveBeenCalledTimes(2);

      // Linha 1
      expect(mockAddGift).toHaveBeenNthCalledWith(1, expect.objectContaining({
        name: 'Geladeira Frost Free',
        category: 'Cozinha',
        price: 3299.90,
        externalLink: 'https://www.example.com/geladeira',
        image: 'https://www.example.com/geladeira.jpg'
      }));

      // Linha 2
      expect(mockAddGift).toHaveBeenNthCalledWith(2, expect.objectContaining({
        name: 'Jogo de Panelas Antiaderente',
        category: 'Cozinha',
        price: 499.00,
        externalLink: '',
        image: ''
      }));
    });
  });

  it('deve auto-preencher os campos de presente ao obter dados do link via scraping', async () => {
    // Mock fetch global para a Edge Function de scraping
    const mockScrapedData = {
      title: 'Batedeira Planetária',
      price: 899.90,
      imageUrl: 'https://img.com/batedeira.jpg'
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockScrapedData)
    });
    global.fetch = mockFetch;

    renderDashboard();

    // Vai para a sub-aba Presentes
    fireEvent.click(screen.getByRole('button', { name: /Configurar Site/i }));
    fireEvent.click(screen.getByRole('button', { name: /Presentes & Pix/i }));

    // Abre o Dialog de Adicionar Presente
    fireEvent.click(screen.getByRole('button', { name: /Adicionar Presente/i }));

    // Encontra o input de link externo de preenchimento
    const linkInput = screen.getByPlaceholderText('https://www.loja...') as HTMLInputElement;
    expect(linkInput).toBeInTheDocument();

    // Digita o link
    fireEvent.change(linkInput, { target: { value: 'https://loja.com/batedeira-planetaria' } });

    // Encontra o botão de varinha (scrape) que é o próximo elemento irmão do input de link
    const scrapeButton = linkInput.nextElementSibling as HTMLButtonElement;
    expect(scrapeButton).toBeInTheDocument();

    // Clica no botão de raspagem
    fireEvent.click(scrapeButton);

    // Espera que a raspagem seja executada e os campos sejam atualizados
    await waitFor(() => {
      // O fetch deve ter sido chamado para o endpoint correto
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://mykaowlastbbtwvhgokt.supabase.co/functions/v1/scrape-gift',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ url: 'https://loja.com/batedeira-planetaria' })
        })
      );

      // Os inputs devem ter sido auto-preenchidos
      const nameInput = screen.getByPlaceholderText('Ex: Jogo de Panelas') as HTMLInputElement;
      const priceInput = screen.getByPlaceholderText('0.00') as HTMLInputElement;
      const imageInput = screen.getByPlaceholderText('https://...') as HTMLInputElement;

      expect(nameInput.value).toBe('Batedeira Planetária');
      expect(parseFloat(priceInput.value)).toBe(899.90);
      expect(imageInput.value).toBe('https://img.com/batedeira.jpg');

      // Deve mostrar o toast de sucesso
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Presente Importado!',
      }));
    });
  });
});

describe('Dashboard: aba "Fotos dos Convidados"', () => {
  const WEDDING_ID = 'wedding-uuid-1';
  const notEnabled = { enabled: false, uploadsEnabled: false, uploadToken: null };

  beforeEach(() => {
    vi.clearAllMocks();
    dashboardState.wedding = {
      id: WEDDING_ID,
      slug: 'danilo-e-maria',
      couple_name: 'Danilo & Maria',
      layout: 'classic',
    };
    driveApi.getStatus.mockResolvedValue(notEnabled);
  });

  afterEach(() => {
    dashboardState.wedding = null;
  });

  it('clicar na aba renderiza o painel e dispara a consulta inicial de status', async () => {
    renderDashboard();
    // Aba padrão é o Painel Geral: o painel de fotos nem foi montado.
    expect(screen.getByTestId('mock-dashboard-history')).toBeInTheDocument();
    expect(driveApi.getStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Fotos dos Convidados' }));

    expect(await screen.findByRole('button', { name: 'Ativar envio de fotos' })).toBeInTheDocument();
    expect(driveApi.getStatus).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('mock-dashboard-history')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-dashboard-guests')).not.toBeInTheDocument();
  });

  it('location.state.activeTab === "photos" abre a aba direto, sem clicar', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/dashboard', state: { activeTab: 'photos' } }]}>
        <Dashboard />
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Ativar envio de fotos' })).toBeInTheDocument();
    expect(driveApi.getStatus).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('mock-dashboard-history')).not.toBeInTheDocument();
  });

  it('a aba "Convidados" continua renderizando a visão de convidados, sem o painel de fotos', async () => {
    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'Convidados' }));

    expect(await screen.findByTestId('mock-dashboard-guests')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('mock-dashboard-guests')).toHaveAttribute('data-wedding-id', WEDDING_ID)
    );
    expect(screen.queryByRole('button', { name: 'Ativar envio de fotos' })).not.toBeInTheDocument();
    expect(driveApi.getStatus).not.toHaveBeenCalled();
  });

  it('trocar de "Convidados" para "Fotos dos Convidados" monta o painel de fotos e desmonta a visão de convidados', async () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'Convidados' }));
    expect(await screen.findByTestId('mock-dashboard-guests')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fotos dos Convidados' }));

    expect(await screen.findByRole('button', { name: 'Ativar envio de fotos' })).toBeInTheDocument();
    expect(screen.queryByTestId('mock-dashboard-guests')).not.toBeInTheDocument();
    expect(driveApi.getStatus).toHaveBeenCalledTimes(1);
  });
});
