import { useCallback, useEffect, useState } from 'react';
import type { SavedSignature } from '../utils/stamps';

/**
 * The saved-signature library, backed by one JSON file per signature in the
 * app's userData folder.
 *
 * Disk rather than IndexedDB was a deliberate choice: signatures a person
 * expects to reuse for years should be something they can back up, copy to a
 * new machine, and see, none of which a renderer-side database offers.
 *
 * Everything here degrades to an in-memory list when `window.ipcRenderer` is
 * absent — running the renderer in a plain browser during development, or a
 * preload that failed to attach. The library then lasts as long as the tab,
 * which is the right failure: signing still works, and nothing silently claims
 * to have saved something it did not.
 */

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

function bridge(): Invoke | null {
  const api = (window as any).ipcRenderer;
  return api && typeof api.invoke === 'function' ? api.invoke.bind(api) : null;
}

export interface SignatureLibrary {
  items: SavedSignature[];
  /** False when there is no disk behind the list, so the UI can say so. */
  persistent: boolean;
  loading: boolean;
  error: string | null;
  save: (record: SavedSignature) => Promise<void>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, label: string) => Promise<void>;
  /** Opens the folder in the OS file manager. Null when not on Electron. */
  reveal: (() => Promise<void>) | null;
}

function newestFirst(a: SavedSignature, b: SavedSignature) {
  return b.created - a.created;
}

export function useSignatureLibrary(): SignatureLibrary {
  const [items, setItems] = useState<SavedSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [persistent] = useState(() => bridge() !== null);

  useEffect(() => {
    const invoke = bridge();
    if (!invoke) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    invoke('signatures:list')
      .then(records => {
        if (cancelled) return;
        setItems((records as SavedSignature[]).slice().sort(newestFirst));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not read the signature library.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  /**
   * The list updates before the write is confirmed. A saved signature is
   * something the user is about to reach for, so it has to be there the instant
   * they look; if the write then fails, the error is surfaced and the entry
   * pulled back out rather than left as a lie.
   */
  const save = useCallback(async (record: SavedSignature) => {
    setItems(prev => [record, ...prev.filter(s => s.id !== record.id)].sort(newestFirst));
    const invoke = bridge();
    if (!invoke) return;
    try {
      await invoke('signatures:save', record);
      setError(null);
    } catch (e: unknown) {
      setItems(prev => prev.filter(s => s.id !== record.id));
      setError(e instanceof Error ? e.message : 'Could not save that signature.');
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    let removed: SavedSignature | undefined;
    setItems(prev => {
      removed = prev.find(s => s.id === id);
      return prev.filter(s => s.id !== id);
    });
    const invoke = bridge();
    if (!invoke) return;
    try {
      await invoke('signatures:delete', id);
      setError(null);
    } catch (e: unknown) {
      if (removed) setItems(prev => [removed as SavedSignature, ...prev].sort(newestFirst));
      setError(e instanceof Error ? e.message : 'Could not delete that signature.');
    }
  }, []);

  const rename = useCallback(async (id: string, label: string) => {
    let updated: SavedSignature | undefined;
    setItems(prev => prev.map(s => {
      if (s.id !== id) return s;
      updated = { ...s, label };
      return updated;
    }));
    const invoke = bridge();
    if (!invoke || !updated) return;
    try {
      await invoke('signatures:save', updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not rename that signature.');
    }
  }, []);

  const revealFolder = useCallback(async () => {
    const invoke = bridge();
    if (invoke) await invoke('signatures:reveal');
  }, []);

  return {
    items,
    persistent,
    loading,
    error,
    save,
    remove,
    rename,
    reveal: persistent ? revealFolder : null,
  };
}
