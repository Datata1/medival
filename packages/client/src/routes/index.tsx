import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Lobby } from '../features/lobby/Lobby.js';

export const Route = createFileRoute('/')({
    component: LobbyRoute,
});

function LobbyRoute() {
    const navigate = useNavigate();
    return (
        <div className="page">
            <Lobby
                onOpen={(worldId) =>
                    void navigate({
                        to: '/worlds/$worldId',
                        params: { worldId: String(worldId) },
                    })
                }
            />
        </div>
    );
}
