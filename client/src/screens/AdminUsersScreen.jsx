import UsersTab from './users/UsersTab.jsx';
import ActivityTabImpl from './users/ActivityTab.jsx';

/**
 * Mobile Settings → "ניהול משתמשים" panel. Just wraps UsersTab in a
 * direction-rtl shell. Each piece of the underlying UI lives in its
 * own file under screens/users/.
 */
export default function AdminUsersScreen({ defaultFilter = 'all', onFilterConsumed }) {
  return (
    <div style={{ direction: 'rtl', padding: '16px 20px 24px' }}>
      <UsersTab defaultFilter={defaultFilter} onFilterConsumed={onFilterConsumed} />
    </div>
  );
}

// Re-export the activity log under its old name so other screens that did
// `import { ActivityTab } from './AdminUsersScreen.jsx'` keep working.
export const ActivityTab = ActivityTabImpl;
