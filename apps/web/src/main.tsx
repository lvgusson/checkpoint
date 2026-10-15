import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import './index.css';
import { AppearanceProvider } from './appearance/AppearanceProvider';
import { router } from './app/routes';
import { AuthProvider } from './auth/AuthProvider';
import { queryClient } from './query/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppearanceProvider>
          <RouterProvider router={router} />
        </AppearanceProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
