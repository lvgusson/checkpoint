import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  can,
  Permission,
  Role,
  roleFromAppMetadata,
} from '../../../../../packages/core/src/authorization';
import {
  metadataFields,
  type MetadataCategory,
  type MetadataCatalog,
} from '../../../../../packages/core/src/metadata';
import { useAuth } from '../../auth/AuthProvider';
import { api } from '../../api/http';
import { errorMessage } from '../../query/errors';

const labels: Record<MetadataCategory, string> = {
  genres: 'Gêneros',
  tags: 'Tags',
  mechanics: 'Mecânicas',
  stores: 'Lojas',
  paces: 'Ritmos',
  structures: 'Estruturas',
  platforms: 'Plataformas',
};
export function CatalogSettings() {
  const auth = useAuth();
  const role = auth.enabled ? roleFromAppMetadata(auth.user?.app_metadata) : Role.Admin;
  return can(role, Permission.CatalogUpdate) ? <CatalogEditor userId={auth.userId} /> : null;
}
function CatalogEditor({ userId }: { userId: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [userId, 'config-options'],
    queryFn: ({ signal }) => api.get<MetadataCatalog>('config/options', { signal }),
  });
  const [category, setCategory] = useState<MetadataCategory>('genres');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function change(method: 'post' | 'delete', value: string) {
    setBusy(true);
    setError('');
    try {
      const catalog = await api[method]<MetadataCatalog>('config/options/' + category, {
        json: { name: value },
      });
      client.setQueryData([userId, 'config-options'], catalog);
      await client.invalidateQueries({ queryKey: [userId, 'catalog'] });
      if (method === 'post') setName('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-section" aria-labelledby="catalog-heading">
      <h2 id="catalog-heading">Opções do catálogo</h2>
      <p>As opções valem para todos os usuários. Só é possível excluir opções sem uso.</p>
      <label>
        Categoria{' '}
        <select
          value={category}
          disabled={busy}
          onChange={(e) => setCategory(e.target.value as MetadataCategory)}
        >
          {Object.keys(metadataFields).map((key) => (
            <option key={key} value={key}>
              {labels[key as MetadataCategory]}
            </option>
          ))}
        </select>
      </label>
      {query.isError && <p role="alert">Não foi possível carregar as opções.</p>}
      {error && <p role="alert">{error}</p>}
      <ul>
        {query.data?.[category].map((value) => (
          <li key={value}>
            {value}{' '}
            <button
              type="button"
              disabled={busy}
              aria-label={'Excluir ' + value}
              onClick={() => void change('delete', value)}
            >
              Excluir
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void change('post', name);
        }}
      >
        <label>
          Nova opção{' '}
          <input
            value={name}
            maxLength={category === 'tags' || category === 'stores' ? 80 : 120}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy || !name.trim() || !query.data}>
          Adicionar
        </button>
      </form>
    </section>
  );
}
