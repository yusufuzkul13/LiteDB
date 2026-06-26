export class StateManager {
  constructor() {
    this.state = this.getInitialState();
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }

  getInitialState() {
    return {
      name: "Yeni Diyagram",
      tables: [],
      relationships: [],
      notes: [],
      areas: [],
      enums: [],
      views: [],
      procedures: [],
      functions: [],
      triggers: []
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  saveHistory() {
    this.undoStack.push(JSON.stringify(this.state));
    this.redoStack = [];
    this.updateUndoRedoButtons();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(JSON.stringify(this.state));
    this.state = JSON.parse(this.undoStack.pop());
    this.notify();
    this.updateUndoRedoButtons();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(JSON.stringify(this.state));
    this.state = JSON.parse(this.redoStack.pop());
    this.notify();
    this.updateUndoRedoButtons();
  }

  updateUndoRedoButtons() {
    const undoBtn = document.getElementById("btn-undo");
    const redoBtn = document.getElementById("btn-redo");
    if (undoBtn) undoBtn.disabled = this.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
  }

  // --- ACTIONS ---
  setDiagramName(name) {
    this.saveHistory();
    this.state.name = name;
    this.notify();
  }

  addTable(table) {
    this.saveHistory();
    this.state.tables.push(table);
    this.notify();
  }

  updateTable(id, updates) {
    this.saveHistory();
    this.state.tables = this.state.tables.map(t => t.id === id ? { ...t, ...updates } : t);
    this.notify();
  }

  deleteTable(id) {
    this.saveHistory();
    // delete relationships referencing this table
    this.state.relationships = this.state.relationships.filter(
      r => r.startTableId !== id && r.endTableId !== id
    );
    this.state.tables = this.state.tables.filter(t => t.id !== id);
    this.notify();
  }

  addRelationship(rel) {
    this.saveHistory();
    this.state.relationships.push(rel);
    this.notify();
  }

  deleteRelationship(id) {
    this.saveHistory();
    this.state.relationships = this.state.relationships.filter(r => r.id !== id);
    this.notify();
  }

  addNote(note) {
    this.saveHistory();
    this.state.notes.push(note);
    this.notify();
  }

  updateNote(id, updates) {
    this.saveHistory();
    this.state.notes = this.state.notes.map(n => n.id === id ? { ...n, ...updates } : n);
    this.notify();
  }

  deleteNote(id) {
    this.saveHistory();
    this.state.notes = this.state.notes.filter(n => n.id !== id);
    this.notify();
  }

  addArea(area) {
    this.saveHistory();
    this.state.areas.push(area);
    this.notify();
  }

  updateArea(id, updates) {
    this.saveHistory();
    this.state.areas = this.state.areas.map(a => a.id === id ? { ...a, ...updates } : a);
    this.notify();
  }

  deleteArea(id) {
    this.saveHistory();
    this.state.areas = this.state.areas.filter(a => a.id !== id);
    this.notify();
  }

  addEnum(en) {
    this.saveHistory();
    this.state.enums.push(en);
    this.notify();
  }

  updateEnum(id, updates) {
    this.saveHistory();
    this.state.enums = this.state.enums.map(e => e.id === id ? { ...e, ...updates } : e);
    this.notify();
  }

  deleteEnum(id) {
    this.saveHistory();
    this.state.enums = this.state.enums.filter(e => e.id !== id);
    this.notify();
  }

  updateDbObject(id, updates) {
    this.saveHistory();
    this.state.views = this.state.views.map(v => v.id === id ? { ...v, ...updates } : v);
    this.state.procedures = this.state.procedures.map(p => p.id === id ? { ...p, ...updates } : p);
    this.state.functions = this.state.functions.map(f => f.id === id ? { ...f, ...updates } : f);
    this.state.triggers = this.state.triggers.map(t => t.id === id ? { ...t, ...updates } : t);
    this.notify();
  }

  loadDiagram(data) {
    if (!data) return;
    this.saveHistory();
    this.state = {
      name: data.name || "Yeni Diyagram",
      tables: Array.isArray(data.tables) ? data.tables : [],
      relationships: Array.isArray(data.relationships) ? data.relationships : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      areas: Array.isArray(data.areas) ? data.areas : [],
      enums: Array.isArray(data.enums) ? data.enums : [],
      views: Array.isArray(data.views) ? data.views : [],
      procedures: Array.isArray(data.procedures) ? data.procedures : [],
      functions: Array.isArray(data.functions) ? data.functions : [],
      triggers: Array.isArray(data.triggers) ? data.triggers : []
    };
    this.notify();
  }
}

export const stateManager = new StateManager();
