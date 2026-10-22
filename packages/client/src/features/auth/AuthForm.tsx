import { Link } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { useStores } from '../../stores/StoreContext.js';

/**
 * Anmelden oder Konto anlegen (plans/19-prototyp/19-8).
 *
 * Ein Formular für beides: Name und Passwort, dazu ein Verweis auf den
 * jeweils anderen Weg. Ein `<form>` statt loser Felder, damit Enter abschickt
 * und Passwortmanager das Formular erkennen.
 */
export const AuthForm = observer(function AuthForm({
    mode,
    onDone,
}: {
    mode: 'login' | 'register';
    onDone: () => void;
}) {
    const { t } = useTranslation();
    const { auth } = useStores();
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');

    const submit = async () => {
        const ok =
            mode === 'login'
                ? await auth.login(name, password)
                : await auth.register(name, password);
        if (ok) onDone();
    };

    return (
        <Card>
            <h2>
                {mode === 'login'
                    ? t('auth.loginTitle')
                    : t('auth.registerTitle')}
            </h2>
            <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                }}
            >
                <label className="flex flex-col gap-1">
                    {t('auth.name')}
                    <input
                        autoComplete="username"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </label>
                <label className="flex flex-col gap-1">
                    {t('auth.password')}
                    <input
                        type="password"
                        autoComplete={
                            mode === 'login'
                                ? 'current-password'
                                : 'new-password'
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </label>
                {mode === 'register' && (
                    <p className="m-0 text-ink-light text-sm">
                        {t('auth.passwordHint')}{' '}
                        {t('auth.firstIsAdmin')}
                    </p>
                )}
                <Button type="submit" disabled={auth.isSubmitting}>
                    {mode === 'login'
                        ? t('auth.login')
                        : t('auth.register')}
                </Button>
                {auth.error && (
                    <p className="m-0 text-seal">{auth.error}</p>
                )}
            </form>
            <p className="mb-0">
                {mode === 'login' ? (
                    <Link
                        to="/register"
                        onClick={() => auth.clearError()}
                    >
                        {t('auth.toRegister')}
                    </Link>
                ) : (
                    <Link to="/login" onClick={() => auth.clearError()}>
                        {t('auth.toLogin')}
                    </Link>
                )}
            </p>
        </Card>
    );
});
