import { bootstrapApplication } from '@angular/platform-browser';
import { Component, inject, provideAppInitializer, signal } from '@angular/core';
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
import { AuthService } from './auth/auth.service';
import { authGuard, guestGuard } from './auth/auth.guard';
import { authInterceptor } from './auth/auth.interceptor';
import { Login } from './auth/login';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `<div class="shell" [class.bare]="bare()">
    @if (!bare()) {
      <aside [class.open]="menu()">
        <a class="brand" routerLink="/jogos" (click)="menu.set(false)"
          ><span class="brand-mark">C<span>•</span></span
          ><span>checkpoint<small>SUA BIBLIOTECA, SEU RITMO</small></span></a
        >
        <div class="nav-label">BIBLIOTECA</div>
        <nav>
          <a routerLink="/jogos" routerLinkActive="active" (click)="menu.set(false)"
            ><span>▦</span> Lista de jogos</a
          ><a routerLink="/ordem" routerLinkActive="active" (click)="menu.set(false)"
            ><span>≋</span> Ordem de jogos</a
          ><a routerLink="/desejos" routerLinkActive="active" (click)="menu.set(false)"
            ><span>♡</span> Lista de desejos</a
          ><a routerLink="/configuracoes" routerLinkActive="active" (click)="menu.set(false)"
            ><span>⚙</span> Configurações</a
          >
        </nav>
        <div class="sidebar-note">
          <span class="dot"></span> Biblioteca local
          <p>Uma boa partida de cada vez.</p>
          @if (auth.user(); as user) {
            <div class="account">
              <span class="account-email" [title]="user.email ?? ''">{{ user.email }}</span>
              <button type="button" class="button" (click)="auth.signOut()">Sair</button>
            </div>
          }
        </div>
      </aside>
      @if (menu()) {
        <button class="scrim" aria-label="Fechar menu" (click)="menu.set(false)"></button>
      }
    }
    <div class="main">
      @if (!bare()) {
        <header class="topbar">
          <button
            class="icon-button hamburger"
            aria-label="Abrir menu"
            [attr.aria-expanded]="menu()"
            (click)="menu.set(!menu())"
          >
            ☰</button
          ><span>MEU ESPAÇO DE JOGOS</span
          ><span class="local-pill"><span class="dot"></span> Salvo neste computador</span>
        </header>
      }
      <main><router-outlet /></main>
      @if (!bare()) {
        <footer>Checkpoint <span>Feito para jogar no seu ritmo.</span></footer>
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
    .account {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
    }
    .account-email {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .account .button {
      padding: 7px 10px;
      font-size: 11px;
    }
  `,
})
class App {
  menu = signal(false);
  protected auth = inject(AuthService);
  private router = inject(Router);
  private url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: location.pathname },
  );
  bare = () => /^\/(login|redefinir-senha)(\?|#|$)/.test(this.url());
}
bootstrapApplication(App, {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    // Carrega /api/v1/config e restaura a sessão antes da 1ª navegação (guards já sabem se há login).
    provideAppInitializer(() => inject(AuthService).init()),
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
      { path: '', redirectTo: 'jogos', pathMatch: 'full' },
      { path: '**', redirectTo: 'jogos' },
    ]),
  ],
}).catch(console.error);
