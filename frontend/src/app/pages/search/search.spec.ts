import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Api } from '../../core/api';
import { ListSummary } from '../../core/models';
import { Search } from './search';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}
function summary(id: string): ListSummary {
  return {
    id,
    school: id,
    class_name: '1° básico',
    school_year: 2027,
    comuna: '',
    region: '',
    visibility: 'public',
    archived: false,
    hidden: false,
    current_version: 1,
    votes: 0,
    published_at: '',
    owner_name: 'Familia',
    role: '',
  };
}

describe('Search request ordering', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the latest results when an older request finishes afterward', async () => {
    const api = TestBed.inject(Api),
      older = deferred<ListSummary[]>(),
      latest = deferred<ListSummary[]>();
    vi.spyOn(api, 'get').mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise);
    const search = TestBed.runInInjectionContext(() => new Search());
    const first = search.search();
    const second = search.search();
    latest.resolve([summary('latest')]);
    await second;
    older.resolve([summary('older')]);
    await first;
    expect(search.lists().map((row) => row.id)).toEqual(['latest']);
    expect(search.loading()).toBe(false);
  });

  it('ignores stale failures and keeps loading until the current request completes', async () => {
    const api = TestBed.inject(Api),
      older = deferred<ListSummary[]>(),
      latest = deferred<ListSummary[]>();
    vi.spyOn(api, 'get').mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise);
    const search = TestBed.runInInjectionContext(() => new Search());
    const first = search.search();
    const second = search.search();
    older.reject(new Error('Old request failed'));
    await first;
    expect(api.error()).toBe('');
    expect(search.loading()).toBe(true);
    latest.resolve([summary('latest')]);
    await second;
    expect(search.loading()).toBe(false);
  });

  it('clears year validation feedback after correction and omits an empty year', async () => {
    const api = TestBed.inject(Api),
      get = vi.spyOn(api, 'get').mockResolvedValue([summary('valid')]);
    const search = TestBed.runInInjectionContext(() => new Search());
    search.model.update((model) => ({ ...model, school_year: 'bad' }));
    await search.search();
    expect(api.error()).toContain('cuatro cifras');
    expect(get).not.toHaveBeenCalled();
    search.model.update((model) => ({ ...model, school_year: '' }));
    await search.search();
    expect(api.error()).toBe('');
    expect(search.lists()[0].id).toBe('valid');
    expect(get.mock.calls[0][0]).not.toContain('school_year');
  });

  it('does not publish an in-flight failure after leaving the search page', async () => {
    const api = TestBed.inject(Api),
      request = deferred<ListSummary[]>();
    vi.spyOn(api, 'get').mockReturnValueOnce(request.promise);
    const search = TestBed.runInInjectionContext(() => new Search());
    const pending = search.search();
    search.ngOnDestroy();
    request.reject(new Error('Late failure'));
    await pending;
    expect(api.error()).toBe('');
  });
});
