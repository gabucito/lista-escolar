import { Service, signal } from '@angular/core';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
@Service()
export class Api {
  readonly contentReset = signal(0);
  clearContent() {
    this.contentReset.update((value) => value + 1);
  }
  readonly denial = signal<{ path: string; status: number; sequence: number } | undefined>(
    undefined,
  );
  private denialSequence = 0;
  readonly error = signal('');
  readonly notice = signal('');
  async request<T>(method: string, path: string, body?: unknown, notifyDenial = true): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (method !== 'GET') headers['X-Requested-With'] = 'lista-escolar';
    if (body !== undefined && !(body instanceof FormData))
      headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await fetch('/api' + path, {
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        body:
          body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(
        0,
        'No pudimos conectar. Revisa tu conexión e inténtalo nuevamente; tus cambios aún no se han guardado.',
      );
    }
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (notifyDenial) this.reportDenial(path, response.status);
      const message =
        typeof data === 'object' && data !== null && 'error' in data
          ? String(data.error)
          : 'No se pudo completar la solicitud.';
      throw new ApiError(response.status, message);
    }
    return data as T;
  }
  get<T>(path: string, notifyDenial = true) {
    return this.request<T>('GET', path, undefined, notifyDenial);
  }
  reportDenial(path: string, status: number) {
    if ([401, 403, 404].includes(status))
      this.denial.set({ path, status, sequence: ++this.denialSequence });
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }
  put<T>(path: string, body: unknown) {
    return this.request<T>('PUT', path, body);
  }
  patch<T>(path: string, body: unknown) {
    return this.request<T>('PATCH', path, body);
  }
  delete<T>(path: string, body?: unknown) {
    return this.request<T>('DELETE', path, body);
  }
  fail(error: unknown) {
    this.notice.set('');
    this.error.set(error instanceof Error ? error.message : 'No se pudo completar la acción.');
  }
  success(message: string) {
    this.error.set('');
    this.notice.set(message);
  }
  clear() {
    this.error.set('');
    this.notice.set('');
  }
}
