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
      folders: [],
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

  addFolder(folder) {
    this.saveHistory();
    this.state.folders.push(folder);
    this.notify();
  }

  updateFolder(id, updates) {
    this.saveHistory();
    this.state.folders = this.state.folders.map(f => f.id === id ? { ...f, ...updates } : f);
    this.notify();
  }

  deleteFolder(id) {
    this.saveHistory();
    this.state.folders = this.state.folders.filter(f => f.id !== id);
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

  addDbObject(type, obj) {
    this.saveHistory();
    if (type === "view") this.state.views.push(obj);
    else if (type === "procedure") this.state.procedures.push(obj);
    else if (type === "function") this.state.functions.push(obj);
    else if (type === "trigger") this.state.triggers.push(obj);
    this.notify();
  }

  deleteDbObject(type, id) {
    this.saveHistory();
    if (type === "view") this.state.views = this.state.views.filter(v => v.id !== id);
    else if (type === "procedure") this.state.procedures = this.state.procedures.filter(p => p.id !== id);
    else if (type === "function") this.state.functions = this.state.functions.filter(f => f.id !== id);
    else if (type === "trigger") this.state.triggers = this.state.triggers.filter(t => t.id !== id);
    this.notify();
  }

  loadDiagram(data) {
    if (!data) return;
    this.saveHistory();
    let initialFolders = Array.isArray(data.folders) ? data.folders : [];
    
    if (initialFolders.length === 0 && Array.isArray(data.tables)) {
      const folderColorMap = {};
      const palette = ['#a855f7', '#f43f5e', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];
      let cIdx = 0;
      
      data.tables.forEach(t => {
        if (t.folder && !folderColorMap[t.folder]) {
          const c = (t.color && t.color !== '#6366f1' && t.color !== '#3b82f6') ? t.color : palette[cIdx % palette.length];
          folderColorMap[t.folder] = c;
          initialFolders.push({
            id: t.folder,
            name: t.folder.charAt(0).toUpperCase() + t.folder.slice(1),
            color: c
          });
          cIdx++;
        }
      });
    }

    this.state = {
      name: data.name || "Yeni Diyagram",
      folders: initialFolders,
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
    window.dispatchEvent(new CustomEvent('diagramLoaded'));
  }
}

export const stateManager = new StateManager();
