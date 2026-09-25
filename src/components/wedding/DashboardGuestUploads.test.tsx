import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DashboardGuestUploads from './DashboardGuestUploads';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const api = vi.hoisted(() => ({
  getStatus: vi.fn(),
  enable: vi.fn(),
  setEnabled: vi.fn(),
  rotateToken: vi.fn(),
  listFiles: vi.fn(),
  getSummary: vi.fn(),
  getThumbnails: vi.fn(),
  getAuthUrl: vi.fn(),
  disconnectDrive: vi.fn(),
}));
vi.mock('@/lib/driveAdminApi', () => api);

const mockToast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

// Quantas vezes o QRCodeCanvas foi renderizado: o de verdade redesenha um canvas de
// 1024 x devicePixelRatio a cada render, então o painel não pode recriá-lo à toa.
const qr = vi.hoisted(() => ({ renders: 0 }));

// jsdom não tem canvas: o mock renderiza um <canvas> comum, com as props em data-*.
vi.mock('qrcode.react', () => ({
  QRCodeCanvas: (props: { value: string; size?: number; level?: string; marginSize?: number }) => {
    qr.renders += 1;
    return (
      <canvas
        data-testid="qr-canvas"
        data-value={props.value}
        data-size={props.size}
        data-level={props.level}
        data-margin={props.marginSize}
      />
    );
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WEDDING_ID = '11111111-2222-3333-4444-555555555555';
const TOKEN = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ012345';
const NEW_TOKEN = 'NOVOtokenNOVOtokenNOVOtoken012345';
const MB = 1024 * 1024;
const GB = 1024 * MB;

const linkFor = (token: string) => `${window.location.origin}/fotos/${token}`;

const connection = (overrides: Record<string, unknown> = {}) => ({
  enabled: true,
  uploadsEnabled: true,
  uploadToken: TOKEN,
  ...overrides,
});

const notEnabled = () => ({ enabled: false, uploadsEnabled: false, uploadToken: null });

const file = (i: number, overrides: Record<string, unknown> = {}) => ({
  id: `f${i}`,
  name: `IMG_${i}.jpg`,
  guestName: 'Maria',
  mimeType: 'image/jpeg',
  size: 2.5 * MB,
  createdTime: '2026-09-20T15:30:00.000Z',
  hasThumbnail: true,
  durationMs: null,
  ...overrides,
});

const files = (from: number, to: number, overrides: Record<string, unknown> = {}) =>
  Array.from({ length: to - from + 1 }, (_, k) => file(from + k, overrides));

const thumbFor = (id: string) => `data:image/jpeg;base64,${id}`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  mockToast.mockReset();
  qr.renders = 0;

  api.getStatus.mockResolvedValue(connection());
  api.enable.mockResolvedValue(connection());
  api.setEnabled.mockImplementation(async (enabled: boolean) => connection({ uploadsEnabled: enabled }));
  api.rotateToken.mockResolvedValue(connection({ uploadToken: NEW_TOKEN }));
  api.getSummary.mockResolvedValue({ count: 0, totalBytes: 0, guests: 0 });
  api.listFiles.mockResolvedValue({ files: [], nextPageToken: null });
  api.getThumbnails.mockImplementation(async (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, thumbFor(id)])),
  );

  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Saída limpa: só os console.error com o prefixo do componente são esperados
  // (nada de aviso de act(), de key ou de atualização de estado).
  const noise = errorSpy.mock.calls.filter((args) => !String(args[0]).startsWith('[DashboardGuestUploads]'));
  errorSpy.mockRestore();
  vi.restoreAllMocks();
  vi.useRealTimers();
  expect(noise).toEqual([]);
});

// ---------------------------------------------------------------------------
// Helpers de tela
// ---------------------------------------------------------------------------

const DRIVE_WORD = /drive/i;

/**
 * Cliques no mesmo tick, antes de o React re-renderizar: o `disabled` ainda não chegou ao DOM,
 * então só a trava interna do componente impede a chamada duplicada.
 */
function clickInOneTick(element: HTMLElement, times = 2) {
  act(() => {
    for (let i = 0; i < times; i += 1) fireEvent.click(element);
  });
}

/** Espera o painel ativado e a primeira atualização (resumo, lista, miniaturas) terminarem. */
async function settle() {
  const button = await screen.findByRole('button', { name: 'Atualizar' });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

async function renderEnabled(ui: React.ReactElement = <DashboardGuestUploads weddingId={WEDDING_ID} />) {
  const utils = render(ui);
  await settle();
  return utils;
}

function expectNoDriveAnywhere(container: HTMLElement) {
  // O cartão "Onde ficam as fotos" fala do Drive de propósito (é onde o casal conecta o dele);
  // o resto do painel continua sem nenhuma menção.
  const scope = container.cloneNode(true) as HTMLElement;
  scope.querySelectorAll('[data-testid="drive-connection-card"]').forEach((card) => card.remove());

  expect(scope.textContent ?? '').not.toMatch(DRIVE_WORD);
  for (const el of Array.from(scope.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      // Só o que o casal pode ver ou clicar: nenhum atributo (href, title, aria-label...) cita o Drive.
      if (attr.name === 'class' || attr.name === 'src' || attr.name.startsWith('data-')) continue;
      expect(`${attr.name}=${attr.value}`).not.toMatch(DRIVE_WORD);
    }
  }
  for (const anchor of Array.from(scope.querySelectorAll('[href]'))) {
    expect(anchor.getAttribute('href')).not.toMatch(/drive\.google\.com|google\.com|googleapis/i);
  }
}

// ---------------------------------------------------------------------------
// weddingId
// ---------------------------------------------------------------------------

describe('weddingId ainda desconhecido', () => {
  it('nulo: pede para salvar o site e não chama o backend', async () => {
    const { container } = render(<DashboardGuestUploads weddingId={null} />);

    expect(screen.getByText('Salve seu site primeiro para ativar o envio de fotos.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    Object.values(api).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    expectNoDriveAnywhere(container);
  });

  it('string vazia (como o Dashboard entrega antes de salvar) também não chama o backend', () => {
    render(<DashboardGuestUploads weddingId="" weddingSlug="casal" />);

    expect(screen.getByText('Salve seu site primeiro para ativar o envio de fotos.')).toBeInTheDocument();
    Object.values(api).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });

  it('só consulta o status depois que o weddingId aparece', async () => {
    const { rerender } = render(<DashboardGuestUploads weddingId={null} />);
    expect(api.getStatus).not.toHaveBeenCalled();

    rerender(<DashboardGuestUploads weddingId={WEDDING_ID} />);

    await settle();
    expect(api.getStatus).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Carregamento do status
// ---------------------------------------------------------------------------

describe('carregando o status', () => {
  it('mostra um indicador de carregamento enquanto o status não chega', async () => {
    const pending = deferred<ReturnType<typeof connection>>();
    api.getStatus.mockReturnValue(pending.promise);

    render(<DashboardGuestUploads weddingId={WEDDING_ID} />);

    expect(screen.getByRole('status')).toHaveTextContent(/carregando/i);
    expect(screen.queryByRole('button', { name: 'Ativar envio de fotos' })).not.toBeInTheDocument();

    await act(async () => {
      pending.resolve(connection());
    });
    await settle();
  });

  it('falha: mostra o erro, avisa com toast destrutivo e "Tentar novamente" recarrega', async () => {
    api.getStatus.mockRejectedValueOnce(new Error('Serviço temporariamente indisponível'));

    render(<DashboardGuestUploads weddingId={WEDDING_ID} />);

    const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
    expect(screen.getByText(/não foi possível carregar/i)).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', description: 'Serviço temporariamente indisponível' }),
    );
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[DashboardGuestUploads]'), expect.anything());

    fireEvent.click(retry);

    await settle();
    expect(api.getStatus).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('switch', { name: 'Receber envios' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Não ativado
// ---------------------------------------------------------------------------

describe('recurso não ativado', () => {
  beforeEach(() => {
    api.getStatus.mockResolvedValue(notEnabled());
  });

  it('explica o recurso e oferece "Ativar envio de fotos", sem QR code nem chamadas do álbum', async () => {
    const { container } = render(<DashboardGuestUploads weddingId={WEDDING_ID} />);

    const button = await screen.findByRole('button', { name: 'Ativar envio de fotos' });

    expect(button).toBeEnabled();
    expect(screen.getAllByText(/QR code/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('qr-canvas')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(api.listFiles).not.toHaveBeenCalled();
    expect(api.getSummary).not.toHaveBeenCalled();
    expectNoDriveAnywhere(container);
  });

  it('clicar em "Ativar" chama enable uma vez e mostra o painel com o QR code e o álbum', async () => {
    api.enable.mockResolvedValue(connection());
    api.listFiles.mockResolvedValue({ files: [file(1)], nextPageToken: null });
    api.getSummary.mockResolvedValue({ count: 1, totalBytes: 2.5 * MB, guests: 1 });
    render(<DashboardGuestUploads weddingId={WEDDING_ID} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Ativar envio de fotos' }));

    expect(await screen.findByTestId('qr-canvas')).toHaveAttribute('data-value', linkFor(TOKEN));
    await settle();
    expect(api.enable).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Ativar envio de fotos' })).not.toBeInTheDocument();
    expect(api.listFiles).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('clique duplo só chama enable uma vez (botão desabilitado enquanto ativa)', async () => {
    const pending = deferred<ReturnType<typeof connection>>();
    api.enable.mockReturnValue(pending.promise);
    render(<DashboardGuestUploads weddingId={WEDDING_ID} />);

    const button = await screen.findByRole('button', { name: /ativar envio de fotos/i });
    clickInOneTick(button);

    expect(api.enable).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    await act(async () => {
      pending.resolve(connection());
    });
    await settle();
  });

  it('falha ao ativar: toast destrutivo com a mensagem do servidor e o botão volta a ficar disponível', async () => {
    api.enable.mockRejectedValue(new Error('Serviço temporariamente indisponível'));
    render(<DashboardGuestUploads weddingId={WEDDING_ID} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Ativar envio de fotos' }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', description: 'Serviço temporariamente indisponível' }),
      ),
    );
    expect(await screen.findByRole('button', { name: 'Ativar envio de fotos' })).toBeEnabled();
    expect(screen.queryByTestId('qr-canvas')).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[DashboardGuestUploads]'), expect.anything());
  });
});

// ---------------------------------------------------------------------------
// Ativado: cartão do QR code
// ---------------------------------------------------------------------------

describe('cartão do QR code', () => {
  it('desenha o QR code de /fotos/<token> em 1024 px, correção M e com margem, e mostra o link', async () => {
    await renderEnabled();

    const qr = screen.getByTestId('qr-canvas');
    expect(qr).toHaveAttribute('data-value', linkFor(TOKEN));
    expect(qr).toHaveAttribute('data-size', '1024');
    expect(qr).toHaveAttribute('data-level', 'M');
    expect(Number(qr.getAttribute('data-margin'))).toBeGreaterThan(0);

    const field = screen.getByDisplayValue(linkFor(TOKEN)) as HTMLInputElement;
    expect(field.readOnly).toBe(true);
    expect(window.location.origin).toMatch(/^https?:\/\//);
    expect(linkFor(TOKEN)).toMatch(/\/fotos\/aBcDeFgHiJkLmNoPqRsTuVwXyZ012345$/);
  });

  it('mostra o aviso sobre os arquivos originais', async () => {
    await renderEnabled();

    expect(
      screen.getByText(
        'Aqui aparecem os arquivos enviados pelos convidados por esta página. Para receber os arquivos originais, entre em contato com a equipe do casarei.online.',
      ),
    ).toBeInTheDocument();
  });

  describe('não redesenha o QR code à toa', () => {
    it('o estado "copiado" liga e desliga sem recriar o QR code', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      await renderEnabled();
      const before = qr.renders;
      expect(before).toBeGreaterThan(0);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
      });
      expect(screen.getByRole('button', { name: 'Link copiado' })).toBeInTheDocument();
      expect(qr.renders).toBe(before);

      // O "copiado" some sozinho depois de 2 s: outra renderização do painel, sem QR novo.
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      expect(screen.getByRole('button', { name: 'Copiar link' })).toBeInTheDocument();
      expect(qr.renders).toBe(before);
    });

    it('"Atualizar" (início, fim e miniaturas) não recria o QR code', async () => {
      api.listFiles.mockResolvedValue({ files: files(1, 3), nextPageToken: null });
      await renderEnabled();
      const before = qr.renders;

      fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());

      expect(api.listFiles).toHaveBeenCalledTimes(2);
      expect(qr.renders).toBe(before);
    });

    it('o estado pendente da chave "Receber envios" não recria o QR code', async () => {
      const pending = deferred<ReturnType<typeof connection>>();
      api.setEnabled.mockReturnValue(pending.promise);
      await renderEnabled();
      const before = qr.renders;
      const toggle = screen.getByRole('switch', { name: 'Receber envios' });

      fireEvent.click(toggle);
      expect(toggle).toBeDisabled();
      expect(qr.renders).toBe(before);

      await act(async () => {
        pending.resolve(connection({ uploadsEnabled: false }));
      });
      expect(toggle).toBeEnabled();
      expect(qr.renders).toBe(before);
    });

    it('um link novo (outro token) redesenha o QR code com o valor novo', async () => {
      await renderEnabled();
      const before = qr.renders;

      fireEvent.click(screen.getByRole('button', { name: 'Gerar novo link' }));
      fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Gerar novo link' }));

      await waitFor(() => expect(screen.getByTestId('qr-canvas')).toHaveAttribute('data-value', linkFor(NEW_TOKEN)));
      expect(qr.renders).toBeGreaterThan(before);
    });
  });

  describe('Copiar link', () => {
    it('usa navigator.clipboard.writeText com o link completo e confirma no botão', async () => {
      await renderEnabled();

      fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith(linkFor(TOKEN));
      expect(await screen.findByRole('button', { name: 'Link copiado' })).toBeInTheDocument();
      expect(mockToast).not.toHaveBeenCalled();
    });

    it('a confirmação some depois de 2 segundos e o timer é limpo ao desmontar', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { unmount } = await renderEnabled();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
      });
      expect(screen.getByRole('button', { name: 'Link copiado' })).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      expect(screen.getByRole('button', { name: 'Copiar link' })).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
      });
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('se a cópia falhar, seleciona o campo e pede para copiar manualmente', async () => {
      writeText.mockRejectedValue(new DOMException('negado', 'NotAllowedError'));
      await renderEnabled();

      fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ description: expect.stringMatching(/manualmente/i) }),
        ),
      );
      const field = screen.getByDisplayValue(linkFor(TOKEN)) as HTMLInputElement;
      expect(field.selectionStart).toBe(0);
      expect(field.selectionEnd).toBe(linkFor(TOKEN).length);
      expect(screen.queryByRole('button', { name: 'Link copiado' })).not.toBeInTheDocument();
    });

    it('sem navigator.clipboard (navegador sem a API) cai no mesmo caminho manual, sem quebrar', async () => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      await renderEnabled();

      fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ description: expect.stringMatching(/manualmente/i) }),
        ),
      );
    });
  });

  describe('Baixar PNG', () => {
    it('baixa canvas.toDataURL("image/png") como qrcode-fotos-dos-convidados.png', async () => {
      const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,QRPNG');
      const clicks: { href: string; download: string }[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push({ href: this.href, download: this.download });
      });
      await renderEnabled();

      fireEvent.click(screen.getByRole('button', { name: 'Baixar PNG' }));

      expect(toDataURL).toHaveBeenCalledWith('image/png');
      expect(clicks).toEqual([{ href: 'data:image/png;base64,QRPNG', download: 'qrcode-fotos-dos-convidados.png' }]);
    });

    it('se o canvas falhar, avisa com toast destrutivo em vez de quebrar', async () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => {
        throw new Error('canvas contaminado');
      });
      await renderEnabled();

      fireEvent.click(screen.getByRole('button', { name: 'Baixar PNG' }));

      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[DashboardGuestUploads]'), expect.anything());
    });
  });
});

// ---------------------------------------------------------------------------
// Gerar novo link
// ---------------------------------------------------------------------------

describe('Gerar novo link', () => {
  it('só chama rotate-token depois de confirmar o diálogo, que avisa dos QR codes impressos', async () => {
    await renderEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Gerar novo link' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/QR codes já impressos deixam de funcionar/i)).toBeInTheDocument();
    expect(api.rotateToken).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Gerar novo link' }));

    await waitFor(() => expect(api.rotateToken).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('qr-canvas')).toHaveAttribute('data-value', linkFor(NEW_TOKEN)));
    expect(screen.getByDisplayValue(linkFor(NEW_TOKEN))).toBeInTheDocument();
    expect(screen.queryByDisplayValue(linkFor(TOKEN))).not.toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/novo link/i) }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('a chave "Receber envios" fica desabilitada enquanto o novo link é gerado (uma troca durante o giro seria ignorada)', async () => {
    const pending = deferred<ReturnType<typeof connection>>();
    api.rotateToken.mockReturnValue(pending.promise);
    await renderEnabled();
    const toggle = screen.getByRole('switch', { name: 'Receber envios' });
    expect(toggle).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Gerar novo link' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Gerar novo link' }));
    await waitFor(() => expect(api.rotateToken).toHaveBeenCalledTimes(1));

    expect(toggle).toBeDisabled();
    expect(api.setEnabled).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(connection({ uploadToken: NEW_TOKEN }));
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('cancelar não faz nada: nenhuma chamada, mesmo link', async () => {
    await renderEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Gerar novo link' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.rotateToken).not.toHaveBeenCalled();
    expect(screen.getByTestId('qr-canvas')).toHaveAttribute('data-value', linkFor(TOKEN));
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('falha ao girar: toast destrutivo e o link atual continua valendo', async () => {
    api.rotateToken.mockRejectedValue(new Error('Serviço temporariamente indisponível'));
    await renderEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Gerar novo link' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Gerar novo link' }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', description: 'Serviço temporariamente indisponível' }),
      ),
    );
    expect(screen.getByTestId('qr-canvas')).toHaveAttribute('data-value', linkFor(TOKEN));
    // O token nunca vai para o log, nem o antigo nem um novo.
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Receber envios
// ---------------------------------------------------------------------------

describe('chave "Receber envios"', () => {
  it('reflete uploadsEnabled e chama set-enabled com o valor oposto ao clicar', async () => {
    await renderEnabled();
    const toggle = screen.getByRole('switch', { name: 'Receber envios' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);

    expect(api.setEnabled).toHaveBeenCalledTimes(1);
    expect(api.setEnabled).toHaveBeenCalledWith(false);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    await waitFor(() => expect(toggle).toBeEnabled());
  });

  it('desligada mostra o aviso de que os convidados não conseguem enviar', async () => {
    api.getStatus.mockResolvedValue(connection({ uploadsEnabled: false }));
    await renderEnabled();

    expect(screen.getByRole('switch', { name: 'Receber envios' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/desativado/i)).toBeInTheDocument();
  });

  it('falha: volta ao valor anterior e avisa com toast destrutivo', async () => {
    api.setEnabled.mockRejectedValue(new Error('Serviço temporariamente indisponível'));
    await renderEnabled();
    const toggle = screen.getByRole('switch', { name: 'Receber envios' });

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', description: 'Serviço temporariamente indisponível' }),
      ),
    );
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('fica desabilitada enquanto a chamada está em andamento (sem chamadas duplicadas)', async () => {
    const pending = deferred<ReturnType<typeof connection>>();
    api.setEnabled.mockReturnValue(pending.promise);
    await renderEnabled();
    const toggle = screen.getByRole('switch', { name: 'Receber envios' });

    clickInOneTick(toggle);

    expect(api.setEnabled).toHaveBeenCalledTimes(1);
    expect(toggle).toBeDisabled();

    await act(async () => {
      pending.resolve(connection({ uploadsEnabled: false }));
    });
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});

// ---------------------------------------------------------------------------
// Resumo e lista
// ---------------------------------------------------------------------------

describe('resumo', () => {
  it('mostra "N arquivos · X GB · M convidados"', async () => {
    api.getSummary.mockResolvedValue({ count: 1234, totalBytes: 1.5 * GB, guests: 8 });
    api.listFiles.mockResolvedValue({ files: [file(1)], nextPageToken: null });

    await renderEnabled();

    expect(screen.getByText('1.234 arquivos · 1,5 GB · 8 convidados')).toBeInTheDocument();
  });

  it('usa o singular e a unidade que couber (MB quando abaixo de 1 GB)', async () => {
    api.getSummary.mockResolvedValue({ count: 1, totalBytes: 3.4 * MB, guests: 1 });
    api.listFiles.mockResolvedValue({ files: [file(1)], nextPageToken: null });

    await renderEnabled();

    expect(screen.getByText('1 arquivo · 3,4 MB · 1 convidado')).toBeInTheDocument();
  });

  it('a falha do resumo não derruba a lista: um toast só e a lista aparece', async () => {
    api.getSummary.mockRejectedValue(new Error('Serviço temporariamente indisponível'));
    api.listFiles.mockResolvedValue({ files: [file(1)], nextPageToken: null });

    await renderEnabled();

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText(/arquivos? ·/)).not.toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });
});

describe('lista de arquivos', () => {
  it('sem arquivos, mostra o estado vazio', async () => {
    await renderEnabled();

    expect(screen.getByText(/ainda não chegou nenhum arquivo/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });

  it('cada item mostra quem enviou (ou "Anônimo"), data, tamanho e o selo de vídeo com a duração', async () => {
    api.listFiles.mockResolvedValue({
      files: [
        file(1, { guestName: 'Maria Silva' }),
        file(2, { guestName: '', size: 512 * 1024 }),
        file(3, { guestName: 'Tio João', mimeType: 'video/mp4', durationMs: 65_000, size: 1.2 * GB }),
        file(4, { guestName: 'Ana', mimeType: 'video/mp4', durationMs: null, hasThumbnail: false }),
      ],
      nextPageToken: null,
    });

    await renderEnabled();

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);

    expect(within(items[0]).getByText('Maria Silva')).toBeInTheDocument();
    expect(within(items[0]).getByText(/^\d{2} set 2026, \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(within(items[0]).getByText('2,5 MB')).toBeInTheDocument();
    expect(within(items[0]).queryByText('1:05')).not.toBeInTheDocument();

    expect(within(items[1]).getByText('Anônimo')).toBeInTheDocument();
    expect(within(items[1]).getByText('512 KB')).toBeInTheDocument();

    expect(within(items[2]).getByText('Tio João')).toBeInTheDocument();
    expect(within(items[2]).getByText('1:05')).toBeInTheDocument();
    expect(within(items[2]).getByText('1,2 GB')).toBeInTheDocument();

    // Vídeo sem duração conhecida ainda ganha o selo.
    expect(within(items[3]).getByText('Vídeo')).toBeInTheDocument();
  });

  it('duração de mais de uma hora aparece como h:mm:ss', async () => {
    api.listFiles.mockResolvedValue({
      files: [file(1, { mimeType: 'video/mp4', durationMs: 3_725_000 })],
      nextPageToken: null,
    });

    await renderEnabled();

    expect(screen.getByText('1:02:05')).toBeInTheDocument();
  });

  it('"Carregar mais" só aparece com nextPageToken, pede a próxima página e acrescenta os itens', async () => {
    api.listFiles
      .mockResolvedValueOnce({ files: files(1, 3), nextPageToken: 'pagina-2' })
      .mockResolvedValueOnce({ files: files(4, 5), nextPageToken: null });
    await renderEnabled();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(5));
    expect(api.listFiles).toHaveBeenNthCalledWith(1);
    expect(api.listFiles).toHaveBeenNthCalledWith(2, 'pagina-2');
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });

  it('ignora arquivos repetidos entre páginas', async () => {
    api.listFiles
      .mockResolvedValueOnce({ files: files(1, 3), nextPageToken: 'pagina-2' })
      .mockResolvedValueOnce({ files: files(3, 4), nextPageToken: null });
    await renderEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));
  });

  it('enquanto carrega mais, "Carregar mais" e "Atualizar" ficam desabilitados e não há chamada dupla', async () => {
    const pending = deferred<{ files: ReturnType<typeof files>; nextPageToken: string | null }>();
    api.listFiles
      .mockResolvedValueOnce({ files: files(1, 2), nextPageToken: 'pagina-2' })
      .mockReturnValueOnce(pending.promise);
    await renderEnabled();
    const more = screen.getByRole('button', { name: 'Carregar mais' });

    clickInOneTick(more);

    expect(api.listFiles).toHaveBeenCalledTimes(2);
    expect(more).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeDisabled();

    await act(async () => {
      pending.resolve({ files: files(3, 3), nextPageToken: null });
    });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled();
  });

  it('falha ao carregar mais: toast destrutivo, mantém a lista e o botão para tentar de novo', async () => {
    api.listFiles
      .mockResolvedValueOnce({ files: files(1, 2), nextPageToken: 'pagina-2' })
      .mockRejectedValueOnce(new Error('Serviço temporariamente indisponível'));
    await renderEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', description: 'Serviço temporariamente indisponível' }),
      ),
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Carregar mais' })).toBeEnabled());
  });

  it('falha na primeira carga da lista: mostra o erro no lugar do estado vazio e avisa com toast', async () => {
    api.listFiles.mockRejectedValue(new Error('Serviço temporariamente indisponível'));

    await renderEnabled();

    expect(screen.getByText(/não foi possível carregar os arquivos/i)).toBeInTheDocument();
    expect(screen.queryByText(/ainda não chegou nenhum arquivo/i)).not.toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', description: 'Serviço temporariamente indisponível' }),
    );
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[DashboardGuestUploads]'), expect.anything());
  });
});

// ---------------------------------------------------------------------------
// Miniaturas
// ---------------------------------------------------------------------------

describe('miniaturas', () => {
  const requestedBatches = () => api.getThumbnails.mock.calls.map((call) => call[0] as string[]);

  it('são pedidas em lotes de no máximo 24 ids, cada id uma única vez', async () => {
    api.listFiles.mockResolvedValue({ files: files(1, 50), nextPageToken: null });

    await renderEnabled();

    const batches = requestedBatches();
    expect(batches.map((batch) => batch.length)).toEqual([24, 24, 2]);
    expect(batches.flat()).toEqual(files(1, 50).map((f) => f.id));
    for (const batch of batches) expect(batch.length).toBeLessThanOrEqual(24);
  });

  it('mostram a imagem quando existe e um ícone de imagem quando não há miniatura', async () => {
    api.listFiles.mockResolvedValue({ files: files(1, 2), nextPageToken: null });
    api.getThumbnails.mockResolvedValue({ f1: thumbFor('f1'), f2: null });

    await renderEnabled();

    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByRole('img', { name: /IMG_1\.jpg/ })).toHaveAttribute('src', thumbFor('f1'));
    expect(within(items[0]).queryByTestId('placeholder-image')).not.toBeInTheDocument();
    expect(within(items[1]).getByTestId('placeholder-image')).toBeInTheDocument();
    expect(within(items[1]).queryByRole('img')).not.toBeInTheDocument();
  });

  it('vídeo sem miniatura mostra o ícone de vídeo com o selo de duração (não parece quebrado)', async () => {
    api.listFiles.mockResolvedValue({
      files: [file(1, { mimeType: 'video/mp4', durationMs: 42_000, hasThumbnail: false })],
      nextPageToken: null,
    });

    await renderEnabled();

    const item = screen.getByRole('listitem');
    expect(within(item).getByTestId('placeholder-video')).toBeInTheDocument();
    expect(within(item).getByText('0:42')).toBeInTheDocument();
    expect(within(item).queryByRole('img')).not.toBeInTheDocument();
  });

  it('só pede miniatura dos arquivos que o servidor diz ter uma (hasThumbnail)', async () => {
    api.listFiles.mockResolvedValue({
      files: [file(1), file(2, { hasThumbnail: false }), file(3)],
      nextPageToken: null,
    });

    await renderEnabled();

    expect(requestedBatches()).toEqual([['f1', 'f3']]);
  });

  it('não chama o servidor de miniaturas quando nenhum arquivo tem miniatura', async () => {
    api.listFiles.mockResolvedValue({ files: [file(1, { hasThumbnail: false })], nextPageToken: null });

    await renderEnabled();

    expect(api.getThumbnails).not.toHaveBeenCalled();
  });

  it('"Carregar mais" pede miniaturas só dos arquivos novos', async () => {
    api.listFiles
      .mockResolvedValueOnce({ files: files(1, 3), nextPageToken: 'pagina-2' })
      .mockResolvedValueOnce({ files: files(4, 5), nextPageToken: null });
    await renderEnabled();
    expect(requestedBatches()).toEqual([['f1', 'f2', 'f3']]);

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => expect(requestedBatches()).toEqual([['f1', 'f2', 'f3'], ['f4', 'f5']]));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
    expect(screen.getAllByRole('img')).toHaveLength(5);
  });

  it('um lote que falha avisa uma vez, mantém os ícones e não derruba a lista nem as chamadas seguintes', async () => {
    api.listFiles.mockResolvedValue({ files: files(1, 30), nextPageToken: null });
    api.getThumbnails.mockRejectedValueOnce(new Error('Serviço temporariamente indisponível'));

    await renderEnabled();

    expect(screen.getAllByRole('listitem')).toHaveLength(30);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.getAllByTestId('placeholder-image')).toHaveLength(30);
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    // Não insiste em loop: o segundo lote não é tentado depois da falha.
    expect(api.getThumbnails).toHaveBeenCalledTimes(1);
  });

  it('id ausente da resposta é tratado como "sem miniatura ainda"', async () => {
    api.listFiles.mockResolvedValue({ files: files(1, 2), nextPageToken: null });
    api.getThumbnails.mockResolvedValue({ f1: thumbFor('f1') });

    await renderEnabled();

    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getAllByTestId('placeholder-image')).toHaveLength(1);
  });

  it('ignora valores herdados do protótipo: só chaves próprias do mapa valem', async () => {
    api.listFiles.mockResolvedValue({ files: files(1, 1), nextPageToken: null });
    api.getThumbnails.mockResolvedValue(Object.create({ f1: thumbFor('f1') }));

    await renderEnabled();

    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByTestId('placeholder-image')).toBeInTheDocument();
  });

  it('aceita o mapa sem protótipo que o cliente da API devolve', async () => {
    api.listFiles.mockResolvedValue({ files: files(1, 2), nextPageToken: null });
    const map = Object.create(null) as Record<string, string | null>;
    map.f1 = thumbFor('f1');
    map.f2 = null;
    api.getThumbnails.mockResolvedValue(map);

    await renderEnabled();

    expect(screen.getAllByRole('img')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Atualizar
// ---------------------------------------------------------------------------

describe('"Atualizar"', () => {
  const requestedBatches = () => api.getThumbnails.mock.calls.map((call) => call[0] as string[]);

  it('recarrega o resumo, a primeira página da lista e SÓ as miniaturas que ainda faltam', async () => {
    api.getSummary
      .mockResolvedValueOnce({ count: 2, totalBytes: 2 * MB, guests: 1 })
      .mockResolvedValueOnce({ count: 3, totalBytes: 3 * MB, guests: 2 });
    api.listFiles
      .mockResolvedValueOnce({ files: files(1, 2), nextPageToken: null })
      .mockResolvedValueOnce({ files: files(1, 3), nextPageToken: null });
    // f2 ainda não tem miniatura (o Drive demora); f1 já tem.
    api.getThumbnails.mockResolvedValueOnce({ f1: thumbFor('f1'), f2: null });
    await renderEnabled();
    expect(requestedBatches()).toEqual([['f1', 'f2']]);
    expect(screen.getByText('2 arquivos · 2 MB · 1 convidado')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
    expect(api.getSummary).toHaveBeenCalledTimes(2);
    expect(api.listFiles).toHaveBeenCalledTimes(2);
    // f1 nunca é pedida de novo; f2 (que veio null) e f3 (nova) sim.
    expect(requestedBatches()).toEqual([['f1', 'f2'], ['f2', 'f3']]);
    expect(screen.getByText('3 arquivos · 3 MB · 2 convidados')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('um null vindo do servidor só é tentado de novo no próximo "Atualizar", nunca em loop', async () => {
    api.listFiles.mockResolvedValue({ files: files(1, 1), nextPageToken: null });
    api.getThumbnails.mockResolvedValue({ f1: null });
    await renderEnabled();

    expect(api.getThumbnails).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.getThumbnails).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(api.getThumbnails).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
  });

  it('mostra o giro do ícone e fica desabilitado enquanto atualiza; cliques repetidos não duplicam', async () => {
    const summary = deferred<{ count: number; totalBytes: number; guests: number }>();
    await renderEnabled();
    api.getSummary.mockReturnValueOnce(summary.promise);
    const button = screen.getByRole('button', { name: 'Atualizar' });

    clickInOneTick(button, 3);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('svg')).toHaveClass('animate-spin');
    // 1 da carga inicial + 1 desta atualização.
    expect(api.getSummary).toHaveBeenCalledTimes(2);
    expect(api.listFiles).toHaveBeenCalledTimes(2);

    await act(async () => {
      summary.resolve({ count: 0, totalBytes: 0, guests: 0 });
    });
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveAttribute('aria-busy', 'false');
    expect(button.querySelector('svg')).not.toHaveClass('animate-spin');
  });

  it('depois de "Carregar mais", volta para a primeira página', async () => {
    api.listFiles
      .mockResolvedValueOnce({ files: files(1, 3), nextPageToken: 'pagina-2' })
      .mockResolvedValueOnce({ files: files(4, 5), nextPageToken: null })
      .mockResolvedValueOnce({ files: files(1, 3), nextPageToken: 'pagina-2' });
    await renderEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(5));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    expect(screen.getByRole('button', { name: 'Carregar mais' })).toBeInTheDocument();
    // As miniaturas dos 5 arquivos já carregados não são pedidas de novo.
    expect(requestedBatches()).toEqual([['f1', 'f2', 'f3'], ['f4', 'f5']]);
  });

  it('erros da atualização viram um único toast destrutivo', async () => {
    await renderEnabled();
    api.getSummary.mockRejectedValueOnce(new Error('Serviço temporariamente indisponível'));
    api.listFiles.mockRejectedValueOnce(new Error('Serviço temporariamente indisponível'));

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
  });
});

// ---------------------------------------------------------------------------
// Nada de Drive na interface
// ---------------------------------------------------------------------------

describe('nenhuma referência ao Drive', () => {
  it('fora do cartão de conexão, nenhum estado do painel mostra a palavra "Drive" nem link para ele', async () => {
    api.getSummary.mockResolvedValue({ count: 3, totalBytes: 5 * MB, guests: 2 });
    api.listFiles.mockResolvedValue({
      files: [
        file(1),
        file(2, { mimeType: 'video/mp4', durationMs: 9_000, hasThumbnail: false }),
        file(3, { guestName: '' }),
      ],
      nextPageToken: 'pagina-2',
    });

    // Sem casamento.
    const noWedding = render(<DashboardGuestUploads weddingId={null} />);
    expectNoDriveAnywhere(noWedding.container);
    noWedding.unmount();

    // Erro de carregamento.
    api.getStatus.mockRejectedValueOnce(new Error('Serviço temporariamente indisponível'));
    const failed = render(<DashboardGuestUploads weddingId={WEDDING_ID} />);
    await screen.findByRole('button', { name: 'Tentar novamente' });
    expectNoDriveAnywhere(failed.container);
    failed.unmount();

    // Não ativado.
    api.getStatus.mockResolvedValueOnce(notEnabled());
    const off = render(<DashboardGuestUploads weddingId={WEDDING_ID} />);
    await screen.findByRole('button', { name: 'Ativar envio de fotos' });
    expectNoDriveAnywhere(off.container);
    off.unmount();

    // Ativado, com lista, vídeo sem miniatura, anônimo e o diálogo de novo link aberto.
    const on = await renderEnabled();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    expectNoDriveAnywhere(on.container);
    fireEvent.click(screen.getByRole('button', { name: 'Gerar novo link' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent ?? '').not.toMatch(DRIVE_WORD);
    expectNoDriveAnywhere(document.body);
  });

  it('não há link (a[href]) para fora do painel em nenhum item', async () => {
    api.listFiles.mockResolvedValue({ files: files(1, 5), nextPageToken: null });

    const { container } = await renderEnabled();

    expect(container.querySelectorAll('a[href]')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

describe('desmontagem', () => {
  it('desmontar com o status pendente não dispara mais nenhuma chamada nem atualiza estado', async () => {
    const pending = deferred<ReturnType<typeof connection>>();
    api.getStatus.mockReturnValue(pending.promise);
    const { unmount } = render(<DashboardGuestUploads weddingId={WEDDING_ID} />);

    unmount();
    await act(async () => {
      pending.resolve(connection());
    });

    expect(api.listFiles).not.toHaveBeenCalled();
    expect(api.getSummary).not.toHaveBeenCalled();
    expect(api.getThumbnails).not.toHaveBeenCalled();
  });

  it('desmontar no meio da atualização interrompe os lotes de miniaturas', async () => {
    const firstBatch = deferred<Record<string, string | null>>();
    api.listFiles.mockResolvedValue({ files: files(1, 50), nextPageToken: null });
    api.getThumbnails.mockReturnValueOnce(firstBatch.promise);
    const { unmount } = render(<DashboardGuestUploads weddingId={WEDDING_ID} />);
    await waitFor(() => expect(api.getThumbnails).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => {
      firstBatch.resolve(Object.fromEntries(files(1, 24).map((f) => [f.id, thumbFor(f.id)])));
    });

    expect(api.getThumbnails).toHaveBeenCalledTimes(1);
  });

  it('trocar o weddingId descarta o resultado da consulta anterior', async () => {
    const first = deferred<ReturnType<typeof connection>>();
    api.getStatus.mockReturnValueOnce(first.promise);
    const { rerender } = render(<DashboardGuestUploads weddingId="antigo" />);

    rerender(<DashboardGuestUploads weddingId={WEDDING_ID} />);
    await settle();
    await act(async () => {
      first.resolve(connection({ uploadToken: 'TOKENantigoTOKENantigoTOKENanti12' }));
    });

    expect(screen.getByTestId('qr-canvas')).toHaveAttribute('data-value', linkFor(TOKEN));
  });
});

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

describe('logs', () => {
  it('nenhum console.error contém o token de upload', async () => {
    api.getSummary.mockRejectedValue(new Error('Serviço temporariamente indisponível'));
    api.listFiles.mockRejectedValue(new Error('Serviço temporariamente indisponível'));
    api.setEnabled.mockRejectedValue(new Error('Serviço temporariamente indisponível'));
    await renderEnabled();

    fireEvent.click(screen.getByRole('switch', { name: 'Receber envios' }));
    await waitFor(() => expect(mockToast.mock.calls.length).toBeGreaterThanOrEqual(2));

    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TOKEN);
    expect(JSON.stringify(mockToast.mock.calls)).not.toContain(TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Cartão "Onde ficam as fotos" (Drive do casal)
// ---------------------------------------------------------------------------

const FOLDER_URL = 'https://drive.google.com/drive/folders/pastaDoCasal_123456';

const ownerConnection = (overrides: Record<string, unknown> = {}) =>
  connection({
    driveMode: 'owner',
    googleEmail: 'ana@example.com',
    needsReconnect: false,
    folderUrl: FOLDER_URL,
    ...overrides,
  });

describe('cartão "Onde ficam as fotos"', () => {
  it('aparece no painel ativado (modo plataforma) e não aparece antes de ativar', async () => {
    api.getStatus.mockResolvedValueOnce(notEnabled());
    const off = render(<DashboardGuestUploads weddingId={WEDDING_ID} />);
    await screen.findByRole('button', { name: 'Ativar envio de fotos' });
    expect(screen.queryByTestId('drive-connection-card')).not.toBeInTheDocument();
    off.unmount();

    await renderEnabled();
    expect(screen.getByTestId('drive-connection-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar no meu Google Drive' })).toBeInTheDocument();
    expect(screen.getByText(/Aqui aparecem os arquivos enviados pelos convidados/)).toBeInTheDocument();
  });

  it('modo casal: mostra a conta, o link da pasta e diz no álbum onde estão os originais', async () => {
    api.getStatus.mockResolvedValue(ownerConnection());

    await renderEnabled();

    expect(screen.getByText(/Conectado como ana@example\.com/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir pasta no Google Drive/ })).toHaveAttribute('href', FOLDER_URL);
    expect(screen.getByText(/Os originais estão na pasta do seu Google Drive/)).toBeInTheDocument();
    expect(screen.queryByText(/entre em contato com a equipe/)).not.toBeInTheDocument();
  });

  it('precisa reconectar: não lê o álbum, mostra o aviso e o botão Reconectar', async () => {
    api.getStatus.mockResolvedValue(ownerConnection({ needsReconnect: true }));

    render(<DashboardGuestUploads weddingId={WEDDING_ID} />);

    expect(await screen.findByRole('button', { name: 'Reconectar' })).toBeInTheDocument();
    expect(screen.getByText(/O álbum volta a aparecer assim que você reconectar o Google Drive/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeDisabled();
    expect(screen.queryByText('Carregando os arquivos…')).not.toBeInTheDocument();
    expect(api.getSummary).not.toHaveBeenCalled();
    expect(api.listFiles).not.toHaveBeenCalled();
  });

  it('desconectar volta ao modo plataforma, zera o álbum e recarrega do Drive de agora', async () => {
    api.getStatus.mockResolvedValue(ownerConnection());
    api.getSummary
      .mockResolvedValueOnce({ count: 2, totalBytes: 5 * MB, guests: 1 })
      .mockResolvedValue({ count: 1, totalBytes: 2 * MB, guests: 1 });
    api.listFiles
      .mockResolvedValueOnce({ files: files(1, 2), nextPageToken: null })
      .mockResolvedValue({ files: [file(9)], nextPageToken: null });
    api.disconnectDrive.mockResolvedValue(connection());

    await renderEnabled();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    // Álbum do Drive de agora (o da plataforma): só a foto nova, não as do Drive do casal.
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Guardar no meu Google Drive' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Abrir pasta no Google Drive/ })).not.toBeInTheDocument();
    expect(api.listFiles).toHaveBeenCalledTimes(2);
    expect(api.getSummary).toHaveBeenCalledTimes(2);
  });
});
