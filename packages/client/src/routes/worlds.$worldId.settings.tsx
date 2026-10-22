import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SettingsView } from '../features/world/SettingsView.js';
import { useStores } from '../stores/StoreContext.js';

export const Route = createFileRoute('/worlds/$worldId/settings')({
    component: SettingsRoute,
});

function SettingsRoute() {
    const navigate = useNavigate();
    const stores = useStores();
    return (
        <SettingsView
            onExit={() => void navigate({ to: '/' })}
            onLogout={() =>
                void stores.auth
                    .logout()
                    .then(() => navigate({ to: '/login' }))
            }
        />
    );
}
