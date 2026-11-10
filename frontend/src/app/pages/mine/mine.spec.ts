import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Api } from '../../core/api';
import { Session } from '../../core/session';
import { ListSummary } from '../../core/models';
import { Mine } from './mine';

function list(id: string, changes: Partial<ListSummary> = {}): ListSummary {
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
    following: false,
    ...changes,
  };
}

describe('Personal list filters', () => {
  function page() {
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: {} },
        { provide: Session, useValue: {} },
        { provide: Router, useValue: {} },
      ],
    });
    return TestBed.runInInjectionContext(() => new Mine());
  }

  it('includes followed lists independently of ownership or editing permissions', () => {
    const mine = page();
    mine.lists.set([
      list('owned', { role: 'owner', following: true }),
      list('edited', { role: 'editor', following: true }),
      list('public', { following: true }),
      list('not-followed', { role: 'viewer' }),
    ]);
    mine.selected.set('following');
    expect(mine.visibleLists().map((item) => item.id)).toEqual(['owned', 'edited', 'public']);
    expect(mine.count('shared')).toBe(2);
    expect(mine.count('owner')).toBe(1);
  });

  it('does not infer a follow from a missing role or an older summary without the flag', () => {
    const mine = page();
    mine.lists.set([list('old-response', { following: undefined }), list('not-followed')]);
    mine.selected.set('following');
    expect(mine.visibleLists()).toEqual([]);
  });

  it('combines the selected relationship with the status filter', () => {
    const mine = page();
    mine.lists.set([
      list('published', { role: 'owner' }),
      list('draft', { role: 'owner', current_version: 0 }),
      list('archive', { role: 'owner', archived: true }),
      list('shared', { role: 'editor' }),
    ]);
    mine.selected.set('owner');
    mine.filter.set({ status: 'published' });
    expect(mine.visibleLists().map((item) => item.id)).toEqual(['published']);
    mine.filter.set({ status: 'draft' });
    expect(mine.visibleLists().map((item) => item.id)).toEqual(['draft']);
    mine.filter.set({ status: 'archived' });
    expect(mine.visibleLists().map((item) => item.id)).toEqual(['archive']);
  });
});
