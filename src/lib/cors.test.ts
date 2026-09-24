import { describe, it, expect } from 'vitest';
import {
  parseAllowedOrigins,
  isOriginAllowed,
  corsHeadersFor,
} from '../../supabase/functions/_shared/cors';

describe('parseAllowedOrigins', () => {
  it('divide por vírgula, faz trim e descarta itens vazios', () => {
    expect(parseAllowedOrigins(' https://casarei.online , ,https://www.casarei.online,, ')).toEqual([
      'https://casarei.online',
      'https://www.casarei.online',
    ]);
  });

  it('remove a barra final de cada origem', () => {
    expect(parseAllowedOrigins('https://casarei.online/, http://localhost:8080/')).toEqual([
      'https://casarei.online',
      'http://localhost:8080',
    ]);
  });

  it('descarta entradas que viram vazias depois de remover a barra', () => {
    expect(parseAllowedOrigins('/, https://casarei.online')).toEqual(['https://casarei.online']);
  });

  it('devolve [] para null, undefined, vazio e só espaços', () => {
    expect(parseAllowedOrigins(null)).toEqual([]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins('   ')).toEqual([]);
    expect(parseAllowedOrigins(' , ,')).toEqual([]);
  });

  it('mantém a lista do exemplo do plano', () => {
    expect(
      parseAllowedOrigins('https://casarei.online,https://www.casarei.online,http://localhost:8080'),
    ).toEqual(['https://casarei.online', 'https://www.casarei.online', 'http://localhost:8080']);
  });
});

describe('isOriginAllowed', () => {
  const allowed = ['https://casarei.online', 'http://localhost:8080'];

  it('aceita origem idêntica a uma da lista', () => {
    expect(isOriginAllowed('https://casarei.online', allowed)).toBe(true);
    expect(isOriginAllowed('http://localhost:8080', allowed)).toBe(true);
  });

  it('recusa origem fora da lista', () => {
    expect(isOriginAllowed('https://evil.example', allowed)).toBe(false);
  });

  it('recusa origem null', () => {
    expect(isOriginAllowed(null, allowed)).toBe(false);
  });

  it('recusa origem vazia', () => {
    expect(isOriginAllowed('', allowed)).toBe(false);
    expect(isOriginAllowed('', [''])).toBe(false);
  });

  it('recusa qualquer origem com a lista vazia', () => {
    expect(isOriginAllowed('https://casarei.online', [])).toBe(false);
  });

  it('compara a origem inteira: esquema diferente não passa', () => {
    expect(isOriginAllowed('http://casarei.online', ['https://casarei.online'])).toBe(false);
    expect(isOriginAllowed('https://localhost:8080', ['http://localhost:8080'])).toBe(false);
  });

  it('compara a origem inteira: porta diferente ou ausente não passa', () => {
    expect(isOriginAllowed('http://localhost:3000', ['http://localhost:8080'])).toBe(false);
    expect(isOriginAllowed('http://localhost', ['http://localhost:8080'])).toBe(false);
    expect(isOriginAllowed('https://casarei.online:8443', ['https://casarei.online'])).toBe(false);
  });

  it('não aceita sufixo nem prefixo do domínio permitido', () => {
    const only = ['https://casarei.online'];
    expect(isOriginAllowed('https://casarei.online.evil.com', only)).toBe(false);
    expect(isOriginAllowed('https://evilcasarei.online', only)).toBe(false);
    expect(isOriginAllowed('https://casarei.online@evil.com', only)).toBe(false);
    expect(isOriginAllowed('https://evil.com/https://casarei.online', only)).toBe(false);
  });

  it('não trata subdomínio como permitido pelo domínio raiz (sem curinga)', () => {
    expect(isOriginAllowed('https://www.casarei.online', ['https://casarei.online'])).toBe(false);
    expect(isOriginAllowed('https://casarei.online', ['https://www.casarei.online'])).toBe(false);
  });

  it('não interpreta * como curinga', () => {
    expect(isOriginAllowed('https://casarei.online', ['*'])).toBe(false);
    expect(isOriginAllowed('https://casarei.online', ['https://*.online'])).toBe(false);
  });

  it('diferencia maiúsculas e minúsculas (comparação exata)', () => {
    expect(isOriginAllowed('https://Casarei.online', ['https://casarei.online'])).toBe(false);
  });

  it('a origem com barra final não é uma origem válida e não passa', () => {
    expect(isOriginAllowed('https://casarei.online/', ['https://casarei.online'])).toBe(false);
  });

  it('entrada da lista com barra final só casa depois de passar por parseAllowedOrigins', () => {
    // Sem normalizar, a comparação é exata: o navegador nunca envia barra final.
    expect(isOriginAllowed('https://casarei.online', ['https://casarei.online/'])).toBe(false);
    const parsed = parseAllowedOrigins('https://casarei.online/');
    expect(isOriginAllowed('https://casarei.online', parsed)).toBe(true);
    expect(isOriginAllowed('https://casarei.online/', parsed)).toBe(false);
  });

  it('a string "null" (origem opaca) só passa se estiver na lista', () => {
    expect(isOriginAllowed('null', allowed)).toBe(false);
  });

  it('chaves herdadas de Object não são origens permitidas', () => {
    for (const origin of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'prototype']) {
      expect(isOriginAllowed(origin, allowed)).toBe(false);
      expect(isOriginAllowed(origin, [])).toBe(false);
    }
  });
});

describe('corsHeadersFor', () => {
  const allowed = ['https://casarei.online', 'http://localhost:8080'];

  it('com origem permitida devolve os headers completos, inclusive Allow-Origin', () => {
    expect(corsHeadersFor('https://casarei.online', allowed)).toEqual({
      'Access-Control-Allow-Origin': 'https://casarei.online',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      Vary: 'Origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
  });

  it('devolve a origem da requisição (e não a lista) em Allow-Origin', () => {
    const headers = corsHeadersFor('http://localhost:8080', allowed);
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:8080');
  });

  it('com origem não permitida omite Allow-Origin mas mantém o resto', () => {
    const headers = corsHeadersFor('https://evil.example', allowed);

    expect(headers).not.toHaveProperty('Access-Control-Allow-Origin');
    expect(headers).toEqual({
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      Vary: 'Origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
  });

  it('com origem null omite Allow-Origin e mantém Vary e os headers de segurança', () => {
    const headers = corsHeadersFor(null, allowed);

    expect(headers).not.toHaveProperty('Access-Control-Allow-Origin');
    expect(headers.Vary).toBe('Origin');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('com lista vazia nunca autoriza origem', () => {
    expect(corsHeadersFor('https://casarei.online', [])).not.toHaveProperty('Access-Control-Allow-Origin');
  });

  it('nunca usa curinga em Allow-Origin', () => {
    expect(corsHeadersFor('https://evil.example', allowed)['Access-Control-Allow-Origin']).toBeUndefined();
    expect(corsHeadersFor('https://casarei.online', allowed)['Access-Control-Allow-Origin']).not.toBe('*');
  });

  it('origens quase iguais não recebem Allow-Origin', () => {
    const only = ['https://casarei.online'];
    for (const origin of [
      'https://casarei.online.evil.com',
      'http://casarei.online',
      'https://casarei.online:8443',
      'https://casarei.online/',
    ]) {
      expect(corsHeadersFor(origin, only)).not.toHaveProperty('Access-Control-Allow-Origin');
    }
  });

  it('chaves herdadas de Object como origem não recebem Allow-Origin', () => {
    for (const origin of ['__proto__', 'constructor', 'toString']) {
      expect(corsHeadersFor(origin, allowed)).not.toHaveProperty('Access-Control-Allow-Origin');
    }
  });

  it('cada chamada devolve um objeto novo (sem estado compartilhado)', () => {
    const a = corsHeadersFor('https://casarei.online', allowed);
    a['X-Extra'] = 'x';
    expect(corsHeadersFor('https://casarei.online', allowed)).not.toHaveProperty('X-Extra');
  });

  it('serve como init de Headers do Response', () => {
    const response = new Response(null, { headers: corsHeadersFor('https://casarei.online', allowed) });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://casarei.online');
    expect(response.headers.get('Vary')).toBe('Origin');
  });
});
