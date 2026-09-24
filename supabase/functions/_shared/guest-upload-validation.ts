// Validação e sanitização de arquivos e nomes enviados pelos convidados.
// Módulo puro: sem Deno.*, sem imports por URL e sem APIs só do Node,
// para rodar tanto na edge function quanto no vitest.

/** Tamanho máximo de um arquivo enviado: 2 GiB. */
export const MAX_BYTES = 2 * 1024 ** 3;

/** Nome da pasta de quem envia sem informar o nome. */
export const ANONYMOUS_LABEL = "Anônimo";

/** Tamanho máximo do nome do convidado, em pontos de código. */
export const MAX_GUEST_NAME_LENGTH = 60;

const MAX_FILE_NAME_LENGTH = 150;
const MAX_EXTENSION_LENGTH = 10;
const FALLBACK_FILE_NAME = "arquivo";

// Extensões aceitas e o mime que o Drive deve receber para cada uma.
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  "3gp": "video/3gpp",
  webm: "video/webm",
};

// Controle (C0 e C1), marcas bidi (U+202A-202E e U+2066-2069) e barras.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F‪-‮⁦-⁩/\\]/g;

const category = (mime: string) => mime.slice(0, mime.indexOf("/"));

/**
 * Decide o mime de um arquivo pela extensão. O tipo declarado pelo navegador só
 * é aceito se for da mesma categoria (image/video); o retorno é sempre o mime
 * da extensão. `null` quando o arquivo deve ser recusado.
 */
export function resolveMime(fileName: string, declaredType: string): string | null {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return null;
  const extensionMime = MIME_BY_EXTENSION[fileName.slice(dot + 1).toLowerCase()];
  if (!extensionMime) return null;

  const declared = declaredType.trim().toLowerCase();
  if (declared === "" || declared === "application/octet-stream") return extensionMime;
  if (declared.startsWith("image/") || declared.startsWith("video/")) {
    return category(declared) === category(extensionMime) ? extensionMime : null;
  }
  return null;
}

// NFC, sem controle/bidi/barras, espaços colapsados e sem espaço nas pontas.
function cleanText(value: string): string {
  return value.normalize("NFC").replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim();
}

/** Limpa o nome de um arquivo e o limita a 150 caracteres, mantendo a extensão. */
export function sanitizeFileName(name: string): string {
  const clean = cleanText(name);

  // Extensão = o que vem depois do último ponto, se tiver de 1 a 10 caracteres.
  const dot = clean.lastIndexOf(".");
  const extensionLength = clean.length - dot - 1;
  const hasExtension = dot !== -1 && extensionLength >= 1 && extensionLength <= MAX_EXTENSION_LENGTH;
  const extension = hasExtension ? clean.slice(dot) : "";
  const base = hasExtension ? clean.slice(0, dot) : clean;

  if (base === "") return FALLBACK_FILE_NAME + extension;

  const room = MAX_FILE_NAME_LENGTH - Array.from(extension).length;
  return Array.from(base).slice(0, room).join("").trimEnd() + extension;
}

/** Limpa o nome que o convidado digitou. `""` quando nada aproveitável sobra. */
export function sanitizeGuestName(name: string | null | undefined): string {
  if (!name) return "";
  const clean = cleanText(name).replace(/^[.\s]+/, "");
  return Array.from(clean).slice(0, MAX_GUEST_NAME_LENGTH).join("").trimEnd();
}

/**
 * Chave de agrupamento das pastas de convidado: ignora maiúsculas, acentos e
 * espaços repetidos. `""` identifica o convidado anônimo.
 */
export function normalizeGuestKey(name: string | null | undefined): string {
  const key = sanitizeGuestName(name)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return key === "anonimo" ? "" : key;
}

// Bytes que um ponto de código ocupa em UTF-8 (surrogate solto vira U+FFFD: 3 bytes).
function utf8Size(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/** Maior prefixo de `value` que cabe em `maxBytes` em UTF-8, sem partir um caractere. */
export function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";
  for (const char of value) {
    bytes += utf8Size(char.codePointAt(0) as number);
    if (bytes > maxBytes) break;
    result += char;
  }
  return result;
}
