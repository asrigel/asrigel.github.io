export class History {
  constructor(getSnapshot, applySnapshot) {
    this.getSnapshot = getSnapshot;
    this.applySnapshot = applySnapshot;
    this.undoStack = [];
    this.redoStack = [];
  }

  push(snapshot) {
    this.undoStack.push(snapshot);
    this.redoStack = [];
  }

  capture() {
    this.push(this.getSnapshot());
  }

  undo() {
    if (!this.undoStack.length) return false;
    const current = this.getSnapshot();
    const previous = this.undoStack.pop();
    this.redoStack.push(current);
    this.applySnapshot(previous);
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    const current = this.getSnapshot();
    const next = this.redoStack.pop();
    this.undoStack.push(current);
    this.applySnapshot(next);
    return true;
  }
}
