import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";

const PAGE_TITLE = "Política de Privacidade — casarei.online";
const LAST_UPDATED = "24 de setembro de 2026";

// Frase exigida pela verificação do app no Google: precisa aparecer exatamente assim, nos dois idiomas.
const LIMITED_USE_PT =
  "O uso e a transferência, para qualquer outro aplicativo, de informações recebidas das APIs do Google pelo casarei.online obedecerão à Política de Dados do Usuário dos Serviços de API do Google, incluindo os requisitos de Uso Limitado.";
const LIMITED_USE_EN =
  "casarei.online's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.";

const GOOGLE_USER_DATA_POLICY_URL = "https://developers.google.com/terms/api-services-user-data-policy";
const ANPD_URL = "https://www.gov.br/anpd/pt-br";

const LINK_CLASS =
  "font-medium text-foreground underline decoration-gold decoration-2 underline-offset-4 hover:text-gold";
const LIST_CLASS = "list-disc space-y-3 pl-5 marker:text-gold";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <h2 id={id} className="font-serif text-2xl leading-snug text-foreground sm:text-3xl">
        {title}
      </h2>
      <span aria-hidden="true" className="mt-3 block h-px w-10 bg-gold" />
      <div className="mt-5 space-y-4 text-base leading-relaxed text-foreground/85">{children}</div>
    </section>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 font-serif text-xl text-foreground">{children}</h3>;
}

function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

const Privacy = () => {
  useEffect(() => {
    const previous = document.title;
    document.title = PAGE_TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl break-words px-5 pb-16 pt-6 sm:pt-10">
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 font-serif text-lg text-foreground">
          <Heart className="h-5 w-5 shrink-0 fill-gold text-gold" aria-hidden="true" />
          casarei.online
        </Link>

        <header className="mt-8 sm:mt-12">
          <h1 className="text-balance font-serif text-4xl leading-tight text-foreground sm:text-5xl">
            Política de Privacidade
          </h1>
          <span aria-hidden="true" className="mt-6 block h-px w-14 bg-gold" />
          <p className="mt-6 text-sm text-muted-foreground">{`Última atualização: ${LAST_UPDATED}`}</p>
          <p className="mt-6 text-lg leading-relaxed text-foreground/85">
            Esta página explica, em linguagem simples, quais dados o casarei.online trata, para que os usamos, onde
            ficam guardados e como você pode exercer seus direitos. Ela vale para os casais que criam o site do
            casamento conosco e para os convidados que enviam fotos e vídeos por uma página aberta a partir de um QR
            code.
          </p>
        </header>

        <Section id="quem-somos" title="Quem somos">
          <p>
            O casarei.online é uma plataforma em que casais montam o site do casamento, com lista de presentes,
            confirmação de presença (RSVP), mural de recados, galeria e painel de controle. Uma das funções permite que
            os convidados enviem fotos e vídeos do evento, sem cadastro, por uma página aberta a partir de um QR code.
          </p>
          <p>O casarei.online é o responsável pelo tratamento dos dados descritos nesta política.</p>
        </Section>

        <Section id="dados-tratados" title="Quais dados tratamos">
          <SubHeading>Quando um convidado envia fotos e vídeos</SubHeading>
          <p>Não é preciso criar conta para enviar. Os dados envolvidos são:</p>
          <ul className={LIST_CLASS}>
            <li>
              <Strong>Nome opcional do convidado.</Strong> O convidado pode digitar um nome se quiser. Ele serve apenas
              para nomear a pasta e rotular os arquivos. Se o campo ficar em branco, os arquivos vão para a pasta
              &quot;Anônimo&quot;. O nome digitado também fica salvo no navegador do próprio convidado, só para
              preencher o campo numa próxima visita.
            </li>
            <li>
              <Strong>Fotos e vídeos.</Strong> Os arquivos que o convidado escolhe enviar.
            </li>
            <li>
              <Strong>Endereço IP.</Strong> Fica em um registro de limite de envios, por período limitado, para
              prevenir abusos.
            </li>
            <li>
              <Strong>Registros técnicos básicos.</Strong> Informações técnicas necessárias para o funcionamento e a
              segurança do serviço.
            </li>
          </ul>
          <SubHeading>Para os casais e para o site do casamento</SubHeading>
          <ul className={LIST_CLASS}>
            <li>
              <Strong>Dados da conta do casal e do site.</Strong> Os dados que a plataforma já trata para o
              funcionamento do site, como as informações de cadastro do casal, confirmações de presença (RSVP),
              presentes e recados do mural.
            </li>
          </ul>
        </Section>

        <Section id="finalidade" title="Para que usamos os dados">
          <ul className={LIST_CLASS}>
            <li>O nome opcional serve para nomear a pasta do convidado e rotular os arquivos enviados.</li>
            <li>
              As fotos e os vídeos são guardados e mostrados ao casal do evento, que os vê no painel do casal.
            </li>
            <li>O endereço IP e os registros técnicos servem para prevenir abusos e manter o serviço seguro.</li>
            <li>
              Os dados de conta e do site do casamento servem para fornecer o serviço que o casal contratou.
            </li>
          </ul>
          <SubHeading>Bases legais (LGPD, art. 7º)</SubHeading>
          <ul className={LIST_CLASS}>
            <li>
              <Strong>Consentimento.</Strong> O convidado que escolhe enviar fotos e vídeos, e que informa um nome se
              quiser, o faz por decisão própria.
            </li>
            <li>
              <Strong>Legítimo interesse.</Strong> A prevenção de abusos no envio de arquivos.
            </li>
            <li>
              <Strong>Execução de contrato.</Strong> O tratamento dos dados dos casais para fornecer o serviço.
            </li>
          </ul>
        </Section>

        <Section id="onde-ficam" title="Onde os arquivos ficam">
          <p>
            Nesta primeira fase, as fotos e os vídeos ficam guardados em uma conta do Google Drive operada pelo próprio
            casarei.online. Cada casal tem uma pasta e, dentro dela, uma subpasta para cada nome de convidado (ou
            &quot;Anônimo&quot;).
          </p>
          <p>
            O navegador do convidado envia os arquivos diretamente ao Google Drive. Eles não são armazenados nos
            servidores do casarei.online.
          </p>
          <p>
            <Strong>Os arquivos não são públicos.</Strong> O casal do evento os vê em uma lista com miniaturas do seu
            painel privado. Quem opera o casarei.online tem acesso técnico à conta de armazenamento.
          </p>
        </Section>

        <Section id="dados-google" title="Uso de dados do Google">
          <p>
            O casarei.online usa a API do Google Drive para criar as pastas do casal, guardar os arquivos enviados pelos
            convidados e mostrar ao casal a lista, com miniaturas, do que chegou.
          </p>
          <p>
            O aplicativo solicita apenas o escopo <code className="rounded bg-secondary px-1.5 py-0.5 text-[0.9em] text-foreground">drive.file</code>,
            que dá acesso exclusivamente aos arquivos que o próprio aplicativo criou. Ele não lê, não lista e não altera
            nenhum outro arquivo da conta.
          </p>
          <p>
            Nesta fase, o aplicativo usa uma conta do Google do próprio casarei.online. Convidados e casais não
            precisam entrar com a conta Google deles nem dar acesso ao próprio Drive.
          </p>
          <div className="space-y-3 border-l-2 border-gold bg-secondary/50 py-4 pl-4 pr-4 text-foreground">
            <p>{LIMITED_USE_PT}</p>
            <p lang="en" className="italic">
              {LIMITED_USE_EN}
            </p>
          </div>
          <p>
            Leia a{" "}
            <a href={GOOGLE_USER_DATA_POLICY_URL} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              Política de Dados do Usuário dos Serviços de API do Google
            </a>
            .
          </p>
        </Section>

        <Section id="compartilhamento" title="Com quem compartilhamos">
          <p>Não vendemos dados pessoais.</p>
          <p>
            Compartilhamos dados apenas com quem é necessário para o serviço funcionar: o Google, provedor de
            armazenamento dos arquivos enviados, e os provedores de infraestrutura que hospedam e operam a plataforma.
            O casal do evento também recebe os arquivos enviados ao seu evento e o nome que o convidado informou.
          </p>
        </Section>

        <Section id="retencao" title="Por quanto tempo guardamos">
          <p>As fotos e os vídeos ficam guardados até o casal pedir a exclusão ou encerrar a conta.</p>
          <p>
            Os registros usados para prevenir abusos no envio de arquivos, como o endereço IP, são mantidos por período
            limitado, apenas o necessário para prevenir abusos.
          </p>
        </Section>

        <Section id="direitos" title="Seus direitos como titular (LGPD)">
          <p>
            A Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018) garante a você, titular dos dados, o direito de:
          </p>
          <ul className={LIST_CLASS}>
            <li>Acessar os dados que tratamos sobre você.</li>
            <li>Corrigir dados incompletos, inexatos ou desatualizados.</li>
            <li>Pedir a eliminação dos seus dados.</li>
            <li>Pedir a portabilidade dos seus dados.</li>
            <li>Saber com quem compartilhamos os seus dados.</li>
            <li>
              Revogar o consentimento a qualquer momento, por exemplo pedindo a exclusão dos arquivos que você enviou.
            </li>
            <li>
              Reclamar à{" "}
              <a href={ANPD_URL} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                Autoridade Nacional de Proteção de Dados (ANPD)
              </a>
              .
            </li>
          </ul>
          <p>
            Para localizarmos os arquivos que você enviou, informe o nome do casal e o nome que você digitou no envio,
            se digitou algum.
          </p>
        </Section>

        <Section id="criancas" title="Crianças">
          <p>O casarei.online não é direcionado a crianças.</p>
        </Section>

        <Section id="contato" title="Contato">
          <p>Para tirar dúvidas sobre esta política ou exercer seus direitos, entre em contato pelo site.</p>
        </Section>
      </div>
    </main>
  );
};

export default Privacy;
