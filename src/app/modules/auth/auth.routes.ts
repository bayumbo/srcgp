import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./pages/password/reset-password.component').then(m => m.ResetPasswordComponent)
  },
  {
    path: 'confirmar-cambio',
    loadComponent: () =>
      import('./pages/password/cambio-confirmado.component').then(m => m.CambioConfirmadoComponent)
  },
  {
    path: 'password-confirmed',
    loadComponent: () =>
      import('./pages/password/password-confirmed.component').then(m => m.PasswordConfirmedComponent)
  },
  
  
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
];

