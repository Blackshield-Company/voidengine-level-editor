/** Snapshot undo/redo. Fine for MVP-sized maps; diff-based later. */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(private limit = 100) {}
  push(snapshot: T) {
    this.past.push(snapshot);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo(current: T): T | undefined {
    const prev = this.past.pop();
    if (prev !== undefined) this.future.push(current);
    return prev;
  }
  redo(current: T): T | undefined {
    const next = this.future.pop();
    if (next !== undefined) this.past.push(current);
    return next;
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}
