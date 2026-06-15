import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'welcome', pathMatch: 'full' },
  {
    path: 'welcome',
    loadComponent: () => import('./pages/welcome/welcome.component').then(m => m.WelcomeComponent),
  },
  {
    path: 'repo',
    loadComponent: () => import('./layout/repo-layout/repo-layout.component').then(m => m.RepoLayoutComponent),
    children: [
      { path: '', redirectTo: 'commits', pathMatch: 'full' },
      {
        path: 'commits',
        loadComponent: () => import('./pages/commits/commits.component').then(m => m.CommitsComponent),
      },
      {
        path: 'commits/:sha',
        loadComponent: () => import('./pages/commit-detail/commit-detail.component').then(m => m.CommitDetailComponent),
      },
      {
        path: 'date-editor',
        loadComponent: () => import('./pages/date-editor/date-editor.component').then(m => m.DateEditorComponent),
      },
      {
        path: 'batch',
        loadComponent: () => import('./pages/batch/batch.component').then(m => m.BatchComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings/settings.component').then(m => m.SettingsComponent),
      },
      {
        path: 'backups',
        loadComponent: () => import('./pages/backups/backups.component').then(m => m.BackupsComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'welcome' },
];
