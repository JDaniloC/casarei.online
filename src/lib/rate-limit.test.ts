import { describe, it, expect } from 'vitest';
import {
  checkAndLog,
  clientIp,
  rateLimitDbFromSupabase,
  type RateLimitDb,
} from '../../supabase/functions/_shared/rate-limit';

const T0 = Date.parse('2026-09-24T12:00:00.000Z');

interface Row {
  identifier: string;
  action: string;
  at: number;
}

// Banco falso em memória: guarda o instante de cada linha e filtra pela janela,
// como a tabela rate_limit_log de verdade.
function makeDb(clock: { now: number }, seed: Row[] = []) {
  const rows: Row[] = [...seed];
  const countCalls: Array<{ identifier: string; action: string; sinceIso: string }> = [];
  const db: RateLimitDb = {
    async countSince(identifier, action, sinceIso) {
      countCalls.push({ identifier, action, sinceIso });
      const since = Date.parse(sinceIso);
      return rows.filter(
        (r) => r.identifier === identifier && r.action === action && r.at >= since,
      ).length;
    },
    async insert(identifier, action) {
      rows.push({ identifier, action, at: clock.now });
    },
  };
  return { db, rows, countCalls };
}

describe('checkAndLog', () => {
  it('permite enquanto a contagem é menor que o máximo e devolve o restante', async () => {
    const clock = { now: T0 };
    const { db, rows } = makeDb(clock);
    const opts = { identifier: '1.2.3.4', action: 'guest_upload_ip', windowMs: 600_000, max: 3, now: () => clock.now };

    expect(await checkAndLog(db, opts)).toEqual({ allowed: true, remaining: 2 });
    expect(await checkAndLog(db, opts)).toEqual({ allowed: true, remaining: 1 });
    expect(await checkAndLog(db, opts)).toEqual({ allowed: true, remaining: 0 });
    expect(rows).toHaveLength(3);
  });

  it('com max - 1 registros ainda permite (e registra o último permitido)', async () => {
    const clock = { now: T0 };
    const seed: Row[] = [
      { identifier: 'ip', action: 'a', at: T0 - 1000 },
      { identifier: 'ip', action: 'a', at: T0 - 500 },
    ];
    const { db, rows } = makeDb(clock, seed);

    const result = await checkAndLog(db, { identifier: 'ip', action: 'a', windowMs: 60_000, max: 3, now: () => clock.now });

    expect(result).toEqual({ allowed: true, remaining: 0 });
    expect(rows).toHaveLength(3);
  });

  it('com max registros bloqueia e NÃO insere', async () => {
    const clock = { now: T0 };
    const seed: Row[] = [
      { identifier: 'ip', action: 'a', at: T0 - 3000 },
      { identifier: 'ip', action: 'a', at: T0 - 2000 },
      { identifier: 'ip', action: 'a', at: T0 - 1000 },
    ];
    const { db, rows } = makeDb(clock, seed);

    const result = await checkAndLog(db, { identifier: 'ip', action: 'a', windowMs: 60_000, max: 3, now: () => clock.now });

    expect(result).toEqual({ allowed: false, remaining: 0 });
    expect(rows).toHaveLength(3);
  });

  it('acima do máximo também bloqueia com remaining 0 (nunca negativo)', async () => {
    const clock = { now: T0 };
    const seed: Row[] = Array.from({ length: 10 }, () => ({ identifier: 'ip', action: 'a', at: T0 - 10 }));
    const { db, rows } = makeDb(clock, seed);

    const result = await checkAndLog(db, { identifier: 'ip', action: 'a', windowMs: 60_000, max: 3, now: () => clock.now });

    expect(result).toEqual({ allowed: false, remaining: 0 });
    expect(rows).toHaveLength(10);
  });

  it('calcula o início da janela com o relógio injetado', async () => {
    const clock = { now: T0 };
    const { db, countCalls } = makeDb(clock);

    await checkAndLog(db, { identifier: 'ip', action: 'a', windowMs: 600_000, max: 3, now: () => clock.now });

    expect(countCalls).toEqual([
      { identifier: 'ip', action: 'a', sinceIso: '2026-09-24T11:50:00.000Z' },
    ]);
  });

  it('usa Date.now quando não há relógio injetado', async () => {
    const clock = { now: T0 };
    const { db, countCalls } = makeDb(clock);

    const before = Date.now();
    await checkAndLog(db, { identifier: 'ip', action: 'a', windowMs: 60_000, max: 3 });
    const after = Date.now();

    const since = Date.parse(countCalls[0].sinceIso);
    expect(since).toBeGreaterThanOrEqual(before - 60_000);
    expect(since).toBeLessThanOrEqual(after - 60_000);
  });

  it('registros fora da janela deixam de contar quando o tempo passa', async () => {
    const clock = { now: T0 };
    const { db } = makeDb(clock);
    const opts = { identifier: 'ip', action: 'a', windowMs: 60_000, max: 2, now: () => clock.now };

    expect((await checkAndLog(db, opts)).allowed).toBe(true);
    expect((await checkAndLog(db, opts)).allowed).toBe(true);
    expect((await checkAndLog(db, opts)).allowed).toBe(false);

    clock.now = T0 + 59_000; // ainda dentro da janela dos dois primeiros
    expect((await checkAndLog(db, opts)).allowed).toBe(false);

    clock.now = T0 + 61_000; // os dois registros saíram da janela
    expect(await checkAndLog(db, opts)).toEqual({ allowed: true, remaining: 1 });
  });

  it('separa a contagem por identificador e por ação', async () => {
    const clock = { now: T0 };
    const { db } = makeDb(clock);
    const base = { windowMs: 60_000, max: 1, now: () => clock.now };

    expect((await checkAndLog(db, { ...base, identifier: 'ip-1', action: 'a' })).allowed).toBe(true);
    expect((await checkAndLog(db, { ...base, identifier: 'ip-1', action: 'a' })).allowed).toBe(false);
    expect((await checkAndLog(db, { ...base, identifier: 'ip-2', action: 'a' })).allowed).toBe(true);
    expect((await checkAndLog(db, { ...base, identifier: 'ip-1', action: 'b' })).allowed).toBe(true);
  });

  it('insere exatamente uma vez, com identificador e ação, quando permite', async () => {
    const inserts: Array<[string, string]> = [];
    const db: RateLimitDb = {
      countSince: async () => 0,
      insert: async (identifier, action) => {
        inserts.push([identifier, action]);
      },
    };

    await checkAndLog(db, { identifier: 'wedding:abc', action: 'guest_upload_wedding', windowMs: 3_600_000, max: 3000 });

    expect(inserts).toEqual([['wedding:abc', 'guest_upload_wedding']]);
  });

  it('propaga o erro do banco na contagem sem inserir', async () => {
    let inserted = false;
    const db: RateLimitDb = {
      countSince: async () => {
        throw new Error('falha na consulta');
      },
      insert: async () => {
        inserted = true;
      },
    };

    await expect(
      checkAndLog(db, { identifier: 'ip', action: 'a', windowMs: 1000, max: 3 }),
    ).rejects.toThrow('falha na consulta');
    expect(inserted).toBe(false);
  });
});

describe('clientIp', () => {
  it('usa o primeiro item de x-forwarded-for, com trim', () => {
    const headers = new Headers({ 'x-forwarded-for': '  203.0.113.7 , 10.0.0.1, 10.0.0.2' });
    expect(clientIp(headers)).toBe('203.0.113.7');
  });

  it('x-forwarded-for tem prioridade sobre cf-connecting-ip', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7', 'cf-connecting-ip': '198.51.100.9' });
    expect(clientIp(headers)).toBe('203.0.113.7');
  });

  it('cai em cf-connecting-ip quando não há x-forwarded-for', () => {
    const headers = new Headers({ 'cf-connecting-ip': '198.51.100.9' });
    expect(clientIp(headers)).toBe('198.51.100.9');
  });

  it('cai em cf-connecting-ip quando x-forwarded-for não tem item aproveitável', () => {
    const headers = new Headers({ 'x-forwarded-for': ' , 10.0.0.1', 'cf-connecting-ip': '198.51.100.9' });
    expect(clientIp(headers)).toBe('198.51.100.9');
  });

  it('devolve "unknown" sem nenhum dos dois headers', () => {
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

// Cliente falso do Supabase: cada método do encadeamento registra a chamada e
// devolve o próprio construtor; `await` no construtor resolve com `result`.
function makeSupabaseFake(result: { count?: number | null; error?: { message: string } | null }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'insert']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  const client = {
    from(table: string) {
      calls.push({ method: 'from', args: [table] });
      return builder;
    },
  };
  return { client, calls };
}

describe('rateLimitDbFromSupabase', () => {
  const SINCE = '2026-09-24T11:50:00.000Z';

  it('countSince encadeia select/eq/eq/gte na tabela rate_limit_log e devolve o count', async () => {
    const { client, calls } = makeSupabaseFake({ count: 7, error: null });

    const count = await rateLimitDbFromSupabase(client).countSince('203.0.113.7', 'guest_upload_ip', SINCE);

    expect(count).toBe(7);
    expect(calls).toEqual([
      { method: 'from', args: ['rate_limit_log'] },
      { method: 'select', args: ['id', { count: 'exact', head: true }] },
      { method: 'eq', args: ['identifier', '203.0.113.7'] },
      { method: 'eq', args: ['action', 'guest_upload_ip'] },
      { method: 'gte', args: ['created_at', SINCE] },
    ]);
  });

  it('countSince trata count nulo como 0', async () => {
    const { client } = makeSupabaseFake({ count: null, error: null });
    expect(await rateLimitDbFromSupabase(client).countSince('ip', 'a', SINCE)).toBe(0);
  });

  it('countSince lança quando a consulta devolve erro, sem vazar o identificador', async () => {
    const ip = '203.0.113.7';
    const { client } = makeSupabaseFake({ count: null, error: { message: `boom para ${ip}` } });

    const promise = rateLimitDbFromSupabase(client).countSince(ip, 'guest_upload_ip', SINCE);

    await expect(promise).rejects.toThrow(Error);
    await promise.catch((err: Error) => {
      expect(err.message).not.toContain(ip);
      expect(String(err.stack)).not.toContain(ip);
    });
  });

  it('insert grava { identifier, action } em rate_limit_log', async () => {
    const { client, calls } = makeSupabaseFake({ error: null });

    await rateLimitDbFromSupabase(client).insert('203.0.113.7', 'guest_upload_ip');

    expect(calls).toEqual([
      { method: 'from', args: ['rate_limit_log'] },
      { method: 'insert', args: [{ identifier: '203.0.113.7', action: 'guest_upload_ip' }] },
    ]);
  });

  it('insert lança quando a gravação devolve erro, sem vazar o identificador', async () => {
    const ip = '203.0.113.7';
    const { client } = makeSupabaseFake({ error: { message: `violação para ${ip}` } });

    const promise = rateLimitDbFromSupabase(client).insert(ip, 'guest_upload_ip');

    await expect(promise).rejects.toThrow(Error);
    await promise.catch((err: Error) => {
      expect(err.message).not.toContain(ip);
      expect(String(err.stack)).not.toContain(ip);
    });
  });

  it('funciona ponta a ponta com checkAndLog: erro do banco derruba a verificação', async () => {
    const { client } = makeSupabaseFake({ count: null, error: { message: 'indisponível' } });

    await expect(
      checkAndLog(rateLimitDbFromSupabase(client), { identifier: 'ip', action: 'a', windowMs: 1000, max: 3 }),
    ).rejects.toThrow();
  });
});
