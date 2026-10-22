import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AuthForm } from '../features/auth/AuthForm.js';

function RegisterRoute() {
    const navigate = useNavigate();
    return (
        <div className="page mx-auto max-w-lg">
            <AuthForm
                mode="register"
                onDone={() => void navigate({ to: '/' })}
            />
        </div>
    );
}

export const Route = createFileRoute('/register')({
    component: RegisterRoute,
});
