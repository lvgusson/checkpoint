import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@checkpoint/ui-react';
import type { Desire, SteamPrice } from '../../../../../packages/core/src/models';
import { badgeColor } from '../metadata';
import { formatPrice, useSteamSearch, useWishlist, useWishlistActions } from './wishlist';
import './wishlist.css';

const DESIRES: Desire[] = ['Muito Alta', 'Alta', 'Média', 'Baixa', 'Muito Baixa'];
import { compareWishlistItems, type WishlistSort } from '../../../../../packages/core/src/wishlist';

const original = (p: SteamPrice) => formatPrice({ ...p, finalCents: p.initialCents });
const messageOf = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

export function WishlistScreen() {
  const { wishlist, genres } = useWishlist();
  const actions = useWishlistActions();
  const [q, setQ] = useState('');
  const [desire, setDesire] = useState<Desire>('Média');
  const [profile, setProfile] = useState('');
  const [sort, setSort] = useState<WishlistSort>('name');
  const [manual, setManual] = useState({ name: '', primaryGenre: '', mainHours: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const search = useSteamSearch(q);

  const sorted = useMemo(
    () => [...(wishlist.data ?? [])].sort(compareWishlistItems(sort)),
    [wishlist.data, sort],
  );
  const onSale = sorted.filter((i) => i.price?.discountPercent).length;
  const busy =
    actions.add.isPending ||
    actions.purchase.isPending ||
    actions.importSteam.isPending ||
    actions.refreshPrices.isPending;
  const shownError =
    error ||
    (wishlist.isError && !wishlist.data
      ? messageOf(wishlist.error, 'Não foi possível carregar a lista de desejos.')
      : '') ||
    (search.error ? messageOf(search.error, 'Busca na Steam indisponível.') : '');

  async function run(action: () => Promise<string>) {
    setError('');
    setNotice('');
    try {
      setNotice(await action());
    } catch (e) {
      setError(messageOf(e, 'Algo deu errado. Tente de novo.'));
    }
  }

  const addFromSteam = (appId: number) =>
    run(async () => {
      const res = await actions.add.mutateAsync({ appId, desire });
      setQ('');
      return res.created
        ? `${res.game.name} entrou na lista de desejos.`
        : `${res.game.name} já está no app (${res.game.status}).`;
    });

  const addManual = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const body: Record<string, unknown> = { name: manual.name, desire };
      if (manual.primaryGenre.trim()) body['primaryGenre'] = manual.primaryGenre;
      if (manual.mainHours !== '') body['mainHours'] = Number(manual.mainHours);
      const res = await actions.add.mutateAsync(body);
      setManual({ name: '', primaryGenre: '', mainHours: '' });
      return res.created ? `${res.game.name} cadastrado.` : `${res.game.name} já está no app.`;
    });
  };

  const importSteam = () =>
    run(async () => {
      const r = await actions.importSteam.mutateAsync(profile);
      const failed = r.failed.length ? `, ${r.failed.length} fora da loja` : '';
      return `Lista da Steam: ${r.total} itens, ${r.created} novos, ${r.existing} já estavam no app${failed}.`;
    });

  const refresh = () =>
    run(async () => {
      await actions.refreshPrices.mutateAsync();
      return 'Preços atualizados.';
    });

  return (
    <div className="wishlist">
      <div className="page-heading">
        <div>
          <span className="eyebrow">O QUE VEM DEPOIS</span>
          <h1>
            Lista de desejos<span className="heading-dot">.</span>
          </h1>
          <p>Jogos que você ainda não tem, com o preço atual da Steam.</p>
        </div>
        <button type="button" className="button" onClick={() => void refresh()} disabled={busy}>
          Atualizar preços <span>↻</span>
        </button>
      </div>

      <section className="filters add">
        <label className="search">
          <span>⌕</span>
          <input
            aria-label="Buscar na Steam"
            placeholder="Buscar na Steam pelo nome…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
        </label>
        <select
          aria-label="Vontade de jogar"
          value={desire}
          onChange={(e) => setDesire(e.target.value as Desire)}
        >
          {DESIRES.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        {search.results.length > 0 ? (
          <ul className="results" role="listbox">
            {search.results.map((r) => (
              <li key={r.appId}>
                <button type="button" onClick={() => void addFromSteam(r.appId)} disabled={busy}>
                  {r.imageUrl && <img src={r.imageUrl} alt="" />}
                  <span className="name">{r.name}</span>
                  <span className="muted">{formatPrice(r.price)}</span>
                  <span className="plus">+ Adicionar</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          search.searching && <p className="muted">Buscando…</p>
        )}
        <details>
          <summary>Cadastrar sem a Steam</summary>
          <form className="manual" onSubmit={(e) => void addManual(e)}>
            <input
              aria-label="Nome"
              placeholder="Nome do jogo"
              value={manual.name}
              onChange={(e) => setManual({ ...manual, name: e.target.value })}
              required
            />
            <select
              aria-label="Gênero"
              value={manual.primaryGenre}
              onChange={(e) => setManual({ ...manual, primaryGenre: e.target.value })}
            >
              <option value="">Sem gênero</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <input
              aria-label="Horas"
              type="number"
              min="0"
              placeholder="Horas (campanha)"
              value={manual.mainHours}
              onChange={(e) => setManual({ ...manual, mainHours: e.target.value })}
            />
            <button className="button" disabled={busy || !manual.name.trim()}>
              Cadastrar
            </button>
          </form>
        </details>
        <details>
          <summary>Importar minha lista de desejos da Steam</summary>
          <div className="manual">
            <input
              aria-label="Perfil da Steam"
              placeholder="SteamID64 ou URL do perfil (vazio = perfil configurado)"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
            />
            <button
              type="button"
              className="button primary"
              onClick={() => void importSteam()}
              disabled={busy}
            >
              Importar
            </button>
          </div>
          <p className="muted">
            A lista precisa estar pública (Steam › Privacidade › Detalhes dos jogos: Público).
          </p>
        </details>
      </section>

      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {shownError && (
        <div className="error" role="alert">
          {shownError}
        </div>
      )}

      <div className="list-toolbar">
        <span>
          {sorted.length} desejados
          {onSale > 0 && <span className="muted"> · {onSale} em promoção</span>}
          {wishlist.isFetching && <span className="muted"> · carregando</span>}
        </span>
        <label>
          Ordenar
          <select
            aria-label="Ordenação"
            value={sort}
            onChange={(e) => setSort(e.target.value as WishlistSort)}
          >
            <option value="name">Nome A–Z</option>
            <option value="discount">Maior desconto</option>
            <option value="price">Menor preço</option>
            <option value="recommendation">Recomendação</option>
          </select>
        </label>
      </div>
      <div className="game-grid">
        {sorted.map((i) => (
          <article className="game-card" key={i.game.id}>
            <Link
              to={`/jogos/${encodeURIComponent(i.game.id)}`}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <div className="cover" data-genre={i.game.primaryGenre}>
                {i.game.coverUrl && (
                  <img
                    src={i.game.coverUrl}
                    alt=""
                    loading="lazy"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
                <span className="cover-fallback">{i.game.name.slice(0, 1)}</span>
                {!!i.price?.discountPercent && (
                  <span className="badge cover-status green">-{i.price.discountPercent}%</span>
                )}
              </div>
              <div className="card-body">
                <div className="card-store">{i.game.store || 'Sem loja'}</div>
                <h2>{i.game.name}</h2>
                {i.description && <p className="description">{i.description}</p>}
                <div className="tags">
                  {i.game.primaryGenre && (
                    <span className={'badge ' + badgeColor(i.game.primaryGenre)}>
                      {i.game.primaryGenre}
                    </span>
                  )}
                  {i.game.secondaryTags.slice(0, 2).map((t) => (
                    <span key={t} className={'badge ' + badgeColor(t)}>
                      {t}
                    </span>
                  ))}
                </div>
                <div className="card-bottom">
                  <span className="price">
                    {!!i.price?.discountPercent && !!i.price.initialCents && (
                      <s>{original(i.price)}</s>
                    )}
                    <strong>{formatPrice(i.price)}</strong>
                  </span>
                  <span className={'badge ' + badgeColor(i.game.desire)}>{i.game.desire}</span>
                </div>
              </div>
            </Link>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await actions.purchase.mutateAsync(i.game.id);
                  return `${i.game.name} entrou na biblioteca.`;
                })
              }
            >
              Comprei
            </button>
          </article>
        ))}
      </div>
      {!sorted.length && !wishlist.isFetching && (
        <EmptyState
          title="Nenhum desejo ainda"
          description="Busque um jogo na Steam ou importe sua lista de desejos."
        />
      )}
    </div>
  );
}
