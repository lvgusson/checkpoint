import { bootstrapApplication } from '@angular/platform-browser';
import { Component, inject, provideAppInitializer } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  NavigationEnd,
  provideRouter,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { Library } from './library';
import { Queue } from './queue';
import { Detail } from './detail';
import { Settings } from './settings';
import { Wishlist } from './wishlist';
import { AppearancePage } from './appearance-page';
import { AppearanceStore } from './appearance';
import { Logo } from './logo';
import { AuthService } from './auth/auth.service';
import { authGuard, guestGuard } from './auth/auth.guard';
import { authInterceptor } from './auth/auth.interceptor';
import { Login } from './auth/login';

/** Destinos da navegação (barra lateral no desktop, barra inferior no celular). */
const NAV = [
  { path: '/jogos', icon: '▦', label: 'Lista de jogos', short: 'Jogos' },
  { path: '/ordem', icon: '≋', label: 'Ordem de jogos', short: 'Ordem' },
  { path: '/desejos', icon: '♡', label: 'Lista de desejos', short: 'Desejos' },
  { path: '/configuracoes', icon: '⚙', label: 'Regras da fila', short: 'Regras' },
  { path: '/aparencia', icon: '◐', label: 'Aparência e conta', short: 'Aparência' },
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Logo],
  template: `<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
    <div class="shell" [class.bare]="bare()">
      @if (!bare()) {
        <aside class="sidebar">
          <a class="brand" routerLink="/jogos"
            ><app-logo /><span>checkpoint<small>SUA BIBLIOTECA, SEU RITMO</small></span></a
          >
          <nav aria-label="Principal">
            @for (n of nav; track n.path) {
              <a [routerLink]="n.path" routerLinkActive="active" ariaCurrentWhenActive="page"
                ><span aria-hidden="true">{{ n.icon }}</span> {{ n.label }}</a
              >
            }
          </nav>
          @if (auth.user(); as user) {
            <div class="sidebar-note">
              <span class="account-email" [title]="user.email ?? ''">{{ user.email }}</span>
              <button type="button" class="button" (click)="auth.signOut()">Sair</button>
            </div>
          }
        </aside>
      }
      <div class="main">
        @if (!bare()) {
          <header class="topbar">
            <a class="brand compact" routerLink="/jogos" aria-label="Checkpoint, início"
              ><app-logo /><span>checkpoint</span></a
            ><span class="topbar-title">MEU ESPAÇO DE JOGOS</span>
            <button
              type="button"
              class="icon-button theme-toggle"
              (click)="toggleTheme()"
              [attr.aria-label]="
                appearance.resolved() === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'
              "
            >
              <span aria-hidden="true">{{ appearance.resolved() === 'dark' ? '☀' : '☾' }}</span>
            </button>
          </header>
        }
        <main id="conteudo" tabindex="-1"><router-outlet /></main>
        @if (!bare()) {
          <footer>Checkpoint <span>Feito para jogar no seu ritmo.</span></footer>
          <nav class="tabbar" aria-label="Principal">
            @for (n of nav; track n.path) {
              <a [routerLink]="n.path" routerLinkActive="active" ariaCurrentWhenActive="page"
                ><span aria-hidden="true">{{ n.icon }}</span
                >{{ n.short }}</a
              >
            }
          </nav>
        }
      </div>
    </div>`,
  // Telas de login/redefinição ocupam a página inteira (sem menu/topo).
  styles: `
    .shell.bare .main {
      margin-left: 0;
      width: 100%;
    }
    .shell.bare main {
      padding: 0;
      max-width: none;
    }
  `,
})
class App {
  readonly nav = NAV;
  protected auth = inject(AuthService);
  protected appearance = inject(AppearanceStore);
  private router = inject(Router);
  private url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: location.pathname },
  );
  bare = () => /^\/(login|redefinir-senha)(\?|#|$)/.test(this.url());
  toggleTheme() {
    this.appearance.update({ theme: this.appearance.resolved() === 'dark' ? 'light' : 'dark' });
  }
}
bootstrapApplication(App, {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    // Carrega /api/v1/config e restaura a sessão antes da 1ª navegação (guards já sabem se há login).
    provideAppInitializer(() => inject(AuthService).init()),
    // Aparência do usuário logado (o script do index.html já aplicou a última usada).
    provideAppInitializer(() => void inject(AppearanceStore)),
    provideRouter([
      { path: 'login', component: Login, canActivate: [guestGuard], data: { mode: 'login' } },
      { path: 'redefinir-senha', component: Login, data: { mode: 'reset' } },
      { path: 'jogos', component: Library, canActivate: [authGuard] },
      // Sem :listId, a tela redireciona para a lista padrão (ver routeListId em lists.ts).
      { path: 'ordem', component: Queue, canActivate: [authGuard] },
      { path: 'ordem/:listId', component: Queue, canActivate: [authGuard] },
      { path: 'jogos/:id', component: Detail, canActivate: [authGuard] },
      { path: 'desejos', component: Wishlist, canActivate: [authGuard] },
      { path: 'configuracoes', component: Settings, canActivate: [authGuard] },
      { path: 'configuracoes/:listId', component: Settings, canActivate: [authGuard] },
      { path: 'aparencia', component: AppearancePage, canActivate: [authGuard] },
      { path: '', redirectTo: 'jogos', pathMatch: 'full' },
      { path: '**', redirectTo: 'jogos' },
    ]),
  ],
}).catch(console.error);
