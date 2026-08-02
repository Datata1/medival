import { createContext, type ReactNode, useContext } from 'react';
import type { RootStore } from './RootStore.js';

const StoreContext = createContext<RootStore | null>(null);

export function StoreProvider({
    store,
    children,
}: {
    store: RootStore;
    children: ReactNode;
}) {
    return (
        <StoreContext.Provider value={store}>
            {children}
        </StoreContext.Provider>
    );
}

/** Zugriff auf die Stores; nur Container-Komponenten rufen das auf. */
export function useStores(): RootStore {
    const store = useContext(StoreContext);
    if (!store)
        throw new Error(
            'StoreProvider fehlt oberhalb dieser Komponente',
        );
    return store;
}
