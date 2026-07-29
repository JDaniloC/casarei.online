import { WeddingProvider } from "@/contexts/WeddingContext";
import PublicLanding from "@/components/wedding/PublicLanding";

const Demo = () => {
  return (
    <WeddingProvider>
      {/*
        Página de demonstração pública, sem casamento real por trás — não há
        `config.defaultMaxCompanions` vindo do banco para ler (o WeddingProvider
        aqui usa o defaultConfig estático, que é 0). maxCompanions=2 é fixo para
        que a demo mostre o seletor de acompanhantes e os campos de nome
        funcionando, em vez de escondê-los como o default 0 faria.
      */}
      <PublicLanding isPreview maxCompanions={2} />
    </WeddingProvider>
  );
};

export default Demo;
