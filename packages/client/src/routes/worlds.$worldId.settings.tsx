import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SettingsView } from '../features/world/SettingsView.js';

export const Route = createFileRoute('/worlds/$worldId/settings')({
    component: SettingsRoute,
});

function SettingsRoute() {
    const navigate = useNavigate();
    return <SettingsView onExit={() => void navigate({ to: '/' })} />;
}
