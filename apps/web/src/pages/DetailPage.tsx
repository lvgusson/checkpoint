import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { Catalog, ScoredGame } from '../../../../packages/core/src/models';
import { api, isApiError } from '../api/http';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { FinishDialog } from '../features/finish-dialog';
import { AppLoader } from '../features/loader/AppLoader';
import { MetadataBadge, MetadataSelect } from '../features/metadata';
import { useGameWriter } from '../features/playing';
import { PrerequisiteSearch } from '../features/prerequisite-search';
import { useQueryKeys } from '../query/keys';
import './detail.css';

/** Fields sent to PATCH /games/:id when they changed. */
const FIELDS = [
  'name',
  'primaryGenre',
  'status',
  'desire',
  'actualHours',
  'finishedAt',
  'startedAt',
  'rating',
  'notes',
  'secondaryTags',
  'pace',
  'mechanic',
  'structure',
  'store',
  'platform',
  'mainHours',
  'extraHours',
  'completionistHours',
  'prerequisiteId',
] as const;
const NULLABLE_WHEN_EMPTY = ['finishedAt', 'startedAt', 'prerequisiteId'];
const SHARED_FIELD_FORBIDDEN =
  'Você não tem permissão para alterar dados compartilhados do catálogo.';

function safeDecode(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

export function DetailPage() {
  const { id: rawId = '' } = useParams();
  const id = safeDecode(rawId).trim();
  const back = useSearchParams()[0].get('from') === 'ordem' ? '/ordem' : '/jogos';
  const k = useQueryKeys();
  const writer = useGameWriter();
  const gameQuery = useQuery({
    queryKey: k.game(id),
    queryFn: ({ signal }) => api.get<ScoredGame>('games/' + encodeURIComponent(id), { signal }),
    enabled: Boolean(id),
  });
  const catalogQuery = useQuery({
    queryKey: k.catalog(),
    queryFn: ({ signal }) => api.get<Catalog>('catalog', { signal }),
  });
  const game = gameQuery.data;
  const catalog = catalogQuery.data;

  // `edits` is null while the form is untouched, so cached/refetched data shows through; once the user edits, it is kept.
  const [edits, setEdits] = useState<ScoredGame | null>(null);
  const [autoFinish, setAutoFinish] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [finishing, setFinishing] = useState(false);

  const isLoading = Boolean(id) && (gameQuery.isLoading || catalogQuery.isLoading);
  const isNotFound = !isLoading && Boolean(id) && !gameQuery.isError && !game;
  const isGameError = gameQuery.isError && !game;
  const isCatalogError = catalogQuery.isError && !catalog;
  const error =
    saveError ||
    (!id
      ? 'Jogo não encontrado.'
      : isGameError
        ? isApiError(gameQuery.error) && gameQuery.error.status === 404
          ? 'Jogo não encontrado.'
          : 'Não foi possível carregar o jogo.'
        : isCatalogError
          ? 'Não foi possível carregar os dados do catálogo.'
          : isNotFound
            ? 'Jogo não encontrado.'
            : '');
  const form = edits ?? game;
  const set = <K extends keyof ScoredGame>(key: K, value: ScoredGame[K]) =>
    game && setEdits({ ...(edits ?? game), [key]: value });
  const num = (key: 'actualHours' | 'mainHours' | 'extraHours' | 'completionistHours') => ({
    value: form?.[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(key, e.target.value === '' ? null : Number(e.target.value)),
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!game || !form) return;
    setSaving(true);
    setSaveError('');
    setSaved(false);
    try {
      if (form.secondaryTags.length > 3) throw new Error('Use até três tags secundárias.');
      const patch: Record<string, unknown> = {};
      for (const key of FIELDS) {
        let v: unknown = form[key];
        if (NULLABLE_WHEN_EMPTY.includes(key) && v === '') v = null;
        if (JSON.stringify(v) !== JSON.stringify(game[key])) patch[key] = v;
      }
      if (Object.hasOwn(patch, 'rating')) patch['autoFinish'] = autoFinish;
      await writer.save(game.id, patch);
      setEdits(null);
      setSaved(true);
    } catch (e) {
      setSaveError(
        isApiError(e) && e.status === 403
          ? SHARED_FIELD_FORBIDDEN
          : e instanceof Error
            ? e.message
            : 'Não foi possível salvar.',
      );
    } finally {
      setSaving(false);
    }
  }

  const g = game;
  const formattedJson = useMemo(() => (g ? JSON.stringify(g, null, 2) : ''), [g]);
  return (
    <div className="detail-page">
      <Link data-testid="detail-back" className="back-link" to={back}>
        ← {back === '/ordem' ? 'Voltar para a ordem de jogos' : 'Voltar para a biblioteca'}
      </Link>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {g && form ? (
        <>
          <div className="detail-hero">
            <div className="detail-cover">
              {g.coverUrl && (
                <img
                  src={g.coverUrl}
                  alt=""
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              )}
              <span>{g.name.slice(0, 1)}</span>
            </div>
            <div>
              <span className="eyebrow">
                {g.store} · {g.platform}
              </span>
              <h1>{g.name}</h1>
              <div className="tags">
                <MetadataBadge kind="status" value={g.status} />
                <MetadataBadge kind="genre" value={g.primaryGenre} />
                {g.secondaryTags.map((t) => (
                  <MetadataBadge key={t} kind="tag" value={t} />
                ))}
              </div>
              <p className="muted">
                {g.pace} · {g.structure} · {g.coop}
              </p>
              {g.status !== 'Finalizado' && g.status !== 'Desejado' && (
                <button
                  data-testid="detail-finish"
                  type="button"
                  className="button primary finish-open"
                  onClick={() => setFinishing(true)}
                >
                  ✓ Finalizar jogo
                </button>
              )}
            </div>
          </div>
          <form data-testid="detail-form" className="detail-form" onSubmit={save}>
            <div className="detail-layout">
              <div>
                <section className="panel">
                  <span className="eyebrow">SUA EXPERIÊNCIA</span>
                  <h2>Como foi a partida?</h2>
                  <p className="muted">Sua avaliação ajuda a escolher os próximos jogos.</p>
                  <div className="field-label" id="rating-label">
                    Nota pessoal
                    <span>{form.rating ?? 'Sem nota'} / 5</span>
                  </div>
                  <div className="stars" role="group" aria-labelledby="rating-label">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        data-testid={`detail-rating-${n}`}
                        key={n}
                        type="button"
                        className={(form.rating ?? 0) >= n ? 'selected' : undefined}
                        aria-label={`Nota ${n} de 5`}
                        aria-pressed={form.rating === n}
                        onClick={() => set('rating', n)}
                      >
                        ★
                      </button>
                    ))}
                    <button
                      data-testid="detail-rating-clear"
                      className="clear-rating"
                      type="button"
                      onClick={() => set('rating', null)}
                    >
                      Limpar
                    </button>
                  </div>
                  <label className="checkbox">
                    <input
                      data-testid="detail-auto-finish"
                      type="checkbox"
                      name="autoFinish"
                      checked={autoFinish}
                      onChange={(e) => setAutoFinish(e.target.checked)}
                    />{' '}
                    Ao dar uma nova nota, marcar como finalizado
                  </label>
                  <div className="form-grid">
                    <MetadataSelect
                      data-testid="detail-status"
                      label="Status"
                      kind="status"
                      options={catalog?.statuses ?? []}
                      value={form.status}
                      onValueChange={(v) =>
                        catalog?.statuses.includes(v as ScoredGame['status']) &&
                        set('status', v as ScoredGame['status'])
                      }
                    />
                    <MetadataSelect
                      data-testid="detail-desire"
                      label="Vontade de jogar"
                      kind="desire"
                      options={catalog?.desires ?? []}
                      value={form.desire}
                      onValueChange={(v) =>
                        catalog?.desires.includes(v as ScoredGame['desire']) &&
                        set('desire', v as ScoredGame['desire'])
                      }
                    />
                    <label>
                      Horas para finalizar
                      <input
                        data-testid="detail-actual-hours"
                        type="number"
                        name="actual"
                        min={0}
                        max={100000}
                        step={0.1}
                        placeholder="Seu tempo real"
                        {...num('actualHours')}
                      />
                    </label>
                    <label>
                      Data de conclusão
                      <DateTimePicker
                        data-testid="detail-finished-at"
                        id="game-finish"
                        mode="date"
                        placeholder="dd/mm/aaaa"
                        value={form.finishedAt || null}
                        onChange={(v) => set('finishedAt', v ?? '')}
                      />
                    </label>
                    <label>
                      Data de início
                      <DateTimePicker
                        data-testid="detail-started-at"
                        id="game-start"
                        mode="date"
                        placeholder="dd/mm/aaaa"
                        value={form.startedAt || null}
                        onChange={(v) => set('startedAt', v ?? '')}
                      />
                    </label>
                  </div>
                  <label>
                    O que você achou?
                    <textarea
                      data-testid="detail-notes"
                      name="notes"
                      value={form.notes}
                      onChange={(e) => set('notes', e.target.value)}
                      rows={5}
                      placeholder="O que vale lembrar sobre este jogo?"
                    />
                  </label>
                </section>
                <section className="panel metadata">
                  <span className="eyebrow">CLASSIFICAÇÃO</span>
                  <h2>Metadados do jogo</h2>
                  <div className="form-grid">
                    <label>
                      Nome
                      <input
                        data-testid="detail-name"
                        name="name"
                        value={form.name}
                        onChange={(e) => set('name', e.target.value)}
                        required
                      />
                    </label>
                    <MetadataSelect
                      data-testid="detail-genre"
                      label="Gênero principal"
                      kind="genre"
                      options={catalog?.genres ?? []}
                      value={form.primaryGenre}
                      onValueChange={(v) => set('primaryGenre', v)}
                    />
                    <MetadataSelect
                      data-testid="detail-tags"
                      multiple
                      label="Tags secundárias"
                      kind="tag"
                      options={catalog?.tags ?? []}
                      values={form.secondaryTags}
                      onValuesChange={(v) => set('secondaryTags', v)}
                    />
                    <MetadataSelect
                      data-testid="detail-pace"
                      label="Ritmo"
                      kind="pace"
                      options={catalog?.paces ?? []}
                      value={form.pace}
                      onValueChange={(v) => set('pace', v)}
                    />
                    <MetadataSelect
                      data-testid="detail-mechanic"
                      label="Mecânica"
                      kind="mechanic"
                      options={catalog?.mechanics ?? []}
                      value={form.mechanic}
                      onValueChange={(v) => set('mechanic', v)}
                    />
                    <MetadataSelect
                      data-testid="detail-structure"
                      label="Estrutura"
                      kind="structure"
                      options={catalog?.structures ?? []}
                      value={form.structure}
                      onValueChange={(v) => set('structure', v)}
                    />
                    <MetadataSelect
                      data-testid="detail-store"
                      label="Loja"
                      kind="store"
                      options={catalog?.stores ?? []}
                      value={form.store}
                      onValueChange={(v) => set('store', v)}
                    />
                    <MetadataSelect
                      data-testid="detail-platform"
                      label="Plataforma"
                      kind="platform"
                      options={catalog?.platforms ?? []}
                      value={form.platform}
                      onValueChange={(v) => set('platform', v)}
                    />
                    <label>
                      Campanha principal (h)
                      <input
                        data-testid="detail-main-hours"
                        type="number"
                        name="main"
                        min={0}
                        step={0.1}
                        {...num('mainHours')}
                      />
                    </label>
                    <label>
                      Campanha + extras (h)
                      <input
                        data-testid="detail-extra-hours"
                        type="number"
                        name="extra"
                        min={0}
                        step={0.1}
                        {...num('extraHours')}
                      />
                    </label>
                    <label>
                      100% (h)
                      <input
                        data-testid="detail-completionist-hours"
                        type="number"
                        name="complete"
                        min={0}
                        step={0.1}
                        {...num('completionistHours')}
                      />
                    </label>
                    <PrerequisiteSearch
                      excludeId={g.id}
                      value={form.prerequisiteId}
                      onValueChange={(v) => set('prerequisiteId', v)}
                    />
                  </div>
                </section>
                <div className="save-bar">
                  <span role="status">
                    {saved
                      ? 'Salvo. A ordem já foi recalculada.'
                      : 'Salvar recalcula a ordem de todas as listas.'}
                  </span>
                  <button
                    data-testid="detail-notes-save"
                    className="button primary"
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? (
                      <AppLoader layout="inline" size="sm" label="Salvando…" />
                    ) : (
                      'Salvar avaliação'
                    )}
                  </button>
                </div>
              </div>
              <aside className="detail-side">
                <section className="panel">
                  <span className="eyebrow">PRIORIDADE PESSOAL</span>
                  <div className="big-score">
                    {g.baseScore}
                    <small>pontos de base</small>
                  </div>
                  <dl>
                    <div>
                      <dt>Afinidade com seu gosto</dt>
                      <dd>{g.affinity} / 100</dd>
                    </div>
                    <div>
                      <dt>Tempo no seu ritmo</dt>
                      <dd>{g.plannedHours === null ? 'A confirmar' : g.plannedHours + ' h'}</dd>
                    </div>
                    <div>
                      <dt>Horas na Steam</dt>
                      <dd>{g.steamHours === null ? '—' : g.steamHours + ' h'}</dd>
                    </div>
                    <div>
                      <dt>Steam App ID</dt>
                      <dd>{g.steamAppId ?? '—'}</dd>
                    </div>
                  </dl>
                  <p className="muted small">
                    A posição final inclui o contexto dos jogos anteriores; ela pode variar em
                    relação à pontuação de base.
                  </p>
                  <Link data-testid="detail-open-queue" className="button full" to="/ordem">
                    Ver ordem de jogos →
                  </Link>
                </section>
                <section className="panel">
                  <h3>Referências da planilha</h3>
                  <p className="muted small">
                    {g.timeVerification || 'Estimativa sem verificação'} · {g.size}
                  </p>
                  {/^https?:\/\//.test(g.timeSource) && (
                    <a
                      data-testid="detail-time-source"
                      href={g.timeSource}
                      target="_blank"
                      rel="noopener"
                    >
                      Fonte dos tempos ↗
                    </a>
                  )}
                  <p className="small">{g.reviewNotes}</p>
                  <details>
                    <summary data-testid="detail-imported-data">Todos os dados importados</summary>
                    <pre>{formattedJson}</pre>
                  </details>
                </section>
              </aside>
            </div>
          </form>
          {finishing && (
            <FinishDialog
              game={g}
              onClose={(didSave) => {
                setFinishing(false);
                if (didSave) {
                  setEdits(null);
                  setSaved(true);
                }
              }}
            />
          )}
        </>
      ) : isLoading ? (
        <div className="empty" role="status">
          <AppLoader data-testid="loader-detail" size={48} label="Carregando jogo…" fill="block" />
        </div>
      ) : !error ? (
        <div className="empty">Jogo não encontrado.</div>
      ) : null}
    </div>
  );
}
