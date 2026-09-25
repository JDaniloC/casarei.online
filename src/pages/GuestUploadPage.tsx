// Página pública `/fotos/:token`: convidados, sem cadastro e quase sempre no celular, enviam
// fotos e vídeos direto para o Google Drive dos noivos.
//
// A tela é a parte visível de dois módulos que já cuidam do difícil:
//   - `guestUploadApi`: informações da página e criação da sessão de upload (edge function);
//   - `driveResumableUpload`: envia os bytes em chunks direto ao Google, com retentativas.
// Aqui ficam a fila (no máximo 2 envios ao mesmo tempo), o contrato de "Tentar novamente" e
// os cuidados de quem está com a tela ligada num casamento: aviso para não sair, Wake Lock e
// atualizações de progresso agrupadas.
//
// Segredos: a URL de sessão de cada arquivo (`uploadUrl`) é uma credencial. Ela vive só na
// memória desta página (ref), nunca em storage, URL, DOM ou console. O token do QR code já
// está na URL da página, mas também não é repetido em lugar nenhum.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  createUploadSession,
  getUploadPageInfo,
  GuestUploadApiError,
  messageForUploadError,
  type GuestUploadErrorCode,
  type UploadPageInfo,
} from "@/lib/guestUploadApi";
import { FatalUploadError, SessionExpiredError, uploadFile } from "@/lib/driveResumableUpload";

const NAME_STORAGE_KEY = "casarei.guestUpload.name";
/** Mesmo limite da edge function (`MAX_GUEST_NAME_LENGTH`). */
const MAX_GUEST_NAME_LENGTH = 60;
const MAX_PARALLEL_UPLOADS = 2;
/** Intervalo mínimo entre duas atualizações visuais de progresso (cerca de 5 por segundo). */
const PROGRESS_FLUSH_MS = 200;

/**
 * Erros da API que voltam sempre iguais se o mesmo arquivo for reenviado (tipo recusado,
 * tamanho, requisição inválida, link inexistente ou origem bloqueada): a mensagem já diz o
 * que fazer, e um botão "Tentar novamente" só levaria o convidado a falhar de novo.
 * Falhas transitórias (rede, limite de envios, indisponibilidade) e erros do motor de upload
 * mantêm o botão.
 */
const DEFINITIVE_ERROR_CODES: ReadonlySet<GuestUploadErrorCode> = new Set<GuestUploadErrorCode>([
  "file_type",
  "file_too_large",
  "invalid_input",
  "not_found",
  "forbidden_origin",
]);

function isDefinitiveError(error: unknown): boolean {
  return error instanceof GuestUploadApiError && DEFINITIVE_ERROR_CODES.has(error.code);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Tamanho legível em pt-BR: "500 B", "1,5 MB", "2 GB". */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${String(Math.round(value * 10) / 10).replace(".", ",")} ${units[unit]}`;
}

/** Nomes do casal para o cabeçalho e os avisos: os dois nomes ou, na falta deles, o nome do casal. */
function coupleLabel(info: UploadPageInfo): string {
  const names = info.partnerNames.map((name) => name.trim()).filter(Boolean);
  return names.length > 0 ? names.join(" & ") : info.coupleName;
}

// `localStorage` pode não existir ou lançar (modo privado, storage bloqueado): a página
// funciona igual sem ele.
function readStoredName(): string {
  try {
    return (window.localStorage.getItem(NAME_STORAGE_KEY) ?? "").slice(0, MAX_GUEST_NAME_LENGTH);
  } catch {
    return "";
  }
}

function storeName(name: string): void {
  try {
    if (name) window.localStorage.setItem(NAME_STORAGE_KEY, name);
    else window.localStorage.removeItem(NAME_STORAGE_KEY);
  } catch {
    // sem storage: o nome só vale nesta visita
  }
}

// ---------------------------------------------------------------------------
// Efeitos de página: meta, título, aviso de saída, Wake Lock
// ---------------------------------------------------------------------------

/** A página é privada do evento: fora dos buscadores. */
function useNoIndexMeta(): void {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/** Pede confirmação ao fechar ou recarregar a aba enquanto há envio em andamento. */
function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}

interface WakeLockSentinelLike {
  release(): Promise<void> | void;
  addEventListener?(type: "release", listener: () => void): void;
}
interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

// Safari antigo e vários navegadores de celular não têm `navigator.wakeLock`.
function getWakeLock(): WakeLockLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  const candidate = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock;
  return candidate && typeof candidate.request === "function" ? candidate : undefined;
}

function releaseQuietly(lock: WakeLockSentinelLike): void {
  try {
    void Promise.resolve(lock.release()).catch(() => {});
  } catch {
    // já liberada
  }
}

/** Mantém a tela acesa enquanto `active`. Sem suporte, ou se o navegador recusar, não faz nada. */
function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wakeLock = getWakeLock();
    if (!wakeLock) return;

    let cancelled = false;
    let acquiring = false;
    let sentinel: WakeLockSentinelLike | null = null;

    const acquire = async () => {
      if (acquiring || sentinel) return;
      acquiring = true;
      try {
        const lock = await wakeLock.request("screen");
        if (cancelled) {
          releaseQuietly(lock);
          return;
        }
        sentinel = lock;
        lock.addEventListener?.("release", () => {
          if (sentinel === lock) sentinel = null;
        });
      } catch {
        // Recusado (economia de bateria, permissão) ou quebrado: o envio segue sem a trava.
      } finally {
        acquiring = false;
      }
    };

    // O navegador solta a trava sozinho quando a aba fica oculta: pede de novo ao voltar.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void acquire();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (sentinel) releaseQuietly(sentinel);
      sentinel = null;
    };
  }, [active]);
}

// ---------------------------------------------------------------------------
// Informações da página
// ---------------------------------------------------------------------------

type InfoState =
  | { kind: "loading" }
  | { kind: "ready"; info: UploadPageInfo }
  | { kind: "disabled"; info: UploadPageInfo }
  | { kind: "unavailable"; info: UploadPageInfo }
  | { kind: "notFound" }
  | { kind: "error"; message: string };

function usePageInfo(token: string) {
  const [state, setState] = useState<InfoState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) {
      setState({ kind: "notFound" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    getUploadPageInfo(token).then(
      (info) => {
        if (cancelled) return;
        const kind = info.available ? "ready" : info.reason === "unavailable" ? "unavailable" : "disabled";
        setState({ kind, info });
      },
      (error: unknown) => {
        if (cancelled) return;
        const code = error instanceof GuestUploadApiError ? error.code : undefined;
        if (code === "not_found" || code === "invalid_input") setState({ kind: "notFound" });
        else setState({ kind: "error", message: messageForUploadError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
}

// ---------------------------------------------------------------------------
// Fila de envio
// ---------------------------------------------------------------------------

type ItemStatus = "waiting" | "uploading" | "done" | "error";

interface QueueItem {
  id: number;
  file: File;
  /** Nome digitado no momento em que o arquivo entrou na fila. */
  guestName: string;
  status: ItemStatus;
  /** 0 a 100. */
  progress: number;
  error?: string;
  /** Com `status === "error"`: `false` quando repetir só falharia igual (sem botão). */
  canRetry?: boolean;
}

/** O que o arquivo precisa lembrar entre tentativas. Fica só em memória. */
interface ItemRuntime {
  /** URL da sessão de upload no Drive: segredo, nunca sai daqui. */
  uploadUrl?: string;
  /** Na próxima execução, retomar `uploadUrl` a partir do que o Google guardou. */
  resume: boolean;
  controller?: AbortController;
}

/**
 * Fila com até `MAX_PARALLEL_UPLOADS` envios simultâneos.
 *
 * Contrato de "Tentar novamente":
 *  - falha retentável do motor (`FatalUploadError.retryable`: rede, 429, 5xx) com sessão já
 *    criada: reenvia para a MESMA `uploadUrl` com `resumeFromServer`, aproveitando o que o
 *    Google já guardou;
 *  - qualquer outra falha (sessão expirada, 4xx, ou erro ao criar a sessão): esquece a URL,
 *    cria uma sessão nova e envia do zero;
 *  - `SessionExpiredError` durante uma execução cria UMA sessão nova sozinha;
 *  - erros definitivos da API (`DEFINITIVE_ERROR_CODES`) não oferecem "Tentar novamente":
 *    `canRetry: false` no item, e a linha só mostra a mensagem.
 *
 * A fonte da verdade é `itemsRef`; `items` (estado) é o espelho que a tela desenha. O
 * progresso chega por `onProgress` muitas vezes por segundo, então é acumulado num mapa e
 * aplicado no máximo a cada `PROGRESS_FLUSH_MS`. Mudanças de estado (enviado, erro) são
 * aplicadas na hora.
 */
function useUploadQueue(token: string) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const itemsRef = useRef<QueueItem[]>([]);
  const runtimes = useRef(new Map<number, ItemRuntime>());
  const pendingProgress = useRef(new Map<number, number>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(1);
  const disposed = useRef(false);

  const commit = useCallback((next: QueueItem[]) => {
    itemsRef.current = next;
    if (!disposed.current) setItems(next);
  }, []);

  const patch = useCallback(
    (id: number, changes: Partial<QueueItem>) => {
      commit(itemsRef.current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
    },
    [commit],
  );

  const flushProgress = useCallback(() => {
    flushTimer.current = null;
    const pending = pendingProgress.current;
    if (pending.size === 0) return;
    let changed = false;
    const next = itemsRef.current.map((item) => {
      const percent = pending.get(item.id);
      // O progresso de uma linha só avança (o motor já é monotônico; isto protege a retomada).
      if (percent === undefined || item.status !== "uploading" || percent <= item.progress) return item;
      changed = true;
      return { ...item, progress: percent };
    });
    pending.clear();
    if (changed) commit(next);
  }, [commit]);

  const reportProgress = useCallback(
    (id: number, loaded: number, total: number) => {
      if (disposed.current || total <= 0) return;
      pendingProgress.current.set(id, Math.min(100, Math.floor((loaded / total) * 100)));
      if (flushTimer.current === null) flushTimer.current = setTimeout(flushProgress, PROGRESS_FLUSH_MS);
    },
    [flushProgress],
  );

  const run = useCallback(
    async (id: number) => {
      const item = itemsRef.current.find((candidate) => candidate.id === id);
      if (!item) return;
      let runtime = runtimes.current.get(id);
      if (!runtime) {
        runtime = { resume: false };
        runtimes.current.set(id, runtime);
      }
      const controller = new AbortController();
      const { signal } = controller;
      runtime.controller = controller;

      try {
        let renewed = false;
        for (;;) {
          let resume = runtime.resume && runtime.uploadUrl !== undefined;
          if (runtime.uploadUrl === undefined) {
            const session = await createUploadSession(token, {
              fileName: item.file.name,
              mimeType: item.file.type,
              size: item.file.size,
              ...(item.guestName ? { guestName: item.guestName } : {}),
            });
            // A página foi fechada enquanto a sessão era criada: não começa o envio.
            if (signal.aborted) throw new DOMException("O envio foi cancelado.", "AbortError");
            runtime.uploadUrl = session.uploadUrl;
            resume = false;
          }
          try {
            await uploadFile({
              uploadUrl: runtime.uploadUrl,
              file: item.file,
              signal,
              onProgress: (loaded, total) => reportProgress(id, loaded, total),
              ...(resume ? { resumeFromServer: true } : {}),
            });
            break;
          } catch (error) {
            if (error instanceof SessionExpiredError && !renewed) {
              // A sessão morreu (404/410): uma sessão nova, do zero, sem o convidado precisar agir.
              renewed = true;
              runtime.uploadUrl = undefined;
              runtime.resume = false;
              pendingProgress.current.delete(id);
              patch(id, { progress: 0 });
              continue;
            }
            throw error;
          }
        }
        pendingProgress.current.delete(id);
        runtimes.current.delete(id); // a URL de sessão não é mais necessária
        patch(id, { status: "done", progress: 100, error: undefined });
      } catch (error) {
        if (signal.aborted) return; // a página foi fechada
        pendingProgress.current.delete(id);
        runtime.controller = undefined;
        runtime.resume = error instanceof FatalUploadError && error.retryable && runtime.uploadUrl !== undefined;
        if (!runtime.resume) runtime.uploadUrl = undefined;
        patch(id, { status: "error", error: messageForUploadError(error), canRetry: !isDefinitiveError(error) });
      }
    },
    [token, patch, reportProgress],
  );

  /** Ocupa as vagas livres com os arquivos que esperam, na ordem da fila. */
  const pump = useCallback(() => {
    if (disposed.current) return;
    const current = itemsRef.current;
    const free = MAX_PARALLEL_UPLOADS - current.filter((item) => item.status === "uploading").length;
    if (free <= 0) return;
    const starting = current
      .filter((item) => item.status === "waiting")
      .slice(0, free)
      .map((item) => item.id);
    if (starting.length === 0) return;
    commit(current.map((item) => (starting.includes(item.id) ? { ...item, status: "uploading" } : item)));
    for (const id of starting) void run(id);
  }, [commit, run]);

  // Toda mudança na fila (entrada, término, erro, nova tentativa) pode abrir uma vaga.
  useEffect(() => {
    pump();
  }, [items, pump]);

  useEffect(() => {
    disposed.current = false;
    const controllers = runtimes.current;
    const pending = pendingProgress.current;
    return () => {
      disposed.current = true;
      if (flushTimer.current !== null) clearTimeout(flushTimer.current);
      flushTimer.current = null;
      pending.clear();
      controllers.forEach((runtime) => runtime.controller?.abort());
    };
  }, []);

  const enqueue = useCallback(
    (files: File[], guestName: string) => {
      if (files.length === 0) return;
      const added: QueueItem[] = files.map((file) => ({
        id: nextId.current++,
        file,
        guestName,
        status: "waiting",
        progress: 0,
      }));
      commit([...itemsRef.current, ...added]);
    },
    [commit],
  );

  const retry = useCallback(
    (id: number) => {
      const item = itemsRef.current.find((candidate) => candidate.id === id);
      if (!item || item.status !== "error") return;
      // Retomando a mesma sessão, a barra não volta a zero; numa sessão nova, sim.
      const keepProgress = runtimes.current.get(id)?.resume === true;
      commit(
        itemsRef.current.map((candidate) =>
          candidate.id === id
            ? { ...candidate, status: "waiting", error: undefined, progress: keepProgress ? candidate.progress : 0 }
            : candidate,
        ),
      );
    },
    [commit],
  );

  return { items, enqueue, retry };
}

// ---------------------------------------------------------------------------
// Apresentação
// ---------------------------------------------------------------------------

const FileRow = memo(function FileRow({ item, onRetry }: { item: QueueItem; onRetry: (id: number) => void }) {
  const { file, status, progress } = item;
  const barColor =
    status === "done" ? "[&>div]:bg-emerald-600" : status === "error" ? "[&>div]:bg-red-400" : "[&>div]:bg-gold";

  return (
    <li className="border-b border-border py-4 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-medium text-foreground" title={file.name}>
          {file.name}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBytes(file.size)}</span>
      </div>
      <Progress
        value={progress}
        aria-label={`Progresso do envio de ${file.name}`}
        aria-valuenow={progress}
        aria-valuetext={`${progress}%`}
        className={`mt-2.5 h-1.5 bg-foreground/10 ${barColor}`}
      />
      {status !== "error" && (
        <div className="mt-2.5 text-sm">
          {status === "waiting" && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
              Aguardando
            </p>
          )}
          {status === "uploading" && (
            <p className="flex items-center gap-2 text-foreground">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {`Enviando ${progress}%`}
            </p>
          )}
          {status === "done" && (
            <p className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Enviado
            </p>
          )}
        </div>
      )}
      {/*
        Região de anúncio só do erro deste arquivo. Ela existe (vazia) em toda linha, desde o
        início, porque leitores de tela só anunciam mudanças numa região que já estava na
        página. O andamento ("Enviando 42%") fica de fora de propósito: mudaria várias vezes
        por segundo. O resumo geral continua na região aria-live da página.
      */}
      <div role="status">
        {status === "error" && (
          <p className="mt-2.5 flex items-start gap-2 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">{`Erro em ${file.name}: `}</span>
            <span>{item.error}</span>
          </p>
        )}
      </div>
      {status === "error" && item.canRetry !== false && (
        <Button
          type="button"
          variant="outline"
          className="mt-3 min-h-11 w-full border-gold/70 px-5 text-base sm:w-auto"
          aria-label={`Tentar novamente: ${file.name}`}
          onClick={() => onRetry(item.id)}
        >
          Tentar novamente
        </Button>
      )}
    </li>
  );
});

function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-5 pb-6 pt-12 sm:pt-16">
        <div className="flex-1">{children}</div>
        <footer className="mt-12 text-center">
          {/*
            Âncora comum em nova aba, não `<Link>`: navegar dentro do app desmontaria a página e
            abortaria os envios em andamento (e `beforeunload` não dispara nesse caso).
          */}
          <a
            href="/privacidade"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center px-3 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Política de privacidade
          </a>
        </footer>
      </div>
    </main>
  );
}

function Headline({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-balance font-serif text-4xl leading-tight text-foreground sm:text-5xl">{children}</h1>
  );
}

/** Estados sem envio: link inexistente, envio desligado ou falha ao carregar. */
function MessageScreen({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="pt-8 text-center sm:pt-12">
      {title ? (
        <>
          <Headline>{title}</Headline>
          <p className="mx-auto mt-6 max-w-sm text-balance text-lg leading-relaxed text-foreground">{message}</p>
        </>
      ) : (
        <h1 className="mx-auto max-w-sm text-balance font-serif text-2xl leading-snug text-foreground">{message}</h1>
      )}
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          className="mt-8 min-h-11 border-gold/70 px-6 text-base"
          onClick={onRetry}
        >
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

interface Notice {
  key: "too-large" | "empty";
  text: string;
  files: string[];
}

function GuestUpload({ token }: { token: string }) {
  const { state, reload } = usePageInfo(token);
  const { items, enqueue, retry } = useUploadQueue(token);
  const [guestName, setGuestName] = useState(readStoredName);
  const [notices, setNotices] = useState<Notice[]>([]);

  const info =
    state.kind === "ready" || state.kind === "disabled" || state.kind === "unavailable" ? state.info : null;
  const names = info ? coupleLabel(info) : "";
  const hasActive = useMemo(
    () => items.some((item) => item.status === "waiting" || item.status === "uploading"),
    [items],
  );

  useNoIndexMeta();
  useDocumentTitle(names ? `Enviar fotos — ${names}` : "Enviar fotos");
  useLeaveWarning(hasActive);
  useScreenWakeLock(hasActive);

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setGuestName(value);
    storeName(value);
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    if (state.kind !== "ready") return;
    const input = event.target;
    const files = Array.from(input.files ?? []);
    input.value = ""; // permite escolher o mesmo arquivo de novo depois

    const accepted: File[] = [];
    const empty: string[] = [];
    const tooLarge: string[] = [];
    for (const file of files) {
      if (file.size <= 0) empty.push(file.name);
      else if (file.size > state.info.maxBytes) tooLarge.push(file.name);
      else accepted.push(file);
    }

    // Arquivos recusados nunca chegam à rede nem à fila.
    const next: Notice[] = [];
    if (tooLarge.length > 0) {
      next.push({
        key: "too-large",
        text: `Arquivos acima de ${formatBytes(state.info.maxBytes)}: fale com ${names} para combinar o envio.`,
        files: tooLarge,
      });
    }
    if (empty.length > 0) {
      next.push({
        key: "empty",
        text:
          empty.length === 1
            ? "Este arquivo está vazio e não pode ser enviado."
            : "Estes arquivos estão vazios e não podem ser enviados.",
        files: empty,
      });
    }
    setNotices(next);
    enqueue(accepted, guestName.trim());
  };

  if (state.kind === "loading") {
    return (
      <PageShell>
        <div role="status" className="flex justify-center pt-24">
          <Loader2 className="h-8 w-8 animate-spin text-gold motion-reduce:animate-none" aria-hidden="true" />
          <span className="sr-only">Carregando…</span>
        </div>
      </PageShell>
    );
  }
  if (state.kind === "notFound") {
    return (
      <PageShell>
        <MessageScreen message="Esta página não existe ou o link mudou." />
      </PageShell>
    );
  }
  if (state.kind === "error") {
    return (
      <PageShell>
        <MessageScreen message={state.message} onRetry={reload} />
      </PageShell>
    );
  }
  if (state.kind === "unavailable") {
    return (
      <PageShell>
        <MessageScreen title={names} message="O envio está temporariamente indisponível. Tente de novo mais tarde." />
      </PageShell>
    );
  }
  if (state.kind === "disabled") {
    return (
      <PageShell>
        <MessageScreen title={names} message="O envio de fotos está desativado no momento." />
      </PageShell>
    );
  }

  const total = items.length;
  const done = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "error").length;
  const summary =
    total === 0
      ? null
      : done === total
        ? "Tudo enviado. Obrigado por compartilhar!"
        : `${done} de ${total} enviado${total > 1 ? "s" : ""}${failed > 0 ? `, ${failed} com erro` : ""}`;

  return (
    <PageShell>
      <header className="text-center">
        <Headline>{names}</Headline>
        <span aria-hidden="true" className="mx-auto mt-6 block h-px w-14 bg-gold" />
        <p className="mx-auto mt-6 max-w-sm text-base leading-relaxed text-muted-foreground">
          Envie suas fotos e vídeos do casamento. Seus arquivos não ficam públicos: os noivos veem o que você enviar
          no painel deles.
        </p>
      </header>

      <section className="mt-10 rounded-2xl border border-dashed border-gold/60 bg-secondary/50 p-5">
        <Label htmlFor="guest-name" className="text-base font-medium">
          Seu nome (opcional)
        </Label>
        <Input
          id="guest-name"
          type="text"
          autoComplete="name"
          maxLength={MAX_GUEST_NAME_LENGTH}
          value={guestName}
          onChange={handleNameChange}
          aria-describedby="guest-name-hint"
          className="mt-2 h-12 bg-background text-base"
        />
        <p id="guest-name-hint" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Se preferir não se identificar, deixe em branco: seus arquivos vão para a pasta Anônimo.
        </p>

        <input
          id="guest-files"
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={handleFiles}
          className="peer sr-only"
        />
        <label
          htmlFor="guest-files"
          className="mt-6 flex min-h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-gold px-6 py-5 text-lg font-medium text-foreground shadow-soft ring-offset-background transition-colors hover:bg-gold/90 active:bg-gold/80 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
        >
          <ImagePlus className="h-6 w-6 shrink-0" aria-hidden="true" />
          Escolher fotos e vídeos
        </label>
      </section>

      <div aria-live="polite" className="mt-6 space-y-3 empty:mt-0">
        {summary && <p className="text-base font-medium text-foreground">{summary}</p>}
        {hasActive && (
          <p className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2.5 text-sm text-foreground">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Mantenha esta tela aberta até terminar.
          </p>
        )}
        {notices.map((notice) => (
          <div
            key={notice.key}
            className="rounded-lg border border-red-700/30 bg-red-50 px-3 py-2.5 text-sm text-red-800"
          >
            <p>{notice.text}</p>
            <p className="mt-1 break-words text-red-800/80">{notice.files.join(", ")}</p>
          </div>
        ))}
      </div>

      {total > 0 && (
        <ul className="mt-4">
          {items.map((item) => (
            <FileRow key={item.id} item={item} onRetry={retry} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}

const GuestUploadPage = () => {
  const { token } = useParams<{ token: string }>();
  // `key`: outro token é outra página, com fila e estado próprios.
  return <GuestUpload key={token} token={token ?? ""} />;
};

export default GuestUploadPage;
