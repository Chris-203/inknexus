/** A change notifier for module-level state, in the shape React's useSyncExternalStore expects. */
export function createChanges() {
  const listeners = new Set<() => void>();
  let version = 0;
  return {
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    /** Goes up on every change, for stores whose state is mutated in place. */
    version: () => version,
    emit() {
      version++;
      listeners.forEach((l) => l());
    },
  };
}
