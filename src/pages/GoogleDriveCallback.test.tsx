import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GoogleDriveCallback from './GoogleDriveCallback';

const api = vi.hoisted(() => ({ connectDrive: vi.fn(), getStatus: vi.fn(), getAuthUrl: vi.fn() }));
vi.mock('@/lib/driveAdminApi', () => api);

const mockToast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const GOOGLE_URL = 'https://accounts.google.com/o/oauth2/v2/auth?state=novo';
const OWNER = {
  enabled: true,
  uploadsEnabled: true,
  uploadToken: 'tok',
  driveMode: 'owner' as const,
  needsReconnect: false,
};
const PLATFORM = { enabled: true, uploadsEnabled: true, uploadToken: 'tok' };

let location: { pathname: string; state: unknown };
function LocationProbe() {
  const current = useLocation();
  location = { pathname: current.pathname, state: current.state };
  return null;
}

function renderAt(search: string, options: { strict?: boolean } = {}) {
  const assign = vi.fn();
  const tree = (
    <MemoryRouter
      initialEntries={[`/dashboard/google-drive/callback${search}`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <LocationProbe />
      <Routes>
        <Route path="/dashboard/google-drive/callback" element={<GoogleDriveCallback assign={assign} />} />
        <Route path="/dashboard" element={<div>Painel do casal</div>} />
      </Routes>
    </MemoryRouter>
  );
  render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { assign };
}

let replaceStateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  mockToast.mockReset();
  api.connectDrive.mockResolvedValue(OWNER);
  api.getAuthUrl.mockResolvedValue(GOOGLE_URL);
  replaceStateSpy = vi.spyOn(window.history, 'replaceState');
});

afterEach(() => {
  replaceStateSpy.mockRestore();
});

describe('GoogleDriveCallback: sucesso', () => {
  it('conclui a conexão com o code e o state e volta ao painel na aba de fotos', async () => {
    renderAt('?code=codigo-x&state=st.ate');

    await screen.findByText('Painel do casal');
    expect(api.connectDrive).toHaveBeenCalledWith({ code: 'codigo-x', state: 'st.ate' });
    expect(location.pathname).toBe('/dashboard');
    expect(location.state).toEqual({ activeTab: 'photos' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Google Drive conectado' }));
  });

  it('mostra o andamento enquanto conclui', async () => {
    api.connectDrive.mockReturnValue(new Promise(() => {}));
    renderAt('?code=c&state=s');
    expect(screen.getByRole('status')).toHaveTextContent(/Conectando o seu Google Drive/);
  });

  it('só conclui uma vez, mesmo com o StrictMode executando o efeito duas vezes', async () => {
    renderAt('?code=c&state=s', { strict: true });

    await screen.findByText('Painel do casal');
    expect(api.connectDrive).toHaveBeenCalledTimes(1);
  });

  it('tira o código e o state da barra de endereço', async () => {
    renderAt('?code=c&state=s');
    await screen.findByText('Painel do casal');
    expect(replaceStateSpy).toHaveBeenCalled();
  });
});

describe('GoogleDriveCallback: o Google não concedeu', () => {
  it('acesso negado: mensagem própria, sem chamar o servidor', async () => {
    renderAt('?error=access_denied&state=s');

    expect(await screen.findByText('A conexão foi cancelada. Nada foi alterado.')).toBeInTheDocument();
    expect(api.connectDrive).not.toHaveBeenCalled();
  });

  it('outro erro do Google: mensagem genérica, sem chamar o servidor', async () => {
    renderAt('?error=server_error');
    expect(await screen.findByText(/Não foi possível concluir a conexão com o Google/)).toBeInTheDocument();
    expect(api.connectDrive).not.toHaveBeenCalled();
  });

  it.each([['sem nada', ''], ['sem state', '?code=c'], ['sem code', '?state=s']])(
    'retorno incompleto (%s): erro e nenhuma chamada',
    async (_label, search) => {
      renderAt(search);
      expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível conectar o Google Drive/);
      expect(api.connectDrive).not.toHaveBeenCalled();
    },
  );
});

describe('GoogleDriveCallback: o servidor recusa', () => {
  it('mostra a mensagem do servidor (ex.: permissão do Drive desmarcada)', async () => {
    api.connectDrive.mockRejectedValue(new Error('Marque a permissão de acesso ao Google Drive para conectar.'));
    api.getStatus.mockResolvedValue(PLATFORM);
    renderAt('?code=c&state=s');

    expect(await screen.findByText('Marque a permissão de acesso ao Google Drive para conectar.')).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('erro do connect, mas o status já está conectado (recarregou a página): trata como sucesso', async () => {
    api.connectDrive.mockRejectedValue(new Error('Não foi possível concluir a conexão com o Google.'));
    api.getStatus.mockResolvedValue(OWNER);
    renderAt('?code=usado&state=s');

    await screen.findByText('Painel do casal');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Google Drive conectado' }));
  });

  it('conectado mas precisando reconectar NÃO conta como sucesso', async () => {
    api.connectDrive.mockRejectedValue(new Error('Não foi possível concluir a conexão com o Google.'));
    api.getStatus.mockResolvedValue({ ...OWNER, needsReconnect: true });
    renderAt('?code=usado&state=s');

    expect(await screen.findByText('Não foi possível concluir a conexão com o Google.')).toBeInTheDocument();
    expect(screen.queryByText('Painel do casal')).not.toBeInTheDocument();
  });

  it('se o status também falha, mostra o erro original', async () => {
    api.connectDrive.mockRejectedValue(new Error('Não foi possível concluir a conexão com o Google.'));
    api.getStatus.mockRejectedValue(new Error('rede'));
    renderAt('?code=c&state=s');

    expect(await screen.findByText('Não foi possível concluir a conexão com o Google.')).toBeInTheDocument();
  });
});

describe('GoogleDriveCallback: depois de um erro', () => {
  beforeEach(() => {
    api.connectDrive.mockRejectedValue(new Error('O link de autorização expirou ou é inválido. Tente conectar de novo.'));
    api.getStatus.mockResolvedValue(PLATFORM);
  });

  it('"Tentar de novo" pede uma URL nova e leva ao Google', async () => {
    const { assign } = renderAt('?code=c&state=s');

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(GOOGLE_URL));
  });

  it('"Tentar de novo" com falha ao pedir a URL mostra o erro e continua na página', async () => {
    api.getAuthUrl.mockRejectedValue(new Error('Serviço temporariamente indisponível'));
    const { assign } = renderAt('?code=c&state=s');

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Serviço temporariamente indisponível')).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('"Voltar ao painel" leva à aba de fotos', async () => {
    renderAt('?code=c&state=s');

    fireEvent.click(await screen.findByRole('button', { name: 'Voltar ao painel' }));

    await screen.findByText('Painel do casal');
    expect(location.state).toEqual({ activeTab: 'photos' });
  });
});
