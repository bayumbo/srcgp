import { Routes } from '@angular/router';
import { AUTH_ROUTES } from './modules/auth/auth.routes';
import { authGuard, publicGuard } from './core/auth/guards/auth.guard';

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
    path: '**',
    redirectTo: '',
    pathMatch: 'full',
  },
];
