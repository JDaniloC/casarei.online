import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { QRCodeCanvas } from "qrcode.react";
import {
  Camera,
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Info,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Video,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import * as adminApi from "@/lib/driveAdminApi";
import type { DriveConnection, DriveFileSummary, DriveSummary } from "@/lib/driveAdminApi";
import { cn } from "@/lib/utils";

// Aba "Fotos dos Convidados" do painel do casal: ativa o envio, entrega o QR code para
// imprimir e lista o que os convidados enviaram, com miniaturas.
//
// Regras que este componente garante:
// - Nenhuma chamada ao backend antes de o weddingId existir (o servidor deriva o casamento
//   do JWT; o id aqui só diz que o site já foi salvo).
// - Nada que leve ao armazenamento dos arquivos aparece na interface (sem links, sem menção).
//   O casal só vê o "álbum dos convidados".
// - Uma operação de leitura por vez (atualizar / carregar mais), nunca duas em paralelo.
// - Miniatura já carregada nunca é pedida de novo; um `null` só é tentado outra vez no
//   próximo "Atualizar", nunca em loop.
// - Resultado assíncrono que chega depois de desmontar (ou de trocar o weddingId) é descartado.
// - O token do QR code nunca vai para log nem para toast.

interface DashboardGuestUploadsProps {
  weddingId: string | null;
  /** Reservado: o painel não precisa do slug hoje. Aceito para manter a mesma assinatura das outras abas. */
  weddingSlug?: string | null;
}

type StatusState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; connection: DriveConnection };

type ListState = "idle" | "loaded" | "error";

const LOG_PREFIX = "[DashboardGuestUploads]";
const GENERIC_ERROR = "Não foi possível concluir a operação. Verifique sua conexão e tente novamente.";
const THUMBNAIL_BATCH = 24;
const COPIED_FEEDBACK_MS = 2000;
const QR_FILE_NAME = "qrcode-fotos-dos-convidados.png";

const ORIGINALS_NOTICE =
  "Aqui aparecem os arquivos enviados pelos convidados por esta página. Para receber os arquivos originais, entre em contato com a equipe do casarei.online.";

const CARD = "rounded-xl border border-border bg-card p-5 shadow-soft sm:p-6";
// Alvo de toque de 44 px no celular; volta ao tamanho padrão do painel a partir de sm.
const TOUCH = "h-11 sm:h-10";

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  let value = Math.round((bytes / 1024 ** exponent) * 10) / 10;
  // 1023,96 KB arredonda para 1024: melhor mostrar 1 MB.
  if (value >= 1024 && exponent < BYTE_UNITS.length - 1) {
    exponent += 1;
    value = Math.round((bytes / 1024 ** exponent) * 10) / 10;
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: exponent === 0 ? 0 : 1 })} ${BYTE_UNITS[exponent]}`;
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : format(date, "dd MMM yyyy, HH:mm", { locale: ptBR });
}

function formatSummary({ count, totalBytes, guests }: DriveSummary): string {
  const files = `${count.toLocaleString("pt-BR")} ${count === 1 ? "arquivo" : "arquivos"}`;
  const people = `${guests.toLocaleString("pt-BR")} ${guests === 1 ? "convidado" : "convidados"}`;
  return `${files} · ${formatBytes(totalBytes)} · ${people}`;
}

const describeError = (error: unknown): string =>
  error instanceof Error && error.message.trim() !== "" ? error.message : GENERIC_ERROR;

// ---------------------------------------------------------------------------
// Peças de tela
// ---------------------------------------------------------------------------

// Cantos de "visor de câmera" em volta do QR code: é o que o casal vai imprimir e o convidado
// vai apontar o celular, então o cartão ganha o gesto da foto.
const VIEWFINDER_CORNERS = [
  "left-2 top-2 border-l-2 border-t-2 rounded-tl-md",
  "right-2 top-2 border-r-2 border-t-2 rounded-tr-md",
  "bottom-2 left-2 border-b-2 border-l-2 rounded-bl-md",
  "bottom-2 right-2 border-b-2 border-r-2 rounded-br-md",
];

function FileTile({ file, thumbnail }: { file: DriveFileSummary; thumbnail: string | undefined }) {
  const isVideo = file.mimeType.startsWith("video/");
  const guest = file.guestName.trim() || "Anônimo";
  const when = formatDate(file.createdTime);
  const PlaceholderIcon = isVideo ? Video : ImageIcon;

  return (
    <li className="min-w-0 overflow-hidden rounded-lg border border-border bg-background">
      <div className="relative aspect-square bg-muted">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={`Miniatura de ${file.name || "arquivo enviado"}`}
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            data-testid={isVideo ? "placeholder-video" : "placeholder-image"}
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center text-muted-foreground/50"
          >
            <PlaceholderIcon className="h-9 w-9" strokeWidth={1.5} />
          </div>
        )}
        {isVideo && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-foreground/80 px-2 py-0.5 text-xs font-medium text-background">
            <Play className="h-3 w-3 fill-current" aria-hidden="true" />
            {file.durationMs === null ? "Vídeo" : formatDuration(file.durationMs)}
          </span>
        )}
      </div>
      <div className="space-y-0.5 px-3 py-2.5">
        <p className="truncate text-sm font-medium text-foreground" title={guest}>
          {guest}
        </p>
        {when && <p className="truncate text-xs text-muted-foreground">{when}</p>}
        <p className="truncate text-xs text-muted-foreground">{formatBytes(file.size)}</p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function DashboardGuestUploads({ weddingId }: DashboardGuestUploadsProps) {
  const { toast } = useToast();
  // O toast do hook é estável, mas a leitura por ref protege os efeitos de um `toast` que mude a cada render.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [status, setStatus] = useState<StatusState>({ phase: "loading" });
  const [activating, setActivating] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<boolean | null>(null);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [summary, setSummary] = useState<DriveSummary | null>(null);
  const [files, setFiles] = useState<DriveFileSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [listState, setListState] = useState<ListState>("idle");
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(() => new Map());
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Cada consulta guarda o número da "rodada" em que nasceu; desmontar ou trocar o weddingId
  // avança a rodada, e tudo o que voltar de uma rodada antiga é descartado.
  const runRef = useRef(0);
  const busyRef = useRef(false); // leitura em andamento (atualizar ou carregar mais)
  const mutatingRef = useRef(false); // ativar, ligar/desligar ou girar o token
  const filesRef = useRef<DriveFileSummary[]>([]);
  const thumbnailsRef = useRef<Map<string, string>>(new Map());
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const qrBoxRef = useRef<HTMLDivElement | null>(null);

  const reportError = useCallback((label: string, title: string, error: unknown) => {
    const message = describeError(error);
    // Só o texto do erro: nada de token, URL ou objeto de resposta.
    console.error(`${LOG_PREFIX} ${label}:`, message);
    return { title, description: message };
  }, []);

  const notifyError = useCallback(
    (label: string, title: string, error: unknown) => {
      toastRef.current({ ...reportError(label, title, error), variant: "destructive" });
    },
    [reportError],
  );

  const commitFiles = useCallback((next: DriveFileSummary[]) => {
    filesRef.current = next;
    setFiles(next);
  }, []);

  /** Pede as miniaturas que faltam, em lotes; devolve o erro do primeiro lote que falhar (ou null). */
  const loadThumbnails = useCallback(async (list: DriveFileSummary[], run: number): Promise<unknown> => {
    // Só quem o servidor diz ter miniatura, e nunca uma que já está carregada.
    const ids = [...new Set(list.filter((f) => f.hasThumbnail && !thumbnailsRef.current.has(f.id)).map((f) => f.id))];

    for (let start = 0; start < ids.length; start += THUMBNAIL_BATCH) {
      if (run !== runRef.current) return null;
      const batch = ids.slice(start, start + THUMBNAIL_BATCH);

      let result: Record<string, string | null> | null | undefined;
      try {
        result = await adminApi.getThumbnails(batch);
      } catch (error) {
        return error; // para aqui: quem chamou avisa uma vez, e o "Atualizar" tenta de novo
      }
      if (run !== runRef.current) return null;

      const loaded = new Map(thumbnailsRef.current);
      let changed = false;
      for (const id of batch) {
        // O mapa é tratado como dado simples: só chaves próprias, nunca métodos herdados.
        const value = result && Object.prototype.hasOwnProperty.call(result, id) ? result[id] : null;
        if (typeof value === "string" && value !== "") {
          loaded.set(id, value);
          changed = true;
        }
      }
      if (changed) {
        thumbnailsRef.current = loaded;
        setThumbnails(loaded);
      }
    }
    return null;
  }, []);

  /** Recarrega resumo, primeira página e as miniaturas que faltam. Nunca roda duas vezes ao mesmo tempo. */
  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const run = runRef.current;
    setRefreshing(true);

    try {
      const [summaryResult, listResult] = await Promise.allSettled([adminApi.getSummary(), adminApi.listFiles()]);
      if (run !== runRef.current) return;

      // Um toast só por atualização (o primeiro problema); todos vão para o console.
      const problems: { title: string; description: string }[] = [];

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
      } else {
        problems.push(reportError("falha ao carregar o resumo", "Não foi possível carregar o resumo", summaryResult.reason));
      }

      if (listResult.status === "fulfilled") {
        commitFiles(listResult.value.files);
        setNextPageToken(listResult.value.nextPageToken);
        setListState("loaded");
        const thumbnailError = await loadThumbnails(listResult.value.files, run);
        if (run !== runRef.current) return;
        if (thumbnailError) {
          problems.push(
            reportError("falha ao carregar miniaturas", "Não foi possível carregar as miniaturas", thumbnailError),
          );
        }
      } else {
        // Com arquivos já na tela, uma atualização que falha não os apaga.
        setListState((current) => (current === "loaded" ? current : "error"));
        problems.push(
          reportError("falha ao carregar os arquivos", "Não foi possível carregar os arquivos", listResult.reason),
        );
      }

      if (problems.length > 0) toastRef.current({ ...problems[0], variant: "destructive" });
    } finally {
      if (run === runRef.current) {
        busyRef.current = false;
        setRefreshing(false);
      }
    }
  }, [commitFiles, loadThumbnails, reportError]);

  const loadMore = useCallback(
    async (pageToken: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const run = runRef.current;
      setLoadingMore(true);

      try {
        let page: adminApi.DriveFilesPage;
        try {
          page = await adminApi.listFiles(pageToken);
        } catch (error) {
          if (run === runRef.current) notifyError("falha ao carregar mais arquivos", "Não foi possível carregar mais arquivos", error);
          return;
        }
        if (run !== runRef.current) return;

        const seen = new Set(filesRef.current.map((f) => f.id));
        const fresh = page.files.filter((f) => !seen.has(f.id));
        commitFiles([...filesRef.current, ...fresh]);
        setNextPageToken(page.nextPageToken);

        const thumbnailError = await loadThumbnails(fresh, run);
        if (run !== runRef.current) return;
        if (thumbnailError) notifyError("falha ao carregar miniaturas", "Não foi possível carregar as miniaturas", thumbnailError);
      } finally {
        if (run === runRef.current) {
          busyRef.current = false;
          setLoadingMore(false);
        }
      }
    },
    [commitFiles, loadThumbnails, notifyError],
  );

  const loadStatus = useCallback(async () => {
    const run = runRef.current;
    setStatus({ phase: "loading" });
    try {
      const connection = await adminApi.getStatus();
      if (run !== runRef.current) return;
      setStatus({ phase: "ready", connection });
      if (connection.enabled) void refresh();
    } catch (error) {
      if (run !== runRef.current) return;
      setStatus({ phase: "error" });
      notifyError("falha ao carregar o status", "Não foi possível carregar o envio de fotos", error);
    }
  }, [notifyError, refresh]);

  useEffect(() => {
    if (!weddingId) return;

    runRef.current += 1;
    busyRef.current = false;
    mutatingRef.current = false;
    thumbnailsRef.current = new Map();
    setThumbnails(thumbnailsRef.current);
    commitFiles([]);
    setSummary(null);
    setNextPageToken(null);
    setListState("idle");
    setRefreshing(false);
    setLoadingMore(false);
    setActivating(false);
    setPendingUploads(null);
    setRotating(false);
    void loadStatus();

    return () => {
      runRef.current += 1;
      busyRef.current = false;
      mutatingRef.current = false;
    };
  }, [weddingId, commitFiles, loadStatus]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  // ----- ações do casal -----------------------------------------------------

  const handleActivate = async () => {
    if (mutatingRef.current) return;
    mutatingRef.current = true;
    const run = runRef.current;
    setActivating(true);
    try {
      const connection = await adminApi.enable();
      if (run !== runRef.current) return;
      setStatus({ phase: "ready", connection });
      if (connection.enabled) void refresh();
    } catch (error) {
      if (run === runRef.current) notifyError("falha ao ativar", "Não foi possível ativar o envio de fotos", error);
    } finally {
      if (run === runRef.current) {
        mutatingRef.current = false;
        setActivating(false);
      }
    }
  };

  const handleToggleUploads = async (next: boolean) => {
    if (mutatingRef.current) return;
    mutatingRef.current = true;
    const run = runRef.current;
    // Mostra já o valor pedido, mas só até a resposta: se o servidor recusar, volta ao anterior.
    setPendingUploads(next);
    try {
      const connection = await adminApi.setEnabled(next);
      if (run !== runRef.current) return;
      setStatus({ phase: "ready", connection });
    } catch (error) {
      if (run === runRef.current) {
        notifyError("falha ao alterar o recebimento", "Não foi possível alterar o recebimento de envios", error);
      }
    } finally {
      if (run === runRef.current) {
        mutatingRef.current = false;
        setPendingUploads(null);
      }
    }
  };

  const handleRotate = async () => {
    if (mutatingRef.current) return;
    mutatingRef.current = true;
    const run = runRef.current;
    setRotating(true);
    try {
      const connection = await adminApi.rotateToken();
      if (run !== runRef.current) return;
      setStatus({ phase: "ready", connection });
      setCopied(false);
      toastRef.current({
        title: "Novo link gerado",
        description: "Baixe o novo QR code e substitua os que já foram impressos.",
      });
    } catch (error) {
      if (run === runRef.current) notifyError("falha ao gerar novo link", "Não foi possível gerar o novo link", error);
    } finally {
      if (run === runRef.current) {
        mutatingRef.current = false;
        setRotating(false);
      }
    }
  };

  const handleCopy = async (url: string) => {
    const run = runRef.current;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Sem permissão ou sem a API (navegador antigo, página sem HTTPS): seleciona o campo para o casal copiar.
      const input = linkInputRef.current;
      if (input) {
        input.focus();
        input.select();
        input.setSelectionRange(0, input.value.length);
      }
      toastRef.current({
        title: "Copie o link",
        description: "Não foi possível copiar automaticamente. Selecionamos o link para você copiá-lo manualmente.",
      });
      return;
    }
    if (run !== runRef.current) return;
    setCopied(true);
    if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      copyTimerRef.current = null;
      setCopied(false);
    }, COPIED_FEEDBACK_MS);
  };

  const handleDownload = () => {
    try {
      const canvas = qrBoxRef.current?.querySelector("canvas");
      if (!canvas) throw new Error("QR code indisponível");
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = QR_FILE_NAME;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      notifyError("falha ao baixar o QR code", "Não foi possível baixar o QR code", error);
    }
  };

  // O QR code precisa ser calculado antes dos retornos antecipados abaixo (regra dos hooks).
  // O QRCodeCanvas redesenha um canvas de 1024 x devicePixelRatio a cada render (o efeito dele
  // não tem lista de dependências), e o painel renderiza a cada lote de miniaturas, a cada
  // início e fim de atualização, no "copiado" e na chave pendente. Por isso o elemento é
  // memorizado só pela URL de envio: mesma URL, mesmo elemento, e o React não o renderiza de novo.
  const uploadToken = status.phase === "ready" && status.connection.enabled ? status.connection.uploadToken : null;
  const uploadUrl = uploadToken ? `${window.location.origin}/fotos/${encodeURIComponent(uploadToken)}` : null;
  const qrCode = useMemo(
    () =>
      uploadUrl === null ? null : (
        <QRCodeCanvas
          value={uploadUrl}
          size={1024}
          level="M"
          marginSize={4}
          role="img"
          aria-label="QR code para os convidados enviarem fotos e vídeos"
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      ),
    [uploadUrl],
  );

  // ----- telas --------------------------------------------------------------

  if (!weddingId) {
    return (
      <section className={cn(CARD, "flex items-center gap-3")}>
        <Camera className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Salve seu site primeiro para ativar o envio de fotos.</p>
      </section>
    );
  }

  if (status.phase === "loading") {
    return (
      <div role="status" className={cn(CARD, "flex items-center gap-3 text-sm text-muted-foreground")}>
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Carregando o envio de fotos…
      </div>
    );
  }

  if (status.phase === "error") {
    return (
      <section className={cn(CARD, "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between")}>
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar o envio de fotos dos convidados. Verifique sua conexão e tente de novo.
        </p>
        <Button variant="outline" className={TOUCH} onClick={() => void loadStatus()}>
          <RefreshCw />
          Tentar novamente
        </Button>
      </section>
    );
  }

  const { connection } = status;

  if (!connection.enabled) {
    return (
      <section className={cn(CARD, "flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-10")}>
        <div className="max-w-xl space-y-4">
          <div className="flex items-center gap-3">
            <Camera className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
            <h3 className="font-serif text-lg text-foreground">Receba as fotos e os vídeos dos seus convidados</h3>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Ative o envio para ganhar um QR code. Seus convidados apontam a câmera do celular, escolhem as fotos e os
            vídeos e enviam, sem precisar de cadastro.
          </p>
          <ol className="space-y-2 text-sm text-foreground">
            {[
              "Ative o envio e baixe o QR code.",
              "Imprima para as mesas ou compartilhe o link.",
              "Acompanhe aqui o que os convidados enviam.",
            ].map((step, index) => (
              <li key={step} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/50 text-xs font-medium text-gold"
                >
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <Button className={cn(TOUCH, "md:shrink-0")} onClick={() => void handleActivate()} disabled={activating}>
          {activating ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Camera />}
          Ativar envio de fotos
        </Button>
      </section>
    );
  }

  const receiving = pendingUploads ?? connection.uploadsEnabled;
  const busy = refreshing || loadingMore;

  return (
    <div className="space-y-6">
      {/* Cartão do QR code */}
      <section className={CARD}>
        <div className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-8">
          {uploadUrl && (
            <div className="mx-auto w-full max-w-[15rem] space-y-3 md:mx-0">
              <div className="relative rounded-lg bg-white p-6 shadow-card ring-1 ring-gold/25">
                {VIEWFINDER_CORNERS.map((corner) => (
                  <span key={corner} aria-hidden="true" className={cn("absolute h-4 w-4 border-gold", corner)} />
                ))}
                <div ref={qrBoxRef}>{qrCode}</div>
              </div>
              <Button className={cn(TOUCH, "w-full")} onClick={handleDownload}>
                <Download />
                Baixar PNG
              </Button>
            </div>
          )}

          <div className="min-w-0 space-y-5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <Camera className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
                <h3 className="font-serif text-lg text-foreground">QR code para os convidados</h3>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Imprima o QR code ou compartilhe o link. Quem abrir envia fotos e vídeos direto do celular, sem
                cadastro.
              </p>
            </div>

            {uploadUrl && (
              <div className="space-y-2">
                <Label htmlFor="guest-upload-link">Link de envio</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="guest-upload-link"
                    ref={linkInputRef}
                    readOnly
                    value={uploadUrl}
                    onFocus={(event) => event.currentTarget.select()}
                    className={cn(TOUCH, "min-w-0 bg-background font-mono text-xs")}
                  />
                  <Button variant="outline" className={cn(TOUCH, "sm:shrink-0")} onClick={() => void handleCopy(uploadUrl)}>
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Link copiado" : "Copiar link"}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
              <Label htmlFor="guest-upload-receiving" className="flex min-h-11 flex-1 cursor-pointer flex-col justify-center gap-0.5">
                <span id="guest-upload-receiving-title" className="text-sm font-medium text-foreground">
                  Receber envios
                </span>
                <span id="guest-upload-receiving-hint" className="text-xs font-normal leading-relaxed text-muted-foreground">
                  {receiving
                    ? "Os convidados que abrirem o link podem enviar fotos e vídeos."
                    : "Desativado: quem abrir o link verá que o envio está desativado no momento."}
                </span>
              </Label>
              <div className="flex min-h-11 items-center">
                <Switch
                  id="guest-upload-receiving"
                  checked={receiving}
                  // Trava também durante "Gerar novo link": uma troca nesse intervalo seria ignorada em silêncio.
                  disabled={pendingUploads !== null || rotating}
                  onCheckedChange={(next) => void handleToggleUploads(next)}
                  // A chave tem 24 px de altura: o ::after estende a área de toque para 44 px sem mudar o visual.
                  className="relative after:absolute after:-inset-x-0.5 after:-inset-y-3 after:content-['']"
                  aria-labelledby="guest-upload-receiving-title"
                  aria-describedby="guest-upload-receiving-hint"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                Se o link foi parar em mãos erradas, gere um novo. O anterior deixa de funcionar.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className={cn(TOUCH, "sm:shrink-0")} disabled={rotating}>
                    {rotating ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <RotateCcw />}
                    Gerar novo link
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-serif">Gerar um novo link?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Os QR codes já impressos deixam de funcionar e o link atual também. Você precisará baixar o novo
                      QR code e substituir os impressos. Os arquivos que já chegaram continuam no álbum.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className={TOUCH}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction className={TOUCH} onClick={() => void handleRotate()}>
                      Gerar novo link
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </section>

      {/* Álbum dos convidados */}
      <section className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-3">
              <ImageIcon className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
              <h3 className="font-serif text-lg text-foreground">Álbum dos convidados</h3>
            </div>
            {summary && summary.count > 0 && (
              <p className="text-sm text-muted-foreground">{formatSummary(summary)}</p>
            )}
          </div>
          <Button
            variant="outline"
            className={TOUCH}
            onClick={() => void refresh()}
            disabled={busy}
            aria-busy={refreshing}
          >
            <RefreshCw className={cn(refreshing && "animate-spin motion-reduce:animate-none")} />
            Atualizar
          </Button>
        </div>

        <p className="mt-4 flex gap-2.5 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          {ORIGINALS_NOTICE}
        </p>

        {listState === "idle" && (
          <div role="status" className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Carregando os arquivos…
          </div>
        )}

        {listState === "error" && files.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            Não foi possível carregar os arquivos. Use “Atualizar” para tentar de novo.
          </p>
        )}

        {listState === "loaded" && files.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            Ainda não chegou nenhum arquivo. Assim que os convidados enviarem, as fotos e os vídeos aparecem aqui.
          </p>
        )}

        {files.length > 0 && (
          <>
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {files.map((file) => (
                <FileTile key={file.id} file={file} thumbnail={thumbnails.get(file.id)} />
              ))}
            </ul>
            {nextPageToken && (
              <div className="mt-6 flex justify-center">
                <Button variant="outline" className={TOUCH} onClick={() => void loadMore(nextPageToken)} disabled={busy}>
                  {loadingMore && <Loader2 className="animate-spin motion-reduce:animate-none" />}
                  Carregar mais
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
