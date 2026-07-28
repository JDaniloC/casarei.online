import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// A factory de mockFrom cria um objeto (com vi.fn() novos) a cada chamada,
// então não há uma única referência estável de `update` para espionar.
// Este helper varre todas as chamadas a mockFrom("guests") e agrega os
// payloads efetivamente passados para `.update(...)` em qualquer uma delas.
const getGuestsUpdatePayloads = () =>
  mockFrom.mock.calls
    .map((call, i) => ({ table: call[0], result: mockFrom.mock.results[i]?.value }))
    .filter((entry) => entry.table === 'guests')
    .flatMap((entry) => entry.result.update.mock.calls.map((args: unknown[]) => args[0]));

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
    mockGuest.max_companions = null;
  });

  it('exibe o padrão do casamento como placeholder quando o convidado herda o limite', async () => {
    renderDashboardGuests();

    const campo = await screen.findByLabelText(/Acompanhantes de Família Silva/i);
    expect(campo).toHaveValue(null);
    expect(campo).toHaveAttribute('placeholder', '2');
  });

  it('limpar o campo e sair (blur) grava max_companions como null, não como zero', async () => {
    mockGuest.max_companions = 3;
    renderDashboardGuests();

    const campo = await screen.findByLabelText(/Acompanhantes de Família Silva/i);
    fireEvent.change(campo, { target: { value: '' } });
    fireEvent.blur(campo);

    await waitFor(() => {
      expect(getGuestsUpdatePayloads()).toContainEqual({ max_companions: null });
    });
    // E não deve ter gravado 0 em nenhum momento nessa interação.
    expect(getGuestsUpdatePayloads()).not.toContainEqual({ max_companions: 0 });
  });

  it('digitar um valor acima de 19 grava o teto da faixa (19)', async () => {
    renderDashboardGuests();

    const campo = await screen.findByLabelText(/Acompanhantes de Família Silva/i);
    fireEvent.change(campo, { target: { value: '25' } });
    fireEvent.blur(campo);

    await waitFor(() => {
      expect(getGuestsUpdatePayloads()).toContainEqual({ max_companions: 19 });
    });
  });

  it('digitar um valor negativo grava o piso da faixa (0)', async () => {
    renderDashboardGuests();

    const campo = await screen.findByLabelText(/Acompanhantes de Família Silva/i);
    fireEvent.change(campo, { target: { value: '-3' } });
    fireEvent.blur(campo);

    await waitFor(() => {
      expect(getGuestsUpdatePayloads()).toContainEqual({ max_companions: 0 });
    });
  });

  it('digitar "0" grava zero, não null (par do caso do campo vazio)', async () => {
    renderDashboardGuests();

    const campo = await screen.findByLabelText(/Acompanhantes de Família Silva/i);
    fireEvent.change(campo, { target: { value: '0' } });
    fireEvent.blur(campo);

    await waitFor(() => {
      expect(getGuestsUpdatePayloads()).toContainEqual({ max_companions: 0 });
    });
    // A distinção NULL (herda o padrão) vs 0 (convite individual) só está
    // provada se este caso e o do campo vazio forem verificados juntos.
    expect(getGuestsUpdatePayloads()).not.toContainEqual({ max_companions: null });
  });
});
