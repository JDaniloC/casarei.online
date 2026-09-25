import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import * as adminApi from "@/lib/driveAdminApi";

// Página de retorno do Google (`/dashboard/google-drive/callback`): recebe `code` e `state`,
// chama `connect` com o login do casal e volta ao painel, na aba de fotos. O código só vale
// uma vez: se o `connect` falhar mas o status já mostrar a conta conectada (a página foi
// recarregada, por exemplo), é sucesso. Nunca loga nem mostra o código ou o state.

interface GoogleDriveCallbackProps {
  /** Leva o navegador ao endereço do Google. Injetável para os testes. */
  assign?: (url: string) => void;
}

type CallbackState = { phase: "working" } | { phase: "error"; message: string };

const LOG_PREFIX = "[GoogleDriveCallback]";
const GENERIC_MESSAGE = "Não foi possível concluir a conexão com o Google. Tente conectar de novo.";
const DENIED_MESSAGE = "A conexão foi cancelada. Nada foi alterado.";
const INCOMPLETE_MESSAGE = "Não foi possível conectar o Google Drive: o retorno do Google veio incompleto.";

const goTo = (url: string) => window.location.assign(url);

const describeError = (error: unknown): string =>
  error instanceof Error && error.message.trim() !== "" ? error.message : GENERIC_MESSAGE;

export default function GoogleDriveCallback({ assign = goTo }: GoogleDriveCallbackProps) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();
  const [state, setState] = useState<CallbackState>({ phase: "working" });
  // O StrictMode executa o efeito duas vezes em desenvolvimento, e o código só vale uma vez.
  const startedRef = useRef(false);

  const backToPanel = () => navigate("/dashboard", { replace: true, state: { activeTab: "photos" } });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const code = params.get("code");
    const oauthState = params.get("state");
    const googleError = params.get("error");

    // Tira o código e o state da barra de endereço (e do histórico) antes de qualquer coisa.
    window.history.replaceState(window.history.state, "", window.location.pathname);

    if (googleError) {
      setState({ phase: "error", message: googleError === "access_denied" ? DENIED_MESSAGE : GENERIC_MESSAGE });
      return;
    }
    if (!code || !oauthState) {
      setState({ phase: "error", message: INCOMPLETE_MESSAGE });
      return;
    }

    const succeed = () => {
      toast({
        title: "Google Drive conectado",
        description: "As próximas fotos dos convidados vão para a pasta do seu Google Drive.",
      });
      navigate("/dashboard", { replace: true, state: { activeTab: "photos" } });
    };

    void (async () => {
      try {
        await adminApi.connectDrive({ code, state: oauthState });
        succeed();
      } catch (error) {
        console.error(`${LOG_PREFIX} falha ao concluir a conexão:`, describeError(error));
        try {
          const status = await adminApi.getStatus();
          if (status.driveMode === "owner" && status.needsReconnect !== true) {
            succeed();
            return;
          }
        } catch {
          // sem status: fica com o erro do connect
        }
        setState({ phase: "error", message: describeError(error) });
      }
    })();
    // O efeito roda uma vez (startedRef); os parâmetros da URL são lidos na primeira execução.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = async () => {
    try {
      assign(await adminApi.getAuthUrl());
    } catch (error) {
      console.error(`${LOG_PREFIX} falha ao reiniciar a conexão:`, describeError(error));
      setState({ phase: "error", message: describeError(error) });
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      {state.phase === "working" ? (
        <div role="status" className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-gold motion-reduce:animate-none" aria-hidden="true" />
          <p>Conectando o seu Google Drive…</p>
        </div>
      ) : (
        <div role="alert" className="space-y-6">
          <div className="space-y-2">
            <h1 className="font-serif text-2xl text-foreground">Não foi possível conectar o Google Drive</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{state.message}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button className="h-11 sm:h-10" onClick={() => void retry()}>
              Tentar de novo
            </Button>
            <Button variant="outline" className="h-11 sm:h-10" onClick={backToPanel}>
              Voltar ao painel
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
