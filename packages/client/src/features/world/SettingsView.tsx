import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { Icon } from '../../components/Icon.js';
import { Table, Td, Th } from '../../components/Table.js';
import { useStores } from '../../stores/StoreContext.js';

/**
 * Einstellungen (plans/18-ux/18-1-rahmen-und-kopfzeile.md, ausgebaut in 18-5).
 *
 * Ton und Pause standen zuerst in der Kopfzeile. Dort brachen sie die
 * Symmetrie der Reiter, und die Lautstärke ist nichts, was man mitten im Spiel
 * ständig braucht — sie gehört hierher. Ticket 18-5 ergänzt das Löschen der
 * Welt und die restlichen Weltparameter.
 */
export const SettingsView = observer(function SettingsView({
    onExit,
    onLogout,
}: {
    onExit: () => void;
    /** Abmelden (19-8). */
    onLogout?: () => void;
}) {
    const { t } = useTranslation();
    const { world, sound, auth, lobby } = useStores();
    const summary = world.summary;

    return (
        <div>
            <h1>{t('nav.settings')}</h1>

            <Card>
                <h2>{t('settings.sound')}</h2>
                <div className="flex flex-wrap items-center gap-4">
                    <Button
                        onClick={() => sound.toggleMuted()}
                        aria-pressed={sound.muted}
                    >
                        <span className="inline-flex items-center gap-1.5">
                            <Icon
                                name={
                                    sound.muted
                                        ? 'icon.sound.off'
                                        : 'icon.sound.on'
                                }
                            />
                            {sound.muted
                                ? t('sound.unmute')
                                : t('sound.mute')}
                        </span>
                    </Button>
                    <label className="flex items-center gap-2">
                        {t('sound.volume')}
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={Math.round(sound.volume * 100)}
                            onChange={(e) =>
                                sound.setVolume(
                                    Number(e.target.value) / 100,
                                )
                            }
                            aria-label={t('sound.volume')}
                            className="w-40"
                        />
                        <span className="tabular-nums">
                            {Math.round(sound.volume * 100)} %
                        </span>
                    </label>
                    {/* Ohne Probe stellt man die Lautstärke blind ein. */}
                    <Button variant="tab" onClick={() => sound.click()}>
                        {t('settings.testSound')}
                    </Button>
                </div>
            </Card>

            <Card>
                <h2>{t('settings.world')}</h2>
                <div className="flex flex-wrap items-center gap-4">
                    {/* Pause nur im Entwicklermodus (19-3): In einer
                        Mehrspielerwelt hielte sie die Welt für alle an. */}
                    {world.devMode && (
                        <Button
                            onClick={() => void world.togglePause()}
                        >
                            <span className="inline-flex items-center gap-1.5">
                                <Icon
                                    name={
                                        world.isRunning
                                            ? 'icon.pause'
                                            : 'icon.play'
                                    }
                                />
                                {world.isRunning
                                    ? t('world.pause')
                                    : t('world.resume')}
                            </span>
                        </Button>
                    )}
                    <span className="text-ink-light">
                        {world.summary?.status === 'ended'
                            ? t('settings.ended')
                            : world.isRunning
                              ? t('settings.running')
                              : t('settings.paused')}
                    </span>
                    <Button variant="danger" onClick={onExit}>
                        {t('world.backToLobby')}
                    </Button>
                    {onLogout && (
                        <Button variant="tab" onClick={onLogout}>
                            {t('auth.logout')}
                        </Button>
                    )}
                </div>
            </Card>

            {summary && (
                <Card>
                    <h2>{t('settings.parameters')}</h2>
                    {/* Nur lesbar: Weltparameter stehen beim Anlegen fest. */}
                    <p className="text-ink-light">
                        {t('settings.parametersHint')}
                    </p>
                    <Table>
                        <tbody>
                            <tr>
                                <Th>{t('settings.speed')}</Th>
                                <Td className="tabular-nums">
                                    {summary.settings.speed}×
                                </Td>
                            </tr>
                            <tr>
                                <Th>{t('settings.unitSpeed')}</Th>
                                <Td className="tabular-nums">
                                    {summary.settings.unitSpeed}×
                                </Td>
                            </tr>
                            <tr>
                                <Th>{t('settings.mapSize')}</Th>
                                <Td className="tabular-nums">
                                    {summary.settings.mapSize} ×{' '}
                                    {summary.settings.mapSize}
                                </Td>
                            </tr>
                            <tr>
                                <Th>{t('settings.bots')}</Th>
                                <Td className="tabular-nums">
                                    {summary.settings.botCount}
                                </Td>
                            </tr>
                            <tr>
                                <Th>{t('settings.barbarians')}</Th>
                                <Td className="tabular-nums">
                                    {summary.settings.barbarianCount}
                                </Td>
                            </tr>
                            <tr>
                                <Th>{t('settings.density')}</Th>
                                <Td className="tabular-nums">
                                    {summary.settings.settlementDensity}
                                </Td>
                            </tr>
                            <tr>
                                <Th>
                                    {t('settings.barbariansPerSettler')}
                                </Th>
                                <Td className="tabular-nums">
                                    {
                                        summary.settings
                                            .barbariansPerSettler
                                    }
                                </Td>
                            </tr>
                            <tr>
                                <Th>{t('settings.barbarianRate')}</Th>
                                <Td className="tabular-nums">
                                    {t('settings.perHour', {
                                        count: summary.settings
                                            .barbarianAttemptsPerHour,
                                    })}
                                </Td>
                            </tr>
                            <tr>
                                <Th>{t('settings.archers')}</Th>
                                <Td>
                                    {summary.settings.archers
                                        ? t('settings.on')
                                        : t('settings.off')}
                                </Td>
                            </tr>
                            <tr>
                                <Th>{t('settings.paladin')}</Th>
                                <Td>
                                    {summary.settings.paladin
                                        ? t('settings.on')
                                        : t('settings.off')}
                                </Td>
                            </tr>
                            <tr>
                                <Th>{t('settings.victory')}</Th>
                                <Td className="tabular-nums">
                                    {t('settings.victoryShare', {
                                        percent: Math.round(
                                            summary.settings
                                                .victoryVillageShare *
                                                100,
                                        ),
                                    })}
                                </Td>
                            </tr>
                            {/* Aus dem Startwert entsteht das Gelände
                                (18-3): Mit ihm lässt sich eine Welt
                                nachbauen. */}
                            <tr>
                                <Th>{t('settings.seed')}</Th>
                                <Td className="tabular-nums">
                                    {summary.settings.seed}
                                </Td>
                            </tr>
                        </tbody>
                    </Table>
                </Card>
            )}

            {/* Löschen darf nur der Verwalter, der Server prüft das auch
                (19-8). Anderen den Knopf zu zeigen hieße, ihnen einen
                Fehler anzubieten. */}
            {summary && auth.isAdmin && (
                <Card>
                    <h2 className="text-seal!">
                        {t('settings.dangerZone')}
                    </h2>
                    <p className="text-ink-light">
                        {t('settings.deleteHint')}
                    </p>
                    <Button
                        variant="danger"
                        onClick={() => {
                            if (
                                !confirm(
                                    t('lobby.confirmDelete', {
                                        name: summary.name,
                                    }),
                                )
                            )
                                return;
                            void lobby
                                .deleteWorld(summary.id)
                                .then(onExit);
                        }}
                    >
                        {t('settings.deleteWorld')}
                    </Button>
                </Card>
            )}
        </div>
    );
});
