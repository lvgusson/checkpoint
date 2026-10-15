import { createBrowserRouter, Navigate } from 'react-router';
import { GuestOnly, RequireAuth } from '../auth/guards';
import { AppearancePage } from '../pages/AppearancePage';
import { DetailPage } from '../pages/DetailPage';
import { LibraryPage } from '../pages/LibraryPage';
import { LoginPage } from '../pages/LoginPage';
import { QueuePage } from '../pages/QueuePage';
import { SettingsPage } from '../pages/SettingsPage';
import { WishlistPage } from '../pages/WishlistPage';
import { Shell } from './Shell';

/** Same URL space as the Angular app. Without :listId, queue/settings resolve the default list themselves. */
export const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { element: <GuestOnly />, children: [{ path: 'login', element: <LoginPage /> }] },
      { path: 'redefinir-senha', element: <LoginPage initialMode="reset" /> },
      {
        element: <RequireAuth />,
        children: [
          { path: 'jogos', element: <LibraryPage /> },
          { path: 'jogos/:id', element: <DetailPage /> },
          { path: 'ordem', element: <QueuePage /> },
          { path: 'ordem/:listId', element: <QueuePage /> },
          { path: 'desejos', element: <WishlistPage /> },
          { path: 'configuracoes', element: <SettingsPage /> },
          { path: 'configuracoes/:listId', element: <SettingsPage /> },
          { path: 'aparencia', element: <AppearancePage /> },
        ],
      },
      { index: true, element: <Navigate replace to="/ordem" /> },
      { path: '*', element: <Navigate replace to="/ordem" /> },
    ],
  },
]);
