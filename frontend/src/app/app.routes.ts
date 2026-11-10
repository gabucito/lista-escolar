import { inject } from '@angular/core';
import { CanActivateFn, Routes, Router } from '@angular/router';
import { Session } from './core/session';
const signedIn: CanActivateFn = async (_route, state) => {
  const session = inject(Session),
    router = inject(Router);
  await session.ready;
  return session.user()
    ? true
    : router.createUrlTree(['/ingresar'], { queryParams: { next: state.url } });
};
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/search/search').then((m) => m.Search),
    title: 'Busca tu lista · Lista Escolar',
  },
  {
    path: 'ingresar',
    loadComponent: () => import('./pages/auth/auth').then((m) => m.Auth),
    title: 'Ingresar · Lista Escolar',
  },
  {
    path: 'registro',
    loadComponent: () => import('./pages/auth/auth').then((m) => m.Auth),
    title: 'Crear cuenta · Lista Escolar',
  },
  {
    path: 'mis-listas',
    canActivate: [signedIn],
    loadComponent: () => import('./pages/mine/mine').then((m) => m.Mine),
    title: 'Mis listas · Lista Escolar',
  },
  {
    path: 'crear',
    canActivate: [signedIn],
    loadComponent: () => import('./pages/editor/editor').then((m) => m.Editor),
    title: 'Crear lista · Lista Escolar',
  },
  {
    path: 'editar/:id',
    canActivate: [signedIn],
    canDeactivate: [(component: { canLeave: () => boolean }) => component.canLeave()],
    loadComponent: () => import('./pages/editor/editor').then((m) => m.Editor),
    title: 'Editar lista · Lista Escolar',
  },
  {
    path: 'listas/:id/compartir',
    canActivate: [signedIn],
    loadComponent: () => import('./pages/share/share').then((m) => m.Share),
    title: 'Compartir · Lista Escolar',
  },
  {
    path: 'listas/:id',
    loadComponent: () => import('./pages/list/list').then((m) => m.List),
    title: 'Lista de útiles · Lista Escolar',
  },
  {
    path: 'cuenta',
    canActivate: [signedIn],
    loadComponent: () => import('./pages/account/account').then((m) => m.Account),
    title: 'Mi cuenta · Lista Escolar',
  },
  {
    path: 'invitaciones/:token',
    canActivate: [signedIn],
    loadComponent: () => import('./pages/invitation/invitation').then((m) => m.Invitation),
    title: 'Invitación · Lista Escolar',
  },
  {
    path: 'solicitar/:token',
    canActivate: [signedIn],
    loadComponent: () => import('./pages/invitation/invitation').then((m) => m.Invitation),
    title: 'Solicitar acceso · Lista Escolar',
  },
  {
    path: 'invitacion/:token',
    canActivate: [signedIn],
    loadComponent: () => import('./pages/invitation/invitation').then((m) => m.Invitation),
    title: 'Invitación · Lista Escolar',
  },
  {
    path: 'solicitar-acceso/:token',
    canActivate: [signedIn],
    loadComponent: () => import('./pages/invitation/invitation').then((m) => m.Invitation),
    title: 'Solicitar acceso · Lista Escolar',
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin/admin').then((m) => m.Admin),
    title: 'Administración · Lista Escolar',
  },
  { path: '**', redirectTo: '' },
];
