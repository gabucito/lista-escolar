import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Api, ApiError } from './api';
describe('API boundary', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sends same-origin credentials and the mutation request header, without caching', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const api = TestBed.inject(Api);
    await api.post('/lists', { school: 'Colegio' });
    expect(fetch).toHaveBeenCalledWith(
      '/api/lists',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: expect.objectContaining({ 'X-Requested-With': 'lista-escolar' }),
      }),
    );
  });
  it('surfaces scoped access denial and suppresses recursive revalidation notifications', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"error":"Sin acceso"}', { status: 403 })),
    );
    const api = TestBed.inject(Api);
    await expect(api.get('/lists/private')).rejects.toBeInstanceOf(ApiError);
    expect(api.denial()?.path).toBe('/lists/private');
    const sequence = api.denial()?.sequence;
    await expect(api.get('/lists/private', false)).rejects.toBeInstanceOf(ApiError);
    expect(api.denial()?.sequence).toBe(sequence);
  });
});
