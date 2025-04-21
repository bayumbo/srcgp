import { Routes } from '@angular/router';
import { AUTH_ROUTES } from './modules/auth/auth.routes';
import { authGuard, publicGuard } from './core/auth/guards/auth.guard';
import { roleGuard } from './core/auth/guards/role.guard';
import { REPORTES_ROUTES } from './modules/reportes/reportes.routes';
import {CONTABILIDAD_ROUTES} from './modules/contabilidad/contabilidad.routes';

export const APP_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./shared/layouts/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./modules/auth/pages/menu/menu.component').then(m => m.MenuComponent),
      },
      {
        path: 'perfil',
        children:[
          {
            path:'',
            loadComponent: () =>
              import('./modules/administracion/pages/users/users.component').then(m => m.PerfilComponent),
          },
          {
            path: ':uid',
      loadComponent: () =>
        import('./modules/administracion/pages/users/users.component').then(
          m => m.PerfilComponent
        ),
          },
        ]  
      },
      {
        path: 'register',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        loadComponent: () =>
          import('./modules/auth/pages/register/register.component').then(m => m.RegisterComponent),
      },
      {
        path: 'gestionroles',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        loadComponent: () =>
          import('./modules/administracion/pages/GestionRoles/gestionroles.component').then(m => m.GestionRolesComponent),
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
]
},
];
