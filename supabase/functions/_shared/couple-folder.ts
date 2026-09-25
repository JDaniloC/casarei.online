// Nome da pasta raiz do casal no Google Drive. Puro: só usa as funções de limpeza de nomes.

import { sanitizeFileName, sanitizeGuestName } from "./guest-upload-validation.ts";

/** Nomes do casal (colunas de `weddings`); vazios viram string vazia. */
export interface CoupleNames {
  coupleName: string;
  partner1Name: string;
  partner2Name: string;
}

/** Prefixo da pasta criada no Drive DO CASAL (no Drive da plataforma o pai já é "Casarei.online"). */
export const OWNER_ROOT_PREFIX = "Casarei.online – ";

const FALLBACK_COUPLE_FOLDER_NAME = "Casal";

// Só o nome do casal, sanitizado (sem sufixo: a pasta já fica dentro de "Casarei.online").
// "Vazio" é o que sobra sem nada aproveitável depois da limpeza: só espaços, barras e
// caracteres invisíveis contam como vazio (sanitizeFileName trocaria isso por "arquivo").
// Sem nome do casal usa os parceiros unidos por " & " (pulando os vazios); sem nada,
// "Casal". Casais com o mesmo nome geram pastas de mesmo nome, de propósito: o Drive permite.
export function coupleFolderName(names: CoupleNames): string {
  const hasContent = (value: string) => sanitizeGuestName(value) !== "";
  const partners = [names.partner1Name, names.partner2Name]
    .map((name) => name.trim())
    .filter(hasContent)
    .join(" & ");
  const name = [names.coupleName, partners].find(hasContent);
  return name === undefined ? FALLBACK_COUPLE_FOLDER_NAME : sanitizeFileName(name);
}

/** Nome da pasta raiz criada no topo do Drive do casal: `Casarei.online – <casal>`. */
export function ownerRootFolderName(names: CoupleNames): string {
  return `${OWNER_ROOT_PREFIX}${coupleFolderName(names)}`;
}
