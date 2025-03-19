import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
    {
        path: 'login',
        loadComponent: () => import('./pages/login/login.component').then(m => m.default)
    },
    {
        path: 'register',
        loadComponent: () => import('./pages/register/register.component').then(m => m.default)
    },
    { path: '', redirectTo: 'login', pathMatch: 'full' }
];