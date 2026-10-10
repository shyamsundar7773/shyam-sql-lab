export type MyPracticedNotesAutosaveCallbacks = {
  onStart: () => void;
  onSuccess: () => void;
  onError: (error: unknown) => void;
  onSettled: () => void;
};

export function scheduleMyPracticedNotesAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  callbacks: MyPracticedNotesAutosaveCallbacks,
  delayMs: number,
): () => void {
  let started = false;
  const timer = setTimeout(() => {
    started = true;
    callbacks.onStart();
    void save(value)
      .then(callbacks.onSuccess, callbacks.onError)
      .finally(callbacks.onSettled);
  }, delayMs);

  return () => {
    if (!started) {
      clearTimeout(timer);
    }
  };
}
