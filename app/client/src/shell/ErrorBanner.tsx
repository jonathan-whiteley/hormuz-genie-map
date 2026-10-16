import { useAppConfig } from '../lib/appConfig';
import { useData } from '../data/DataContext';
import { errorLine } from './queryTables';

export function ErrorBanner() {
  const { dataset } = useData();
  const config = useAppConfig();
  if (dataset.errors.length === 0) return null;
  const where = config ? `${config.catalog}.${config.schema}` : 'the data schema';
  return (
    <div
      role="alert"
      style={{
        background: '#FDECEA',
        borderLeft: '4px solid var(--lava-600)',
        padding: 'var(--space-2)',
        color: 'var(--navy-900)',
      }}
    >
      {dataset.errors.map((e) => (
        <p key={e.query} style={{ margin: 0 }}>
          {errorLine(e.query, e.message, where)}
        </p>
      ))}
    </div>
  );
}
