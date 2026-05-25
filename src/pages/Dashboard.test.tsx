import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Dashboard from './Dashboard';
import { BrowserRouter } from 'react-router-dom';

// Mock dependências externas
vi.mock('@/components/wedding/DashboardHistory', () => ({
  default: () => <div data-testid="mock-dashboard-history">DashboardHistory</div>
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
}));

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
