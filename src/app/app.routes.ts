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
      import('./shared/layouts/main-layout/main-layout.component').then(m => m.LayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./modules/auth/pages/menu/menu.component').then(m => m.MenuComponent),
      },
      {
        path: 'perfil',
        loadComponent: () =>
          import('./modules/administracion/pages/users/users.component').then(m => m.PerfilComponent),
      },
      {
        path: 'register',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        loadComponent: () =>
          import('./modules/auth/pages/register/register.component').then(m => m.RegisterComponent),
      },
      
      //{
        //path: 'usuarios',
        //canActivate: [roleGuard],
        //data: { roles: ['admin'] },
        //loadComponent: () =>
          //import('./modules/contabilidad/pages/indexconta/indexconta.component').then(
           // m => m.IndexContaComponent
         // ),
      //},
      //{
        //path: 'cargas',
        //canActivate: [roleGuard],
        //data: { roles: ['admin'] },
        //loadComponent: () =>
          //import('./modules/administracion/pages/data-carga/data-carga.component').then(
            //m => m.DataCargaComponent
          //),
     // }
    ]
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
