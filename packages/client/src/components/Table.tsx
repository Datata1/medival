import type {
    HTMLAttributes,
    TdHTMLAttributes,
    ThHTMLAttributes,
} from 'react';

/** Registerartige Tabelle: Tinten-Kopfzeile, Zebrastreifen in Pergamenttönen. */
export function Table({
    className,
    ...props
}: HTMLAttributes<HTMLTableElement>) {
    return (
        <table
            className={`w-full border-collapse text-[0.95rem] [&_tbody_tr:nth-child(even)]:bg-parchment-dark/50${
                className ? ` ${className}` : ''
            }`}
            {...props}
        />
    );
}

export function Th({
    className,
    ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
    return (
        <th
            className={`border-oak border-b-2 px-2 py-1.5 text-left font-display font-semibold text-ink text-sm tracking-wide${
                className ? ` ${className}` : ''
            }`}
            {...props}
        />
    );
}

export function Td({
    className,
    ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
    return (
        <td
            className={`border-oak/40 border-b px-2 py-1.5 text-left${
                className ? ` ${className}` : ''
            }`}
            {...props}
        />
    );
}
