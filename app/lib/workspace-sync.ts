export type SyncState = "saved" | "pending" | "saving" | "error" | "conflict";
export type PendingWorkspace<T> = { administrations: T; revision: string; savedAt: string };
export class WorkspaceSaveError extends Error {
  code: string;
  constructor(message: string, code = "SAVE_FAILED") { super(message); this.code = code; }
}

/** One request at a time, always using the revision acknowledged by the server. */
export class WorkspaceSync<T, P> {
  private latest: T;
  private confirmed: string;
  private revision: string;
  private saving = false;
  private blocked = false;
  private uncertain = false;
  private stopped = false;
  private options: {
    save: (value: T, revision: string) => Promise<{ revision: string; profile: P }>;
    persist: (pending: PendingWorkspace<T>) => void;
    clear: () => void;
    state: (state: SyncState, message?: string) => void;
    saved: (profile: P, value: T) => void;
  };

  constructor(value: T, revision: string, options: WorkspaceSync<T, P>["options"]) {
    this.latest = value;
    this.confirmed = JSON.stringify(value);
    this.revision = revision;
    this.options = options;
  }
  get dirty() { return this.blocked || this.uncertain || JSON.stringify(this.latest) !== this.confirmed; }
  private persist() {
    this.options.persist({ administrations: this.latest, revision: this.revision, savedAt: new Date().toISOString() });
  }
  update(value: T) {
    this.latest = value;
    if (!this.dirty) {
      if (!this.saving) { this.options.clear(); this.options.state("saved"); }
      return;
    }
    this.persist();
    if (!this.blocked && !this.saving) this.options.state("pending");
  }
  stop() { this.stopped = true; }
  async flush() {
    if (this.saving || this.blocked || this.stopped || !this.dirty) return;
    this.saving = true;
    try {
      while (this.dirty && !this.stopped) {
        const value = this.latest;
        const serialized = JSON.stringify(value);
        this.options.state("saving");
        const result = await this.options.save(value, this.revision);
        if (!result.revision) throw new WorkspaceSaveError("De server heeft het opslaan niet bevestigd.");
        this.revision = result.revision;
        this.confirmed = serialized;
        this.uncertain = false;
        this.options.saved(result.profile, value);
        if (this.dirty) this.persist();
        else {
          this.options.clear();
          this.options.state("saved");
        }
      }
    } catch (error) {
      // A lost response does not prove that the server rejected the write.
      this.uncertain = true;
      this.blocked = error instanceof WorkspaceSaveError && ["REVISION_CONFLICT", "UPDATE_REQUIRED"].includes(error.code);
      this.options.state(this.blocked ? "conflict" : "error", error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally { this.saving = false; }
  }
}

export const browserCacheKey = "boekbalans-administraties-v1";
export const recoveryPrefix = "boekbalans-herstel-v2:";
type CacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

// Preserve the old browser cache BEFORE login replaces it with a server version.
export function preserveBrowserCache(storage: CacheStorage, serverValue: unknown, copyId: string) {
  const saved = storage.getItem(browserCacheKey);
  if (!saved) return;
  let same = false;
  try { same = JSON.stringify(JSON.parse(saved)) === JSON.stringify(serverValue); } catch { /* Keep even an unreadable old copy. */ }
  if (!same) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(recoveryPrefix) && storage.getItem(key) === saved) return;
    }
    storage.setItem(`${recoveryPrefix}${copyId}`, saved);
  }
}

export function browserRecoveryCopies(storage: CacheStorage, excludeKey?: string) {
  const copies: Array<{ key: string; contents: unknown }> = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(recoveryPrefix) || key === excludeKey) continue;
    const value = storage.getItem(key);
    if (value) {
      try { copies.push({ key, contents: JSON.parse(value) }); }
      catch { copies.push({ key, contents: value }); }
    }
  }
  return copies;
}
