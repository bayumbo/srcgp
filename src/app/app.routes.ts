// src/app/app.routes.ts

import { Routes } from '@angular/router';
import { AUTH_ROUTES } from './modules/auth/auth.routes';
import { authGuard, publicGuard } from './core/auth/guards/auth.guard';
import { roleGuard } from './core/auth/guards/role.guard'; // Asegúrate de que la ruta de importación sea correcta
import { REPORTES_ROUTES } from './modules/reportes/reportes.routes';
import { CONTABILIDAD_ROUTES } from './modules/contabilidad/contabilidad.routes';

export const APP_ROUTES: Routes = [
  // 🔓 RUTAS PÚBLICAS (sin auth)
  {
    path: 'auth',
    canActivate: [publicGuard],
    children: AUTH_ROUTES,
  },

  // 🔐 RUTAS PROTEGIDAS (requieren login y usan el MainLayout)
  {
    path: '',
    canActivate: [authGuard], // Asegura que el usuario esté logueado
    loadComponent: () =>
      import('./shared/layouts/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
    children: [
      {
        path: '', // Ruta por defecto dentro del layout (el menú principal)
        loadComponent: () =>
          import('./modules/auth/pages/menu/menu.component').then(m => m.MenuComponent),
      },
      {
        path: 'perfil',
        // No necesita roleGuard aquí a menos que quieras restringir qué roles pueden ver el perfil de otros.
        // Asumo que todos los logueados pueden ver su propio perfil.
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./modules/administracion/pages/users/users.component').then(m => m.PerfilComponent),
          },
          {
            path: ':uid',
            loadComponent: () =>
              import('./modules/administracion/pages/users/users.component').then(m => m.PerfilComponent),
          },
        ],
      },
      {
        path: 'register',
        canActivate: [roleGuard],
        data: { roles: ['admin'] }, // Solo admin puede registrar usuarios
        loadComponent: () =>
          import('./modules/auth/pages/register/register.component').then(m => m.RegisterComponent),
      },
      {
        path: 'gestionroles',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'socio'] }, // <-- CORREGIDO: Admin Y Socio pueden acceder a Gestión de Roles
        loadComponent: () =>
          import('./modules/administracion/pages/GestionRoles/gestionroles.component').then(m => m.GestionRolesComponent),
      },
      {
        path: 'reportes',
        canActivate: [roleGuard], // <-- AÑADIDO: Control de rol para Reportes
        data: { roles: ['admin', 'socio', 'recaudador'] }, // Roles permitidos para Reportes
        children: REPORTES_ROUTES,
      },
      {
        path: 'contabilidad', // <-- MOVIDO: Ahora dentro del children del MainLayout
        canActivate: [roleGuard], // <-- AÑADIDO: Control de rol para Contabilidad
        data: { roles: ['admin', 'socio', 'recaudador'] }, // Roles permitidos para Contabilidad
        children: CONTABILIDAD_ROUTES,
      },
    ],
  },
  // Redirección para rutas no encontradas
  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full',
  },
];