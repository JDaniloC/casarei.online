import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GuestUploadPage from './GuestUploadPage';
import * as api from '@/lib/guestUploadApi';
import * as engine from '@/lib/driveResumableUpload';

// Só as chamadas de rede são falsas: as classes de erro e `messageForUploadError` são as reais,
// para a página ser testada contra o mesmo contrato que usa em produção.
vi.mock('@/lib/guestUploadApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/guestUploadApi')>('@/lib/guestUploadApi');
  return { ...actual, getUploadPageInfo: vi.fn(), createUploadSession: vi.fn() };
});
vi.mock('@/lib/driveResumableUpload', async () => {
  const actual = await vi.importActual<typeof import('@/lib/driveResumableUpload')>(
    '@/lib/driveResumableUpload',
  );
  return { ...actual, uploadFile: vi.fn() };
});

const TOKEN = 'tok-secreto-123';
const GB = 1024 ** 3;
const NAME_KEY = 'casarei.guestUpload.name';

const INFO: api.UploadPageInfo = {
  coupleName: 'Ana e Bruno',
  partnerNames: ['Ana', 'Bruno'],
  available: true,
  maxBytes: 2 * GB,
};

const getInfo = vi.mocked(api.getUploadPageInfo);
const createSession = vi.mocked(api.createUploadSession);
const upload = vi.mocked(engine.uploadFile);

/** Um `uploadFile` em andamento, que o teste resolve ou rejeita quando quiser. */
interface PendingUpload {
  opts: engine.UploadFileOptions;
  settled: boolean;
  resolve: (value?: { fileId: string }) => void;
  reject: (error: unknown) => void;
}

let uploads: PendingUpload[];
let sessionCounter: number;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  uploads = [];
  sessionCounter = 0;

  getInfo.mockReset().mockResolvedValue(INFO);
  createSession
    .mockReset()
    .mockImplementation(async () => ({ uploadUrl: `https://upload.example/sessao-${++sessionCounter}` }));
  upload.mockReset().mockImplementation(
    (opts) =>
      new Promise((resolve, reject) => {
        const entry: PendingUpload = {
          opts,
          settled: false,
          resolve: (value = { fileId: `arquivo-${uploads.length}` }) => {
            entry.settled = true;
            resolve(value);
          },
          reject: (error) => {
            entry.settled = true;
            reject(error);
          },
        };
        // Como o motor real: cancelar pelo signal rejeita com AbortError.
        opts.signal?.addEventListener('abort', () => {
          if (!entry.settled) entry.reject(new DOMException('O envio foi cancelado.', 'AbortError'));
        });
        uploads.push(entry);
      }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
});

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Caminho atual do roteador, lido sem escrever nada no DOM (o token não pode aparecer nele). */
let currentPath = '';
function LocationProbe() {
  currentPath = useLocation().pathname;
  return null;
}

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[`/fotos/${TOKEN}`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <LocationProbe />
      <Routes>
        <Route path="/fotos/:token" element={<GuestUploadPage />} />
        <Route path="/privacidade" element={<div>Página de privacidade</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function renderReady() {
  const utils = renderPage();
  await screen.findByLabelText('Escolher fotos e vídeos');
  return utils;
}

function makeFile(name: string, bytes = 10, type = 'image/jpeg'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** Arquivo que declara `size` sem alocar tudo isso na memória do teste. */
function sizedFile(name: string, size: number, type = 'video/mp4'): File {
  const file = makeFile(name, 1, type);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function selectFiles(files: File[]) {
  const input = screen.getByLabelText('Escolher fotos e vídeos');
  fireEvent.change(input, { target: { files } });
}

/** Executa `fn` dentro de `act` assíncrono (resolver/rejeitar promessas que atualizam a tela). */
async function settle(fn: () => void) {
  await act(async () => {
    fn();
  });
}

function rowOf(fileName: string): HTMLElement {
  const row = screen.getByText(fileName).closest('li');
  if (!row) throw new Error(`Linha de ${fileName} não encontrada na fila`);
  return row;
}

function retryButton(fileName?: string) {
  return screen.getByRole('button', {
    name: fileName ? new RegExp(`tentar novamente.*${fileName.replace('.', '\\.')}`, 'i') : /tentar novamente/i,
  });
}

function fireBeforeUnload(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const NETWORK_MESSAGE = api.messageForUploadError(new engine.FatalUploadError('sem rede', 0));

// ---------------------------------------------------------------------------
// Estados da página
// ---------------------------------------------------------------------------

describe('estados da página', () => {
  it('mostra o carregamento enquanto busca as informações e pede a página com o token da rota', async () => {
    getInfo.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent(/carregando/i);
    expect(getInfo).toHaveBeenCalledWith(TOKEN);
  });

  it('mostra "não encontrado" quando o link não existe', async () => {
    getInfo.mockRejectedValue(new api.GuestUploadApiError('not_found', 404));
    renderPage();

    expect(await screen.findByText('Esta página não existe ou o link mudou.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Escolher fotos e vídeos')).not.toBeInTheDocument();
  });

  it('mostra "desativado" quando o envio está desligado, sem o seletor de arquivos', async () => {
    getInfo.mockResolvedValue({ ...INFO, available: false, reason: 'disabled' });
    renderPage();

    expect(await screen.findByText('O envio de fotos está desativado no momento.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Escolher fotos e vídeos')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Seu nome (opcional)')).not.toBeInTheDocument();
  });

  it('mostra "indisponível" (sem seletor) quando o casal precisa reconectar o Google', async () => {
    getInfo.mockResolvedValue({ ...INFO, available: false, reason: 'unavailable' });
    renderPage();

    expect(
      await screen.findByText('O envio está temporariamente indisponível. Tente de novo mais tarde.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('O envio de fotos está desativado no momento.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Escolher fotos e vídeos')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Seu nome (opcional)')).not.toBeInTheDocument();
  });

  it('em falha de rede na carga mostra a mensagem do cliente (que sugere o Chrome) e permite tentar de novo', async () => {
    getInfo.mockRejectedValueOnce(new api.GuestUploadApiError('network', 0));
    renderPage();

    expect(await screen.findByText(/abra esta página no Chrome/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));

    expect(await screen.findByLabelText('Escolher fotos e vídeos')).toBeInTheDocument();
    expect(getInfo).toHaveBeenCalledTimes(2);
  });

  it('pronto: cabeçalho com os nomes, texto de boas-vindas, campo de nome, seletor e link de privacidade', async () => {
    await renderReady();

    expect(screen.getByRole('heading', { level: 1, name: 'Ana & Bruno' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Envie suas fotos e vídeos do casamento. Seus arquivos não ficam públicos: os noivos veem o que você enviar no painel deles.',
      ),
    ).toBeInTheDocument();
    // A política de privacidade diz que a plataforma tem acesso técnico ao armazenamento:
    // a página não pode prometer que só os noivos veem os arquivos.
    expect(screen.queryByText(/só eles veem/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/direto para o álbum/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Seu nome (opcional)')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Se preferir não se identificar, deixe em branco: seus arquivos vão para a pasta Anônimo.',
      ),
    ).toBeInTheDocument();

    const input = screen.getByLabelText('Escolher fotos e vídeos') as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe('image/*,video/*');

    expect(screen.getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute('href', '/privacidade');
  });

  it('usa o nome do casal quando não há nomes individuais', async () => {
    getInfo.mockResolvedValue({ ...INFO, partnerNames: [] });
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Ana e Bruno' })).toBeInTheDocument();
    expect(document.title).toBe('Enviar fotos — Ana e Bruno');
  });

  it('define o título da aba e o restaura ao sair', async () => {
    document.title = 'Título original';
    const { unmount } = await renderReady();

    expect(document.title).toBe('Enviar fotos — Ana & Bruno');
    unmount();
    expect(document.title).toBe('Título original');
  });

  it('injeta a meta noindex e a remove ao desmontar', async () => {
    const { unmount } = await renderReady();

    const metas = document.head.querySelectorAll('meta[name="robots"]');
    expect(metas).toHaveLength(1);
    expect(metas[0]).toHaveAttribute('content', 'noindex');

    unmount();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('a meta noindex já vale durante o carregamento e nos estados de erro', async () => {
    getInfo.mockRejectedValue(new api.GuestUploadApiError('not_found', 404));
    renderPage();
    expect(document.head.querySelector('meta[name="robots"]')).not.toBeNull();
    await screen.findByText('Esta página não existe ou o link mudou.');
    expect(document.head.querySelector('meta[name="robots"]')).not.toBeNull();
  });

  it('desmontar durante a carga não gera atualização de estado nem erro', async () => {
    let resolveInfo!: (info: api.UploadPageInfo) => void;
    getInfo.mockReturnValue(new Promise((resolve) => (resolveInfo = resolve)));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderPage();

    unmount();
    await act(async () => resolveInfo(INFO));

    expect(errors).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Nome do convidado
// ---------------------------------------------------------------------------

describe('nome do convidado', () => {
  it('envia o nome (sem espaços nas pontas) na criação da sessão', async () => {
    await renderReady();
    fireEvent.change(screen.getByLabelText('Seu nome (opcional)'), { target: { value: '  Maria Silva  ' } });
    selectFiles([makeFile('foto.jpg', 10, 'image/jpeg')]);

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(createSession).toHaveBeenCalledWith(TOKEN, {
      fileName: 'foto.jpg',
      mimeType: 'image/jpeg',
      size: 10,
      guestName: 'Maria Silva',
    });
  });

  it('sem nome, a requisição não leva guestName', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(createSession.mock.calls[0][1]).not.toHaveProperty('guestName');
  });

  it('guarda o nome no localStorage e o restaura na próxima visita', async () => {
    const first = await renderReady();
    fireEvent.change(screen.getByLabelText('Seu nome (opcional)'), { target: { value: 'Maria' } });
    expect(window.localStorage.getItem(NAME_KEY)).toBe('Maria');
    first.unmount();

    await renderReady();
    expect(screen.getByLabelText('Seu nome (opcional)')).toHaveValue('Maria');
  });

  it('funciona quando o localStorage lança em qualquer operação', async () => {
    const denied = () => {
      throw new DOMException('Acesso negado ao armazenamento', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(denied);

    await renderReady();
    fireEvent.change(screen.getByLabelText('Seu nome (opcional)'), { target: { value: 'Maria' } });
    expect(screen.getByLabelText('Seu nome (opcional)')).toHaveValue('Maria');

    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(createSession.mock.calls[0][1]).toMatchObject({ guestName: 'Maria' });
  });
});

// ---------------------------------------------------------------------------
// Seleção: arquivos recusados antes de qualquer chamada de rede
// ---------------------------------------------------------------------------

describe('seleção de arquivos', () => {
  it('recusa arquivo acima do limite com a mensagem que cita o casal, sem tocar a rede nem entrar na fila', async () => {
    await renderReady();
    selectFiles([sizedFile('casamento.mp4', 3 * GB)]);

    expect(
      await screen.findByText('Arquivos acima de 2 GB: fale com Ana & Bruno para combinar o envio.'),
    ).toBeInTheDocument();
    expect(createSession).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('cita o nome do casal quando não há nomes individuais', async () => {
    getInfo.mockResolvedValue({ ...INFO, partnerNames: [] });
    renderPage();
    await screen.findByLabelText('Escolher fotos e vídeos');
    selectFiles([sizedFile('casamento.mp4', 3 * GB)]);

    expect(
      await screen.findByText('Arquivos acima de 2 GB: fale com Ana e Bruno para combinar o envio.'),
    ).toBeInTheDocument();
  });

  it('aceita o arquivo que tem exatamente o tamanho máximo', async () => {
    await renderReady();
    selectFiles([sizedFile('limite.mp4', 2 * GB)]);

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Arquivos acima de/)).not.toBeInTheDocument();
  });

  it('recusa arquivo vazio com mensagem amigável, sem tocar a rede nem entrar na fila', async () => {
    await renderReady();
    selectFiles([makeFile('vazio.jpg', 0)]);

    expect(await screen.findByText('Este arquivo está vazio e não pode ser enviado.')).toBeInTheDocument();
    expect(createSession).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('numa seleção mista, enfileira só os válidos e avisa dos recusados', async () => {
    await renderReady();
    selectFiles([makeFile('boa.jpg'), makeFile('vazio.jpg', 0), sizedFile('enorme.mp4', 3 * GB)]);

    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession.mock.calls[0][1]).toMatchObject({ fileName: 'boa.jpg' });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Este arquivo está vazio e não pode ser enviado.')).toBeInTheDocument();
    expect(screen.getByText(/Arquivos acima de 2 GB/)).toBeInTheDocument();
  });

  it('uma nova seleção limpa os avisos da anterior', async () => {
    await renderReady();
    selectFiles([makeFile('vazio.jpg', 0)]);
    await screen.findByText('Este arquivo está vazio e não pode ser enviado.');

    selectFiles([makeFile('boa.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(screen.queryByText('Este arquivo está vazio e não pode ser enviado.')).not.toBeInTheDocument();
  });

  it('mostra nome e tamanho de cada arquivo da fila', async () => {
    await renderReady();
    selectFiles([sizedFile('grande.mp4', Math.round(1.5 * 1024 * 1024)), sizedFile('pequena.jpg', 500, 'image/jpeg')]);

    await waitFor(() => expect(uploads).toHaveLength(2));
    expect(within(rowOf('grande.mp4')).getByText('1,5 MB')).toBeInTheDocument();
    expect(within(rowOf('pequena.jpg')).getByText('500 B')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Fila e fluxo por arquivo
// ---------------------------------------------------------------------------

describe('fila de envio', () => {
  it('cria a sessão e envia o arquivo com a URL recebida; termina como "Enviado"', async () => {
    await renderReady();
    const file = makeFile('foto.jpg');
    selectFiles([file]);

    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0].opts.uploadUrl).toBe('https://upload.example/sessao-1');
    expect(uploads[0].opts.file).toBe(file);
    expect(uploads[0].opts.resumeFromServer).toBeFalsy();
    expect(within(rowOf('foto.jpg')).getByText(/Enviando/)).toBeInTheDocument();

    await settle(() => uploads[0].resolve());
    expect(within(rowOf('foto.jpg')).getByText('Enviado')).toBeInTheDocument();
    expect(within(rowOf('foto.jpg')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('envia no máximo 2 arquivos ao mesmo tempo e libera a vaga quando um termina', async () => {
    await renderReady();
    selectFiles(['a', 'b', 'c', 'd', 'e'].map((n) => makeFile(`${n}.jpg`)));

    await waitFor(() => expect(uploads).toHaveLength(2));
    await act(async () => {}); // dá chance de um terceiro começar por engano
    expect(uploads).toHaveLength(2);
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('Aguardando')).toHaveLength(3);

    const maxUnsettled = () => uploads.filter((u) => !u.settled).length;
    let peak = maxUnsettled();
    for (let done = 0; done < 5; done += 1) {
      await settle(() => uploads.find((u) => !u.settled)!.resolve());
      if (done < 4) await waitFor(() => expect(uploads).toHaveLength(Math.min(5, done + 3)));
      peak = Math.max(peak, maxUnsettled());
    }

    expect(peak).toBeLessThanOrEqual(2);
    expect(createSession).toHaveBeenCalledTimes(5);
    expect(screen.getAllByText('Enviado')).toHaveLength(5);
  });

  it('mostra o progresso com nome acessível e valor', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));

    const bar = screen.getByRole('progressbar', { name: 'Progresso do envio de foto.jpg' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');

    act(() => uploads[0].opts.onProgress?.(50, 100));
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '50'));
    expect(within(rowOf('foto.jpg')).getByText('Enviando 50%')).toBeInTheDocument();
  });

  it('agrupa as atualizações de progresso (cerca de 5 por segundo) e sempre mostra o estado final', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const bar = screen.getByRole('progressbar', { name: /foto\.jpg/ });

    act(() => {
      for (let percent = 1; percent <= 50; percent += 1) uploads[0].opts.onProgress?.(percent, 100);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '0'); // ainda não desenhou nada
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '50'); // só o último valor da rajada

    act(() => uploads[0].opts.onProgress?.(80, 100));
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '50'); // no máximo ~5 atualizações por segundo
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '80');

    // O estado final não espera o temporizador.
    await settle(() => uploads[0].resolve());
    expect(within(rowOf('foto.jpg')).getByText('Enviado')).toBeInTheDocument();
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });

  it('o progresso de uma linha não volta atrás', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    const bar = screen.getByRole('progressbar', { name: /foto\.jpg/ });

    act(() => uploads[0].opts.onProgress?.(60, 100));
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '60'));
    act(() => uploads[0].opts.onProgress?.(30, 100));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(bar).toHaveAttribute('aria-valuenow', '60');
  });

  it('avisa que é preciso manter a tela aberta enquanto há envio, e para de avisar quando termina', async () => {
    await renderReady();
    expect(screen.queryByText('Mantenha esta tela aberta até terminar.')).not.toBeInTheDocument();

    selectFiles([makeFile('foto.jpg')]);
    expect(await screen.findByText('Mantenha esta tela aberta até terminar.')).toBeInTheDocument();

    await settle(() => uploads[0].resolve());
    expect(screen.queryByText('Mantenha esta tela aberta até terminar.')).not.toBeInTheDocument();
  });

  it('resume o andamento numa região aria-live polite e agradece ao terminar', async () => {
    await renderReady();
    const region = document.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();

    selectFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(2));
    expect(region).toHaveTextContent('0 de 2 enviados');

    await settle(() => uploads[0].resolve());
    expect(region).toHaveTextContent('1 de 2 enviados');

    await settle(() => uploads[1].resolve());
    expect(region).toHaveTextContent('Tudo enviado. Obrigado por compartilhar!');
  });

  it('coloca os avisos de arquivos recusados na região aria-live', async () => {
    await renderReady();
    selectFiles([sizedFile('enorme.mp4', 3 * GB)]);
    const region = document.querySelector('[aria-live="polite"]');

    await waitFor(() => expect(region).toHaveTextContent('fale com Ana & Bruno'));
  });
});

// ---------------------------------------------------------------------------
// Erros e "Tentar novamente"
// ---------------------------------------------------------------------------

describe('erros e nova tentativa', () => {
  it('erro de rede do motor mostra a mensagem que sugere o Chrome e o botão "Tentar novamente"', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));

    await settle(() => uploads[0].reject(new engine.FatalUploadError('sem rede', 0)));

    expect(within(rowOf('foto.jpg')).getByText(NETWORK_MESSAGE)).toBeInTheDocument();
    expect(NETWORK_MESSAGE).toMatch(/Chrome/);
    expect(retryButton('foto.jpg')).toBeInTheDocument();
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('1 com erro');
  });

  it('erro retentável: "Tentar novamente" reenvia com a MESMA URL e resumeFromServer, sem nova sessão', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    const firstUrl = uploads[0].opts.uploadUrl;
    await settle(() => uploads[0].reject(new engine.FatalUploadError('sem rede', 0)));

    fireEvent.click(retryButton());

    await waitFor(() => expect(uploads).toHaveLength(2));
    expect(uploads[1].opts.uploadUrl).toBe(firstUrl);
    expect(uploads[1].opts.resumeFromServer).toBe(true);
    expect(createSession).toHaveBeenCalledTimes(1);

    await settle(() => uploads[1].resolve());
    expect(within(rowOf('foto.jpg')).getByText('Enviado')).toBeInTheDocument();
  });

  it.each([429, 503])('HTTP %i do Google também é retentável na mesma sessão', async (status) => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    await settle(() => uploads[0].reject(new engine.FatalUploadError('Google ocupado', status)));

    fireEvent.click(retryButton());

    await waitFor(() => expect(uploads).toHaveLength(2));
    expect(uploads[1].opts.resumeFromServer).toBe(true);
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('erro não retentável: "Tentar novamente" cria uma sessão nova e envia do zero', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    await settle(() => uploads[0].reject(new engine.FatalUploadError('O Google Drive recusou o envio (HTTP 403).', 403)));

    expect(within(rowOf('foto.jpg')).getByText(api.messageForUploadError(new Error('x')))).toBeInTheDocument();
    fireEvent.click(retryButton());

    await waitFor(() => expect(uploads).toHaveLength(2));
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(uploads[1].opts.uploadUrl).toBe('https://upload.example/sessao-2');
    expect(uploads[1].opts.uploadUrl).not.toBe(uploads[0].opts.uploadUrl);
    expect(uploads[1].opts.resumeFromServer).toBeFalsy();
  });

  describe('barra de progresso ao tentar de novo', () => {
    async function uploadUntilFailure(error: unknown) {
      await renderReady();
      selectFiles([makeFile('foto.jpg')]);
      await waitFor(() => expect(uploads).toHaveLength(1));
      const bar = screen.getByRole('progressbar', { name: /foto\.jpg/ });
      act(() => uploads[0].opts.onProgress?.(60, 100));
      await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '60'));
      await settle(() => uploads[0].reject(error));
      return bar;
    }

    it('retomando a mesma sessão, a barra não volta a zero', async () => {
      const bar = await uploadUntilFailure(new engine.FatalUploadError('sem rede', 0));
      expect(bar).toHaveAttribute('aria-valuenow', '60');

      fireEvent.click(retryButton());

      await waitFor(() => expect(uploads).toHaveLength(2));
      expect(bar).toHaveAttribute('aria-valuenow', '60');
    });

    it('numa sessão nova (erro não retentável), a barra recomeça do zero', async () => {
      const bar = await uploadUntilFailure(new engine.FatalUploadError('recusado', 403));
      expect(bar).toHaveAttribute('aria-valuenow', '60');

      fireEvent.click(retryButton());

      await waitFor(() => expect(uploads).toHaveLength(2));
      expect(bar).toHaveAttribute('aria-valuenow', '0');
    });

    it('sessão expirada renovada sozinha também recomeça a barra do zero', async () => {
      const bar = await uploadUntilFailure(new engine.SessionExpiredError());

      await waitFor(() => expect(uploads).toHaveLength(2));
      expect(bar).toHaveAttribute('aria-valuenow', '0');
    });
  });

  it('falha na criação da sessão mostra a mensagem do código; tentar de novo cria a sessão e envia', async () => {
    createSession.mockRejectedValueOnce(new api.GuestUploadApiError('rate_limited', 429));
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);

    const message = api.messageForUploadError(new api.GuestUploadApiError('rate_limited', 429));
    expect(await within(await screen.findByRole('list')).findByText(message)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();

    fireEvent.click(retryButton());

    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(uploads[0].opts.resumeFromServer).toBeFalsy();
  });

  it('falha de rede na criação da sessão mostra a mensagem que sugere o Chrome', async () => {
    createSession.mockRejectedValueOnce(new api.GuestUploadApiError('network', 0));
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);

    expect(await within(await screen.findByRole('list')).findByText(/abra esta página no Chrome/i)).toBeInTheDocument();
  });

  it('SessionExpiredError na primeira tentativa cria UMA sessão nova e recomeça sozinha', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));

    await settle(() => uploads[0].reject(new engine.SessionExpiredError()));

    await waitFor(() => expect(uploads).toHaveLength(2));
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(uploads[1].opts.uploadUrl).toBe('https://upload.example/sessao-2');
    expect(uploads[1].opts.resumeFromServer).toBeFalsy();
    // Recomeçou, e ainda não é erro para o convidado.
    expect(screen.queryByRole('button', { name: /tentar novamente/i })).not.toBeInTheDocument();

    await settle(() => uploads[1].resolve());
    expect(within(rowOf('foto.jpg')).getByText('Enviado')).toBeInTheDocument();
  });

  it('se a sessão nova também expirar, não cria uma terceira: vira erro com "Tentar novamente"', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    await settle(() => uploads[0].reject(new engine.SessionExpiredError()));
    await waitFor(() => expect(uploads).toHaveLength(2));
    await settle(() => uploads[1].reject(new engine.SessionExpiredError()));

    expect(await screen.findByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
    await act(async () => {});
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(uploads).toHaveLength(2);

    // O clique do convidado é uma nova decisão: nova sessão, do zero.
    fireEvent.click(retryButton());
    await waitFor(() => expect(uploads).toHaveLength(3));
    expect(createSession).toHaveBeenCalledTimes(3);
    expect(uploads[2].opts.resumeFromServer).toBeFalsy();
  });

  it('se a retomada da mesma sessão descobrir que ela expirou, cria uma sessão nova uma vez', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    await settle(() => uploads[0].reject(new engine.FatalUploadError('sem rede', 0)));

    fireEvent.click(retryButton());
    await waitFor(() => expect(uploads).toHaveLength(2));
    expect(uploads[1].opts.resumeFromServer).toBe(true);
    await settle(() => uploads[1].reject(new engine.SessionExpiredError()));

    await waitFor(() => expect(uploads).toHaveLength(3));
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(uploads[2].opts.uploadUrl).toBe('https://upload.example/sessao-2');
    expect(uploads[2].opts.resumeFromServer).toBeFalsy();
  });

  it('um erro não trava a fila: os outros arquivos continuam sendo enviados', async () => {
    await renderReady();
    selectFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(2));

    await settle(() => uploads[0].reject(new engine.FatalUploadError('sem rede', 0)));

    await waitFor(() => expect(uploads).toHaveLength(3));
    expect(uploads[2].opts.file.name).toBe('c.jpg');
    expect(within(rowOf('a.jpg')).getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('o botão de tentar novamente e o seletor têm pelo menos 44 px de altura', async () => {
    await renderReady();
    expect(screen.getByText('Escolher fotos e vídeos').closest('label')).toHaveClass('min-h-11');

    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    await settle(() => uploads[0].reject(new engine.FatalUploadError('sem rede', 0)));

    expect(retryButton()).toHaveClass('min-h-11');
  });
});

// ---------------------------------------------------------------------------
// Erros definitivos, anúncio por arquivo e link de privacidade
// ---------------------------------------------------------------------------

describe('botão "Tentar novamente" só quando repetir pode dar certo', () => {
  // Erros da API que voltam sempre iguais: a própria mensagem diz para falar com os noivos ou
  // conferir o arquivo/link. A mensagem fica; o botão não.
  it.each([
    ['file_type', 400],
    ['file_too_large', 400],
    ['invalid_input', 400],
    ['not_found', 404],
    ['forbidden_origin', 403],
  ] as const)('erro definitivo %s: mostra a mensagem e esconde o botão', async (code, status) => {
    const error = new api.GuestUploadApiError(code, status);
    createSession.mockRejectedValueOnce(error);
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);

    const list = await screen.findByRole('list');
    expect(await within(list).findByText(api.messageForUploadError(error))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tentar novamente/i })).not.toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
    // Continua contando como erro no resumo.
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('1 com erro');
  });

  it.each([
    ['disabled', 409],
    ['rate_limited', 429],
    ['unavailable', 503],
    ['storage_full', 507],
    ['network', 0],
    ['unknown', 500],
  ] as const)('erro transitório %s: mostra a mensagem e mantém o botão', async (code, status) => {
    const error = new api.GuestUploadApiError(code, status);
    createSession.mockRejectedValueOnce(error);
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);

    const list = await screen.findByRole('list');
    expect(await within(list).findByText(api.messageForUploadError(error))).toBeInTheDocument();
    expect(retryButton('foto.jpg')).toBeInTheDocument();
  });

  it.each([
    ['FatalUploadError retentável (rede)', () => new engine.FatalUploadError('sem rede', 0)],
    ['FatalUploadError não retentável (403)', () => new engine.FatalUploadError('recusado', 403)],
    ['FatalUploadError 400 do Google', () => new engine.FatalUploadError('requisição inválida', 400)],
  ])('erro do motor (%s) mantém o botão', async (_name, makeError) => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    await settle(() => uploads[0].reject(makeError()));

    expect(retryButton('foto.jpg')).toBeInTheDocument();
  });

  it('SessionExpiredError que sobra depois da sessão nova também mantém o botão', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    await settle(() => uploads[0].reject(new engine.SessionExpiredError()));
    await waitFor(() => expect(uploads).toHaveLength(2));
    await settle(() => uploads[1].reject(new engine.SessionExpiredError()));

    expect(await screen.findByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('num erro definitivo o botão dos outros arquivos continua aparecendo', async () => {
    createSession.mockRejectedValueOnce(new api.GuestUploadApiError('file_type', 400));
    await renderReady();
    selectFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1)); // b.jpg segue para o envio
    await settle(() => uploads[0].reject(new engine.FatalUploadError('sem rede', 0)));

    expect(within(rowOf('a.jpg')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(rowOf('b.jpg')).getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });
});

describe('anúncio do erro de cada arquivo', () => {
  it('o texto do erro fica numa região role="status" que já existe (vazia) antes do erro', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));

    const row = rowOf('foto.jpg');
    const region = within(row).getByRole('status');
    expect(region).toBeEmptyDOMElement();

    await settle(() => uploads[0].reject(new engine.FatalUploadError('sem rede', 0)));

    // A mesma região recebeu a mensagem, então o leitor de tela a anuncia; o nome do arquivo
    // vai junto, para quem não vê a linha saber de qual arquivo é o erro.
    expect(within(row).getByRole('status')).toBe(region);
    expect(within(region).getByText(NETWORK_MESSAGE)).toBeInTheDocument();
    expect(region).toHaveTextContent('foto.jpg');
  });

  it('só a linha com erro tem texto na região; as outras ficam vazias', async () => {
    await renderReady();
    selectFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(2));
    await settle(() => uploads[0].reject(new engine.FatalUploadError('sem rede', 0)));

    expect(within(rowOf('a.jpg')).getByRole('status')).not.toBeEmptyDOMElement();
    expect(within(rowOf('b.jpg')).getByRole('status')).toBeEmptyDOMElement();
  });

  it('não repete o resumo da página: a região da linha só tem a mensagem do arquivo', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    await settle(() => uploads[0].reject(new engine.FatalUploadError('sem rede', 0)));

    const region = within(rowOf('foto.jpg')).getByRole('status');
    expect(region).not.toHaveTextContent(/enviados?/);
    expect(region).not.toHaveTextContent('com erro');
  });
});

describe('link de privacidade', () => {
  it('é uma âncora que abre em nova aba com noopener e noreferrer', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));

    const link = screen.getByRole('link', { name: 'Política de privacidade' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/privacidade');
    expect(link).toHaveAttribute('target', '_blank');
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/);
    expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
  });

  it('tocar no link durante um envio não navega dentro do app nem aborta o envio', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    const pathBefore = currentPath;
    expect(pathBefore).toBe(`/fotos/${TOKEN}`);

    fireEvent.click(screen.getByRole('link', { name: 'Política de privacidade' }));
    await act(async () => {});

    expect(currentPath).toBe(pathBefore); // o roteador não saiu da página
    expect(screen.queryByText('Página de privacidade')).not.toBeInTheDocument();
    expect(uploads[0].opts.signal?.aborted).toBe(false);
    expect(within(rowOf('foto.jpg')).getByText(/Enviando/)).toBeInTheDocument();

    // E o envio continua normalmente até o fim.
    await settle(() => uploads[0].resolve());
    expect(within(rowOf('foto.jpg')).getByText('Enviado')).toBeInTheDocument();
  });

  it('a página não tem outro link além da política de privacidade', async () => {
    await renderReady();

    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Segredos, saída e limpeza
// ---------------------------------------------------------------------------

describe('segredos', () => {
  it('nem o token nem a URL de sessão vão para storage, DOM ou console', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    await renderReady();
    fireEvent.change(screen.getByLabelText('Seu nome (opcional)'), { target: { value: 'Maria' } });
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    await settle(() => uploads[0].reject(new engine.FatalUploadError('sem rede', 0)));

    const storages = JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage });
    expect(storages).not.toContain(TOKEN);
    expect(storages).not.toContain('upload.example');
    expect(document.body.innerHTML).not.toContain(TOKEN);
    expect(document.body.innerHTML).not.toContain('upload.example');
    expect(window.location.href).not.toContain('upload.example');
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    // A única coisa guardada é o nome que o convidado digitou.
    expect(Object.keys(window.localStorage)).toEqual([NAME_KEY]);
  });
});

describe('beforeunload', () => {
  it('só bloqueia a saída enquanto há envio e remove o listener depois', async () => {
    await renderReady();
    expect(fireBeforeUnload()).toBe(false);

    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(fireBeforeUnload()).toBe(true);

    await settle(() => uploads[0].resolve());
    expect(fireBeforeUnload()).toBe(false);
  });

  it('um envio com erro (parado) não bloqueia a saída', async () => {
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    await settle(() => uploads[0].reject(new engine.FatalUploadError('sem rede', 0)));

    expect(fireBeforeUnload()).toBe(false);
  });

  it('remove o listener ao desmontar durante um envio', async () => {
    const { unmount } = await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));

    unmount();
    expect(fireBeforeUnload()).toBe(false);
  });
});

describe('wake lock', () => {
  it('sem navigator.wakeLock (Safari antigo) a página e o envio funcionam normalmente', async () => {
    expect('wakeLock' in navigator).toBe(false);
    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    await settle(() => uploads[0].resolve());

    expect(within(rowOf('foto.jpg')).getByText('Enviado')).toBeInTheDocument();
  });

  it('pede a trava de tela durante o envio e a libera ao terminar', async () => {
    const sentinel = { release: vi.fn().mockResolvedValue(undefined), addEventListener: vi.fn() };
    const request = vi.fn().mockResolvedValue(sentinel);
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });

    await renderReady();
    expect(request).not.toHaveBeenCalled();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    expect(sentinel.release).not.toHaveBeenCalled();

    await settle(() => uploads[0].resolve());
    await waitFor(() => expect(sentinel.release).toHaveBeenCalledTimes(1));
  });

  it('libera a trava ao desmontar durante o envio', async () => {
    const sentinel = { release: vi.fn().mockResolvedValue(undefined), addEventListener: vi.fn() };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn().mockResolvedValue(sentinel) },
    });

    const { unmount } = await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(navigator.wakeLock.request).toHaveBeenCalled());
    await act(async () => {});

    unmount();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it('se o navegador recusar a trava, o envio segue sem ela', async () => {
    const request = vi.fn().mockRejectedValue(new DOMException('Sem permissão', 'NotAllowedError'));
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });

    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(request).toHaveBeenCalled());
    await settle(() => uploads[0].resolve());

    expect(within(rowOf('foto.jpg')).getByText('Enviado')).toBeInTheDocument();
  });

  it('se navigator.wakeLock.request lançar de forma síncrona, o envio segue sem ela', async () => {
    const request = vi.fn(() => {
      throw new Error('quebrou');
    });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });

    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    await settle(() => uploads[0].resolve());

    expect(within(rowOf('foto.jpg')).getByText('Enviado')).toBeInTheDocument();
  });

  it('pede a trava de novo quando a aba volta a ficar visível durante o envio', async () => {
    let onRelease: (() => void) | undefined;
    const sentinel = {
      release: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        onRelease = listener;
      }),
    };
    const request = vi.fn().mockResolvedValue(sentinel);
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });

    await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await act(async () => {});

    // O navegador libera a trava sozinho quando a aba fica oculta.
    onRelease?.();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });
});

describe('ao desmontar', () => {
  it('cancela os envios em andamento e não deixa temporizadores nem erros para trás', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = await renderReady();
    selectFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    await waitFor(() => expect(uploads).toHaveLength(2));

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => uploads[0].opts.onProgress?.(10, 100)); // deixa um flush de progresso agendado
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await act(async () => {
      unmount();
    });

    expect(uploads[0].opts.signal?.aborted).toBe(true);
    expect(uploads[1].opts.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(uploads).toHaveLength(2); // o terceiro nunca começa
    expect(errors).not.toHaveBeenCalled();
  });

  it('se a sessão for criada depois de desmontar, o envio nem começa', async () => {
    let releaseSession!: (value: { uploadUrl: string }) => void;
    createSession.mockReturnValue(new Promise((resolve) => (releaseSession = resolve)));
    const { unmount } = await renderReady();
    selectFiles([makeFile('foto.jpg')]);
    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => releaseSession({ uploadUrl: 'https://upload.example/tarde' }));

    expect(upload).not.toHaveBeenCalled();
  });
});
