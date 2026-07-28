import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import DashboardGuests from './DashboardGuests';

const mockConfig = {
  defaultMaxCompanions: 2,
};

vi.mock('@/contexts/WeddingContext', () => ({
  useWedding: () => ({
    config: mockConfig,
    updateConfig: vi.fn(),
  }),
}));

const mockGuest = {
  id: 'g1',
  name: 'Família Silva',
  max_companions: null,
  status: 'pending',
  token: 't',
};

// Mock encadeado do client Supabase: cobre apenas os métodos que
// DashboardGuests realmente chama (select/eq/order para leitura,
// insert/update/delete para escrita), separado por tabela.
const mockFrom = vi.fn((table: string) => {
  if (table === 'guests') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [mockGuest], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
  }
  if (table === 'rsvp_responses') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
  }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));

const renderDashboardGuests = () => {
  return render(
    <BrowserRouter>
      <DashboardGuests weddingId="wedding-123" weddingSlug="familia-silva" />
    </BrowserRouter>
  );
};

describe('DashboardGuests Component (acompanhantes por convidado)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exibe o padrão do casamento como placeholder quando o convidado herda o limite', async () => {
    renderDashboardGuests();

    const campo = await screen.findByLabelText(/Acompanhantes de Família Silva/i);
    expect(campo).toHaveValue(null);
    expect(campo).toHaveAttribute('placeholder', '2');
  });
});
