import { useRef, useState } from "react";
import { ExternalLink, HardDrive, Loader2, TriangleAlert } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import * as adminApi from "@/lib/driveAdminApi";
import type { DriveConnection } from "@/lib/driveAdminApi";
import { cn } from "@/lib/utils";

// Cartão "Onde ficam as fotos" da aba "Fotos dos Convidados". É o ÚNICO lugar do painel que
// fala do Google Drive: o casal escolhe guardar as fotos no próprio Drive (modo casal) ou
// deixa como está (modo plataforma, sem nenhuma menção ao Drive no resto do painel).
//
// - Conectar leva o casal ao Google e volta pela página de callback (que conclui a conexão);
//   por isso este componente só pede a URL e navega.
// - Desconectar acontece aqui mesmo e avisa o painel (que recarrega o álbum do Drive de agora).
// - Nunca mostra nem registra token, código ou a URL do Google fora do redirecionamento.

interface DriveConnectionCardProps {
  connection: DriveConnection;
  /** O casal desconectou: o painel atualiza o status e recarrega o álbum. */
  onDisconnected: (connection: DriveConnection) => void;
  /** Leva o navegador ao endereço do Google. Injetável para os testes. */
  navigate?: (url: string) => void;
}

const LOG_PREFIX = "[DriveConnectionCard]";
const GENERIC_ERROR = "Não foi possível concluir a operação. Verifique sua conexão e tente novamente.";
const CARD = "rounded-xl border border-border bg-card p-5 shadow-soft sm:p-6";
// Alvo de toque de 44 px no celular; volta ao tamanho padrão do painel a partir de sm.
const TOUCH = "h-11 sm:h-10";

const goTo = (url: string) => window.location.assign(url);

const describeError = (error: unknown): string =>
  error instanceof Error && error.message.trim() !== "" ? error.message : GENERIC_ERROR;

export default function DriveConnectionCard({ connection, onDisconnected, navigate = goTo }: DriveConnectionCardProps) {
  const { toast } = useToast();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  // Trava síncrona: dois cliques no mesmo instante chegam antes de o React desabilitar o botão.
  const busyRef = useRef(false);

  const owner = connection.driveMode === "owner";
  const needsReconnect = owner && connection.needsReconnect === true;

  const startConnect = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setConnecting(true);
    try {
      navigate(await adminApi.getAuthUrl());
      // A página vai embora: fica em "conectando" de propósito.
    } catch (error) {
      console.error(`${LOG_PREFIX} falha ao iniciar a conexão:`, describeError(error));
      toast({
        variant: "destructive",
        title: "Não foi possível conectar o Google Drive",
        description: describeError(error),
      });
      busyRef.current = false;
      setConnecting(false);
    }
  };

  const confirmDisconnect = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setDisconnecting(true);
    try {
      const next = await adminApi.disconnectDrive();
      onDisconnected(next);
      toast({
        title: "Google Drive desconectado",
        description: "Os próximos envios voltam a ser guardados pela Casarei.online.",
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} falha ao desconectar:`, describeError(error));
      toast({
        variant: "destructive",
        title: "Não foi possível desconectar o Google Drive",
        description: describeError(error),
      });
    } finally {
      busyRef.current = false;
      setDisconnecting(false);
    }
  };

  const connectButton = (label: string) => (
    <Button className={cn(TOUCH, "sm:shrink-0")} onClick={() => void startConnect()} disabled={connecting}>
      {connecting ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <HardDrive />}
      {label}
    </Button>
  );

  const disconnectDialog = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className={cn(TOUCH, "sm:shrink-0")} disabled={disconnecting}>
          {disconnecting && <Loader2 className="animate-spin motion-reduce:animate-none" />}
          Desconectar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif">Desconectar o Google Drive?</AlertDialogTitle>
          <AlertDialogDescription>
            As fotos que já chegaram continuam no seu Drive. Os próximos envios voltam a ser guardados pela
            Casarei.online, e este álbum deixa de mostrar as fotos que estão no seu Drive. Para remover também a
            permissão do aplicativo, use as configurações da sua conta Google.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={TOUCH}>Cancelar</AlertDialogCancel>
          <AlertDialogAction className={TOUCH} onClick={() => void confirmDisconnect()}>
            Desconectar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const folderLink = connection.folderUrl ? (
    <Button asChild variant="outline" className={cn(TOUCH, "sm:shrink-0")}>
      <a href={connection.folderUrl} target="_blank" rel="noopener noreferrer">
        <ExternalLink />
        Abrir pasta no Google Drive
      </a>
    </Button>
  ) : null;

  if (!owner) {
    return (
      <section data-testid="drive-connection-card" className={cn(CARD, "space-y-4")}>
        <div className="flex items-center gap-3">
          <HardDrive className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
          <h3 className="font-serif text-lg text-foreground">Guardar as fotos no seu Google Drive</h3>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Conecte sua conta do Google e as próximas fotos dos convidados passam a ir para uma pasta criada no seu Drive,
          com os originais sempre com você. O link e o QR code continuam os mesmos. O aplicativo só enxerga o que ele
          mesmo criar, e você pode desconectar quando quiser.
        </p>
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Fotos recebidas antes de conectar continuam guardadas pela Casarei.online e deixam de aparecer neste painel.
        </p>
        {connectButton("Guardar no meu Google Drive")}
      </section>
    );
  }

  return (
    <section data-testid="drive-connection-card" className={cn(CARD, "space-y-4")}>
      <div className="flex items-center gap-3">
        <HardDrive className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
        <h3 className="font-serif text-lg text-foreground">Fotos guardadas no seu Google Drive</h3>
      </div>

      {needsReconnect && (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm leading-relaxed text-foreground"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <p>
            É preciso reconectar o Google Drive. Enquanto isso, quem abrir o link de envio verá que o envio está
            indisponível.
          </p>
        </div>
      )}

      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {connection.googleEmail ? `Conectado como ${connection.googleEmail}.` : "Conectado à sua conta do Google."} As
        fotos dos convidados chegam numa pasta criada pelo aplicativo no seu Google Drive.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {needsReconnect && connectButton("Reconectar")}
        {folderLink}
        {disconnectDialog}
      </div>
    </section>
  );
}
