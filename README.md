# Casarei.online | A Plataforma Perfeita para seu Casamento 💍

**Casarei.online** é uma plataforma open-source, moderna e elegante para criação de sites de casamento personalizados. Desenvolvida com foco em facilidade de uso, permite que qualquer casal configure seu site com informações do evento, lista de presentes integrada e confirmação de presença (RSVP).

---

## 🚀 Como Começar

Siga os passos abaixo para rodar o projeto localmente em sua máquina de desenvolvimento.

### Pré-requisitos
* **Node.js** (v18 ou superior)
* **npm** ou **yarn**

### Instalação e Execução

1. **Clone o repositório:**
   ```bash
   git clone <URL_DO_SEU_REPOSITORIO>
   ```

2. Entre na pasta do projeto:
   ```bash
   cd casarei.online
   ```

3. Instale as dependências:
   ```bash
   npm install
   ```

4. Inicie o servidor local:
   ```bash
   npm run dev
   ```

Acesse: http://localhost:5173

---

## 🛠️ Tecnologias Utilizadas
Este projeto utiliza o que há de mais moderno no desenvolvimento web:

- Vite: Build system ultra-rápido.
- React: Biblioteca para interfaces de usuário.
- TypeScript: Tipagem estática para código mais seguro.
- Tailwind CSS: Estilização via classes utilitárias.
- shadcn/ui: Componentes de interface de alta qualidade.
- Lucide React: Biblioteca de ícones elegantes.

---

## 📦 Estrutura do Projeto
A organização das pastas segue o padrão de escalabilidade:

```
src/
├── components/   # Botões, Cards, Modais e UI Geral
├── hooks/        # Lógica de estado e funções personalizadas
├── lib/          # Configurações de utilitários (ex: tailwind-merge)
├── pages/        # Views principais (Home, RSVP, Galeria)
└── App.tsx       # Componente raiz e roteamento
```

---

## 🌐 Deploy (Publicação)
Para gerar os arquivos finais prontos para o servidor:

```bash
npm run build
```

O comando criará uma pasta `dist/`. Você pode hospedar essa pasta gratuitamente em plataformas como:

- Vercel
- Netlify
- GitHub Pages

---

## 📅 Detalhes do Evento

- Noivos: Camila & Rafael
- Data Prevista: 15 de Agosto de 2025
- Status: Em desenvolvimento

---

## 📜 Origem do Projeto & Filosofia Open Source

O **Casarei.online** nasceu originalmente sob o nome de **Casalzinnn**, desenvolvido como um projeto sob medida para celebrar o casamento de **Camila & Rafael** (previsto para 15 de Agosto de 2025).

Com o objetivo de ajudar outros casais a criarem seus próprios sites com a mesma facilidade e sem depender de plataformas caras e restritivas, o projeto foi forkado, generalizado e disponibilizado como código aberto. A partir de agora, a comunidade pode utilizar e contribuir livremente com a plataforma.

Os dados de Camila & Rafael continuam sendo utilizados no código-fonte como a demonstração padrão (seed data) para ilustrar visualmente o funcionamento da plataforma assim que ela é iniciada localmente.

---

Desenvolvido com ❤️ para um dia inesquecível.
