import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from './useAuth';

const mocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      getSession: mocks.getSession,
      signOut: vi.fn(),
    },
  },
}));
// O hook carrega o toast com `import()` dinâmico; o mock vale do mesmo jeito.
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }));

function renderAt(pathAndQuery: string) {
  window.history.replaceState({}, '', pathAndQuery);
  return renderHook(() => useAuth());
}

beforeEach(() => {
  mocks.onAuthStateChange.mockReset();
  mocks.getSession.mockReset();
  mocks.toast.mockReset();
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mocks.getSession.mockResolvedValue({ data: { session: null } });
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('useAuth: erro de OAuth na URL', () => {
  it('no login, mostra o toast "Erro no login" e limpa a query string (comportamento existente)', async () => {
    const { result } = renderAt('/login?error=access_denied&error_description=access_denied');

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: 'Erro no login',
        description: 'Você cancelou o login via provedor.',
        variant: 'destructive',
      }),
    );
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/login');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it('no retorno do Google do Drive, não mostra o toast nem reescreve a URL (a página trata o erro)', async () => {
    const { result } = renderAt('/dashboard/google-drive/callback?error=access_denied&state=s');

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Dá tempo ao `import()` dinâmico que dispararia o toast.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(window.location.search).toContain('error=access_denied');
    expect(window.location.search).toContain('state=s');
    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it('no retorno do Google do Drive sem erro (code e state), nada é mostrado', async () => {
    const { result } = renderAt('/dashboard/google-drive/callback?code=c&state=s');

    await waitFor(() => expect(result.current.loading).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?code=c&state=s');
    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
  });
});
