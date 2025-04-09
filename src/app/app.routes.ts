import { Routes } from '@angular/router';
import { AUTH_ROUTES } from './modules/auth/auth.routes';
import { authGuard, publicGuard } from './core/auth/guards/auth.guard';
import { REPORTES_ROUTES } from './modules/reportes/reportes.routes';
import {CONTABILIDAD_ROUTES} from './modules/contabilidad/contabilidad.routes';

export const APP_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./modules/auth/pages/menu/menu.component').then(
        (m) => m.MenuComponent
      ),
  },
  {
    path: 'register',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./modules/auth/pages/register/register.component').then(
        (m) => m.RegisterComponent
      ),
  },
  {
    path: 'auth',
    canActivate: [publicGuard],
    children: AUTH_ROUTES,
  },
  
  {
    path: 'contabilidad',
    canActivate: [authGuard],
    children: CONTABILIDAD_ROUTES,
  },

  {
    path: 'reportes',
    canActivate: [authGuard],
    children: REPORTES_ROUTES,
  },

  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full',
  },
  
];
