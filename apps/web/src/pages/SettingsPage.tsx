import { useParams } from 'react-router';
import { SettingsScreen } from '../features/settings/SettingsScreen';

// Keyed by list so notices and errors never leak across lists.
export function SettingsPage() {
  return <SettingsScreen key={useParams().listId} />;
}
