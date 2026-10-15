import { testIdKey, testIdValue } from '@/components/ui/test-id';
import { zodResolver } from '@hookform/resolvers/zod';
import { ConfirmDialog } from '@checkpoint/ui-react';
import { useMemo, useState } from 'react';
import { useForm, useWatch, type FieldPath, type Resolver } from 'react-hook-form';
import { Link } from 'react-router';
import type {
  Desire,
  QueueFilters,
  ScoringConfig,
  ScoringFactor,
  ScoringSettings,
  ScoringSection,
} from '../../../../../packages/core/src/models';
import { errorMessage } from '../../query/errors';
import { ListPicker, useRouteListId } from '../lists';
import { useResetScoringSettings, useSaveScoringSettings, useScoringSettings } from '../scoring';
import { FormulaPanel } from './FormulaPanel';
import {
  SECTIONS,
  desireRemoved,
  formatDate,
  hasValue,
  hoursRemoved,
  num,
  scoringSchema,
} from './settingsForm';
import './settings.css';
import { CatalogSettings } from './CatalogSettings';

type ListFilter = 'excludedGenres' | 'excludedTags' | 'stores' | 'paces';

/** Per-list scoring configuration: weights, rules and content filters, saved as one config. */
export function SettingsScreen() {
  const listId = useRouteListId('/configuracoes');
  const query = useScoringSettings(listId);
  const settings = query.data;
  if (!settings || !listId) {
    return (
      <div className="settings">
        <Heading />
        {listId && <ListPicker base="/configuracoes" current={listId} />}
        {query.isError ? (
          <div className="error" role="alert">
            Não foi possível carregar as configurações. Confira se a API está no ar.
            <button data-testid="settings-retry" type="button" onClick={() => void query.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : (
          <div className="empty">Carregando configurações…</div>
        )}
      </div>
    );
  }
  // Mounted only with data (defaults are ready on first render); remounts per list.
  return <SettingsForm key={listId} listId={listId} settings={settings} />;
}

function SettingsForm({ listId, settings }: { listId: string; settings: ScoringSettings }) {
  const save = useSaveScoringSettings();
  const reset = useResetScoringSettings();
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const saving = save.isPending || reset.isPending;

  const resolver = useMemo(
    () =>
      // The schema validates only the edited subset of the config; the form value type is the full config.
      zodResolver(scoringSchema(settings.factors)) as unknown as Resolver<ScoringConfig>,
    [settings.factors],
  );
  const form = useForm<ScoringConfig>({
    defaultValues: settings.config,
    resolver,
    mode: 'onChange',
  });
  const { register, control, setValue, reset: resetForm, formState } = form;
  const { isDirty, errors } = formState;
  const weights = useWatch({ control, name: 'weights' }) ?? settings.config.weights;
  const filters = useWatch({ control, name: 'filters' }) ?? settings.config.filters;
  const rules = useWatch({ control, name: 'rules' }) ?? settings.config.rules;
  const d = useMemo(() => ({ weights, filters, rules }), [weights, filters, rules]);

  const invalid = Object.keys(errors).length > 0;
  const o = settings.filterOptions;
  const rows = (section: ScoringSection) =>
    settings.factors.filter((f) => f.section === section && f.id !== 'inProgress');
  const hoursInvalid = !!errors.filters;
  const activeFilters = JSON.stringify(filters) !== JSON.stringify(settings.defaults.filters);
  const setFilters = (patch: Partial<QueueFilters>) => {
    setSuccess('');
    return (
      Object.entries(patch) as [keyof QueueFilters, QueueFilters[keyof QueueFilters]][]
    ).forEach(([key, value]) =>
      setValue(`filters.${key}` as FieldPath<ScoringConfig>, value as never, {
        shouldDirty: true,
        shouldValidate: true,
      }),
    );
  };
  const toggleIn = (key: ListFilter, value: string) =>
    setFilters({
      [key]: hasValue(filters[key], value)
        ? filters[key].filter(
            (x) => x.toLocaleLowerCase('pt-BR') !== value.toLocaleLowerCase('pt-BR'),
          )
        : [...filters[key], value],
    });
  const pick = (key: ListFilter, option: { value: string; count: number }, cls = '') => (
    <button
      data-testid={`settings-filter-${testIdKey(key)}-${testIdValue(option.value)}`}
      key={option.value}
      type="button"
      className={'pick ' + cls}
      aria-pressed={hasValue(filters[key], option.value)}
      disabled={saving}
      onClick={() => toggleIn(key, option.value)}
    >
      {option.value} <small>{option.count}</small>
    </button>
  );

  async function persist(run: () => Promise<ScoringSettings>, message: string) {
    setError('');
    setSuccess('');
    try {
      resetForm((await run()).config); // new baseline from the saved copy
      setSuccess(message);
    } catch (e) {
      setError(
        'Não foi possível salvar' +
          (e instanceof Error && e.message ? ': ' + errorMessage(e) : '.'),
      );
    }
  }
  const onSave = () =>
    persist(
      () => save.mutateAsync({ listId: listId, config: form.getValues() }),
      'Configuração salva. A fila desta lista foi recalculada.',
    );
  const onReset = () => {
    setConfirmReset(false);
    return persist(
      () => reset.mutateAsync({ listId: listId }),
      'Padrão restaurado. A fila desta lista foi recalculada.',
    );
  };

  const weightRow = (f: ScoringFactor) => {
    const key = f.weight!;
    const bad = !!errors.weights?.[key];
    return (
      <>
        <label className={'number' + (bad ? ' invalid' : '')}>
          <input
            data-testid={`settings-weight-${testIdKey(key)}`}
            type="number"
            min={f.min}
            max={f.max}
            step={f.step}
            disabled={saving}
            aria-label={'Peso: ' + f.label}
            aria-invalid={bad}
            {...register(`weights.${key}`, { valueAsNumber: true })}
          />
          <span>{f.unit}</span>
        </label>
        {bad && (
          <small className="hint">
            {num(f.min)} a {num(f.max)}
          </small>
        )}
      </>
    );
  };

  const hoursInput = (key: 'minHours' | 'maxHours', label: string, text: string) => (
    <label className={'number' + (hoursInvalid ? ' invalid' : '')}>
      {text}
      <input
        data-testid={`settings-filter-${testIdKey(key)}`}
        type="number"
        min="0"
        max="10000"
        step="1"
        placeholder="—"
        disabled={saving}
        aria-label={label}
        {...register(`filters.${key}`, {
          setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
        })}
      />
      <span>h</span>
    </label>
  );

  return (
    // Any edit (bubbled change event, or setFilters) dismisses the success notice.
    <div className="settings" onChange={() => setSuccess('')}>
      <Heading />
      <CatalogSettings />
      <ListPicker base="/configuracoes" current={listId} />
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="reorder-notice" role="status">
          <span>
            {success}{' '}
            <Link data-testid="settings-open-queue" to={`/ordem/${listId}`}>
              Ver a fila ↗
            </Link>
          </span>
          <button
            data-testid="settings-notice-close"
            type="button"
            onClick={() => setSuccess('')}
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      )}

      <FormulaPanel d={d} context={rows('context')} />

      {SECTIONS.map((s) => (
        <section key={s.id} className="panel settings-section" aria-labelledby={'sec-' + s.id}>
          <h2 id={'sec-' + s.id}>{s.title}</h2>
          <p className="muted">{s.hint}</p>
          <table className="factors">
            <thead>
              <tr>
                <th scope="col">Fator</th>
                <th scope="col" className="desc">
                  Descrição
                </th>
                <th scope="col">Peso</th>
                <th scope="col">Ativo</th>
              </tr>
            </thead>
            <tbody>
              {rows(s.id).map((f) => (
                <tr key={f.id} className={f.rule && !rules[f.rule] ? 'off' : undefined}>
                  <th scope="row">{f.label}</th>
                  <td className="desc">{f.description}</td>
                  <td className="weight">
                    {f.weight ? weightRow(f) : <span className="muted">—</span>}
                  </td>
                  <td className="toggle">
                    {f.rule ? (
                      <label className="switch">
                        <input
                          data-testid={`settings-rule-${testIdKey(f.id)}`}
                          type="checkbox"
                          role="switch"
                          disabled={saving}
                          aria-label={'Regra ativa: ' + f.label}
                          {...register(`rules.${f.rule}`)}
                        />
                        <span aria-hidden="true"></span>
                      </label>
                    ) : (
                      <span className="muted small">sempre</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <section className="panel settings-section" aria-labelledby="sec-content-filters">
        <h2 id="sec-content-filters">Filtros de conteúdo</h2>
        <p className="muted">
          Recorte a fila para montar listas temáticas. Os números mostram quantos dos {o.total}{' '}
          candidatos cada escolha tira da fila.
          {activeFilters && (
            <button
              data-testid="settings-filters-clear"
              type="button"
              className="link"
              disabled={saving}
              onClick={() => setFilters(structuredClone(settings.defaults.filters))}
            >
              Limpar filtros
            </button>
          )}
        </p>

        <fieldset className="filter-group">
          <legend>Excluir gêneros</legend>
          <div className="chips">{o.genres.map((g) => pick('excludedGenres', g, 'exclude'))}</div>
        </fieldset>

        <fieldset className="filter-group">
          <legend>Duração (horas previstas)</legend>
          <div className="hours">
            {hoursInput('minHours', 'Horas mínimas', 'mín.')}
            {hoursInput('maxHours', 'Horas máximas', 'máx.')}
            <label className="check">
              <input
                data-testid="settings-filter-exclude-unknown-hours"
                type="checkbox"
                disabled={saving}
                {...register('filters.excludeUnknownHours')}
              />
              Tirar jogos sem tempo estimado
            </label>
            <span className="removed">−{hoursRemoved(d, o.hours)} jogos</span>
          </div>
          {hoursInvalid && (
            <small className="hint">Use horas de 0 a 10.000, com o mínimo até o máximo.</small>
          )}
          <p className="muted small">
            Horas previstas = estimativa (história + extras, ou só história) × seu ritmo; é o mesmo
            número que a fila mostra e soma. Sem limite = campo vazio.
          </p>
        </fieldset>

        <fieldset className="filter-group">
          <legend>
            Só estas lojas <small>(nenhuma marcada = todas)</small>
          </legend>
          <div className="chips">{o.stores.map((s) => pick('stores', s))}</div>
        </fieldset>

        <fieldset className="filter-group">
          <legend>
            Só estes ritmos <small>(nenhum marcado = todos)</small>
          </legend>
          <div className="chips">{o.paces.map((p) => pick('paces', p))}</div>
        </fieldset>

        <fieldset className="filter-group inline">
          <legend>Vontade e companhia</legend>
          <label className="select">
            Vontade mínima
            <select
              data-testid="settings-filter-min-desire"
              disabled={saving}
              {...register('filters.minDesire', {
                setValueAs: (v) => (v || null) as Desire | null,
              })}
            >
              <option value="">Qualquer</option>
              {o.desires.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.value} ou mais
                </option>
              ))}
            </select>
            <span className="removed">−{desireRemoved(d, o.desires)} jogos</span>
          </label>
          <label className="check">
            <input
              data-testid="settings-filter-coop-only"
              type="checkbox"
              disabled={saving}
              {...register('filters.coopOnly')}
            />
            Só jogos com coop (local ou online) <small>{o.coop} jogos</small>
          </label>
        </fieldset>

        <details className="filter-group" open={filters.excludedTags.length > 0 || undefined}>
          <summary data-testid="settings-filter-tags">
            Excluir subgêneros/tags ({filters.excludedTags.length})
          </summary>
          <div className="chips">{o.tags.map((t) => pick('excludedTags', t, 'exclude'))}</div>
        </details>
      </section>

      <div className="save-bar settings-actions">
        <span>
          {saving
            ? 'Salvando…'
            : invalid
              ? 'Corrija os valores destacados.'
              : isDirty
                ? 'Alterações não salvas.'
                : `Versão ${settings.version} salva${settings.updatedAt ? ' em ' + formatDate(settings.updatedAt) : ' (padrão)'}.`}
        </span>
        <div className="actions">
          <button
            data-testid="settings-reset"
            type="button"
            className="button"
            onClick={() => setConfirmReset(true)}
            disabled={saving}
          >
            Restaurar padrão
          </button>
          <button
            data-testid="settings-discard"
            type="button"
            className="button"
            onClick={() => resetForm(settings.config)}
            disabled={!isDirty || saving}
          >
            Descartar
          </button>
          <button
            data-testid="settings-save"
            type="button"
            className="button primary"
            onClick={() => void onSave()}
            disabled={!isDirty || invalid || saving}
          >
            Salvar
          </button>
        </div>
      </div>
      <ConfirmDialog
        data-testid="dialog-settings-reset"
        open={confirmReset}
        title="Restaurar o padrão?"
        description="Voltar todos os pesos, regras e filtros desta lista para o padrão?"
        confirmLabel="Restaurar"
        onConfirm={() => void onReset()}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

function Heading() {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">COMO A FILA É CALCULADA</span>
        <h1>
          Configurações<span className="heading-dot">.</span>
        </h1>
        <p>
          Cada lista tem os próprios pesos e regras. Ajuste o peso de cada fator e desligue as
          regras que não fazem sentido para esta lista.
        </p>
      </div>
    </div>
  );
}
