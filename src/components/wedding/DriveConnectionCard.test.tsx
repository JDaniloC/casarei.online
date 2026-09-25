import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DriveConnectionCard from './DriveConnectionCard';

const api = vi.hoisted(() => ({ getAuthUrl: vi.fn(), disconnectDrive: vi.fn() }));
vi.mock('@/lib/driveAdminApi', () => api);

const mockToast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const FOLDER_URL = 'https://drive.google.com/drive/folders/pastaDoCasal_123456';
const GOOGLE_URL = 'https://accounts.google.com/o/oauth2/v2/auth?state=xyz';

const platform = { enabled: true, uploadsEnabled: true, uploadToken: 'tok' };
const owner = {
  ...platform,
  driveMode: 'owner' as const,
  googleEmail: 'ana@example.com',
  needsReconnect: false,
  folderUrl: FOLDER_URL,
};

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  mockToast.mockReset();
  api.getAuthUrl.mockResolvedValue(GOOGLE_URL);
  api.disconnectDrive.mockResolvedValue(platform);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  const noise = errorSpy.mock.calls.filter((args) => !String(args[0]).startsWith('[DriveConnectionCard]'));
  errorSpy.mockRestore();
  expect(noise).toEqual([]);
});

const renderCard = (connection = platform as Record<string, unknown>, extra: Record<string, unknown> = {}) => {
  const navigate = vi.fn();
  const onDisconnected = vi.fn();
  const utils = render(
    <DriveConnectionCard
      connection={connection as never}
      navigate={navigate}
      onDisconnected={onDisconnected}
      {...extra}
    />,
  );
  return { ...utils, navigate, onDisconnected };
};

describe('modo plataforma', () => {
  it('convida a guardar as fotos no Google Drive do casal e avisa das fotos antigas', () => {
    renderCard();

    const card = screen.getByTestId('drive-connection-card');
    expect(within(card).getByRole('heading', { name: 'Guardar as fotos no seu Google Drive' })).toBeInTheDocument();
    expect(within(card).getByText(/O link e o QR code continuam os mesmos/)).toBeInTheDocument();
    expect(within(card).getByText(/Fotos recebidas antes de conectar continuam guardadas pela Casarei\.online/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar no meu Google Drive' })).toBeEnabled();
    expect(card.querySelectorAll('a[href]')).toHaveLength(0);
  });

  it('ao clicar, pede a URL do Google e leva o casal até ela', async () => {
    const { navigate } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar no meu Google Drive' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(GOOGLE_URL));
    expect(api.getAuthUrl).toHaveBeenCalledTimes(1);
    // A página vai embora: o botão fica em "conectando", não volta a aceitar cliques.
    expect(screen.getByRole('button', { name: 'Guardar no meu Google Drive' })).toBeDisabled();
  });

  it('dois cliques no mesmo instante pedem a URL uma vez só', async () => {
    const { navigate } = renderCard();
    const button = screen.getByRole('button', { name: 'Guardar no meu Google Drive' });

    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(api.getAuthUrl).toHaveBeenCalledTimes(1);
  });

  it('falha ao pedir a URL: avisa com o texto do erro, não navega e o botão volta', async () => {
    api.getAuthUrl.mockRejectedValue(new Error('Serviço temporariamente indisponível'));
    const { navigate } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar no meu Google Drive' }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: 'Não foi possível conectar o Google Drive',
        description: 'Serviço temporariamente indisponível',
      }),
    );
    expect(navigate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar no meu Google Drive' })).toBeEnabled());
  });
});

describe('modo casal', () => {
  it('mostra a conta conectada e o link da pasta (abre em outra aba, sem referrer)', () => {
    renderCard(owner);

    expect(screen.getByRole('heading', { name: 'Fotos guardadas no seu Google Drive' })).toBeInTheDocument();
    expect(screen.getByText(/Conectado como ana@example\.com/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Abrir pasta no Google Drive/ });
    expect(link).toHaveAttribute('href', FOLDER_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    expect(screen.queryByRole('button', { name: 'Guardar no meu Google Drive' })).not.toBeInTheDocument();
  });

  it('sem e-mail conhecido e sem link da pasta: texto genérico e nenhum link', () => {
    renderCard({ ...owner, googleEmail: null, folderUrl: null });

    expect(screen.getByText(/Conectado à sua conta do Google/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('desconectar pede confirmação, chama o servidor e avisa o painel com o novo status', async () => {
    const { onDisconnected } = renderCard(owner);

    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/As fotos que já chegaram continuam no seu Drive/)).toBeInTheDocument();
    expect(api.disconnectDrive).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    await waitFor(() => expect(onDisconnected).toHaveBeenCalledWith(platform));
    expect(api.disconnectDrive).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Google Drive desconectado' }));
  });

  it('o aviso de desconectar lembra que a permissão do app se remove nas configurações da conta Google', async () => {
    renderCard(owner);

    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(
        /Para remover também a permissão do aplicativo, use as configurações da sua conta Google\./,
      ),
    ).toBeInTheDocument();
  });

  it('cancelar a confirmação não desconecta', async () => {
    const { onDisconnected } = renderCard(owner);

    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));

    expect(api.disconnectDrive).not.toHaveBeenCalled();
    expect(onDisconnected).not.toHaveBeenCalled();
  });

  it('falha ao desconectar: avisa e não muda o painel', async () => {
    api.disconnectDrive.mockRejectedValue(new Error('Serviço temporariamente indisponível'));
    const { onDisconnected } = renderCard(owner);

    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desconectar' }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Não foi possível desconectar o Google Drive' }),
    );
    expect(onDisconnected).not.toHaveBeenCalled();
  });
});

describe('precisa reconectar', () => {
  const reconnect = { ...owner, needsReconnect: true };

  it('mostra o alerta e o botão Reconectar, que reinicia o mesmo fluxo', async () => {
    const { navigate } = renderCard(reconnect);

    expect(screen.getByRole('alert')).toHaveTextContent(/É preciso reconectar o Google Drive/);
    expect(screen.getByRole('alert')).toHaveTextContent(/envio está indisponível/);

    fireEvent.click(screen.getByRole('button', { name: 'Reconectar' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(GOOGLE_URL));
  });

  it('continua oferecendo Desconectar (voltar ao modo padrão)', () => {
    renderCard(reconnect);
    expect(screen.getByRole('button', { name: 'Desconectar' })).toBeInTheDocument();
  });
});
