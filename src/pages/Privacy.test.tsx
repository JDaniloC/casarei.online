import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Privacy from './Privacy';

// Frases exigidas pela verificação do app no Google: têm de aparecer exatamente assim.
const LIMITED_USE_PT =
  'O uso e a transferência, para qualquer outro aplicativo, de informações recebidas das APIs do Google pelo casarei.online obedecerão à Política de Dados do Usuário dos Serviços de API do Google, incluindo os requisitos de Uso Limitado.';
const LIMITED_USE_EN =
  "casarei.online's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.";

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={['/privacidade']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Privacy />
    </MemoryRouter>,
  );
}

describe('Página de política de privacidade', () => {
  it('mostra o título da política como cabeçalho principal', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Política de Privacidade' })).toBeInTheDocument();
  });

  it.each([
    'Quem somos',
    'Quais dados tratamos',
    'Para que usamos os dados',
    'Onde os arquivos ficam',
    'Como protegemos os dados',
    'Uso de dados do Google',
    'Com quem compartilhamos',
    'Por quanto tempo guardamos',
    'Seus direitos como titular (LGPD)',
    'Crianças',
    'Contato',
  ])('tem a seção "%s"', (heading) => {
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
  });

  it('mantém as seções nesta ordem, com a proteção dos dados logo depois de onde os arquivos ficam', () => {
    renderPage();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual([
      'Quem somos',
      'Quais dados tratamos',
      'Para que usamos os dados',
      'Onde os arquivos ficam',
      'Como protegemos os dados',
      'Uso de dados do Google',
      'Com quem compartilhamos',
      'Por quanto tempo guardamos',
      'Seus direitos como titular (LGPD)',
      'Crianças',
      'Contato',
    ]);
  });

  it('mostra a data da última atualização', () => {
    renderPage();
    expect(screen.getByText('Última atualização: 24 de setembro de 2026')).toBeInTheDocument();
  });

  it('explica que os arquivos ficam no Google Drive da plataforma, dentro de uma pasta por casal', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Onde os arquivos ficam' });
    expect(within(section).getByText(/Google Drive operada pelo próprio casarei\.online/)).toBeInTheDocument();
    expect(within(section).getByText(/uma pasta e, dentro dela, uma subpasta para cada nome de convidado/)).toBeInTheDocument();
    expect(within(section).getByText(/\(ou "Anônimo"\)/)).toBeInTheDocument();
  });

  it('diz que os arquivos não são públicos e que não ficam nos servidores do casarei.online', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Onde os arquivos ficam' });
    expect(within(section).getByText(/Os arquivos não são públicos\./)).toBeInTheDocument();
    expect(within(section).getByText(/não são armazenados nos servidores do casarei\.online/)).toBeInTheDocument();
    expect(within(section).getByText(/lista com miniaturas do seu painel privado/)).toBeInTheDocument();
  });

  it('admite que quem opera o casarei.online tem acesso técnico à conta de armazenamento', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Onde os arquivos ficam' });
    // Frase completa (só o texto do parágrafo, sem o trecho em negrito): sumir ou ser suavizada quebra o teste.
    expect(
      within(section).getByText(
        'O casal do evento os vê em uma lista com miniaturas do seu painel privado. Quem opera o casarei.online tem acesso técnico à conta de armazenamento.',
      ),
    ).toBeInTheDocument();
  });

  it('descreve o nome opcional do convidado e a pasta Anônimo', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Quais dados tratamos' });
    expect(within(section).getByText('Nome opcional do convidado.')).toBeInTheDocument();
    expect(within(section).getByText(/Se o campo ficar em branco, os arquivos vão para a pasta "Anônimo"/)).toBeInTheDocument();
  });

  it('lista os dados tratados no envio: arquivos, endereço IP e registros técnicos', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Quais dados tratamos' });
    expect(within(section).getByText('Fotos e vídeos.')).toBeInTheDocument();
    expect(within(section).getByText('Endereço IP.')).toBeInTheDocument();
    expect(within(section).getByText('Registros técnicos básicos.')).toBeInTheDocument();
    expect(within(section).getByText(/dados da conta do casal/i)).toBeInTheDocument();
  });

  it('diz que o endereço IP fica num registro de limite de envios, por período limitado, para prevenir abusos', () => {
    renderPage();
    const data = screen.getByRole('region', { name: 'Quais dados tratamos' });
    expect(
      within(data).getByText('Fica em um registro de limite de envios, por período limitado, para prevenir abusos.'),
    ).toBeInTheDocument();
    const purpose = screen.getByRole('region', { name: 'Para que usamos os dados' });
    expect(
      within(purpose).getByText('O endereço IP e os registros técnicos servem para prevenir abusos e manter o serviço seguro.'),
    ).toBeInTheDocument();
  });

  it('cita a LGPD e os direitos do titular, inclusive a reclamação à ANPD', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Seus direitos como titular (LGPD)' });
    expect(within(section).getByText(/Lei nº 13\.709\/2018/)).toBeInTheDocument();
    for (const right of [
      /Acessar os dados/,
      /Corrigir dados/,
      /Pedir a eliminação/,
      /Pedir a portabilidade/,
      /Saber com quem compartilhamos/,
      /Revogar o consentimento/,
      /Reclamar à/,
    ]) {
      expect(within(section).getByText(right)).toBeInTheDocument();
    }
    const anpd = within(section).getByRole('link', { name: 'Autoridade Nacional de Proteção de Dados (ANPD)' });
    expect(anpd).toHaveAttribute('href', 'https://www.gov.br/anpd/pt-br');
    expect(anpd).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('indica as bases legais: consentimento, legítimo interesse e execução de contrato', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Para que usamos os dados' });
    expect(within(section).getByText('Consentimento.')).toBeInTheDocument();
    expect(within(section).getByText('Legítimo interesse.')).toBeInTheDocument();
    expect(within(section).getByText('Execução de contrato.')).toBeInTheDocument();
  });

  describe('uso de dados do Google', () => {
    it('declara o escopo drive.file e que nenhum outro arquivo é lido, listado ou alterado', () => {
      renderPage();
      const section = screen.getByRole('region', { name: 'Uso de dados do Google' });
      expect(within(section).getByText('drive.file')).toBeInTheDocument();
      expect(within(section).getByText(/exclusivamente aos arquivos que o próprio aplicativo criou/)).toBeInTheDocument();
      expect(within(section).getByText(/não lê, não lista e não altera nenhum outro arquivo/)).toBeInTheDocument();
    });

    it('traz a frase de Uso Limitado em português e no original em inglês', () => {
      renderPage();
      const section = screen.getByRole('region', { name: 'Uso de dados do Google' });
      expect(within(section).getByText(LIMITED_USE_PT)).toBeInTheDocument();
      const english = within(section).getByText(LIMITED_USE_EN);
      expect(english).toBeInTheDocument();
      expect(english).toHaveAttribute('lang', 'en');
    });

    it('aponta para a política de dados do usuário dos serviços de API do Google', () => {
      renderPage();
      const link = screen.getByRole('link', { name: /Política de Dados do Usuário dos Serviços de API do Google/ });
      expect(link).toHaveAttribute('href', 'https://developers.google.com/terms/api-services-user-data-policy');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    });
  });

  it('afirma que os dados nunca são vendidos e cita o Google como provedor de armazenamento', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Com quem compartilhamos' });
    expect(within(section).getByText(/Não vendemos dados pessoais/)).toBeInTheDocument();
    expect(within(section).getByText(/Google, provedor de armazenamento/)).toBeInTheDocument();
  });

  it('diz que o casal vê (e não recebe) os arquivos enviados ao seu evento e o nome informado', () => {
    const { container } = renderPage();
    const section = screen.getByRole('region', { name: 'Com quem compartilhamos' });
    expect(
      within(section).getByText(
        'O casal do evento vê os arquivos enviados ao seu evento (lista com miniaturas no painel) e o nome que o convidado informou.',
      ),
    ).toBeInTheDocument();
    // Nada na página pode sugerir entrega, download ou transferência de propriedade dos arquivos.
    expect(container.textContent).not.toMatch(/\breceb(e|em|er)\b|baix|download|entreg|propriedade/i);
  });

  describe('proteção dos dados', () => {
    const protectionSection = () => screen.getByRole('region', { name: 'Como protegemos os dados' });

    it('explica o caminho do envio: HTTPS, direto para o Google Drive, com endereço temporário por arquivo', () => {
      renderPage();
      expect(
        within(protectionSection()).getByText(
          'Os arquivos vão do navegador do convidado direto para o Google Drive, por conexão HTTPS, usando um endereço de envio temporário criado para cada arquivo.',
        ),
      ).toBeInTheDocument();
    });

    it('diz que os arquivos não são públicos e que o painel não oferece link para o Drive', () => {
      renderPage();
      expect(
        within(protectionSection()).getByText(
          'Os arquivos não são públicos, e o painel do casal não oferece nenhum link para o Drive.',
        ),
      ).toBeInTheDocument();
    });

    it('diz que o casal vê apenas os arquivos do próprio evento', () => {
      renderPage();
      expect(
        within(protectionSection()).getByText('O casal vê apenas os arquivos enviados ao seu próprio evento.'),
      ).toBeInTheDocument();
    });

    it('reconhece que a segurança também depende do Google e que nenhum sistema é completamente seguro', () => {
      renderPage();
      const section = protectionSection();
      expect(
        within(section).getByText('A segurança do armazenamento também depende dos controles do próprio Google.'),
      ).toBeInTheDocument();
      expect(
        within(section).getByText(
          'Nenhum sistema é completamente seguro, por isso não podemos prometer proteção absoluta.',
        ),
      ).toBeInTheDocument();
    });

    it('não promete medidas que não podem ser verificadas', () => {
      renderPage();
      const text = protectionSection().textContent ?? '';
      expect(text).not.toMatch(/criptograf|cifra|backup|cópia de segurança|auditor|certifica|acesso registrado|registro de acesso/i);
      expect(text).not.toMatch(/\d+\s*(dias|meses|anos|horas)/i);
    });
  });

  it('descreve a retenção sem prometer prazos que não podem ser verificados', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Por quanto tempo guardamos' });
    expect(within(section).getByText(/até o casal pedir a exclusão ou encerrar a conta/)).toBeInTheDocument();
    expect(within(section).getByText(/por período limitado, apenas o necessário para prevenir abusos/)).toBeInTheDocument();
    expect(section.textContent).not.toMatch(/\d+\s*(dias|meses|anos|horas)/i);
  });

  it('diz que o serviço não é direcionado a crianças', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Crianças' });
    expect(within(section).getByText(/não é direcionado a crianças/)).toBeInTheDocument();
  });

  it('manda entrar em contato pelo site, sem inventar e-mail', () => {
    const { container } = renderPage();
    const section = screen.getByRole('region', { name: 'Contato' });
    expect(within(section).getByText(/entre em contato pelo site/)).toBeInTheDocument();
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(container.textContent).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(container.textContent).not.toMatch(/CNPJ/i);
  });

  it('não expõe nenhum link do Drive', () => {
    const { container } = renderPage();
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.filter((href) => href.includes('drive.google.com'))).toEqual([]);
  });

  it('tem um link de volta ao início', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /casarei\.online/i })).toHaveAttribute('href', '/');
  });

  it('define o título da aba e o restaura ao sair da página', () => {
    document.title = 'Título anterior';
    const { unmount } = renderPage();
    expect(document.title).toBe('Política de Privacidade — casarei.online');
    unmount();
    expect(document.title).toBe('Título anterior');
  });
});
