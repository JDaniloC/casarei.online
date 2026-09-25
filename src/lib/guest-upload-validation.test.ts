import { describe, it, expect } from 'vitest';
import {
  MAX_BYTES,
  ANONYMOUS_LABEL,
  MAX_GUEST_NAME_LENGTH,
  resolveMime,
  sanitizeFileName,
  sanitizeGuestName,
  normalizeGuestKey,
  truncateUtf8,
} from '../../supabase/functions/_shared/guest-upload-validation';

const utf8Length = (value: string) => new TextEncoder().encode(value).length;

describe('constantes', () => {
  it('limita o arquivo a 2 GiB', () => {
    expect(MAX_BYTES).toBe(2147483648);
  });

  it('usa "Anônimo" como rótulo da pasta sem nome', () => {
    expect(ANONYMOUS_LABEL).toBe('Anônimo');
  });

  it('limita o nome do convidado a 60 caracteres', () => {
    expect(MAX_GUEST_NAME_LENGTH).toBe(60);
  });
});

describe('resolveMime', () => {
  it.each([
    ['foto.jpg', 'image/jpeg'],
    ['foto.jpeg', 'image/jpeg'],
    ['foto.png', 'image/png'],
    ['foto.heic', 'image/heic'],
    ['foto.heif', 'image/heif'],
    ['foto.webp', 'image/webp'],
    ['foto.gif', 'image/gif'],
    ['video.mp4', 'video/mp4'],
    ['video.mov', 'video/quicktime'],
    ['video.m4v', 'video/x-m4v'],
    ['video.3gp', 'video/3gpp'],
    ['video.webm', 'video/webm'],
  ])('aceita %s como %s', (fileName, mime) => {
    expect(resolveMime(fileName, '')).toBe(mime);
  });

  it('ignora maiúsculas na extensão', () => {
    expect(resolveMime('IMG_0001.JPG', '')).toBe('image/jpeg');
    expect(resolveMime('Video.MoV', '')).toBe('video/quicktime');
  });

  it('usa a última extensão de um nome com vários pontos', () => {
    expect(resolveMime('festa.2026.final.png', '')).toBe('image/png');
  });

  it('recusa extensão fora da lista', () => {
    expect(resolveMime('programa.exe', '')).toBeNull();
    expect(resolveMime('desenho.svg', 'image/svg+xml')).toBeNull();
  });

  it('recusa nome sem extensão', () => {
    expect(resolveMime('foto', 'image/jpeg')).toBeNull();
    expect(resolveMime('foto.', 'image/jpeg')).toBeNull();
    expect(resolveMime('', '')).toBeNull();
  });

  it('usa o mime da extensão quando o tipo declarado é vazio', () => {
    expect(resolveMime('foto.png', '')).toBe('image/png');
  });

  it('usa o mime da extensão quando o tipo declarado é application/octet-stream', () => {
    expect(resolveMime('video.mov', 'application/octet-stream')).toBe('video/quicktime');
  });

  it('recusa quando a categoria declarada difere da extensão', () => {
    expect(resolveMime('video.mp4', 'image/jpeg')).toBeNull();
    expect(resolveMime('foto.jpg', 'video/mp4')).toBeNull();
  });

  it('devolve o mime da extensão quando o tipo declarado é da mesma categoria', () => {
    expect(resolveMime('foto.heic', 'image/jpeg')).toBe('image/heic');
    expect(resolveMime('video.mov', 'video/mp4')).toBe('video/quicktime');
  });

  it('não diferencia maiúsculas no tipo declarado', () => {
    expect(resolveMime('foto.jpg', 'Image/JPEG')).toBe('image/jpeg');
  });

  it('recusa qualquer outro tipo declarado', () => {
    expect(resolveMime('foto.jpg', 'application/pdf')).toBeNull();
    expect(resolveMime('foto.jpg', 'text/html')).toBeNull();
  });

  // Chaves herdadas de Object.prototype não podem passar pela allowlist.
  describe.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])('extensão herdada .%s', (extensao) => {
    it.each(['', 'image/jpeg'])('devolve null sem lançar erro com tipo declarado "%s"', (declarado) => {
      expect(() => resolveMime(`x.${extensao}`, declarado)).not.toThrow();
      expect(resolveMime(`x.${extensao}`, declarado)).toBeNull();
    });
  });
});

describe('sanitizeFileName', () => {
  it('mantém um nome comum intacto', () => {
    expect(sanitizeFileName('IMG_0001.jpg')).toBe('IMG_0001.jpg');
  });

  it('remove o caractere bidi que disfarça a extensão', () => {
    expect(sanitizeFileName('foto\u202Egpj.exe')).toBe('fotogpj.exe');
  });

  it('remove todos os caracteres bidi', () => {
    expect(sanitizeFileName('a\u202Ab\u202Bc\u202Cd\u202Dl\u202Ee\u2066f\u2067g\u2068h\u2069i.png')).toBe(
      'abcdlefghi.png',
    );
  });

  it('remove caracteres de controle', () => {
    expect(sanitizeFileName('a\u0000b\u001Fc\u007Fd\u0085e\u009Ff.jpg')).toBe('abcdef.jpg');
  });

  it('remove barras e barras invertidas', () => {
    expect(sanitizeFileName('../fotos\\casamento/foto.jpg')).toBe('..fotoscasamentofoto.jpg');
  });

  it('remove BOM e os demais caracteres invisíveis', () => {
    expect(sanitizeFileName('foto\uFEFF.jpg')).toBe('foto.jpg');
    expect(sanitizeFileName('foto\uFEFFfinal.jpg')).toBe('fotofinal.jpg');
    expect(sanitizeFileName('a\u200Bb\u200Ec\u200Fd\u2060e\u061Cf\uFEFF.jpg')).toBe('abcdef.jpg');
  });

  it('colapsa espaços e faz trim', () => {
    expect(sanitizeFileName('  foto   de   festa.jpg  ')).toBe('foto de festa.jpg');
  });

  it('normaliza para NFC', () => {
    const decomposto = 'cerimônia.jpg';
    expect(sanitizeFileName(decomposto)).toBe('cerimônia.jpg');
  });

  it('corta um nome de 400 caracteres em 150 mantendo a extensão', () => {
    const result = sanitizeFileName('a'.repeat(400) + '.mp4');
    expect(result).toHaveLength(150);
    expect(result.endsWith('.mp4')).toBe(true);
    expect(result.startsWith('aaaa')).toBe(true);
  });

  it('preserva uma extensão de exatamente 10 caracteres', () => {
    const result = sanitizeFileName('a'.repeat(400) + '.abcdefghij');
    expect(result).toHaveLength(150);
    expect(result.endsWith('.abcdefghij')).toBe(true);
  });

  it('não trata como extensão um trecho com mais de 10 caracteres', () => {
    const result = sanitizeFileName('a'.repeat(200) + '.abcdefghijk');
    expect(result).toHaveLength(150);
    expect(result).toBe('a'.repeat(150));
  });

  it('não parte um par substituto ao cortar', () => {
    const result = sanitizeFileName('🎉'.repeat(200) + '.mp4');
    expect(Array.from(result)).toHaveLength(150);
    expect(result.endsWith('🎉.mp4')).toBe(true);
    expect(result).not.toContain('�');
    expect(result.normalize('NFC')).toBe(result);
  });

  it('não deixa espaço solto entre o nome cortado e a extensão', () => {
    const result = sanitizeFileName('a'.repeat(145) + ' ' + 'b'.repeat(10) + '.mp4');
    expect(result).toBe('a'.repeat(145) + '.mp4');
  });

  it('usa "arquivo" quando só sobra a extensão', () => {
    expect(sanitizeFileName('.jpg')).toBe('arquivo.jpg');
    expect(sanitizeFileName('/\\ \u202E.jpg')).toBe('arquivo.jpg');
  });

  it('usa só "arquivo" quando nada sobra', () => {
    expect(sanitizeFileName('')).toBe('arquivo');
    expect(sanitizeFileName('   ')).toBe('arquivo');
    expect(sanitizeFileName('/\\\u0000')).toBe('arquivo');
  });
});

describe('sanitizeGuestName', () => {
  it('mantém um nome comum intacto', () => {
    expect(sanitizeGuestName('Maria Silva')).toBe('Maria Silva');
  });

  it('devolve vazio para null, undefined e texto em branco', () => {
    expect(sanitizeGuestName(null)).toBe('');
    expect(sanitizeGuestName(undefined)).toBe('');
    expect(sanitizeGuestName('   ')).toBe('');
  });

  it('remove controle, bidi e barras', () => {
    expect(sanitizeGuestName('Ma\u0000ri\u202Ea\u2067 /Sil\\va')).toBe('Maria Silva');
  });

  it('colapsa espaços e faz trim', () => {
    expect(sanitizeGuestName('  Maria   Silva  ')).toBe('Maria Silva');
  });

  it('remove marcas de direção invisíveis no fim do nome', () => {
    expect(sanitizeGuestName('Ana\u200E')).toBe('Ana');
    expect(sanitizeGuestName('Ana\u200F')).toBe('Ana');
  });

  it('remove espaço de largura zero, word joiner, marca de letra árabe e BOM', () => {
    expect(sanitizeGuestName('M\u200Ba\u200Er\u200Fi\u2060a\u061C\uFEFF')).toBe('Maria');
  });

  it('devolve vazio quando só sobram caracteres invisíveis', () => {
    expect(sanitizeGuestName('\u200B\u200B\uFEFF')).toBe('');
  });

  it('remove ponto inicial escondido atrás de um caractere invisível', () => {
    expect(sanitizeGuestName('\u200B.oculto')).toBe('oculto');
  });

  it('preserva a sequência de emoji com ZWJ', () => {
    const familia = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    expect(sanitizeGuestName(familia)).toBe(familia);
  });

  it('preserva o ZWNJ', () => {
    expect(sanitizeGuestName('a\u200Cb')).toBe('a\u200Cb');
  });

  it('normaliza para NFC', () => {
    expect(sanitizeGuestName('María')).toBe('María');
  });

  it('remove pontos no início', () => {
    expect(sanitizeGuestName('.oculto')).toBe('oculto');
    expect(sanitizeGuestName('.. . oculto')).toBe('oculto');
  });

  it('mantém pontos que não estão no início', () => {
    expect(sanitizeGuestName('Dr. Silva')).toBe('Dr. Silva');
  });

  it('devolve vazio quando só sobram pontos', () => {
    expect(sanitizeGuestName('...')).toBe('');
  });

  it('aceita emoji dentro do limite de 60 pontos de código', () => {
    const nome = '🎉'.repeat(MAX_GUEST_NAME_LENGTH);
    expect(sanitizeGuestName(nome)).toBe(nome);
  });

  it('corta em 60 pontos de código sem partir um emoji', () => {
    const result = sanitizeGuestName('🎉'.repeat(MAX_GUEST_NAME_LENGTH + 5));
    expect(Array.from(result)).toHaveLength(MAX_GUEST_NAME_LENGTH);
    expect(result).toBe('🎉'.repeat(MAX_GUEST_NAME_LENGTH));
  });

  it('corta um nome longo de letras em 60 caracteres', () => {
    expect(sanitizeGuestName('a'.repeat(100))).toBe('a'.repeat(60));
  });

  it('não deixa espaço no fim depois de cortar', () => {
    expect(sanitizeGuestName('a'.repeat(59) + ' bbb')).toBe('a'.repeat(59));
  });
});

describe('normalizeGuestKey', () => {
  it('gera a mesma chave para grafias que só diferem em espaços, caixa e acentos', () => {
    const chave = normalizeGuestKey('maria silva');
    expect(chave).toBe('maria silva');
    expect(normalizeGuestKey('Maria  Silva')).toBe(chave);
    expect(normalizeGuestKey('María Silva')).toBe(chave);
    expect(normalizeGuestKey('  MARIA   SILVA ')).toBe(chave);
    expect(normalizeGuestKey('Maria Silva')).toBe(chave);
  });

  it('ignora caracteres invisíveis no meio do nome', () => {
    expect(normalizeGuestKey('Maria\u200BSilva')).toBe(normalizeGuestKey('MariaSilva'));
    expect(normalizeGuestKey('Maria\uFEFFSilva')).toBe(normalizeGuestKey('MariaSilva'));
    expect(normalizeGuestKey('Ma\u2060ria\uFEFF Sil\u200Fva')).toBe('maria silva');
  });

  it('não deixa um caractere invisível esconder o anônimo', () => {
    expect(normalizeGuestKey('Anonimo\u200B')).toBe('');
    expect(normalizeGuestKey('\u200B')).toBe('');
  });

  it('trata acento composto e decomposto como o mesmo nome', () => {
    expect(normalizeGuestKey('María')).toBe(normalizeGuestKey('María'));
  });

  it('diferencia nomes realmente diferentes', () => {
    expect(normalizeGuestKey('Maria Silva')).not.toBe(normalizeGuestKey('Mariana Silva'));
  });

  it('devolve vazio para o rótulo anônimo em qualquer grafia', () => {
    expect(normalizeGuestKey('Anônimo')).toBe('');
    expect(normalizeGuestKey('ANONIMO')).toBe('');
    expect(normalizeGuestKey(ANONYMOUS_LABEL)).toBe('');
    expect(normalizeGuestKey('.anonimo')).toBe('');
  });

  it('devolve vazio para nome vazio, em branco, null e undefined', () => {
    expect(normalizeGuestKey('')).toBe('');
    expect(normalizeGuestKey('   ')).toBe('');
    expect(normalizeGuestKey(null)).toBe('');
    expect(normalizeGuestKey(undefined)).toBe('');
  });

  it('não confunde um nome que apenas começa com anônimo', () => {
    expect(normalizeGuestKey('Anônimo Silva')).toBe('anonimo silva');
  });
});

describe('truncateUtf8', () => {
  it('devolve o valor inteiro quando cabe', () => {
    expect(truncateUtf8('abc', 3)).toBe('abc');
    expect(truncateUtf8('abc', 10)).toBe('abc');
  });

  it('corta texto ASCII no limite de bytes', () => {
    expect(truncateUtf8('abcdef', 4)).toBe('abcd');
  });

  it('não corta um caractere no meio', () => {
    // "ção" ocupa 5 bytes (ç=2, ã=2, o=1): com 3 bytes cabe só o "ç".
    const result = truncateUtf8('ção', 3);
    expect(result).toBe('ç');
    expect(utf8Length(result)).toBe(2);
    expect(result).not.toContain('�');
  });

  it('não corta um emoji de 4 bytes', () => {
    expect(truncateUtf8('a😀', 4)).toBe('a');
    expect(truncateUtf8('a😀', 5)).toBe('a😀');
  });

  it('nunca ultrapassa o limite de bytes', () => {
    const texto = 'Maria José da Conceição 🎉 Ünïcödé';
    for (let limite = 0; limite <= utf8Length(texto); limite++) {
      const result = truncateUtf8(texto, limite);
      expect(utf8Length(result)).toBeLessThanOrEqual(limite);
      expect(texto.startsWith(result)).toBe(true);
    }
  });

  it('devolve vazio quando o limite é zero ou menor', () => {
    expect(truncateUtf8('abc', 0)).toBe('');
    expect(truncateUtf8('abc', -5)).toBe('');
  });

  it('devolve vazio para texto vazio', () => {
    expect(truncateUtf8('', 10)).toBe('');
  });
});
