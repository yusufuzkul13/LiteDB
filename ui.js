import { stateManager } from "./state.js";
import { generateSQL } from "./sqlGenerator.js";
import { getProjectedColumns, getAccessedFields, getJoinTypes } from "./sqlParser.js";
import { generateMockValue } from "./mockEngine.js";

export class UIController {
  constructor(canvasController) {
    this.cc = canvasController;
    this.currentDbObjectTab = "overview";
    this.initEvents();
  }

  initEvents() {
    try {
    // Tabs switching
    document.querySelectorAll(".sidebar-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".sidebar-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        tab.classList.add("active");
        const tabId = `tab-${tab.getAttribute("data-tab")}`;
        document.getElementById(tabId).classList.add("active");
      });
    });

    // Add buttons
    document.getElementById("btn-add-table").addEventListener("click", () => this.addNewTable());
    document.getElementById("add-table-btn").addEventListener("click", () => this.addNewTable());
    document.getElementById("empty-add-table").addEventListener("click", () => this.addNewTable());

    document.getElementById("btn-add-note").addEventListener("click", () => this.addNewNote());
    document.getElementById("add-note-btn").addEventListener("click", () => this.addNewNote());

    document.getElementById("btn-add-area").addEventListener("click", () => this.addNewArea());

    document.getElementById("add-enum-btn").addEventListener("click", () => this.addNewEnum());

    // Undo/Redo
    document.getElementById("btn-undo").addEventListener("click", () => stateManager.undo());
    document.getElementById("btn-redo").addEventListener("click", () => stateManager.redo());

    // SQL Modal
    const sqlModal = document.getElementById("sql-modal");
    document.getElementById("btn-sql").addEventListener("click", () => {
      sqlModal.style.display = "flex";
      this.updateSQLView();
    });
    document.getElementById("sql-dialect").addEventListener("change", () => this.updateSQLView());
    document.getElementById("copy-sql").addEventListener("click", () => {
      const code = document.getElementById("sql-output").innerText;
      navigator.clipboard.writeText(code);
      this.cc.showToast("SQL kopyalandı!");
    });

    // Export Modal
    const exportModal = document.getElementById("export-modal");
    document.getElementById("btn-export").addEventListener("click", () => {
      exportModal.style.display = "flex";
    });

    document.getElementById("export-json").addEventListener("click", () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(stateManager.state, null, 2));
      const dlAnchorElem = document.createElement("a");
      dlAnchorElem.setAttribute("href", dataStr);
      dlAnchorElem.setAttribute("download", `${stateManager.state.name}.json`);
      dlAnchorElem.click();
      exportModal.style.display = "none";
    });

    document.getElementById("export-sql-file").addEventListener("click", () => {
      const dialect = document.getElementById("sql-dialect").value;
      const sqlText = generateSQL(stateManager.state, dialect);
      const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(sqlText);
      const dlAnchorElem = document.createElement("a");
      dlAnchorElem.setAttribute("href", dataStr);
      dlAnchorElem.setAttribute("download", `${stateManager.state.name}.sql`);
      dlAnchorElem.click();
      exportModal.style.display = "none";
    });

    document.getElementById("export-svg-file").addEventListener("click", () => {
      const svgClone = document.getElementById("canvas").cloneNode(true);
      const svgString = new XMLSerializer().serializeToString(svgClone);
      const svgBlob = new Blob([svgString], {type: "image/svg+xml;charset=utf-8"});
      const svgUrl = URL.createObjectURL(svgBlob);
      const dlAnchorElem = document.createElement("a");
      dlAnchorElem.setAttribute("href", svgUrl);
      dlAnchorElem.setAttribute("download", `${stateManager.state.name}.svg`);
      dlAnchorElem.click();
      exportModal.style.display = "none";
    });

    document.getElementById("export-png").addEventListener("click", () => {
      this.cc.showToast("PNG çıktısı için tarayıcı yazdırma özelliğini kullanabilirsiniz (SVG/Vector çıktısı önerilir).", "info");
      exportModal.style.display = "none";
    });

    // Close Modals
    document.querySelectorAll(".modal-close").forEach(btn => {
      btn.addEventListener("click", () => {
        const modalId = btn.getAttribute("data-modal");
        if (modalId) document.getElementById(modalId).style.display = "none";
      });
    });

    // Diagram name
    const nameInput = document.getElementById("diagram-name");
    nameInput.addEventListener("change", () => {
      stateManager.setDiagramName(nameInput.value);
    });

    // Theme Switch
    document.getElementById("btn-theme").addEventListener("click", () => {
      document.body.classList.toggle("light");
      localStorage.setItem("lite_db_theme", document.body.classList.contains("light") ? "light" : "dark");
    });

    // Restore theme
    if (localStorage.getItem("lite_db_theme") === "light") {
      document.body.classList.add("light");
    }

    // ── Connection + Diagram state ────────────────────────────────────────────
    this.activeConnectionId = null;
    this.activeDiagramId    = null;

    // ── Save button ───────────────────────────────────────────────────────────
    document.getElementById("btn-save").addEventListener("click", () => {
      const state = { ...stateManager.state, id: this.activeDiagramId, connectionId: this.activeConnectionId };
      Promise.allSettled([
        fetch('/api/save',          { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(state) }),
        fetch('/api/diagrams/save', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(state) })
      ]).then(([, diagRes]) => {
        if (diagRes.status === 'fulfilled' && diagRes.value.ok) {
          diagRes.value.json().then(r => { if (r.id) this.activeDiagramId = r.id; });
          this.cc.showToast("✅ Diyagram diske kaydedildi!");
        } else {
          this.cc.showToast("⚠️ Diyagram kaydedilemedi, sunucu hatası.", "warning");
        }
      });
    });

    // ── Home button (show recent diagrams) ───────────────────────────────────────
    const homeBtn = document.getElementById("btn-home");
    if (homeBtn) {
      homeBtn.addEventListener("click", () => {
        // Auto-save before going to home
        const state = { ...stateManager.state, id: this.activeDiagramId, connectionId: this.activeConnectionId };
        Promise.allSettled([
          fetch('/api/save',          { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(state) }),
          fetch('/api/diagrams/save', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(state) })
        ]).then(([, diagRes]) => {
          if (diagRes.status === 'fulfilled' && diagRes.value.ok) {
            diagRes.value.json().then(r => { if (r.id) this.activeDiagramId = r.id; });
            this.cc.showToast("✅ Diyagram kaydedildi!");
          }
          // Go to home screen
          document.getElementById("app").style.display = "none";
          document.getElementById("splash-screen").style.display = "flex";
          this.loadRecentDiagrams(document.getElementById("diagram-name"));
        });
      });
    }

    // ── Sync button ───────────────────────────────────────────────────────────
    const syncBtn = document.getElementById("btn-sync");
    if (syncBtn) {
      syncBtn.addEventListener("click", () => {
        if (!this.activeConnectionId) { this.cc.showToast("Önce bir DB bağlantısı seçin.", "warning"); return; }
        syncBtn.disabled = true;
        fetch('/api/sync', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ connectionId: this.activeConnectionId }) })
          .then(r => r.json()).then(res => {
            syncBtn.disabled = false;
            if (res.success) {
              this.cc.showToast(`✅ ${res.message}`);
              fetch('/api/schema').then(r => r.json()).then(schema => {
                stateManager.loadDiagram({
                  ...stateManager.state,
                  tables:        schema.tables        || [],
                  relationships: schema.relationships || [],
                  views:         schema.views         || [],
                  procedures:    schema.procedures    || [],
                  functions:     schema.functions     || [],
                  triggers:      schema.triggers      || [],
                });
              });
            } else { this.cc.showToast(`❌ ${res.message}`, "warning"); }
          }).catch(() => { syncBtn.disabled = false; this.cc.showToast("Senkronizasyon başarısız.", "warning"); });
      });
    }

    // ── "Yeni Diyagram" — open connection modal first ────────────────────────
    const btnNewDiagram = document.getElementById("btn-new-diagram");
    if (btnNewDiagram) {
      btnNewDiagram.addEventListener("click", () => {
        try {
          this.openNewDiagramModal();
        } catch(err) {
          console.error('[LiteDB] openNewDiagramModal hatası:', err);
        }
      });
    }

    document.getElementById("btn-import-diagram").addEventListener("click", () => {
      document.getElementById("file-import").click();
    });

    document.getElementById("file-import").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target.result);
          stateManager.loadDiagram(data);
          document.getElementById("splash-screen").style.display = "none";
          document.getElementById("app").style.display = "flex";
          nameInput.value = stateManager.state.name;
          this.cc.fitToViewport();
          this.cc.showToast("JSON başarıyla yüklendi!");
        } catch (err) {
          alert("Geçersiz JSON formatı.");
        }
      };
      reader.readAsText(file);
    });

    // Load recent diagrams from disk (handled by loadRecentDiagrams method)
    this.loadRecentDiagrams(nameInput);


    // Listen for canvas selections
    window.addEventListener("elementSelected", (e) => {
      const selected = e.detail;
      this.renderInspector(selected);
    });

    document.getElementById("close-inspector").addEventListener("click", () => {
      this.cc.selectElement(null);
    });

    // Accordion toggles
    document.querySelectorAll(".accordion-trigger").forEach(trigger => {
      trigger.addEventListener("click", () => {
        const targetId = trigger.getAttribute("data-target");
        const targetList = document.getElementById(targetId);
        trigger.classList.toggle("active");
        if (targetList) targetList.classList.toggle("active");
      });
    });

    // Right panel inspector resize handler
    const rightPanel = document.getElementById("right-panel");
    const rightPanelResizer = document.getElementById("right-panel-resizer");
    if (rightPanelResizer && rightPanel) {
      let isDraggingResizer = false;

      rightPanelResizer.addEventListener("mousedown", (e) => {
        e.preventDefault();
        isDraggingResizer = true;
        rightPanelResizer.classList.add("dragging");
        document.body.style.cursor = "ew-resize";
        document.body.style.userSelect = "none";
      });

      window.addEventListener("mousemove", (e) => {
        if (!isDraggingResizer) return;
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= 260 && newWidth <= 800) {
          rightPanel.style.width = `${newWidth}px`;
        }
      });

      window.addEventListener("mouseup", () => {
        if (isDraggingResizer) {
          isDraggingResizer = false;
          rightPanelResizer.classList.remove("dragging");
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        }
      });
    }

    // Object search input handler
    const searchInp = document.getElementById("object-search-input");
    if (searchInp) {
      searchInp.addEventListener("input", (e) => {
        this.objectSearchQuery = e.target.value.toLowerCase();
        this.updateSidebarLists(stateManager.state);
      });
    }
    } catch(err) {
      console.error('[LiteDB] initEvents HATASI:', err);
    }
  }

  addNewTable() {
    const id = "tbl_" + Math.random().toString(36).substr(2, 9);
    stateManager.addTable({
      id,
      name: "tablo_" + Math.round(Math.random() * 100),
      x: Math.round(-this.cc.panX / this.cc.zoom + 100),
      y: Math.round(-this.cc.panY / this.cc.zoom + 100),
      color: "var(--primary)",
      fields: [
        { id: "f_" + Math.random().toString(36).substr(2, 9), name: "id", type: "INT", primary: true, notNull: true, unique: true, increment: true }
      ]
    });
    this.cc.selectElement("table", id);
  }

  addNewNote() {
    const id = "note_" + Math.random().toString(36).substr(2, 9);
    stateManager.addNote({
      id,
      title: "Yeni Not",
      content: "Buraya notlarınızı yazabilirsiniz.",
      x: Math.round(-this.cc.panX / this.cc.zoom + 150),
      y: Math.round(-this.cc.panY / this.cc.zoom + 150),
      width: 180,
      height: 120,
      color: "#fef08a"
    });
    this.cc.selectElement("note", id);
  }

  addNewArea() {
    const id = "area_" + Math.random().toString(36).substr(2, 9);
    stateManager.addArea({
      id,
      name: "Grup Alanı",
      x: Math.round(-this.cc.panX / this.cc.zoom + 100),
      y: Math.round(-this.cc.panY / this.cc.zoom + 100),
      width: 320,
      height: 240,
      color: "rgba(99, 102, 241, 0.2)"
    });
    this.cc.selectElement("area", id);
  }

  addNewEnum() {
    const id = "enum_" + Math.random().toString(36).substr(2, 9);
    stateManager.addEnum({
      id,
      name: "enum_status",
      values: ["active", "inactive", "pending"]
    });
    this.cc.selectElement("enum", id);
  }

  updateSQLView() {
    const dialect = document.getElementById("sql-dialect").value;
    const sqlText = generateSQL(stateManager.state, dialect);
    document.getElementById("sql-output").innerText = sqlText;
  }

  showRelatedObjects(tableId) {
    const state = stateManager.state;
    const table = state.tables.find(t => t.id === tableId);
    if (!table) return;

    // ── 1. FK ilişkileri (her iki yönde) ──────────────────────────────────────
    const fkRelationships = state.relationships.filter(r =>
      r.startTableId === tableId || r.endTableId === tableId
    );

    // ── 2. SQL objeleri: bu tabloyu dependencies'de kullananlar ──────────────
    const relatedSqlObjects = [];
    const allObjects = [
      ...(state.views      || []).map(o => ({ ...o, type: 'view'      })),
      ...(state.procedures || []).map(o => ({ ...o, type: 'procedure' })),
      ...(state.functions  || []).map(o => ({ ...o, type: 'function'  })),
      ...(state.triggers   || []).map(o => ({ ...o, type: 'trigger'   })),
    ];
    allObjects.forEach(obj => {
      // dependencies array ile eşleş (tableId veya table.name)
      const deps = obj.dependencies || [];
      const nameMatch = obj.sql && obj.sql.toLowerCase().includes(table.name.toLowerCase());
      if (deps.includes(tableId) || deps.includes(table.name) || nameMatch) {
        relatedSqlObjects.push(obj);
      }
    });

    if (fkRelationships.length === 0 && relatedSqlObjects.length === 0) {
      this.cc.showToast(`"${table.name}" tablosuna bağlı ilişki veya obje bulunamadı.`, "info");
      return;
    }

    // Tabloyu seç (inspector ve canvas highlight için)
    this.cc.selectElement("table", tableId);

    // Renderer'a tümleşik lineage event'i gönder
    window.dispatchEvent(new CustomEvent('showTableLineage', {
      detail: {
        tableId,
        fkRelationships,
        relatedSqlObjects,
      }
    }));

    const parts = [];
    if (fkRelationships.length > 0) parts.push(`${fkRelationships.length} FK ilişkisi`);
    if (relatedSqlObjects.length > 0) parts.push(`${relatedSqlObjects.length} SQL objesi`);
    this.cc.showToast(`"${table.name}" → ${parts.join(', ')} bulundu`);
  }


  updateSidebarLists(state) {
    // Tables Tab
    const tablesList = document.getElementById("tables-list");
    tablesList.innerHTML = "";
    document.getElementById("table-count").innerText = `${state.tables.length} tablo`;
    state.tables.forEach(t => {
      const item = document.createElement("div");
      item.className = "sidebar-item";
      if (this.cc.selectedElement && this.cc.selectedElement.type === "table" && this.cc.selectedElement.id === t.id) {
        item.classList.add("selected");
      }
      item.innerHTML = `
        <div class="sidebar-item-label">
          <span class="sidebar-item-dot" style="background:${t.color || "var(--primary)"}"></span>
          <span class="sidebar-item-name">${t.name}</span>
        </div>
        <div class="sidebar-item-actions">
          <button class="sidebar-item-btn info" data-id="${t.id}" data-action="show-related" title="İlişkili Objeleri Göster">👁</button>
          <button class="sidebar-item-btn danger" data-id="${t.id}" title="Tabloyu Sil">✕</button>
        </div>
      `;
      item.addEventListener("click", () => this.cc.selectElement("table", t.id));
      item.querySelectorAll(".sidebar-item-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          if (action === "show-related") {
            this.showRelatedObjects(t.id);
          } else {
            if (confirm("Bu tabloyu silmek istediğinize emin misiniz?")) {
              stateManager.deleteTable(t.id);
              this.cc.selectElement(null);
            }
          }
        });
      });
      tablesList.appendChild(item);
    });

    // Relationships Tab
    const relsList = document.getElementById("relationships-list");
    relsList.innerHTML = "";
    document.getElementById("rel-count").innerText = `${state.relationships.length} ilişki`;
    state.relationships.forEach(r => {
      const startT = state.tables.find(t => t.id === r.startTableId);
      const endT = state.tables.find(t => t.id === r.endTableId);
      if (!startT || !endT) return;

      const item = document.createElement("div");
      item.className = "sidebar-item";
      item.innerHTML = `
        <div class="sidebar-item-label">
          <span class="sidebar-item-name" style="font-size:11px;">${startT.name} ➔ ${endT.name}</span>
        </div>
        <div class="sidebar-item-actions">
          <button class="sidebar-item-btn danger" data-id="${r.id}">✕</button>
        </div>
      `;
      item.addEventListener("click", () => this.cc.selectElement("relationship", r.id));
      item.querySelector(".sidebar-item-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        stateManager.deleteRelationship(r.id);
        this.cc.selectElement(null);
      });
      relsList.appendChild(item);
    });

    // Notes Tab
    const notesList = document.getElementById("notes-list");
    notesList.innerHTML = "";
    document.getElementById("note-count").innerText = `${state.notes.length} not`;
    state.notes.forEach(n => {
      const item = document.createElement("div");
      item.className = "sidebar-item";
      item.innerHTML = `
        <div class="sidebar-item-label">
          <span class="sidebar-item-name">${n.title || "Not"}</span>
        </div>
        <div class="sidebar-item-actions">
          <button class="sidebar-item-btn danger" data-id="${n.id}">✕</button>
        </div>
      `;
      item.addEventListener("click", () => this.cc.selectElement("note", n.id));
      item.querySelector(".sidebar-item-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        stateManager.deleteNote(n.id);
        this.cc.selectElement(null);
      });
      notesList.appendChild(item);
    });

    // Enums Tab
    const enumsList = document.getElementById("enums-list");
    enumsList.innerHTML = "";
    document.getElementById("enum-count").innerText = `${state.enums.length} enum`;
    state.enums.forEach(en => {
      const item = document.createElement("div");
      item.className = "sidebar-item";
      item.innerHTML = `
        <div class="sidebar-item-label">
          <span class="sidebar-item-name">${en.name}</span>
        </div>
        <div class="sidebar-item-actions">
          <button class="sidebar-item-btn danger" data-id="${en.id}">✕</button>
        </div>
      `;
      item.addEventListener("click", () => this.cc.selectElement("enum", en.id));
      item.querySelector(".sidebar-item-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        stateManager.deleteEnum(en.id);
        this.cc.selectElement(null);
      });
      enumsList.appendChild(item);
    });

    // Objeler Accordion Lists (Views, Procedures, Functions, Triggers)
    const viewsList = document.getElementById("views-list");
    if (viewsList) {
      viewsList.innerHTML = "";
      let views = state.views || [];
      if (this.objectSearchQuery) {
        views = views.filter(v => v.name.toLowerCase().includes(this.objectSearchQuery));
      }
      const viewCountElem = document.getElementById("view-count");
      if (viewCountElem) viewCountElem.innerText = views.length;
      views.forEach(v => {
        const item = document.createElement("div");
        item.className = "sidebar-item";
        if (this.cc.selectedElement && this.cc.selectedElement.type === "db_object" && this.cc.selectedElement.id === v.id) {
          item.classList.add("selected");
        }
        item.innerHTML = `
          <div class="sidebar-item-label">
            <span class="sidebar-item-dot" style="background:var(--accent)"></span>
            <span class="sidebar-item-name" title="${v.name}">${v.name}</span>
          </div>
        `;
        item.addEventListener("click", () => this.cc.selectElement("db_object", v.id));
        viewsList.appendChild(item);
      });
    }

    const procsList = document.getElementById("procs-list");
    if (procsList) {
      procsList.innerHTML = "";
      let procs = state.procedures || [];
      if (this.objectSearchQuery) {
        procs = procs.filter(p => p.name.toLowerCase().includes(this.objectSearchQuery));
      }
      const procCountElem = document.getElementById("proc-count");
      if (procCountElem) procCountElem.innerText = procs.length;
      procs.forEach(p => {
        const item = document.createElement("div");
        item.className = "sidebar-item";
        if (this.cc.selectedElement && this.cc.selectedElement.type === "db_object" && this.cc.selectedElement.id === p.id) {
          item.classList.add("selected");
        }
        item.innerHTML = `
          <div class="sidebar-item-label">
            <span class="sidebar-item-dot" style="background:var(--warning)"></span>
            <span class="sidebar-item-name" title="${p.name}">${p.name}</span>
          </div>
        `;
        item.addEventListener("click", () => this.cc.selectElement("db_object", p.id));
        procsList.appendChild(item);
      });
    }

    const funcsList = document.getElementById("funcs-list");
    if (funcsList) {
      funcsList.innerHTML = "";
      let funcs = state.functions || [];
      if (this.objectSearchQuery) {
        funcs = funcs.filter(f => f.name.toLowerCase().includes(this.objectSearchQuery));
      }
      const funcCountElem = document.getElementById("func-count");
      if (funcCountElem) funcCountElem.innerText = funcs.length;
      funcs.forEach(f => {
        const item = document.createElement("div");
        item.className = "sidebar-item";
        if (this.cc.selectedElement && this.cc.selectedElement.type === "db_object" && this.cc.selectedElement.id === f.id) {
          item.classList.add("selected");
        }
        item.innerHTML = `
          <div class="sidebar-item-label">
            <span class="sidebar-item-dot" style="background:var(--success)"></span>
            <span class="sidebar-item-name" title="${f.name}">${f.name}</span>
          </div>
        `;
        item.addEventListener("click", () => this.cc.selectElement("db_object", f.id));
        funcsList.appendChild(item);
      });
    }

    const triggersList = document.getElementById("triggers-list");
    if (triggersList) {
      triggersList.innerHTML = "";
      let triggers = state.triggers || [];
      if (this.objectSearchQuery) {
        triggers = triggers.filter(t => t.name.toLowerCase().includes(this.objectSearchQuery));
      }
      const triggerCountElem = document.getElementById("trigger-count");
      if (triggerCountElem) triggerCountElem.innerText = triggers.length;
      triggers.forEach(t => {
        const item = document.createElement("div");
        item.className = "sidebar-item";
        if (this.cc.selectedElement && this.cc.selectedElement.type === "db_object" && this.cc.selectedElement.id === t.id) {
          item.classList.add("selected");
        }
        item.innerHTML = `
          <div class="sidebar-item-label">
            <span class="sidebar-item-dot" style="background:var(--danger)"></span>
            <span class="sidebar-item-name" title="${t.name}">${t.name}</span>
          </div>
        `;
        item.addEventListener("click", () => this.cc.selectElement("db_object", t.id));
        triggersList.appendChild(item);
      });
    }
  }

  renderInspector(selected) {
    const rightPanel = document.getElementById("right-panel");
    const container = document.getElementById("inspector-content");
    container.innerHTML = "";

    if (!selected) {
      rightPanel.style.display = "none";
      return;
    }

    rightPanel.style.display = "flex";

    if (selected.type === "table") {
      document.getElementById("inspector-title").innerText = "Tablo Özellikleri";
      const table = stateManager.state.tables.find(t => t.id === selected.id);
      if (!table) return;

      // Color swatches helper
      const colors = ["#6366f1", "#10b981", "#ef4444", "#f59e0b", "#3b82f6", "#ec4899", "#8b5cf6"];
      let colorSwatches = colors.map(c => `
        <span class="color-swatch ${table.color === c ? 'active' : ''}" style="background:${c}" data-color="${c}"></span>
      `).join("");

      // Fields list helper
      let fieldsHtml = table.fields.map((f, i) => `
        <div class="field-row" data-index="${i}">
          <div class="field-row-top">
            <input class="inspector-input field-name" value="${f.name}" placeholder="Kolon Adı" />
            <select class="inspector-select field-type" style="width:90px;flex-shrink:0;">
              <option value="INT" ${f.type === "INT" ? "selected" : ""}>INT</option>
              <option value="INTEGER" ${f.type === "INTEGER" ? "selected" : ""}>INTEGER</option>
              <option value="VARCHAR(255)" ${f.type === "VARCHAR(255)" ? "selected" : ""}>VARCHAR(255)</option>
              <option value="TEXT" ${f.type === "TEXT" ? "selected" : ""}>TEXT</option>
              <option value="BOOLEAN" ${f.type === "BOOLEAN" ? "selected" : ""}>BOOLEAN</option>
              <option value="DECIMAL" ${f.type === "DECIMAL" ? "selected" : ""}>DECIMAL</option>
              <option value="DATE" ${f.type === "DATE" ? "selected" : ""}>DATE</option>
              <option value="TIMESTAMP" ${f.type === "TIMESTAMP" ? "selected" : ""}>TIMESTAMP</option>
            </select>
            <button class="field-del-btn" data-index="${i}">✕</button>
          </div>
          <div class="field-row-flags">
            <label class="flag-check"><input type="checkbox" class="field-pk" ${f.primary ? "checked" : ""}> PK</label>
            <label class="flag-check"><input type="checkbox" class="field-nn" ${f.notNull ? "checked" : ""}> NN</label>
            <label class="flag-check"><input type="checkbox" class="field-uq" ${f.unique ? "checked" : ""}> UQ</label>
            <label class="flag-check"><input type="checkbox" class="field-ai" ${f.increment ? "checked" : ""}> AI</label>
          </div>
          <input class="inspector-input field-default" value="${f.default || ""}" placeholder="Varsayılan Değer" />
        </div>
      `).join("");

      container.innerHTML = `
        <div class="inspector-section">
          <div class="inspector-label">Tablo Adı</div>
          <input id="insp-table-name" class="inspector-input" value="${table.name}" />
        </div>
        <div class="inspector-section">
          <div class="inspector-label">Tablo Rengi</div>
          <div class="inspector-color-row">${colorSwatches}</div>
        </div>
        <div class="inspector-section">
          <div class="inspector-label">Kolonlar</div>
          <div class="fields-list">${fieldsHtml}</div>
          <button id="insp-add-field" class="add-field-btn">+ Kolon Ekle</button>
        </div>
        <div style="margin-top:24px;">
          <button id="insp-delete-table" class="btn-danger" style="width:100%;justify-content:center;">Tabloyu Sil</button>
        </div>
      `;

      // Handlers
      document.getElementById("insp-table-name").addEventListener("input", (e) => {
        stateManager.updateTable(table.id, { name: e.target.value });
      });

      container.querySelectorAll(".color-swatch").forEach(swatch => {
        swatch.addEventListener("click", () => {
          stateManager.updateTable(table.id, { color: swatch.getAttribute("data-color") });
          this.renderInspector(selected);
        });
      });

      document.getElementById("insp-add-field").addEventListener("click", () => {
        const fields = [...table.fields, {
          id: "f_" + Math.random().toString(36).substr(2, 9),
          name: "yeni_kolon",
          type: "VARCHAR(255)",
          primary: false,
          notNull: false,
          unique: false,
          increment: false
        }];
        stateManager.updateTable(table.id, { fields });
        this.renderInspector(selected);
      });

      document.getElementById("insp-delete-table").addEventListener("click", () => {
        if (confirm("Bu tabloyu silmek istediğinize emin misiniz?")) {
          stateManager.deleteTable(table.id);
          this.cc.selectElement(null);
        }
      });

      container.querySelectorAll(".field-row").forEach(row => {
        const index = parseInt(row.getAttribute("data-index"));
        const f = table.fields[index];

        row.querySelector(".field-name").addEventListener("input", (e) => {
          const fields = [...table.fields];
          fields[index].name = e.target.value;
          stateManager.updateTable(table.id, { fields });
        });

        row.querySelector(".field-type").addEventListener("change", (e) => {
          const fields = [...table.fields];
          fields[index].type = e.target.value;
          stateManager.updateTable(table.id, { fields });
        });

        row.querySelector(".field-pk").addEventListener("change", (e) => {
          const fields = [...table.fields];
          fields[index].primary = e.target.checked;
          if (e.target.checked) fields[index].notNull = true; // PKs are not null
          stateManager.updateTable(table.id, { fields });
          this.renderInspector(selected);
        });

        row.querySelector(".field-nn").addEventListener("change", (e) => {
          const fields = [...table.fields];
          fields[index].notNull = e.target.checked;
          stateManager.updateTable(table.id, { fields });
        });

        row.querySelector(".field-uq").addEventListener("change", (e) => {
          const fields = [...table.fields];
          fields[index].unique = e.target.checked;
          stateManager.updateTable(table.id, { fields });
        });

        row.querySelector(".field-ai").addEventListener("change", (e) => {
          const fields = [...table.fields];
          fields[index].increment = e.target.checked;
          stateManager.updateTable(table.id, { fields });
        });

        row.querySelector(".field-default").addEventListener("input", (e) => {
          const fields = [...table.fields];
          fields[index].default = e.target.value;
          stateManager.updateTable(table.id, { fields });
        });

        row.querySelector(".field-del-btn").addEventListener("click", () => {
          const fields = table.fields.filter((_, idx) => idx !== index);
          stateManager.updateTable(table.id, { fields });
          this.renderInspector(selected);
        });
      });

    } else if (selected.type === "relationship") {
      document.getElementById("inspector-title").innerText = "İlişki Özellikleri";
      const rel = stateManager.state.relationships.find(r => r.id === selected.id);
      if (!rel) return;

      const startTable = stateManager.state.tables.find(t => t.id === rel.startTableId);
      const startField = startTable?.fields.find(f => f.id === rel.startFieldId);
      const endTable = stateManager.state.tables.find(t => t.id === rel.endTableId);
      const endField = endTable?.fields.find(f => f.id === rel.endFieldId);

      container.innerHTML = `
        <div class="inspector-section">
          <div class="inspector-label">Kaynak Tablo.Kolon</div>
          <div style="font-weight:500;">${startTable?.name}.${startField?.name}</div>
        </div>
        <div class="inspector-section">
          <div class="inspector-label">Hedef Tablo.Kolon</div>
          <div style="font-weight:500;">${endTable?.name}.${endField?.name}</div>
        </div>
        <div class="inspector-section">
          <div class="inspector-label">Kardinallik</div>
          <select id="insp-rel-type" class="inspector-select">
            <option value="1-N" ${rel.type === "1-N" ? "selected" : ""}>1 - N (Birden Çoğa)</option>
            <option value="1-1" ${rel.type === "1-1" ? "selected" : ""}>1 - 1 (Bire Bir)</option>
          </select>
        </div>
        <div style="margin-top:24px;">
          <button id="insp-delete-rel" class="btn-danger" style="width:100%;justify-content:center;">İlişkiyi Sil</button>
        </div>
      `;

      document.getElementById("insp-rel-type").addEventListener("change", (e) => {
        stateManager.saveHistory();
        rel.type = e.target.value;
        stateManager.notify();
      });

      document.getElementById("insp-delete-rel").addEventListener("click", () => {
        stateManager.deleteRelationship(rel.id);
        this.cc.selectElement(null);
      });

    } else if (selected.type === "note") {
      document.getElementById("inspector-title").innerText = "Not Özellikleri";
      const note = stateManager.state.notes.find(n => n.id === selected.id);
      if (!note) return;

      const colors = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#e9d5ff", "#fed7aa"];
      let colorSwatches = colors.map(c => `
        <span class="color-swatch ${note.color === c ? 'active' : ''}" style="background:${c}" data-color="${c}"></span>
      `).join("");

      container.innerHTML = `
        <div class="inspector-section">
          <div class="inspector-label">Başlık</div>
          <input id="insp-note-title" class="inspector-input" value="${note.title}" />
        </div>
        <div class="inspector-section">
          <div class="inspector-label">İçerik</div>
          <textarea id="insp-note-content" class="inspector-input" style="height:120px;resize:vertical;font-family:inherit;">${note.content}</textarea>
        </div>
        <div class="inspector-section">
          <div class="inspector-label">Arkaplan Rengi</div>
          <div class="inspector-color-row">${colorSwatches}</div>
        </div>
        <div style="margin-top:24px;">
          <button id="insp-delete-note" class="btn-danger" style="width:100%;justify-content:center;">Notu Sil</button>
        </div>
      `;

      document.getElementById("insp-note-title").addEventListener("input", (e) => {
        stateManager.updateNote(note.id, { title: e.target.value });
      });

      document.getElementById("insp-note-content").addEventListener("input", (e) => {
        stateManager.updateNote(note.id, { content: e.target.value });
      });

      container.querySelectorAll(".color-swatch").forEach(swatch => {
        swatch.addEventListener("click", () => {
          stateManager.updateNote(note.id, { color: swatch.getAttribute("data-color") });
          this.renderInspector(selected);
        });
      });

      document.getElementById("insp-delete-note").addEventListener("click", () => {
        stateManager.deleteNote(note.id);
        this.cc.selectElement(null);
      });

    } else if (selected.type === "area") {
      document.getElementById("inspector-title").innerText = "Alan Özellikleri";
      const area = stateManager.state.areas.find(a => a.id === selected.id);
      if (!area) return;

      const colors = ["rgba(99, 102, 241, 0.2)", "rgba(16, 185, 129, 0.2)", "rgba(239, 68, 68, 0.2)", "rgba(245, 158, 11, 0.2)", "rgba(59, 130, 246, 0.2)"];
      let colorSwatches = colors.map(c => `
        <span class="color-swatch ${area.color === c ? 'active' : ''}" style="background:${c}" data-color="${c}"></span>
      `).join("");

      container.innerHTML = `
        <div class="inspector-section">
          <div class="inspector-label">Alan Adı</div>
          <input id="insp-area-name" class="inspector-input" value="${area.name}" />
        </div>
        <div class="inspector-section">
          <div class="inspector-label">Renk</div>
          <div class="inspector-color-row">${colorSwatches}</div>
        </div>
        <div style="margin-top:24px;">
          <button id="insp-delete-area" class="btn-danger" style="width:100%;justify-content:center;">Alanı Sil</button>
        </div>
      `;

      document.getElementById("insp-area-name").addEventListener("input", (e) => {
        stateManager.updateArea(area.id, { name: e.target.value });
      });

      container.querySelectorAll(".color-swatch").forEach(swatch => {
        swatch.addEventListener("click", () => {
          stateManager.updateArea(area.id, { color: swatch.getAttribute("data-color") });
          this.renderInspector(selected);
        });
      });

      document.getElementById("insp-delete-area").addEventListener("click", () => {
        stateManager.deleteArea(area.id);
        this.cc.selectElement(null);
      });

    } else if (selected.type === "enum") {
      document.getElementById("inspector-title").innerText = "Enum Özellikleri";
      const en = stateManager.state.enums.find(e => e.id === selected.id);
      if (!en) return;

      let valuesHtml = en.values.map((v, i) => `
        <div class="enum-value-row" data-index="${i}">
          <input class="inspector-input enum-value-input" value="${v}" placeholder="Değer" />
          <button class="field-del-btn enum-val-del" data-index="${i}">✕</button>
        </div>
      `).join("");

      container.innerHTML = `
        <div class="inspector-section">
          <div class="inspector-label">Enum Adı</div>
          <input id="insp-enum-name" class="inspector-input" value="${en.name}" />
        </div>
        <div class="inspector-section">
          <div class="inspector-label">Değerler</div>
          <div class="enum-values-list">${valuesHtml}</div>
          <button id="insp-add-enum-val" class="add-field-btn">+ Değer Ekle</button>
        </div>
        <div style="margin-top:24px;">
          <button id="insp-delete-enum" class="btn-danger" style="width:100%;justify-content:center;">Enumu Sil</button>
        </div>
      `;

      document.getElementById("insp-enum-name").addEventListener("input", (e) => {
        stateManager.updateEnum(en.id, { name: e.target.value });
      });

      document.getElementById("insp-add-enum-val").addEventListener("click", () => {
        stateManager.updateEnum(en.id, { values: [...en.values, "value_" + (en.values.length + 1)] });
        this.renderInspector(selected);
      });

      container.querySelectorAll(".enum-value-input").forEach((inp, idx) => {
        inp.addEventListener("change", (e) => {
          const vals = [...en.values];
          vals[idx] = e.target.value;
          stateManager.updateEnum(en.id, { values: vals });
        });
      });

      container.querySelectorAll(".enum-val-del").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.getAttribute("data-index"));
          stateManager.updateEnum(en.id, { values: en.values.filter((_, i) => i !== idx) });
          this.renderInspector(selected);
        });
      });

      document.getElementById("insp-delete-enum").addEventListener("click", () => {
        stateManager.deleteEnum(en.id);
        this.cc.selectElement(null);
      });
    } else if (selected && selected.type === "db_object") {
      let obj = stateManager.state.views.find(v => v.id === selected.id) ||
                stateManager.state.procedures.find(p => p.id === selected.id) ||
                stateManager.state.functions.find(f => f.id === selected.id) ||
                stateManager.state.triggers.find(t => t.id === selected.id);
      
      if (!obj) return;
      
      const activeElement = document.activeElement;
      if (activeElement && activeElement.id === `insp-sql-editor-${obj.id}`) {
        // Typing in editor: prevent rewriting HTML to keep focus and cursor position
        return;
      }
      
      document.getElementById("inspector-title").innerText = `${obj.name}`;

      const tabsHtml = `
        <div class="inspector-tabs">
          <button class="insp-tab-btn ${this.currentDbObjectTab === 'overview' ? 'active' : ''}" data-tab="overview">Genel Bakış</button>
          <button class="insp-tab-btn ${this.currentDbObjectTab === 'code' ? 'active' : ''}" data-tab="code">SQL Kodu</button>
          <button class="insp-tab-btn ${this.currentDbObjectTab === 'map' ? 'active' : ''}" data-tab="map">Bağımlılık</button>
          <button class="insp-tab-btn ${this.currentDbObjectTab === 'simulate' ? 'active' : ''}" data-tab="simulate">Simülasyon &amp; Analiz</button>
        </div>
      `;

      let contentHtml = "";

      if (this.currentDbObjectTab === "overview") {
        let totalReads = 0;
        let totalWrites = 0;
        
        const tablesListHtml = obj.dependencies.map(depId => {
          const tbl = stateManager.state.tables.find(t => t.id === depId);
          if (!tbl) return '';

          let actionType = "READ";
          const escapedName = tbl.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
          const writeRegex = new RegExp(
            `\\b(insert\\s+into|update|delete\\s+from|delete)\\s+(?:\\w+\\.)*${escapedName}\\b`,
            "i"
          );
          if (writeRegex.test(obj.sql)) {
            actionType = "WRITE";
            totalWrites++;
          } else if (obj.type === "trigger") {
            actionType = "TRIGGERED_BY";
          } else {
            totalReads++;
          }

          const actionLabel = { READ: "OKUR", WRITE: "YAZAR", TRIGGERED_BY: "TETİKLER" }[actionType];
          const actionColor = { READ: "var(--success)", WRITE: "var(--danger)", TRIGGERED_BY: "var(--warning)" }[actionType];

          const accessed = getAccessedFields(tbl.name, tbl.fields, obj.sql);
          const accessedTags = accessed.map(f => `
            <span style="font-size:0.75rem; background:var(--surface2); color:var(--text); padding:2px 6px; border-radius:4px; border:1px solid var(--border);">${f.name}</span>
          `).join('');

          return `
            <div style="background:var(--surface2); padding:10px; border-radius:8px; border:1px solid var(--border); display:flex; flex-direction:column; gap:6px;">
              <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                <div style="display:flex; align-items:center; gap:6px; font-weight:600; font-size:0.88rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  <span style="width:8px; height:8px; border-radius:50%; background:${tbl.color}; flex-shrink:0;"></span>
                  <span class="sidebar-item-name" title="${tbl.name}">${tbl.name}</span>
                </div>
                <span style="margin-left:auto; font-size:0.7rem; font-weight:bold; color:${actionColor}; background:${actionColor}15; border:1px solid ${actionColor}30; padding:1px 6px; border-radius:4px; text-transform:uppercase; flex-shrink:0;">
                  ${actionLabel}
                </span>
              </div>
              ${accessed.length > 0 ? `
                <div style="font-size:0.75rem; color:var(--text2); font-weight:550; margin-top:2px;">Erişilen Kolonlar:</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;">
                  ${accessedTags}
                </div>
              ` : '<div style="font-size:0.72rem; color:var(--text2); font-style:italic;">Kolon detaylarına doğrudan erişim çözülemedi.</div>'}
            </div>
          `;
        }).join('');

        let viewOutputsHtml = "";
        if (obj.type === "view") {
          const cols = getProjectedColumns(obj.sql);
          viewOutputsHtml = `
            <div class="inspector-section" style="margin-top:16px;">
              <div class="inspector-label">Çıktı Kolonları (Output)</div>
              <div style="display:flex; flex-direction:column; gap:4px; margin-top:6px;">
                ${cols.length > 0 ? cols.map(c => `
                  <div style="display:flex; align-items:center; justify-content:space-between; background:var(--surface2); padding:6px 10px; border-radius:6px; border:1px solid var(--border); font-size:0.82rem;">
                    <span style="font-weight:600; color:var(--text);">${c.name}</span>
                    <span style="font-family:var(--mono); font-size:0.72rem; color:var(--text2); max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${c.expression}">${c.expression}</span>
                  </div>
                `).join('') : '<div style="font-size:0.8rem; color:var(--text2); font-style:italic;">Çıktı kolonu tespit edilemedi.</div>'}
              </div>
            </div>
          `;
        }

        contentHtml = `
          <div class="inspector-section" style="margin-bottom:12px;">
            <div class="inspector-label">Nesne Bilgisi</div>
            <div style="display:flex; justify-content:space-between; background:var(--surface2); padding:8px 12px; border-radius:8px; border:1px solid var(--border); font-size:0.82rem; margin-top:4px;">
              <div>Tür: <strong style="text-transform:uppercase; color:var(--primary);">${obj.type}</strong></div>
              <div>Grup: <strong style="color:var(--text);">${obj.folder}</strong></div>
            </div>
          </div>
          <div class="inspector-section">
            <div class="inspector-label">Bağlı Olduğu Tablolar</div>
            <div style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">
              ${tablesListHtml || '<div style="color:var(--text2); font-size:0.8rem; font-style:italic;">Hiçbir tabloya bağımlılığı yok.</div>'}
            </div>
          </div>
          ${viewOutputsHtml}
        `;

      } else if (this.currentDbObjectTab === "code") {
        contentHtml = `
          <div class="inspector-section" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div class="inspector-label" style="margin-bottom:0;">Kaynak SQL Kodu</div>
            <button id="btn-insp-copy-sql" class="btn-secondary" style="padding:2px 8px; font-size:0.75rem;">Kopyala</button>
          </div>
          <div class="inspector-section" style="flex:1; display:flex; flex-direction:column; min-height:260px; height:calc(100% - 40px); margin-bottom:0;">
            <div class="sql-editor-container">
              <pre id="insp-sql-highlight-${obj.id}" class="sql-highlight-pre"></pre>
              <textarea id="insp-sql-editor-${obj.id}" class="inspector-input" placeholder="-- SQL kodunu yazın ve simüle edin...">${obj.sql}</textarea>
            </div>
          </div>
        `;

      } else if (this.currentDbObjectTab === "map") {
        const isDark = !document.body.classList.contains("light");
        const svgString = this.generateDependencySvg(obj, stateManager.state, isDark);
        contentHtml = `
          <div class="inspector-section">
            <div class="inspector-label">Bağımlılık Haritası</div>
            <div style="background:var(--bg); border:1px solid var(--border2); border-radius:12px; padding:10px 0; margin-top:6px;">
              ${svgString}
            </div>
          </div>
          <div class="inspector-section">
            <div class="inspector-label">Açıklamalar</div>
            <div style="font-size:0.78rem; line-height:1.5; color:var(--text2); display:flex; flex-direction:column; gap:6px; margin-top:6px;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="width:12px; height:3px; background:#10b981; display:inline-block;"></span>
                <span>Yeşil ok: Tablodan veri okur (READ)</span>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="width:12px; height:3px; background:#ef4444; display:inline-block;"></span>
                <span>Kırmızı ok: Tabloya veri yazar (WRITE)</span>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="width:12px; height:3px; background:#f59e0b; display:inline-block; border-bottom:1px dashed #f59e0b;"></span>
                <span>Sarı/Kesikli ok: Tablo tetikleyiciyi çalıştırır</span>
              </div>
            </div>
          </div>
        `;
      } else if (this.currentDbObjectTab === "simulate") {
        // Query analysis metrics
        const sql = obj.sql || "";
        const joinsCount = (sql.match(/\bjoin\b/gi) || []).length;
        const subqueriesCount = (sql.match(/\(\s*select\b/gi) || []).length;
        const hasSelectStar = /\bselect\s+\*\b/i.test(sql);
        const aggFuncsCount = (sql.match(/\b(count|sum|avg|min|max)\b/gi) || []).length;
        
        let complexity = "Düşük (Mükemmel) 🟢";
        let complexityColor = "var(--success)";
        if (joinsCount > 4 || subqueriesCount > 2) {
          complexity = "Yüksek (Performans Riski) 🔴";
          complexityColor = "var(--danger)";
        } else if (joinsCount > 1 || subqueriesCount > 0) {
          complexity = "Orta (Kabul Edilebilir) 🟡";
          complexityColor = "var(--warning)";
        }

        // Gather index suggestions
        const suggestions = [];
        if (hasSelectStar) {
          suggestions.push("<code>SELECT *</code> yerine sütun isimlerini açıkça belirtin.");
        }
        if (subqueriesCount > 0) {
          suggestions.push("Alt sorgular yerine <code>JOIN</code> veya <code>CTE</code> kullanmayı deneyin.");
        }
        
        // Find columns used in WHERE clause for index recommendations
        const whereMatch = sql.match(/\bwhere\b([\s\S]*?)(?:$|;|group\s+by|order\s+by|union)/i);
        if (whereMatch) {
          const whereClause = whereMatch[1];
          const colMatches = whereClause.match(/\[?(\w+)\]?\s*(=|like|in|between|<|>)/gi);
          if (colMatches) {
            colMatches.forEach(m => {
              const colName = m.replace(/[\[\]]/g, "").match(/^\w+/);
              if (colName && colName[0]) {
                const name = colName[0];
                if (!["id", "isdelete", "isactive"].includes(name.toLowerCase())) {
                  suggestions.push(`Sık filtreleme yapılan <code>${name}</code> kolonuna INDEX tanımlanması önerilir.`);
                }
              }
            });
          }
        }
        if (suggestions.length === 0) {
          suggestions.push("Sorgu yapısı optimize edilmiş görünüyor. Herhangi bir performans darboğazı bulunamadı.");
        }

        // ── DETAYLI VERİ AKIŞ SİMÜLASYONU ──
        const simulationSteps = [];
        obj.dependencies.forEach(depId => {
          const tbl = stateManager.state.tables.find(t => t.id === depId);
          if (!tbl) return;

          const escapedName = tbl.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
          
          let opText = "OKUR (SELECT)";
          let opColor = "var(--accent)";
          if (new RegExp(`\\b(insert\\s+into|insert)\\s+(?:\\w+\\.)*${escapedName}\\b`, "i").test(sql)) {
            opText = "VERİ EKLER (INSERT)";
            opColor = "var(--success)";
          } else if (new RegExp(`\\bupdate\\s+(?:\\w+\\.)*${escapedName}\\b`, "i").test(sql)) {
            opText = "VERİ GÜNCELLER (UPDATE)";
            opColor = "var(--warning)";
          } else if (new RegExp(`\\b(delete\\s+from|delete)\\s+(?:\\w+\\.)*${escapedName}\\b`, "i").test(sql)) {
            opText = "VERİ SİLER (DELETE)";
            opColor = "var(--danger)";
          }

          const accessed = getAccessedFields(tbl.name, tbl.fields, sql);
          const accessedNames = accessed.map(f => `<code>${f.name}</code>`).join(", ");
          
          let stepHtml = `
            <div style="background:var(--bg); border:1px solid var(--border2); padding:10px; border-radius:8px; margin-bottom:8px; font-size:0.78rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <strong style="color:var(--text); font-size:0.82rem;">💾 ${tbl.name} Tablosu</strong>
                <span style="font-size:0.68rem; font-weight:800; color:${opColor}; border:1px solid ${opColor}; padding:1px 5px; border-radius:3px; background:${opColor}10;">${opText}</span>
              </div>
              <div style="color:var(--text2); line-height:1.4;">
                Bu nesne, tablo üzerinde <b>${opText.split(" ")[0]}</b> işlemi gerçekleştirmektedir.
                ${accessed.length > 0 ? `<br><b>İşlenen Kolonlar:</b> ${accessedNames}` : ""}
              </div>
          `;

          // Join condition tespiti
          const joinConditions = getJoinConditions(sql);
          const tblJoins = [];
          Object.keys(joinConditions).forEach(fieldName => {
            if (tbl.fields.some(f => f.name === fieldName)) {
              joinConditions[fieldName].forEach(cond => {
                tblJoins.push(`<code>${cond}</code>`);
              });
            }
          });
          if (tblJoins.length > 0) {
            stepHtml += `
              <div style="margin-top:6px; padding-top:6px; border-top:1px dashed var(--border2); font-size:0.75rem; color:var(--text2);">
                🔗 <b>Bağlantı Şekli:</b> ${Array.from(new Set(tblJoins)).join(" veya ")}
              </div>
            `;
          }
          
          stepHtml += `</div>`;
          simulationSteps.push(stepHtml);
        });

        const projCols = getProjectedColumns(sql, stateManager.state.tables);
        
        const mockRows = [];
        for (let rIndex = 0; rIndex < 5; rIndex++) {
          const rowData = {};
          projCols.forEach(col => {
            rowData[col.name] = generateMockValue(col.name, rIndex, col.sourceTable, col.sourceColumn);
          });
          mockRows.push(rowData);
        }

        let tableHeaderHtml = "";
        let tableBodyHtml = "";
        
        if (projCols.length > 0) {
          tableHeaderHtml = projCols.map(col => `
            <th style="padding:8px; border-bottom:2px solid var(--border); font-size:0.72rem; text-align:left; color:var(--text2); white-space:nowrap;">
              ${col.name}
            </th>
          `).join('');
          
          tableBodyHtml = mockRows.map(row => `
            <tr style="border-bottom:1px solid var(--border2);">
              ${projCols.map(col => `
                <td style="padding:8px; font-size:0.75rem; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:120px;" title="${row[col.name]}">
                  ${row[col.name]}
                </td>
              `).join('')}
            </tr>
          `).join('');
        }

        contentHtml = `
          <!-- Akış Simülasyonu -->
          <div class="inspector-section" style="margin-bottom:16px;">
            <div class="inspector-label" style="margin-bottom:6px;">Detaylı İşlem Akış Simülasyonu</div>
            <div style="max-height:240px; overflow-y:auto; padding-right:4px;">
              ${simulationSteps.length > 0 ? simulationSteps.join('') : '<div style="font-size:0.8rem; color:var(--text2); font-style:italic;">İlişkili tablo işlemi bulunamadı.</div>'}
            </div>
          </div>

          <!-- Performance Analysis Card -->
          <div class="inspector-section" style="margin-bottom:16px;">
            <div class="inspector-label" style="margin-bottom:6px;">Sorgu Performans Karnesi</div>
            <div style="background:var(--surface2); border:1px solid var(--border); border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem;">
                <span style="color:var(--text2);">Sorgu Karmaşıklığı:</span>
                <span style="font-weight:bold; color:${complexityColor};">${complexity}</span>
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:2px;">
                <span style="font-size:0.68rem; background:var(--bg); border:1px solid var(--border2); color:var(--text2); padding:2px 6px; border-radius:4px;">
                  <b>${joinsCount}</b> JOIN
                </span>
                <span style="font-size:0.68rem; background:var(--bg); border:1px solid var(--border2); color:var(--text2); padding:2px 6px; border-radius:4px;">
                  <b>${subqueriesCount}</b> Alt Sorgu
                </span>
                <span style="font-size:0.68rem; background:var(--bg); border:1px solid var(--border2); color:var(--text2); padding:2px 6px; border-radius:4px;">
                  <b>${aggFuncsCount}</b> Agregasyon
                </span>
              </div>
            </div>
          </div>

          <!-- Optimization Suggestions -->
          <div class="inspector-section" style="margin-bottom:16px;">
            <div class="inspector-label" style="margin-bottom:6px;">İyileştirme Önerileri</div>
            <div style="background:var(--surface2); border:1px solid var(--border); border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px;">
              ${suggestions.map(s => `
                <div style="display:flex; align-items:flex-start; gap:8px; font-size:0.75rem; line-height:1.4; color:var(--text2);">
                  <span style="color:var(--primary); font-weight:bold; margin-top:-1px;">💡</span>
                  <span>${s}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Simulated Preview Data -->
          <div class="inspector-section" style="flex:1; display:flex; flex-direction:column; min-height:180px; margin-bottom:0;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <div class="inspector-label" style="margin-bottom:0;">Simüle Edilmiş Sonuçlar (İlk 5 Satır)</div>
              <button id="btn-re-simulate" class="btn-secondary" style="padding:2px 8px; font-size:0.7rem; border-radius:4px; height:auto;">Yenile</button>
            </div>
            
            ${projCols.length > 0 ? `
              <div style="flex:1; overflow:auto; border:1px solid var(--border2); border-radius:8px; background:var(--bg); max-height:220px;">
                <table style="width:100%; border-collapse:collapse; text-align:left;">
                  <thead>
                    <tr style="background:var(--surface2);">
                      ${tableHeaderHtml}
                    </tr>
                  </thead>
                  <tbody>
                    ${tableBodyHtml}
                  </tbody>
                </table>
              </div>
            ` : `
              <div style="flex:1; display:flex; align-items:center; justify-content:center; border:1px dashed var(--border2); border-radius:8px; padding:20px; text-align:center; color:var(--text2); font-size:0.78rem; background:var(--surface2);">
                Seçim listesi bulunamadı (SELECT ifadesini kontrol edin).
              </div>
            `}
          </div>
        `;
      }

      container.innerHTML = tabsHtml + contentHtml;

      container.querySelectorAll(".insp-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          this.currentDbObjectTab = btn.getAttribute("data-tab");
          this.renderInspector(selected);
        });
      });

      const reSimulateBtn = document.getElementById("btn-re-simulate");
      if (reSimulateBtn) {
        reSimulateBtn.addEventListener("click", () => {
          this.renderInspector(selected);
          this.cc.showToast("Sonuçlar yeniden simüle edildi!");
        });
      }

      const copyBtn = document.getElementById("btn-insp-copy-sql");
      if (copyBtn) {
        copyBtn.addEventListener("click", () => {
          const textarea = document.getElementById(`insp-sql-editor-${obj.id}`);
          if (textarea) {
            navigator.clipboard.writeText(textarea.value);
            this.cc.showToast("SQL kodu kopyalandı!");
          }
        });
      }

      const editor = document.getElementById(`insp-sql-editor-${obj.id}`);
      const highlight = document.getElementById(`insp-sql-highlight-${obj.id}`);
      if (editor && highlight) {
        highlight.innerHTML = this.highlightSQL(editor.value) + "\n";

        const syncScroll = () => {
          highlight.scrollTop = editor.scrollTop;
          highlight.scrollLeft = editor.scrollLeft;
        };

        // Sync immediately on load/render
        setTimeout(syncScroll, 50);

        editor.addEventListener("scroll", syncScroll);
        editor.addEventListener("keyup", syncScroll);
        editor.addEventListener("click", syncScroll);

        editor.addEventListener("input", (e) => {
          const newSql = e.target.value;
          highlight.innerHTML = this.highlightSQL(newSql) + "\n";
          syncScroll();
          
          const newDeps = [];
          stateManager.state.tables.forEach(tbl => {
            const regex = new RegExp(`\\b${tbl.name}\\b`, 'i');
            if (regex.test(newSql)) {
              newDeps.push(tbl.id);
            }
          });

          stateManager.updateDbObject(obj.id, { sql: newSql, dependencies: newDeps });
          
          if (this.cc.cc.renderer) {
            this.cc.cc.renderer.renderDependencyFlow(stateManager.state);
          }
        });
      }
    }
  }

  generateDependencySvg(obj, state, isDark) {
    const cfg = {
      view: { 
        label: "VIEW", 
        color: "#10b981",
        iconSvg: `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="#10b981" stroke-width="2.5" fill="none"/><circle cx="12" cy="12" r="3" stroke="#10b981" stroke-width="2.5" fill="none"/>`
      },
      procedure: { 
        label: "PROCEDURE", 
        color: "#f97316",
        iconSvg: `<polygon points="8 5 19 12 8 19 8 5" stroke="#f97316" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
      },
      function: { 
        label: "FUNCTION", 
        color: "#3b82f6",
        iconSvg: `<polyline points="16 18 22 12 16 6" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><polyline points="8 6 2 12 8 18" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
      },
      trigger: { 
        label: "TRIGGER", 
        color: "#ef4444",
        iconSvg: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
      }
    }[obj.type] || { 
      label: "OBJECT", 
      color: "#6366f1",
      iconSvg: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#6366f1" stroke-width="2.5" fill="none"/><polyline points="14 2 14 8 20 8" stroke="#6366f1" stroke-width="2.5" fill="none"/>`
    };

    const activeDepTableIds = new Set(obj.dependencies);
    const depTables = state.tables.filter(t => activeDepTableIds.has(t.id));

    const W = 380, H = 260;
    const cx = W / 2, cy = H / 2;
    const r = depTables.length <= 3 ? 90 : depTables.length <= 6 ? 100 : 110;

    let nodes = depTables.map((t, i) => {
      const angle = (2 * Math.PI * i) / depTables.length - Math.PI / 2;
      let actionType = "READ";
      const escapedName = t.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const writeRegex = new RegExp(
        `\\b(insert\\s+into|update|delete\\s+from|delete)\\s+(?:\\w+\\.)*${escapedName}\\b`,
        "i"
      );
      if (writeRegex.test(obj.sql)) {
        actionType = "WRITE";
      } else if (obj.type === "trigger") {
        actionType = "TRIGGERED_BY";
      }

      return {
        name: t.name,
        color: t.color || "#6366f1",
        actionType,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle)
      };
    });

    const nodeFill = isDark ? "#22222f" : "#f5f5fd";
    const nodeText = isDark ? "white" : "#1a1a2e";
    const centerFg = isDark ? "#1a1a24" : "#ffffff";
    const arrowColorMap = {
      READ: "#10b981",
      WRITE: "#ef4444",
      TRIGGERED_BY: "#f59e0b"
    };

    let svgContent = `
      <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible; display:block; margin:0 auto;">
        <defs>
          ${Object.entries(arrowColorMap).map(([k, color]) => `
            <marker id="da-mini-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 2 L 10 5 L 0 8 z" fill="${color}" />
            </marker>
          `).join('')}
        </defs>
    `;

    nodes.forEach(n => {
      const arrowColor = arrowColorMap[n.actionType] || "#10b981";
      const dx = n.x - cx;
      const dy = n.y - cy;
      const len = Math.hypot(dx, dy);
      
      const sx = cx + (dx / len) * 36;
      const sy = cy + (dy / len) * 36;
      const ex = n.x - (dx / len) * 49;
      const ey = n.y - (dy / len) * 18;

      svgContent += `
        <line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}"
          stroke="${arrowColor}" stroke-width="1.5"
          ${n.actionType === "TRIGGERED_BY" ? 'stroke-dasharray="4,3"' : ''}
          marker-end="url(#da-mini-${n.actionType})"
          opacity="0.8"
        />
      `;
    });

    svgContent += `
      <circle cx="${cx}" cy="${cy}" r="32" fill="${centerFg}" stroke="${cfg.color}" stroke-width="2.5" />
      <g transform="translate(${cx - 12}, ${cy - 18})">
        ${cfg.iconSvg}
      </g>
      <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="8px" font-weight="900" fill="${cfg.color}" letter-spacing="0.2" font-family="sans-serif">${cfg.label}</text>
    `;

    nodes.forEach(n => {
      const arrowColor = arrowColorMap[n.actionType] || "#10b981";
      const disp = n.name.length > 15 ? n.name.slice(0, 14) + "…" : n.name;
      svgContent += `
        <g>
          <rect x="${n.x - 45}" y="${n.y - 16}" width="90" height="32" rx="6" fill="${nodeFill}" stroke="${arrowColor}" stroke-width="1.5" />
          <text x="${n.x}" y="${n.y - 2}" text-anchor="middle" font-size="10px" font-weight="bold" fill="${nodeText}" font-family="sans-serif">${disp}</text>
          <text x="${n.x}" y="${n.y + 8}" text-anchor="middle" font-size="8px" font-weight="extrabold" fill="${arrowColor}" font-family="sans-serif">${n.actionType}</text>
        </g>
      `;
    });

    svgContent += `</svg>`;
    return svgContent;
  }

  highlightSQL(sql) {
    if (!sql) return "";
    let html = sql
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const placeholders = [];

    // Multi-line comments
    html = html.replace(/\/\*[\s\S]*?\*\//g, (match) => {
      const id = `##PLACEHOLDER_COMMENT_${placeholders.length}##`;
      placeholders.push(`<span style="color: #94a3b8; font-style: italic;">${match}</span>`);
      return id;
    });

    // Single-line comments
    html = html.replace(/--.*$/gm, (match) => {
      const id = `##PLACEHOLDER_COMMENT_${placeholders.length}##`;
      placeholders.push(`<span style="color: #94a3b8; font-style: italic;">${match}</span>`);
      return id;
    });

    // Strings
    html = html.replace(/(['"])(?:\\.|[^\\])*?\1/g, (match) => {
      const id = `##PLACEHOLDER_STRING_${placeholders.length}##`;
      placeholders.push(`<span style="color: #34d399;">${match}</span>`);
      return id;
    });

    // SQL Keywords
    const keywords = [
      "select", "create", "view", "procedure", "function", "trigger", "as", "from",
      "left", "join", "on", "where", "and", "or", "in", "not", "null", "case", "when",
      "then", "else", "end", "isnull", "concat", "format", "right", "inner", "outer",
      "insert", "into", "update", "delete", "table", "returns", "begin", "declare", "set", "group", "by", "order"
    ];
    
    keywords.sort((a, b) => b.length - a.length);
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, "gi");
      html = html.replace(regex, (match) => {
        return `<span style="color: #818cf8; font-weight: bold;">${match}</span>`;
      });
    });

    // SQL functions
    const sqlFuncs = ["count", "sum", "max", "min", "avg", "getdate", "coalesce", "cast", "convert", "distinct"];
    sqlFuncs.forEach(func => {
      const regex = new RegExp(`\\b${func}\\b`, "gi");
      html = html.replace(regex, (match) => {
        return `<span style="color: #c084fc; font-weight: bold;">${match}</span>`;
      });
    });

    // Restore placeholders
    for (let i = placeholders.length - 1; i >= 0; i--) {
      const id = `##PLACEHOLDER_COMMENT_${i}##`;
      const idStr = `##PLACEHOLDER_STRING_${i}##`;
      html = html.replace(id, placeholders[i]).replace(idStr, placeholders[i]);
    }

    return html;
  }

  // ── Connection status in header ─────────────────────────────────────────────
  updateConnectionStatus() {
    const el = document.getElementById("db-status-indicator");
    if (!el) return;
    if (!this.activeConnectionId) {
      el.innerHTML = `<span class="db-status-dot db-status-none"></span> DB Bağlantısı Yok`;
      el.title = "Bağlantı yok";
      return;
    }
    fetch('/api/connections').then(r => r.json()).then(conns => {
      const conn = conns.find(c => c.id === this.activeConnectionId);
      if (conn) {
        el.innerHTML = `<span class="db-status-dot db-status-ok"></span> ${conn.name}`;
        el.title = `${conn.server} / ${conn.database}`;
      }
    }).catch(() => {
      el.innerHTML = `<span class="db-status-dot db-status-err"></span> Bağlantı hatası`;
    });
  }

  // ── Load recent diagrams from server ────────────────────────────────────────
  loadRecentDiagrams(nameInput) {
    fetch('/api/diagrams')
      .then(res => res.ok ? res.json() : [])
      .then(diagrams => {
        if (!diagrams || diagrams.length === 0) return;
        document.getElementById("recent-diagrams").style.display = "block";
        const list = document.getElementById("recent-list");
        if (!list) return;
        list.innerHTML = "";
        diagrams.forEach(d => {
          const item = document.createElement("div");
          item.className = "recent-item";
          const savedDate = d.savedAt ? new Date(d.savedAt).toLocaleString("tr-TR") : "Bilinmiyor";
          item.innerHTML = `
            <div style="flex:1; overflow:hidden;">
              <div class="recent-item-name">${d.name || "İsimsiz Diyagram"}</div>
              <div class="recent-item-meta">${d.tables} tablo · ${d.relationships} ilişki · ${savedDate}</div>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">
              <button class="btn-rename-diagram" title="Yeniden Adlandır" style="background:none;border:none;color:var(--text2);font-size:0.85rem;cursor:pointer;padding:4px;">✎</button>
              <button class="btn-delete-diagram" title="Sil" style="background:none;border:none;color:var(--danger);font-size:1rem;cursor:pointer;padding:4px;">✕</button>
            </div>
          `;
          item.addEventListener("click", (e) => {
            if (e.target.closest(".btn-delete-diagram") || e.target.closest(".btn-rename-diagram")) return;
            fetch(`/api/diagrams/load?id=${encodeURIComponent(d.id)}`)
              .then(res => res.json())
              .then(data => {
                stateManager.loadDiagram(data);
                this.activeDiagramId = data.id || d.id;
                this.activeConnectionId = data.connectionId || null;
                this.updateConnectionStatus();
                document.getElementById("splash-screen").style.display = "none";
                document.getElementById("app").style.display = "flex";
                if (nameInput) nameInput.value = stateManager.state.name;
                this.cc.fitToViewport();
                this.cc.showToast(`"${data.name}" diyagramı yüklendi!`);
              })
              .catch(() => this.cc.showToast("Diyagram yüklenemedi!", "warning"));
          });
          item.querySelector(".btn-rename-diagram")?.addEventListener("click", (e) => {
            e.stopPropagation();
            const newName = prompt("Yeni diyagram adı:", d.name);
            if (!newName || newName.trim() === d.name) return;
            fetch('/api/diagrams/rename', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: d.id, name: newName.trim() }) })
              .then(() => { item.querySelector(".recent-item-name").textContent = newName.trim(); d.name = newName.trim(); this.cc.showToast("Yeniden adlandırıldı."); })
              .catch(() => this.cc.showToast("Yeniden adlandırma başarısız.", "warning"));
          });
          item.querySelector(".btn-delete-diagram")?.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!confirm(`"${d.name}" diyagramını silmek istiyor musunuz?`)) return;
            fetch(`/api/diagrams/delete?id=${encodeURIComponent(d.id)}`, { method: 'DELETE' })
              .then(() => { item.remove(); this.cc.showToast("Diyagram silindi."); })
              .catch(() => this.cc.showToast("Silinemedi.", "warning"));
          });
          list.appendChild(item);
        });
      })
      .catch(() => {
        // Fallback to localStorage if server not available
        try {
          const saved = localStorage.getItem("lite_db_saved_diagram");
          if (!saved) return;
          const data = JSON.parse(saved);
          if (!data || typeof data !== "object") return;
          document.getElementById("recent-diagrams").style.display = "block";
          const list = document.getElementById("recent-list");
          if (!list) return;
          list.innerHTML = "";
          const item = document.createElement("div");
          item.className = "recent-item";
          item.innerHTML = `<div><div class="recent-item-name">${data.name || "İsimsiz"} <span style="font-size:0.65rem;color:var(--warning);">(Yerel)</span></div><div class="recent-item-meta">${(data.tables||[]).length} tablo</div></div>`;
          item.addEventListener("click", () => {
            stateManager.loadDiagram(data);
            document.getElementById("splash-screen").style.display = "none";
            document.getElementById("app").style.display = "flex";
            if (nameInput) nameInput.value = stateManager.state.name;
            this.cc.fitToViewport();
          });
          list.appendChild(item);
        } catch {}
      });
  }

  // ── New Diagram Modal (connection picker) ───────────────────────────────────
  openNewDiagramModal() {
    const modal = document.getElementById("conn-modal");
    if (!modal) {
      console.error("[LiteDB] conn-modal elementi bulunamadı!");
      return;
    }

    let selectedConnId = null;

    const refreshSavedList = () => {
      const savedList = document.getElementById("conn-saved-list");
      fetch('/api/connections').then(r => r.json()).then(conns => {
        if (!conns || conns.length === 0) {
          savedList.innerHTML = `<div style="color:var(--text2);font-size:0.8rem;padding:4px 0;">Kayıtlı bağlantı yok. Aşağıdan yeni ekleyin.</div>`;
          return;
        }
        savedList.innerHTML = conns.map(c => `
          <div class="conn-saved-item" data-id="${c.id}">
            <div style="flex:1;">
              <div style="font-weight:600;font-size:0.85rem;">${c.name}</div>
              <div style="font-size:0.75rem;color:var(--text2);">${c.server} / ${c.database}</div>
            </div>
            <button class="conn-saved-delete" data-id="${c.id}" title="Sil" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:0.9rem;">✕</button>
          </div>
        `).join('');

        savedList.querySelectorAll(".conn-saved-item").forEach(el => {
          el.addEventListener("click", (e) => {
            if (e.target.closest(".conn-saved-delete")) return;
            savedList.querySelectorAll(".conn-saved-item").forEach(x => x.classList.remove("selected"));
            el.classList.add("selected");
            selectedConnId = el.dataset.id;
            const connName = el.querySelector("div[style] div").textContent;
            document.getElementById("conn-selected-info").textContent = `✅ Seçildi: ${connName}`;
          });
        });
        savedList.querySelectorAll(".conn-saved-delete").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            if (!confirm("Bu bağlantıyı silmek istiyor musunuz?")) return;
            fetch(`/api/connections/delete?id=${id}`, { method: 'DELETE' })
              .then(() => { if (selectedConnId === id) { selectedConnId = null; document.getElementById("conn-selected-info").textContent = ""; } refreshSavedList(); });
          });
        });
      }).catch(() => { document.getElementById("conn-saved-list").innerHTML = `<div style="color:var(--warning);font-size:0.8rem;">Sunucu çalışmıyor — npm run dev gerekli</div>`; });
    };

    modal.style.display = "flex";
    refreshSavedList();

    const connTestBtn = document.getElementById("conn-test-btn");
    if (connTestBtn) connTestBtn.onclick = () => {
      const payload = {
        server: document.getElementById("conn-server").value.trim(),
        port: parseInt(document.getElementById("conn-port").value) || 1433,
        database: document.getElementById("conn-database").value.trim(),
        username: document.getElementById("conn-user").value.trim(),
        password: document.getElementById("conn-pass").value
      };
      const resultEl = document.getElementById("conn-test-result");
      resultEl.textContent = "Test ediliyor...";
      fetch('/api/connections/test', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        .then(r => r.json())
        .then(res => { resultEl.textContent = res.success ? "✅ " + res.message : "❌ " + res.message; resultEl.style.color = res.success ? "var(--success)" : "var(--danger)"; })
        .catch(() => { resultEl.textContent = "❌ Sunucuya ulaşılamadı"; resultEl.style.color = "var(--danger)"; });
    };

    const connCancelBtn = document.getElementById("conn-cancel-btn");
    if (connCancelBtn) connCancelBtn.onclick = () => { modal.style.display = "none"; };

    const connCreateBtn = document.getElementById("conn-create-btn");
    if (connCreateBtn) connCreateBtn.onclick = async () => {
      const diagName = document.getElementById("conn-diag-name").value.trim() || "Yeni Diyagram";
      const newName  = document.getElementById("conn-name").value.trim();

      // Save new connection if filled
      if (newName) {
        const payload = {
          name: newName,
          server:   document.getElementById("conn-server").value.trim(),
          port:     parseInt(document.getElementById("conn-port").value) || 1433,
          database: document.getElementById("conn-database").value.trim(),
          username: document.getElementById("conn-user").value.trim(),
          password: document.getElementById("conn-pass").value
        };
        const res = await fetch('/api/connections/create', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }).then(r => r.json());
        if (res.id) selectedConnId = res.id;
      }

      modal.style.display = "none";
      stateManager.loadDiagram({ name: diagName, tables: [], relationships: [], notes: [], areas: [], enums: [], views: [], procedures: [], functions: [], triggers: [] });
      this.activeConnectionId = selectedConnId;
      this.activeDiagramId    = null;
      this.updateConnectionStatus();

      document.getElementById("splash-screen").style.display = "none";
      document.getElementById("app").style.display = "flex";
      const ni = document.getElementById("diagram-name");
      if (ni) ni.value = diagName;
      this.cc.fitToViewport();

      // If connection selected, fetch schema automatically
      if (selectedConnId) {
        this.cc.showToast("Şema çekiliyor...");
        fetch('/api/sync', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ connectionId: selectedConnId }) })
          .then(r => r.json()).then(res => {
            if (res.success) {
              this.cc.showToast(`✅ ${res.message}`);
              fetch('/api/schema').then(r => r.json()).then(schema => {
                stateManager.loadDiagram({
                  ...stateManager.state,
                  tables:        schema.tables        || [],
                  relationships: schema.relationships || [],
                  views:         schema.views         || [],
                  procedures:    schema.procedures    || [],
                  functions:     schema.functions     || [],
                  triggers:      schema.triggers      || []
                });
              });
            } else { this.cc.showToast("Şema çekilemedi: " + res.message, "warning"); }
          }).catch(() => this.cc.showToast("Şema çekilemedi, sunucu hatası.", "warning"));
      } else {
        this.cc.showToast(`"${diagName}" diyagramı oluşturuldu!`);
      }
    };
  }
}
