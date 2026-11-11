/**
 * Ein Balken mit Nullmarke in der Mitte, für Werte, die in beide Richtungen
 * ausschlagen (plans/18-ux/18-4-berichte.md: das Glück im Kampf).
 *
 * Der Wert steht immer auch als Text daneben. Farbe allein trägt die
 * Aussage nicht: Wer Rot und Grün nicht unterscheidet, sähe sonst nur „ein
 * Stück Balken" ohne Vorzeichen.
 */
export function Gauge({
    value,
    limit,
    label,
    text,
}: {
    value: number;
    /** Der Balken reicht von `−limit` bis `+limit`. */
    limit: number;
    /** Was der Wert bedeutet, für Screenreader vor dem Text. */
    label: string;
    /** Der Wert in Worten, zum Beispiel „+5 %". */
    text: string;
}) {
    const clamped = Math.max(-limit, Math.min(limit, value));
    // Anteil der halben Breite, die gefüllt ist.
    const share = (Math.abs(clamped) / limit) * 50;
    return (
        <div className="flex items-center gap-3">
            {/* Der Balken ist Schmuck: Den Wert trägt der Text daneben. */}
            <div
                aria-hidden="true"
                className="relative h-3 w-56 max-w-full rounded-xs border border-oak bg-parchment-dark"
            >
                <div
                    className={`absolute top-0 bottom-0 ${
                        clamped < 0 ? 'bg-seal' : 'bg-moss'
                    }`}
                    style={
                        clamped < 0
                            ? { right: '50%', width: `${share}%` }
                            : { left: '50%', width: `${share}%` }
                    }
                />
                <div className="absolute top-[-3px] bottom-[-3px] left-1/2 w-px bg-ink" />
            </div>
            <strong
                className={`tabular-nums ${
                    clamped < 0 ? 'text-seal' : 'text-moss'
                }`}
            >
                <span className="sr-only">{label}: </span>
                {text}
            </strong>
        </div>
    );
}
