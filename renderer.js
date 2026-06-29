import { getProjectedColumns, getAccessedFields, getWhereConditions, getJoinConditions, getTableAliases, cleanSql, stripSubqueries } from "./sqlParser.js";
import { stateManager } from "./state.js";

export class CanvasRenderer {
  constructor(canvasController) {
    this.cc = canvasController;
    this.tablesLayer = document.getElementById("tables-layer");
    this.relationshipsLayer = document.getElementById("relationships-layer");
    this.notesLayer = document.getElementById("notes-layer");
    this.areasLayer = document.getElementById("areas-layer");
    this.objectsLayer = document.getElementById("objects-layer");
    this.inLineageMode = false;
    this.lockedTableId = null;
    this.setupRelatedObjectsListener();

    // Canvas background click clears the focus lock
    let bgMouseDownX = 0;
    let bgMouseDownY = 0;
    const bg = document.getElementById("canvas-bg");
    if (bg) {
      bg.addEventListener("mousedown", (e) => {
        bgMouseDownX = e.clientX;
        bgMouseDownY = e.clientY;
      });
      bg.addEventListener("click", (e) => {
        const dist = Math.hypot(e.clientX - bgMouseDownX, e.clientY - bgMouseDownY);
        // Only clear if it was a true click (moved less than 5px)
        if (dist < 5) {
          if (this.lockedTableId) {
            this.lockedTableId = null;
            this.clearHighlights();
          }
        }
      });
    }

    // Clear focus lock when select tool is activated
    const selectToolBtn = document.getElementById("tool-select");
    if (selectToolBtn) {
      selectToolBtn.addEventListener("click", () => {
        if (this.lockedTableId) {
          this.lockedTableId = null;
          this.clearHighlights();
        }
      });
    }
  }

  applyHighlight(tableId) {
    const relatedRels = stateManager.state.relationships.filter(r => r.startTableId === tableId || r.endTableId === tableId);
    const relatedTableIds = new Set(relatedRels.flatMap(r => [r.startTableId, r.endTableId]));
    relatedTableIds.add(tableId);

    document.querySelectorAll(".table-card").forEach(tc => {
      const tcId = tc.parentElement.id.replace("table-", "");
      if (!relatedTableIds.has(tcId)) {
        tc.style.opacity = "0.15";
        tc.style.filter = "grayscale(50%)";
        tc.style.transition = "all 0.15s ease";
      } else {
        tc.style.opacity = "1";
        tc.style.transition = "all 0.15s ease";
        if (tcId === tableId) {
          tc.style.boxShadow = "0 0 15px rgba(99,102,241,0.4)";
        }
      }
    });

    document.querySelectorAll(".rel-path").forEach(p => {
      p.style.opacity = "0.1";
      p.style.transition = "all 0.15s ease";
    });

    document.querySelectorAll(`.rel-path[data-start-table-id="${tableId}"], .rel-path[data-end-table-id="${tableId}"]`).forEach(p => {
      p.style.opacity = "1";
      p.style.strokeWidth = "3.5";
      p.style.stroke = "var(--primary-h)";
    });
  }

  clearHighlights() {
    document.querySelectorAll(".table-card").forEach(tc => {
      tc.style.opacity = "1";
      tc.style.filter = "none";
      tc.style.boxShadow = "var(--shadow)";
    });
    document.querySelectorAll(".rel-path").forEach(p => {
      p.style.opacity = "1";
      p.style.strokeWidth = "2.5";
      p.style.stroke = "var(--rel-color)";
    });
  }

  render(state) {
    const exitBtn = document.getElementById("exit-lineage-btn");
    if (exitBtn && !this.inLineageMode) {
      exitBtn.style.display = "none";
    }

    if (this.inLineageMode) {
      return;
    }

    // Restore standard display/styles before rendering
    document.querySelectorAll("foreignObject, g[id^='area-group-'], path.rel-path").forEach(el => {
      el.style.display = "";
      el.style.opacity = "1";
    });

    let tablesToRender = state.tables;
    let relsToRender = state.relationships;
    if (this.isolatedFolderId) {
      tablesToRender = state.tables.filter(t => t.folder === this.isolatedFolderId);
      const tblIds = new Set(tablesToRender.map(t => t.id));
      relsToRender = state.relationships.filter(r => tblIds.has(r.startTableId) && tblIds.has(r.endTableId));
    }

    this.renderAreas(state.areas);
    this.renderNotes(state.notes);
    this.renderTables(tablesToRender);
    this.renderRelationships(relsToRender, tablesToRender);

    // Clear and draw dependency flows if selected
    if (this.objectsLayer) this.objectsLayer.innerHTML = "";
    const legend = document.getElementById("lineage-legend");
    const infoBtn = document.getElementById("lineage-info-btn");
    if (legend) legend.style.display = "none";
    if (infoBtn) infoBtn.style.display = "none";

    const selected = this.cc.selectedElement;
    if (selected && selected.type === "db_object") {
      this.renderDependencyFlow(state);
    } else {
      // Restore standard styles if no db_object is selected
      const tableCards = document.querySelectorAll(".table-card");
      tableCards.forEach(tc => {
        tc.style.opacity = "1";
        tc.style.borderColor = "var(--border)";
        tc.style.boxShadow = "var(--shadow)";
      });
      const relPaths = document.querySelectorAll(".rel-path");
      relPaths.forEach(rp => {
        rp.style.opacity = "1";
        rp.style.display = "";
      });
    }

    if (this.lockedTableId) {
      const tableExists = tablesToRender.some(t => t.id === this.lockedTableId);
      if (tableExists) {
        this.applyHighlight(this.lockedTableId);
      } else {
        this.lockedTableId = null;
      }
    }

    // Toggle empty state
    const isEmpty = state.tables.length === 0 && state.notes.length === 0 && state.areas.length === 0;
    const emptyState = document.getElementById("empty-state");
    if (emptyState) {
      emptyState.style.display = isEmpty ? "flex" : "none";
    }
  }

  // Listen for showRelatedObjects / showTableLineage events
  setupRelatedObjectsListener() {
    // Legacy event (still supported)
    window.addEventListener('showRelatedObjects', (e) => {
      const { tableId, relatedObjectIds } = e.detail;
      this.renderMultipleDbObjects(relatedObjectIds);
    });

    // New unified table lineage event
    window.addEventListener('showTableLineage', (e) => {
      const { tableId, fkRelationships, relatedSqlObjects } = e.detail;
      this.renderTableLineage(tableId, fkRelationships, relatedSqlObjects);
    });

    window.addEventListener('isolateFolder', (e) => {
      this.isolatedFolderId = e.detail;
      this.render(stateManager.state);
    });
  }

  renderMultipleDbObjects(objectIds) {
    const state = this.cc.stateManager.state;
    const allObjects = [
      ...state.views.map(o => ({ ...o, type: 'view' })),
      ...state.procedures.map(o => ({ ...o, type: 'procedure' })),
      ...state.functions.map(o => ({ ...o, type: 'function' })),
      ...state.triggers.map(o => ({ ...o, type: 'trigger' }))
    ];

    const objectsToRender = allObjects.filter(obj => objectIds.includes(obj.id));

    // Calculate positions for multiple objects
    const startX = 100;
    const startY = 100;
    const spacingX = 280;
    const spacingY = 200;
    const cols = 3;

    objectsToRender.forEach((obj, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      obj.x = startX + col * spacingX;
      obj.y = startY + row * spacingY;
      this.renderDbObject(obj);
    });
  }

  /**
   * Tabloya ait tüm FK ilişkilerini ve SQL objelerini tümleşik olarak diyagramda gösterir.
   * - Merkez: seçili tablo (parlak kenarlı)
   * - Sol: FK ile bağlı tablolar (tek sütun, kompakt yerleşim)
   * - Sağ: SQL objeleri (view, procedure, function, trigger)
   * - Ok çizgileri: FK → solid, SQL obj → dashed
   *
   * TÜM elemanlar objectsLayer'da sıfırdan çizilir (tablesLayer tamamen gizlenir).
   * Bu sayede DOM çakışması ve duplicate sorunları yaşanmaz.
   */
  /**
   * Tabloya ait tüm FK ilişkilerini ve SQL objelerini tümleşik olarak diyagramda gösterir.
   * - Merkez: seçili tablo (parlak kenarlı)
   * - Sol: FK ile bağlı tablolar (tek sütun, kompakt yerleşim)
   * - Sağ: SQL objeleri (view, procedure, function, trigger)
   * - Ok çizgileri: FK → solid, SQL obj → dashed
   *
   * TÜM elemanlar objectsLayer'da sıfırdan çizilir (tablesLayer tamamen gizlenir).
   * Bu sayede DOM çakışması ve duplicate sorunları yaşanmaz.
   */
  renderTableLineage(tableId, fkRelationships, relatedSqlObjects) {
    this.inLineageMode = true;
    const state = stateManager.state;
    const table = state.tables.find(t => t.id === tableId);
    if (!table) return;

    // Clear objects layer
    if (this.objectsLayer) this.objectsLayer.innerHTML = "";

    // ── tablesLayer + notesLayer + areasLayer → tamamen gizle ────────────────
    this.tablesLayer.querySelectorAll("foreignObject").forEach(fo => fo.style.display = "none");
    this.notesLayer.querySelectorAll("foreignObject").forEach(fo => fo.style.display = "none");
    this.areasLayer.querySelectorAll("g").forEach(g => g.style.display = "none");
    this.relationshipsLayer.querySelectorAll("path").forEach(p => p.style.display = "none");

    // ── Sabit layout sabitleri ───────────────────────────────────────────────
    const TW = 220;       // tablo genişliği
    const ROW_H = 26;
    const HDR_H = 40;
    const GAP = 24;       // tablolar arası dikey boşluk
    const COL_GAP = 160;  // sütunlar arası yatay boşluk
    const SQL_W = 195;    // SQL kart genişliği
    const SQL_H = 50;
    const SQL_GAP = 14;
    const ORIGIN_X = 200; // sol kenar başlangıç
    const ORIGIN_Y = 120; // üst kenar başlangıcı

    const calcH = (t) => HDR_H + (t.fields.length * ROW_H) + 10;
    const centerH = calcH(table);

    // ── FK tablolar listesi ───────────────────────────────────────────────────
    const fkTableIds = new Set();
    fkRelationships.forEach(r => {
      if (r.startTableId !== tableId) fkTableIds.add(r.startTableId);
      if (r.endTableId !== tableId) fkTableIds.add(r.endTableId);
    });
    const fkTables = [...fkTableIds]
      .map(id => state.tables.find(t => t.id === id))
      .filter(Boolean);

    // ── Layout: FK tablolar solda, merkez ortada, SQL objeleri sağda ─────────
    const fkHeights = fkTables.map(t => calcH(t));
    const totalFkH = fkHeights.reduce((s, h) => s + h, 0) + GAP * (fkTables.length - 1);

    const totalSqlH = relatedSqlObjects.length * SQL_H + SQL_GAP * (relatedSqlObjects.length - 1);

    const maxH = Math.max(centerH, totalFkH || 0, totalSqlH || 0);
    const layoutH = Math.max(maxH, 100);

    // X pozisyonları
    const fkX = fkTables.length > 0 ? ORIGIN_X : 0;
    const centerX = fkTables.length > 0 ? fkX + TW + COL_GAP : ORIGIN_X;
    const sqlX = relatedSqlObjects.length > 0 ? centerX + TW + COL_GAP : 0;

    // Y pozisyonları
    const centerY = ORIGIN_Y + (layoutH - centerH) / 2;

    const fkYStart = ORIGIN_Y + (layoutH - totalFkH) / 2;
    const fkCoords = {};
    let curFkY = fkYStart;
    fkTables.forEach((t, i) => {
      const h = fkHeights[i];
      fkCoords[t.id] = { x: fkX, y: curFkY, h };
      curFkY += h + GAP;
    });

    const sqlYStart = ORIGIN_Y + (layoutH - totalSqlH) / 2;

    // Helper: Bir tabloyu objectsLayer üzerinde sıfırdan çizer
    const drawTableCard = (tbl, tx, ty, isCenter = false) => {
      const th = calcH(tbl);
      const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
      fo.setAttribute("x", tx);
      fo.setAttribute("y", ty);
      fo.setAttribute("width", TW);
      fo.setAttribute("height", th);
      fo.setAttribute("id", `tl-table-${tbl.id}`);

      const card = document.createElement("div");
      card.className = "table-card";
      card.style.width = "100%";
      card.style.height = "100%";
      card.style.background = "var(--surface)";
      card.style.borderRadius = "8px";
      card.style.boxShadow = isCenter 
        ? `0 0 24px 6px ${tbl.color || "var(--primary)"}70`
        : `0 0 10px rgba(0,0,0,0.15)`;
      card.style.border = isCenter
        ? `2.5px solid ${tbl.color || "var(--primary)"}`
        : `1px solid var(--border)`;
      card.style.overflow = "hidden";
      card.style.display = "flex";
      card.style.flexDirection = "column";

      const header = document.createElement("div");
      header.className = "table-card-header";
      header.style.padding = "10px 12px";
      header.style.background = tbl.color || "var(--primary)";
      header.style.color = "#fff";
      header.style.fontWeight = "600";
      header.style.fontSize = "13px";
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";

      const nameSpan = document.createElement("span");
      nameSpan.innerText = tbl.name;
      header.appendChild(nameSpan);

      const pkBadge = document.createElement("span");
      pkBadge.style.opacity = "0.8";
      pkBadge.style.fontSize = "10px";
      pkBadge.innerText = `(${tbl.fields.length})`;
      header.appendChild(pkBadge);

      card.appendChild(header);

      const fieldsList = document.createElement("div");
      fieldsList.style.display = "flex";
      fieldsList.style.flexDirection = "column";
      fieldsList.style.padding = "4px 0";

      tbl.fields.forEach((field) => {
        const row = document.createElement("div");
        row.className = "table-field-row";
        row.style.height = `${ROW_H}px`;
        row.style.padding = "0 12px";
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.justifyContent = "space-between";
        row.style.position = "relative";
        row.style.gap = "8px";
        row.style.fontSize = "12px";

        const nameWrap = document.createElement("div");
        nameWrap.style.display = "flex";
        nameWrap.style.alignItems = "center";
        nameWrap.style.gap = "4px";

        if (field.primary) {
          const keyIcon = document.createElement("span");
          keyIcon.innerText = "🔑";
          keyIcon.style.fontSize = "10px";
          nameWrap.appendChild(keyIcon);
        }

        const nameLabel = document.createElement("span");
        nameLabel.innerText = field.name;
        if (field.primary) nameLabel.style.fontWeight = "600";
        nameWrap.appendChild(nameLabel);

        row.appendChild(nameWrap);

        const typeLabel = document.createElement("span");
        typeLabel.innerText = field.type;
        typeLabel.style.color = "var(--text2)";
        typeLabel.style.fontSize = "11px";
        row.appendChild(typeLabel);

        fieldsList.appendChild(row);
      });

      card.appendChild(fieldsList);
      fo.appendChild(card);
      this.objectsLayer.appendChild(fo);
    };

    // ── Merkez tabloyu çiz ───────────────────────────────────────────────────
    drawTableCard(table, centerX, centerY, true);

    // ── FK tablolarını çiz ───────────────────────────────────────────────────
    fkTables.forEach(t => {
      const pos = fkCoords[t.id];
      if (pos) {
        drawTableCard(t, pos.x, pos.y, false);
      }
    });

    // ── SVG defs (oklar) ─────────────────────────────────────────────────────
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <marker id="tl-arrow-fk" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="var(--rel-color)" />
      </marker>
      <marker id="tl-arrow-sql-view" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="var(--accent)" />
      </marker>
      <marker id="tl-arrow-sql-procedure" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="var(--warning)" />
      </marker>
      <marker id="tl-arrow-sql-function" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="var(--success)" />
      </marker>
      <marker id="tl-arrow-sql-trigger" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="var(--danger)" />
      </marker>
    `;
    this.objectsLayer.appendChild(defs);

    // ── FK ilişki oklarını çiz ───────────────────────────────────────────────
    fkRelationships.forEach(rel => {
      const otherId = rel.startTableId === tableId ? rel.endTableId : rel.startTableId;
      const pos = fkCoords[otherId];
      if (!pos) return;

      const isLeft = pos.x < centerX;
      const startFX = isLeft ? centerX : centerX + TW;
      const startFY = centerY + centerH / 2;
      const endFX = isLeft ? pos.x + TW : pos.x;
      const endFY = pos.y + pos.h / 2;

      const dx = Math.abs(endFX - startFX) * 0.55;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${startFX} ${startFY} C ${isLeft ? startFX - dx : startFX + dx} ${startFY}, ${isLeft ? endFX + dx : endFX - dx} ${endFY}, ${endFX} ${endFY}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "var(--rel-color)");
      path.setAttribute("stroke-width", "2.5");
      path.setAttribute("marker-end", "url(#tl-arrow-fk)");
      path.setAttribute("class", "tl-line");

      // FK label
      const midX = (startFX + endFX) / 2;
      const midY = (startFY + endFY) / 2;
      
      const startT = state.tables.find(t => t.id === rel.startTableId);
      const endT = state.tables.find(t => t.id === rel.endTableId);
      const startF = startT?.fields.find(f => f.id === rel.startFieldId);
      const endF = endT?.fields.find(f => f.id === rel.endFieldId);
      const fkDetails = startF && endF ? `${startF.name} ➔ ${endF.name}` : "";

      const fkLabelWidth = fkDetails ? 100 : 60;
      const fkLabelHeight = fkDetails ? 30 : 20;

      const labelFo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
      labelFo.setAttribute("x", midX - fkLabelWidth / 2);
      labelFo.setAttribute("y", midY - fkLabelHeight / 2);
      labelFo.setAttribute("width", fkLabelWidth);
      labelFo.setAttribute("height", fkLabelHeight);
      
      const labelDiv = document.createElement("div");
      labelDiv.style.cssText = "font-size:8px;font-weight:700;color:var(--rel-color);background:var(--surface);border-radius:4px;padding:2px 4px;text-align:center;opacity:0.95;border:1.5px solid var(--border);display:flex;flex-direction:column;justify-content:center;gap:2px;cursor:help;";
      labelDiv.title = fkDetails ? `Bağlantı:\n${startT?.name}.${startF?.name} ➔ ${endT?.name}.${endF?.name}` : "Foreign Key";

      const fkMainSpan = document.createElement("span");
      fkMainSpan.innerText = rel.type || "FK Bağlantısı";
      labelDiv.appendChild(fkMainSpan);

      if (fkDetails) {
        const fkSubSpan = document.createElement("span");
        fkSubSpan.style.cssText = "font-size:6.5px;color:var(--text2);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
        fkSubSpan.innerText = fkDetails;
        labelDiv.appendChild(fkSubSpan);
      }

      labelFo.appendChild(labelDiv);

      this.objectsLayer.appendChild(path);
      this.objectsLayer.appendChild(labelFo);
    });

    // ── SQL obje kartlarını ve oklarını çiz ──────────────────────────────────
    const sqlColors = {
      view: "var(--accent)",
      procedure: "var(--warning)",
      function: "var(--success)",
      trigger: "var(--danger)",
    };
    const sqlIcons = {
      view: "👁",
      procedure: "▶️",
      function: "ƒ",
      trigger: "⚡",
    };

    relatedSqlObjects.forEach((obj, i) => {
      const color = sqlColors[obj.type] || "var(--primary)";
      const icon = sqlIcons[obj.type] || "●";
      const objY = sqlYStart + i * (SQL_H + SQL_GAP);

      // SQL obje kartı
      const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
      fo.setAttribute("x", sqlX);
      fo.setAttribute("y", objY);
      fo.setAttribute("width", SQL_W);
      fo.setAttribute("height", SQL_H);
      fo.setAttribute("id", `tl-sql-${obj.id}`);

      const card = document.createElement("div");
      card.style.cssText = `width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;padding:6px 10px;border-radius:8px;border:2px dashed ${color};background:var(--surface);box-shadow:0 4px 16px ${color}20;overflow:hidden;cursor:pointer;`;
      card.addEventListener("click", () => this.cc.selectElement("db_object", obj.id));

      const headerRow = document.createElement("div");
      headerRow.style.cssText = "display:flex;align-items:center;gap:6px;";

      const iconSpan = document.createElement("span");
      iconSpan.style.cssText = `font-size:12px;color:${color};`;
      iconSpan.innerText = icon;

      const nameSpan = document.createElement("span");
      nameSpan.style.cssText = `font-weight:700;font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;`;
      nameSpan.innerText = obj.name;

      const badge = document.createElement("span");
      badge.style.cssText = `font-size:7.5px;font-weight:700;text-transform:uppercase;color:${color};background:${color}18;border:1px solid ${color}40;border-radius:3px;padding:1px 5px;flex-shrink:0;`;
      badge.innerText = obj.type;

      headerRow.appendChild(iconSpan);
      headerRow.appendChild(nameSpan);
      headerRow.appendChild(badge);
      card.appendChild(headerRow);
      fo.appendChild(card);
      this.objectsLayer.appendChild(fo);

      // Distribute arrow start Y across the table height
      const startYMin = centerY + 40; // leave space for header
      const startYMax = centerY + centerH - 20; // leave space for bottom
      let arrowStartY = centerY + centerH / 2;
      if (relatedSqlObjects.length > 1) {
        const step = (startYMax - startYMin) / (relatedSqlObjects.length - 1);
        arrowStartY = startYMin + (i * step);
      }

      // Ok: merkez tablodan SQL objesine
      const objMidY = objY + SQL_H / 2;
      const arrowStartX = centerX + TW;
      const arrowEndX = sqlX;
      const arrowEndY = objMidY;
      const adx = (arrowEndX - arrowStartX) * 0.55;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${arrowStartX} ${arrowStartY} C ${arrowStartX + adx} ${arrowStartY}, ${arrowEndX - adx} ${arrowEndY}, ${arrowEndX} ${arrowEndY}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-dasharray", "5 3");
      path.setAttribute("marker-end", `url(#tl-arrow-sql-${obj.type})`);
      this.objectsLayer.appendChild(path);

      // SQL Operasyon Analiz Etiketi (SELECT, INSERT, UPDATE, DELETE)
      const sqlLower = (obj.sql || "").toLowerCase();
      let opType = "SELECT";
      let opColor = "var(--accent)";
      if (sqlLower.includes("insert into") || sqlLower.includes("insert ")) {
        opType = "INSERT";
        opColor = "var(--success)";
      } else if (sqlLower.includes("update ")) {
        opType = "UPDATE";
        opColor = "var(--warning)";
      } else if (sqlLower.includes("delete from") || sqlLower.includes("delete ")) {
        opType = "DELETE";
        opColor = "var(--danger)";
      }

      let detailsText = "";
      try {
        const accessedFields = getAccessedFields(table.name, table.fields, obj.sql || "");
        if (accessedFields && accessedFields.length > 0) {
           detailsText = accessedFields.map(f => f.name).join(", ");
        }
      } catch (e) {}

      const boxWidth = detailsText ? 120 : 70;
      const boxHeight = detailsText ? 32 : 20;

      // Staggering the label's X position to prevent horizontal overlap
      const staggerX = (i % 2 === 0) ? -25 : 25;
      const sqlMidX = (arrowStartX + arrowEndX) / 2 + staggerX;
      const sqlMidY = (arrowStartY + arrowEndY) / 2;
      
      const opFo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
      opFo.setAttribute("x", sqlMidX - boxWidth / 2);
      opFo.setAttribute("y", sqlMidY - boxHeight / 2);
      opFo.setAttribute("width", boxWidth);
      opFo.setAttribute("height", boxHeight);
      
      const opDiv = document.createElement("div");
      opDiv.style.cssText = `font-size:7.5px;font-weight:800;color:${opColor};background:var(--surface);border-radius:4px;padding:2px 4px;text-align:center;border:1.5px solid ${opColor};opacity:0.95;display:flex;flex-direction:column;justify-content:center;gap:2px;overflow:hidden;cursor:help;`;
      opDiv.title = detailsText ? `${opType} işlemleri şu kolonları etkiliyor/kullanıyor:\n${detailsText}` : opType;

      const typeSpan = document.createElement("span");
      typeSpan.style.textTransform = "uppercase";
      typeSpan.innerText = opType;
      opDiv.appendChild(typeSpan);
      
      if (detailsText) {
          const detailSpan = document.createElement("span");
          detailSpan.style.cssText = "font-size:6.5px;color:var(--text2);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
          detailSpan.innerText = `Kolonlar: ${detailsText}`;
          opDiv.appendChild(detailSpan);
      }

      opFo.appendChild(opDiv);
      this.objectsLayer.appendChild(opFo);
    });

    // Lineage info butonunu göster (aktif halde)
    const infoBtn = document.getElementById("lineage-info-btn");
    if (infoBtn) {
      infoBtn.style.display = "flex";
      infoBtn.style.background = "rgba(99,102,241,0.4)";
      infoBtn.style.borderColor = "#6366f1";
    }

    // Add explicit Exit Lineage Mode button
    let exitBtn = document.getElementById("exit-lineage-btn");
    if (!exitBtn) {
      exitBtn = document.createElement("button");
      exitBtn.id = "exit-lineage-btn";
      exitBtn.innerText = "Tüm Tablolara Dön";
      exitBtn.style.cssText = "position:absolute; top:24px; left:50%; transform:translateX(-50%); z-index:1000; padding:10px 20px; background:var(--danger); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:30px; cursor:pointer; box-shadow:0 4px 16px rgba(239,68,68,0.4); font-weight:700; font-size:13px; transition:all 0.2s; display:flex; align-items:center; gap:8px;";
      exitBtn.innerHTML = `<span>⤶</span> Tüm Tablolara Dön`;
      exitBtn.onmouseenter = () => exitBtn.style.transform = "translateX(-50%) scale(1.05)";
      exitBtn.onmouseleave = () => exitBtn.style.transform = "translateX(-50%) scale(1)";
      
      exitBtn.onclick = () => {
        this.inLineageMode = false;
        if (infoBtn) {
          infoBtn.style.display = "none";
        }
        const legend = document.getElementById("lineage-legend");
        if (legend) legend.style.display = "none";
        this.cc.selectElement(null);
        this.render(stateManager.state);
        setTimeout(() => this.cc.fitToViewport(), 50);
      };
      
      const wrapper = document.getElementById("canvas-wrapper");
      if (wrapper) wrapper.appendChild(exitBtn);
    } else {
      exitBtn.style.display = "flex";
    }

    // Viewport'u bu lineage layoutuna göre odakla
    this.zoomToLineage(ORIGIN_X, ORIGIN_Y, sqlX ? sqlX + SQL_W : centerX + TW, ORIGIN_Y + layoutH);
  }

  // Lineage alanı için özel zoom/pan metodu
  zoomToLineage(x1, y1, x2, y2) {
    const padding = 80;
    const boundsWidth = (x2 - x1) + padding * 2;
    const boundsHeight = (y2 - y1) + padding * 2;

    const rect = this.cc.svg.getBoundingClientRect();
    const scaleX = rect.width / boundsWidth;
    const scaleY = rect.height / boundsHeight;

    this.cc.zoom = Math.min(Math.min(scaleX, scaleY), 1.2);
    this.cc.panX = (rect.width - (x2 + x1) * this.cc.zoom) / 2;
    this.cc.panY = (rect.height - (y2 + y1) * this.cc.zoom) / 2;

    this.cc.applyTransform();
  }

  renderAreas(areas) {
    this.areasLayer.innerHTML = "";
    areas.forEach(area => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("id", `area-group-${area.id}`);

      // Main rectangle
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", area.x);
      rect.setAttribute("y", area.y);
      rect.setAttribute("width", area.width || 300);
      rect.setAttribute("height", area.height || 200);
      rect.setAttribute("fill", area.color || "rgba(99, 102, 241, 0.05)");
      rect.setAttribute("stroke", area.color || "var(--primary)");
      rect.setAttribute("stroke-width", "2");
      rect.setAttribute("stroke-dasharray", "4 4");
      rect.setAttribute("rx", "8");
      rect.setAttribute("class", "area-rect");
      rect.style.cursor = "move";

      // Area label
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", area.x + 12);
      text.setAttribute("y", area.y + 24);
      text.setAttribute("fill", area.color || "var(--primary)");
      text.setAttribute("font-size", "14px");
      text.setAttribute("font-weight", "600");
      text.textContent = area.name;
      text.style.pointerEvents = "none";
      text.style.userSelect = "none";

      g.appendChild(rect);
      g.appendChild(text);

      // Drag handler
      rect.addEventListener("mousedown", (e) => this.cc.startDragging("area", area.id, e));

      this.areasLayer.appendChild(g);
    });
  }

  renderNotes(notes) {
    this.notesLayer.innerHTML = "";
    notes.forEach(note => {
      const width = note.width || 180;
      const height = note.height || 120;

      const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
      fo.setAttribute("x", note.x);
      fo.setAttribute("y", note.y);
      fo.setAttribute("width", width);
      fo.setAttribute("height", height);
      fo.setAttribute("id", `note-${note.id}`);

      const div = document.createElement("div");
      div.className = "note-card";
      div.style.width = "100%";
      div.style.height = "100%";
      div.style.background = note.color || "#fef08a"; // yellow post-it style by default
      div.style.color = "#1e293b";
      div.style.borderRadius = "8px";
      div.style.padding = "10px";
      div.style.boxShadow = "var(--shadow)";
      div.style.border = "1px solid rgba(0,0,0,0.1)";
      div.style.display = "flex";
      div.style.flexDirection = "column";
      div.style.cursor = "move";

      const titleEl = document.createElement("div");
      titleEl.style.fontWeight = "600";
      titleEl.style.fontSize = "12px";
      titleEl.style.marginBottom = "4px";
      titleEl.innerText = note.title || "Not";

      const bodyEl = document.createElement("div");
      bodyEl.style.fontSize = "11px";
      bodyEl.style.flex = "1";
      bodyEl.style.overflow = "hidden";
      bodyEl.style.whiteSpace = "pre-wrap";
      bodyEl.innerText = note.content || "Çift tıklayarak düzenleyin...";

      div.appendChild(titleEl);
      div.appendChild(bodyEl);
      fo.appendChild(div);

      // Event listeners
      div.addEventListener("mousedown", (e) => this.cc.startDragging("note", note.id, e));
      
      this.notesLayer.appendChild(fo);
    });
  }

  renderTables(tables) {
    this.tablesLayer.innerHTML = "";
    tables.forEach(table => {
      const width = 220;
      const rowHeight = 26;
      const headerHeight = 42;
      const height = headerHeight + (table.fields.length * rowHeight) + 10;

      const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
      fo.setAttribute("x", table.x);
      fo.setAttribute("y", table.y);
      fo.setAttribute("width", width);
      fo.setAttribute("height", height);
      fo.setAttribute("id", `table-${table.id}`);

      const card = document.createElement("div");
      card.className = "table-card";
      if (this.cc.selectedElement && this.cc.selectedElement.type === "table" && this.cc.selectedElement.id === table.id) {
        card.classList.add("selected");
      }
      card.style.width = "100%";
      card.style.height = "100%";
      card.style.background = "var(--surface)";
      card.style.borderRadius = "8px";
      card.style.boxShadow = "var(--shadow)";
      card.style.border = `1px solid var(--border)`;
      card.style.overflow = "hidden";
      card.style.display = "flex";
      card.style.flexDirection = "column";

      // Card Header
      const header = document.createElement("div");
      header.className = "table-card-header";
      header.style.padding = "10px 12px";
      header.style.background = table.color || "var(--primary)";
      header.style.color = "#fff";
      header.style.fontWeight = "600";
      header.style.fontSize = "13px";
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.cursor = "move";

      const nameSpan = document.createElement("span");
      nameSpan.innerText = table.name;
      header.appendChild(nameSpan);

      // Icon placeholder / small PK visual
      const pkBadge = document.createElement("span");
      pkBadge.style.opacity = "0.8";
      pkBadge.style.fontSize = "10px";
      pkBadge.innerText = `(${table.fields.length})`;
      header.appendChild(pkBadge);

      card.appendChild(header);

      // Fields Container
      const fieldsList = document.createElement("div");
      fieldsList.style.display = "flex";
      fieldsList.style.flexDirection = "column";
      fieldsList.style.padding = "4px 0";

      table.fields.forEach((field, index) => {
        const row = document.createElement("div");
        row.className = "table-field-row";
        row.style.height = `${rowHeight}px`;
        row.style.padding = "0 12px";
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.justifyContent = "space-between";
        row.style.position = "relative";
        row.style.gap = "8px";
        row.style.fontSize = "12px";

        // Anchor Left
        const anchorL = document.createElement("div");
        anchorL.className = "field-anchor left";
        anchorL.setAttribute("data-table-id", table.id);
        anchorL.setAttribute("data-field-id", field.id);
        anchorL.style.position = "absolute";
        anchorL.style.left = "-5px";
        anchorL.style.width = "10px";
        anchorL.style.height = "10px";
        anchorL.style.borderRadius = "50%";
        anchorL.style.background = "var(--border2)";
        anchorL.style.border = "2px solid var(--surface)";
        anchorL.style.cursor = "crosshair";
        anchorL.style.zIndex = "10";
        row.appendChild(anchorL);

        // Name and constraints
        const nameWrap = document.createElement("div");
        nameWrap.style.display = "flex";
        nameWrap.style.alignItems = "center";
        nameWrap.style.gap = "4px";
        nameWrap.style.overflow = "hidden";
        nameWrap.style.textOverflow = "ellipsis";
        nameWrap.style.whiteSpace = "nowrap";

        if (field.primary) {
          const keyIcon = document.createElement("span");
          keyIcon.innerText = "🔑";
          keyIcon.style.fontSize = "10px";
          nameWrap.appendChild(keyIcon);
        }

        const nameLabel = document.createElement("span");
        nameLabel.innerText = field.name;
        if (field.primary) nameLabel.style.fontWeight = "600";
        nameWrap.appendChild(nameLabel);

        row.appendChild(nameWrap);

        // Datatype label
        const typeLabel = document.createElement("span");
        typeLabel.innerText = field.type;
        typeLabel.style.color = "var(--text2)";
        typeLabel.style.fontSize = "11px";
        row.appendChild(typeLabel);

        // Anchor Right
        const anchorR = document.createElement("div");
        anchorR.className = "field-anchor right";
        anchorR.setAttribute("data-table-id", table.id);
        anchorR.setAttribute("data-field-id", field.id);
        anchorR.style.position = "absolute";
        anchorR.style.right = "-5px";
        anchorR.style.width = "10px";
        anchorR.style.height = "10px";
        anchorR.style.borderRadius = "50%";
        anchorR.style.background = "var(--border2)";
        anchorR.style.border = "2px solid var(--surface)";
        anchorR.style.cursor = "crosshair";
        anchorR.style.zIndex = "10";
        row.appendChild(anchorR);

        // Link event triggers
        [anchorL, anchorR].forEach(anchor => {
          anchor.addEventListener("mousedown", (e) => this.cc.startLinking(table.id, field.id, e, anchor));
        });

        fieldsList.appendChild(row);
      });

      card.appendChild(fieldsList);
      fo.appendChild(card);

      // Card drag trigger
      header.addEventListener("mousedown", (e) => this.cc.startDragging("table", table.id, e));
      
      let cardMouseDownX = 0;
      let cardMouseDownY = 0;
      card.addEventListener("mousedown", (e) => {
        cardMouseDownX = e.clientX;
        cardMouseDownY = e.clientY;
      });

      card.addEventListener("click", (e) => {
        const dist = Math.hypot(e.clientX - cardMouseDownX, e.clientY - cardMouseDownY);
        // If dragged more than 5px (e.g. for panning), ignore this click event
        if (dist >= 5) return;

        // If in Hand Tool, toggle focus lock
        if (this.cc.activeTool === "hand") {
          e.stopPropagation();
          if (this.lockedTableId === table.id) {
            this.lockedTableId = null;
            this.clearHighlights();
          } else {
            this.lockedTableId = table.id;
            this.applyHighlight(table.id);
          }
          return;
        }

        if (e.target.closest(".table-card-header")) return;
        this.cc.selectElement("table", table.id);
      });

      // Hover-based relationship highlighting
      card.addEventListener("mouseenter", () => {
        if (this.inLineageMode) return;
        if (this.lockedTableId) return; // Skip hover if a focus lock is active
        this.applyHighlight(table.id);
      });

      card.addEventListener("mouseleave", () => {
        if (this.inLineageMode) return;
        if (this.lockedTableId) return; // Don't clear highlights if locked
        this.clearHighlights();
      });

      this.tablesLayer.appendChild(fo);
    });
  }

  renderRelationships(relationships, tables) {
    this.relationshipsLayer.innerHTML = "";
    relationships.forEach(rel => {
      const startTable = tables.find(t => t.id === rel.startTableId);
      const endTable = tables.find(t => t.id === rel.endTableId);
      if (!startTable || !endTable) return;

      const startIndex = startTable.fields.findIndex(f => f.id === rel.startFieldId);
      const endIndex = endTable.fields.findIndex(f => f.id === rel.endFieldId);
      if (startIndex === -1 || endIndex === -1) return;

      // Anchor coords calculations
      const overlapPadding = 250;
      const isOverlap = !(startTable.x + overlapPadding < endTable.x || endTable.x + overlapPadding < startTable.x);
      
      let startSide, endSide;
      if (isOverlap) {
         // Horizontally overlapping (stacked). Route both to the right edge to loop smoothly.
         startSide = "right";
         endSide = "right";
      } else {
         startSide = startTable.x < endTable.x ? "right" : "left";
         endSide = endTable.x < startTable.x ? "right" : "left";
      }

      const startX = startSide === "right" ? startTable.x + 220 : startTable.x;
      const startY = startTable.y + 42 + (startIndex * 26) + 13;

      const endX = endSide === "right" ? endTable.x + 220 : endTable.x;
      const endY = endTable.y + 42 + (endIndex * 26) + 13;

      // Draw path line with custom control points
      let dx = Math.abs(endX - startX) * 0.5;
      if (isOverlap) {
         // Force a wide loop if they overlap horizontally
         dx = Math.max(Math.abs(endY - startY) * 0.6, 120);
      } else {
         dx = Math.max(dx, 80);
      }

      const cx1 = startSide === "right" ? startX + dx : startX - dx;
      const cy1 = startY;
      const cx2 = endSide === "right" ? endX + dx : endX - dx;
      const cy2 = endY;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${startX} ${startY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${endX} ${endY}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "var(--rel-color)");
      path.setAttribute("stroke-width", "2.5");
      path.setAttribute("class", "rel-path");
      path.setAttribute("marker-end", "url(#arrow-end)");
      path.setAttribute("marker-start", "url(#arrow-start)");
      path.setAttribute("data-start-table-id", rel.startTableId);
      path.setAttribute("data-end-table-id", rel.endTableId);

      // Click to select relationship
      path.addEventListener("click", (e) => {
        e.stopPropagation();
        this.cc.selectElement("relationship", rel.id);
      });

      this.relationshipsLayer.appendChild(path);
    });
  }

  renderDependencyFlow(state) {
    this.objectsLayer.innerHTML = "";
    const selected = this.cc.selectedElement;
    const legend = document.getElementById("lineage-legend");
    const infoBtn = document.getElementById("lineage-info-btn");

    if (!selected || selected.type !== "db_object") {
      if (legend) legend.style.display = "none";
      if (infoBtn) infoBtn.style.display = "none";
      return;
    }

    const obj = state.views.find(v => v.id === selected.id) ||
                state.procedures.find(p => p.id === selected.id) ||
                state.functions.find(f => f.id === selected.id) ||
                state.triggers.find(t => t.id === selected.id);

    if (!obj) {
      if (legend) legend.style.display = "none";
      if (infoBtn) infoBtn.style.display = "none";
      return;
    }

    if (infoBtn) {
      infoBtn.style.display = "flex";
      // Set infoBtn to its default inactive styling
      infoBtn.style.background = "rgba(99, 102, 241, 0.15)";
      infoBtn.style.borderColor = "rgba(99, 102, 241, 0.5)";
    }
    if (legend) legend.style.display = "none";

    const activeDepTableIds = new Set(obj.dependencies);
    const depTables = state.tables.filter(t => activeDepTableIds.has(t.id));

    const columns = obj.type === "view" ? getProjectedColumns(obj.sql, state.tables) : [];
    const drawnBadges = new Set();
    
    const cleanedSql = cleanSql(obj.sql);
    const strippedSql = stripSubqueries(cleanedSql);
    const whereMatch = strippedSql.match(/\bwhere\b([\s\S]*?)(?:$|;|group\s+by|order\s+by|union)/i);
    const hasWhere = !!(whereMatch && whereMatch[1].trim());
    const whereText = hasWhere ? whereMatch[1].trim().replace(/\s+/g, ' ') : "";
    
    const accessedTables = [];
    if (obj.type !== "view") {
      state.tables.forEach(tbl => {
        if (activeDepTableIds.has(tbl.id)) {
          let actionType = "READ";
          const escapedName = tbl.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
          const writeRegex = new RegExp(
            `\\b(insert\\s+into|update|delete\\s+from|delete)\\s+(?:\\w+\\.)*${escapedName}\\b`,
            "i"
          );
          if (writeRegex.test(obj.sql)) {
            actionType = "WRITE";
          } else if (obj.type === "trigger") {
            actionType = "TRIGGERED_BY";
          }
          accessedTables.push({ table: tbl, actionType });
        }
      });
    }

    const rowHeight = 26;
    const headerHeight = 36;
    const width = 260;
    const itemCount = obj.type === "view" ? columns.length : accessedTables.length;
    const height = headerHeight + (itemCount * rowHeight) + 10;

    const isExplicitFieldInCondition = (cond, tableName, fieldName) => {
      const cleanCond = cond.toLowerCase();
      const cleanTable = tableName.toLowerCase();
      const cleanField = fieldName.toLowerCase();
      
      const hasField = cleanCond.includes(`.${cleanField}`) || 
                       cleanCond.includes(`[${cleanField}]`) ||
                       new RegExp(`\\b${cleanField}\\b`).test(cleanCond);
                       
      if (!hasField) return false;

      if (cleanCond.includes(cleanTable)) {
        return true;
      }

      const aliases = getTableAliases(tableName, obj.sql);
      let aliasMatched = false;
      aliases.forEach(alias => {
        const cleanAlias = alias.toLowerCase();
        if (cleanCond.includes(`${cleanAlias}.`) || cleanCond.includes(`${cleanAlias}[`)) {
          aliasMatched = true;
        }
      });

      if (aliasMatched) return true;

      const otherPrefixRegex = /([a-zA-Z_]\w*)\s*\.\s*[a-zA-Z_]\w*/g;
      let match;
      let hasOtherPrefix = false;
      while ((match = otherPrefixRegex.exec(cleanCond)) !== null) {
        const prefix = match[1];
        if (prefix && prefix !== cleanTable && !aliases.some(a => a.toLowerCase() === prefix)) {
          hasOtherPrefix = true;
        }
      }
      return !hasOtherPrefix;
    };
    
    // Calculate the center based on average coordinates of dependent tables
    let cx = 400;
    let cy = 300;
    if (depTables.length > 0) {
      let avgX = 0, avgY = 0;
      depTables.forEach(t => {
        avgX += t.x;
        avgY += t.y;
      });
      cx = avgX / depTables.length;
      cy = avgY / depTables.length - 80;
    } else {
      const wrapper = document.getElementById("canvas-wrapper");
      if (wrapper) {
        cx = -this.cc.panX / this.cc.zoom + (wrapper.clientWidth / 2 - width / 2) / this.cc.zoom;
        cy = -this.cc.panY / this.cc.zoom + 120 / this.cc.zoom;
      }
    }

    const colors = {
      view: "var(--accent)",
      procedure: "var(--warning)",
      function: "var(--success)",
      trigger: "var(--danger)"
    };
    const color = colors[obj.type] || "var(--primary)";

    // Inject SVG defs for custom markers dynamically to ensure color matching and clean styles
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <marker id="dep-arrow-end-${obj.id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="${color}" />
      </marker>
      <marker id="dep-arrow-end-read-${obj.id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="var(--success)" />
      </marker>
      <marker id="dep-arrow-end-write-${obj.id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="var(--danger)" />
      </marker>
      <marker id="dep-arrow-end-triggered-by-${obj.id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="var(--warning)" />
      </marker>
    `;
    this.objectsLayer.appendChild(defs);

    const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
    fo.setAttribute("x", cx);
    fo.setAttribute("y", cy);
    fo.setAttribute("width", width);
    fo.setAttribute("height", height);
    fo.setAttribute("id", `db-obj-${obj.id}`);

    const card = document.createElement("div");
    card.classList.add("selected");
    card.style.width = "100%";
    card.style.height = "100%";
    card.style.overflow = "hidden";
    card.style.display = "flex";
    card.style.flexDirection = "column";

    // Premium styling tailored to distinguish Views / Procs / Funcs / Triggers from standard Tables
    if (obj.type === "view") {
      card.className = "view-card";
      card.style.background = "rgba(15, 23, 42, 0.85)"; // Sleek dark slate glass
      card.style.backdropFilter = "blur(12px)";
      card.style.border = `2.5px dashed ${color}`; // Dashed border for Views
      card.style.borderRadius = "16px";
      card.style.boxShadow = `0 8px 32px ${color}35`;
    } else if (obj.type === "procedure" || obj.type === "function") {
      card.className = "proc-card";
      card.style.background = "var(--surface)";
      card.style.border = `2.5px solid ${color}`;
      card.style.borderRadius = "4px"; // Square technical look
      card.style.boxShadow = `0 4px 20px ${color}40, inset 0 0 12px ${color}10`;
    } else if (obj.type === "trigger") {
      card.className = "trigger-card";
      card.style.background = "repeating-linear-gradient(45deg, rgba(239,68,68,0.05) 0px, rgba(239,68,68,0.05) 8px, transparent 8px, transparent 16px), var(--surface)";
      card.style.border = `2.5px solid ${color}`;
      card.style.borderRadius = "8px";
      card.style.boxShadow = `0 6px 24px ${color}50`;
    } else {
      card.className = "table-card";
      card.style.background = "var(--surface)";
      card.style.border = `2.5px solid ${color}`;
      card.style.borderRadius = "8px";
      card.style.boxShadow = `0 0 25px ${color}`;
    }

    const header = document.createElement("div");
    header.style.padding = "10px 14px";
    header.style.background = obj.type === "view" ? `linear-gradient(90deg, ${color}20, ${color}40)` : color;
    if (obj.type === "view") {
      header.style.borderBottom = `1.5px dashed ${color}`;
    }
    header.style.color = "#fff";
    header.style.fontWeight = "700";
    header.style.fontSize = "13px";
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";

    const nameSpan = document.createElement("span");
    nameSpan.style.display = "flex";
    nameSpan.style.alignItems = "center";
    
    // Add custom icon representing object type
    let iconHtml = "";
    if (obj.type === "view") {
      iconHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px; color:${color};"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    } else if (obj.type === "procedure") {
      iconHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px; color:${color};"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    } else if (obj.type === "function") {
      iconHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px; color:${color};"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
    } else if (obj.type === "trigger") {
      iconHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px; color:${color};"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
    }
    
    nameSpan.innerHTML = `${iconHtml}${obj.name}`;
    header.appendChild(nameSpan);

    const typeBadge = document.createElement("span");
    typeBadge.style.fontSize = "9px";
    typeBadge.style.background = "rgba(0,0,0,0.2)";
    typeBadge.style.padding = "2px 6px";
    typeBadge.style.borderRadius = "4px";
    typeBadge.style.textTransform = "uppercase";
    typeBadge.innerText = obj.type;
    header.appendChild(typeBadge);

    card.appendChild(header);

    const listContainer = document.createElement("div");
    listContainer.style.display = "flex";
    listContainer.style.flexDirection = "column";
    listContainer.style.padding = "4px 0";

    if (obj.type === "view") {
      columns.forEach((col) => {
        const row = document.createElement("div");
        row.className = "table-field-row";
        row.style.height = `${rowHeight}px`;
        row.style.padding = "0 12px";
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.justifyContent = "space-between";
        row.style.position = "relative";
        row.style.fontSize = "11px";

        const nameWrap = document.createElement("div");
        nameWrap.style.display = "flex";
        nameWrap.style.alignItems = "center";
        nameWrap.style.gap = "4px";
        
        // Helper to create a badge
        const makeBadge = (text, bg, color, border) => {
          const b = document.createElement("span");
          b.innerText = text;
          b.style.padding = "1px 4px";
          b.style.background = bg;
          b.style.color = color;
          b.style.fontSize = "7.5px";
          b.style.fontWeight = "800";
          b.style.borderRadius = "3px";
          b.style.fontFamily = "monospace";
          b.style.lineHeight = "1.4";
          b.style.flexShrink = "0";
          if (border) b.style.border = border;
          return b;
        };

        if (col.isAggregated) {
          nameWrap.appendChild(makeBadge("Σ", "rgba(99,102,241,0.25)", "#c4b5fd", "1px solid rgba(139,92,246,0.6)"));
        } else if (col.isCalculated) {
          nameWrap.appendChild(makeBadge("f(x)", "rgba(59,130,246,0.2)", "#93c5fd", "1px solid rgba(96,165,250,0.6)"));
        }

        if (col.isGroupBy) {
          nameWrap.appendChild(makeBadge("GRP", "rgba(16,185,129,0.2)", "#6ee7b7", "1px solid rgba(52,211,153,0.5)"));
        }

        if (col.joinType) {
          const label = col.joinType.replace(/ JOIN$/, '').trim();
          nameWrap.appendChild(makeBadge(label, "rgba(245,158,11,0.15)", "#fcd34d", "1px solid rgba(245,158,11,0.5)"));
        }

        const nameLabel = document.createElement("span");
        nameLabel.innerText = col.name;
        nameLabel.style.fontWeight = "600";
        nameLabel.style.color = "var(--text)";
        nameWrap.appendChild(nameLabel);
        row.appendChild(nameWrap);

        const exprLabel = document.createElement("span");
        exprLabel.innerText = col.expression;
        exprLabel.style.fontSize = "9px";
        exprLabel.style.fontFamily = "var(--mono)";
        exprLabel.style.color = "var(--text2)";
        exprLabel.style.maxWidth = "90px";
        exprLabel.style.overflow = "hidden";
        exprLabel.style.textOverflow = "ellipsis";
        exprLabel.style.whiteSpace = "nowrap";
        row.appendChild(exprLabel);

        listContainer.appendChild(row);
      });
    } else {
      accessedTables.forEach((acc) => {
        const row = document.createElement("div");
        row.className = "table-field-row";
        row.style.height = `${rowHeight}px`;
        row.style.padding = "0 12px";
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.justifyContent = "space-between";
        row.style.position = "relative";
        row.style.fontSize = "11px";

        const actionColor = { READ: "var(--success)", WRITE: "var(--danger)", TRIGGERED_BY: "var(--warning)" }[acc.actionType];
        const actionLabel = { READ: "OKUR", WRITE: "YAZAR", TRIGGERED_BY: "TETİKLER" }[acc.actionType];

        const nameWrap = document.createElement("div");
        nameWrap.style.display = "flex";
        nameWrap.style.alignItems = "center";
        nameWrap.style.gap = "6px";

        const dot = document.createElement("span");
        dot.style.width = "6px";
        dot.style.height = "6px";
        dot.style.borderRadius = "50%";
        dot.style.background = acc.table.color || "var(--primary)";
        nameWrap.appendChild(dot);

        const nameLabel = document.createElement("span");
        nameLabel.innerText = acc.table.name;
        nameLabel.style.fontWeight = "600";
        nameLabel.style.color = "var(--text)";
        nameWrap.appendChild(nameLabel);
        row.appendChild(nameWrap);

        const actBadge = document.createElement("span");
        actBadge.innerText = actionLabel;
        actBadge.style.fontSize = "8px";
        actBadge.style.fontWeight = "bold";
        actBadge.style.color = actionColor;
        actBadge.style.background = `${actionColor}15`;
        actBadge.style.border = `1px solid ${actionColor}30`;
        actBadge.style.padding = "1px 4px";
        actBadge.style.borderRadius = "3px";
        row.appendChild(actBadge);

        listContainer.appendChild(row);
      });
    }

    card.appendChild(listContainer);
    fo.appendChild(card);
    this.objectsLayer.appendChild(fo);
    if (hasWhere) {
      const wX = cx + width / 2 - 90;
      const wY = cy + height + 50;
      const wWidth = 180;
      const wHeight = 180;

      const foWhere = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
      foWhere.setAttribute("x", wX);
      foWhere.setAttribute("y", wY);
      foWhere.setAttribute("width", wWidth);
      foWhere.setAttribute("height", wHeight);
      foWhere.setAttribute("id", `db-obj-where-${obj.id}`);

      const wrapperDiv = document.createElement("div");
      wrapperDiv.style.width = "100%";
      wrapperDiv.style.height = "100%";
      wrapperDiv.style.position = "relative";

      // The rotated crystal/diamond background
      const diamondBg = document.createElement("div");
      diamondBg.style.position = "absolute";
      diamondBg.style.width = "120px";
      diamondBg.style.height = "120px";
      diamondBg.style.left = "30px";
      diamondBg.style.top = "30px";
      diamondBg.style.transform = "rotate(45deg)";
      diamondBg.style.border = "2px dashed var(--warning)";
      diamondBg.style.background = "rgba(15, 23, 42, 0.9)";
      diamondBg.style.backdropFilter = "blur(12px)";
      diamondBg.style.borderRadius = "8px";
      diamondBg.style.boxShadow = "0 0 25px rgba(245, 158, 11, 0.45)";

      // Centered, non-rotated content container
      const content = document.createElement("div");
      content.style.position = "absolute";
      content.style.left = "35px";
      content.style.top = "35px";
      content.style.width = "110px";
      content.style.height = "110px";
      content.style.display = "flex";
      content.style.flexDirection = "column";
      content.style.alignItems = "center";
      content.style.justifyContent = "center";
      content.style.textAlign = "center";
      content.style.fontFamily = "var(--mono)";
      content.style.color = "var(--text)";
      content.style.lineHeight = "1.3";
      content.style.pointerEvents = "none";

      const title = document.createElement("div");
      title.innerText = "WHERE FILTER";
      title.style.fontWeight = "bold";
      title.style.color = "var(--warning)";
      title.style.fontSize = "8px";
      title.style.letterSpacing = "0.05em";
      title.style.marginBottom = "6px";
      title.style.textTransform = "uppercase";

      const formatWhereClause = (text) => {
        const parts = text.split(/(\band\b|\bor\b)/i);
        let html = "";
        parts.forEach((part) => {
          const lower = part.trim().toLowerCase();
          if (lower === "and" || lower === "or") {
            html += `<div style="color: var(--warning); font-weight: bold; font-size: 7.5px; margin: 2px 0;">${lower.toUpperCase()}</div>`;
          } else if (part.trim()) {
            html += `<div style="font-size: 8.5px; opacity: 0.95; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${part.trim()}">${part.trim()}</div>`;
          }
        });
        return html;
      };

      const body = document.createElement("div");
      body.style.width = "100%";
      body.innerHTML = formatWhereClause(whereText);

      content.appendChild(title);
      content.appendChild(body);
      wrapperDiv.appendChild(diamondBg);
      wrapperDiv.appendChild(content);
      foWhere.appendChild(wrapperDiv);
      this.objectsLayer.appendChild(foWhere);

      // Draw thick line from View card to WHERE Filter Diamond top corner
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const startX = cx + width / 2;
      const startY = cy + height;
      const endX = cx + width / 2;
      const endY = wY + 30; // Matches the top vertex of the diamondBg (top: 30px)
      path.setAttribute("d", `M ${startX} ${startY} L ${endX} ${endY}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "var(--warning)");
      path.setAttribute("stroke-width", "2.5");
      path.setAttribute("marker-end", `url(#dep-arrow-end-triggered-by-${obj.id})`);
      this.objectsLayer.appendChild(path);
    }
    // Dynamic Left-Right Table Layout distribution
    const sortedDepTables = [...depTables].sort((a, b) => a.x - b.x);
    const leftTables = [];
    const rightTables = [];
    sortedDepTables.forEach((t, i) => {
      if (i < sortedDepTables.length / 2) {
        leftTables.push(t);
      } else {
        rightTables.push(t);
      }
    });

    const tableWidth = 220;
    const tableCoords = {};

    // Position Left Column
    const leftX = cx - tableWidth - 140;
    let totalLeftHeight = 0;
    const leftHeights = leftTables.map(t => 42 + (t.fields.length * 26) + 10);
    leftHeights.forEach(h => totalLeftHeight += h);
    const leftGap = 24;
    totalLeftHeight += leftGap * (leftTables.length - 1);
    let currentLeftY = cy + (height / 2) - (totalLeftHeight / 2);

    leftTables.forEach((t, idx) => {
      const h = leftHeights[idx];
      tableCoords[t.id] = { x: leftX, y: currentLeftY, width: tableWidth, height: h, side: "left" };
      const foEl = document.getElementById(`table-${t.id}`);
      if (foEl) {
        foEl.setAttribute("x", leftX);
        foEl.setAttribute("y", currentLeftY);
      }
      currentLeftY += h + leftGap;
    });

    // Position Right Column
    const rightX = cx + width + 140;
    let totalRightHeight = 0;
    const rightHeights = rightTables.map(t => 42 + (t.fields.length * 26) + 10);
    rightHeights.forEach(h => totalRightHeight += h);
    const rightGap = 24;
    totalRightHeight += rightGap * (rightTables.length - 1);
    let currentRightY = cy + (height / 2) - (totalRightHeight / 2);

    rightTables.forEach((t, idx) => {
      const h = rightHeights[idx];
      tableCoords[t.id] = { x: rightX, y: currentRightY, width: tableWidth, height: h, side: "right" };
      const foEl = document.getElementById(`table-${t.id}`);
      if (foEl) {
        foEl.setAttribute("x", rightX);
        foEl.setAttribute("y", currentRightY);
      }
      currentRightY += h + rightGap;
    });

    // Update visibility of related cards (Ensure the View card isn't hidden)
    const allTableCards = document.querySelectorAll(".table-card");
    allTableCards.forEach(tc => {
      const parentFo = tc.closest("foreignObject");
      if (parentFo) {
        const parentId = parentFo.getAttribute("id");
        if (parentId && parentId.startsWith("db-obj-")) {
          // Keep our view/proc/trigger/func card visible
          parentFo.style.display = "";
          return;
        }
        const tableId = parentId.replace("table-", "");
        if (activeDepTableIds.has(tableId)) {
          tc.style.boxShadow = `0 0 15px ${color}`;
          tc.style.borderColor = color;
          parentFo.style.display = "";
        } else {
          parentFo.style.display = "none";
        }
      }
    });

    document.querySelectorAll("[id^='note-']").forEach(el => el.style.display = "none");
    document.querySelectorAll("[id^='area-group-']").forEach(el => el.style.display = "none");
    document.querySelectorAll(".rel-path").forEach(el => el.style.display = "none");

    // Draw curvature arrows connecting columns
    if (obj.type === "view") {
      columns.forEach((col, colIdx) => {
        const viewRowY = cy + headerHeight + (colIdx * rowHeight) + (rowHeight / 2);

        depTables.forEach(depTable => {
          const tCoord = tableCoords[depTable.id];
          if (!tCoord) return;

          const tableWhereConds = getWhereConditions(depTable.name, depTable.fields, obj.sql);
          const joinConds = getJoinConditions(obj.sql);

          depTable.fields.forEach((f, fIdx) => {
            const tableFieldY = tCoord.y + 42 + (fIdx * 26) + 13;
            
            const cleanExpr = col.expression.toLowerCase();
            const cleanFieldName = f.name.toLowerCase();
            const cleanTableName = depTable.name.toLowerCase();
            
            const isMatch = cleanExpr.includes(`${cleanTableName}.${cleanFieldName}`) || 
                            cleanExpr.includes(cleanFieldName) ||
                            (col.name.toLowerCase() === cleanFieldName);

            if (isMatch) {
              const isLeft = tCoord.side === "left";
              const startX = isLeft ? cx : cx + width;
              const startY = cy + height / 2;
              const endX = isLeft ? tCoord.x + tableWidth : tCoord.x;
              const endY = tableFieldY;

              const dx = Math.abs(endX - startX) * 0.45;
              const cx1 = isLeft ? startX - dx : startX + dx;
              const cy1 = startY;
              const cx2 = isLeft ? endX + dx : endX - dx;
              const cy2 = endY;

              // Draw direct connection path
              const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
              path.setAttribute("d", `M ${startX} ${startY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${endX} ${endY}`);
              path.setAttribute("fill", "none");
              path.setAttribute("stroke", color);
              path.setAttribute("stroke-width", "1.5");
              path.setAttribute("stroke-dasharray", "4 2");
              path.setAttribute("marker-end", `url(#dep-arrow-end-${obj.id})`);
              path.style.filter = `drop-shadow(0px 0px 3px ${color}40)`;
              this.objectsLayer.appendChild(path);

              // Filter and verify conditions explicitly reference this field to avoid duplicates
              const matchingJoinConds = [];
              if (joinConds[f.name]) {
                joinConds[f.name].forEach(cond => {
                  if (isExplicitFieldInCondition(cond, depTable.name, f.name)) {
                    matchingJoinConds.push(cond);
                  }
                });
              }

              const matchingWhereConds = [];
              if (tableWhereConds[f.name]) {
                tableWhereConds[f.name].forEach(cond => {
                  if (isExplicitFieldInCondition(cond, depTable.name, f.name)) {
                    matchingWhereConds.push(cond);
                  }
                });
              }

              const fieldJoinCond = matchingJoinConds.join(" AND ");
              const fieldWhereCond = matchingWhereConds.join(" AND ");
              let condText = "";
              if (fieldJoinCond && fieldWhereCond) {
                condText = `${fieldJoinCond} | ${fieldWhereCond}`;
              } else {
                condText = fieldJoinCond || fieldWhereCond || "";
              }

              // Draw large, styled badge on the line for conditions
              if (condText && !drawnBadges.has(condText)) {
                drawnBadges.add(condText);
                const midX = 0.125 * startX + 0.375 * cx1 + 0.375 * cx2 + 0.125 * endX;
                const midY = 0.125 * startY + 0.375 * cy1 + 0.375 * cy2 + 0.125 * endY;

                const condGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");

                if (fieldWhereCond && !fieldJoinCond) {
                  // Draw a small baklava/diamond icon
                  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                  const size = 7;
                  const points = `${midX},${midY - size} ${midX + size},${midY} ${midX},${midY + size} ${midX - size},${midY}`;
                  polygon.setAttribute("points", points);
                  polygon.setAttribute("fill", "var(--warning)");
                  polygon.setAttribute("stroke", "rgba(15, 23, 42, 0.95)");
                  polygon.setAttribute("stroke-width", "1.5");
                  polygon.style.filter = "drop-shadow(0 2px 5px rgba(245, 158, 11, 0.7))";
                  polygon.style.cursor = "help";

                  const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
                  titleEl.textContent = fieldWhereCond;
                  polygon.appendChild(titleEl);

                  condGroup.appendChild(polygon);
                } else {
                  // Draw normal cylinder/pill badge
                  const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
                  textEl.setAttribute("x", midX);
                  textEl.setAttribute("y", midY + 3.5);
                  textEl.setAttribute("text-anchor", "middle");
                  textEl.setAttribute("fill", "var(--warning)");
                  textEl.setAttribute("font-size", "10px");
                  textEl.setAttribute("font-family", "var(--mono)");
                  textEl.setAttribute("font-weight", "bold");
                  textEl.style.textShadow = "0 1px 3px rgba(0,0,0,0.8)";
                  textEl.textContent = condText.length > 32 ? condText.substring(0, 29) + "..." : condText;

                  const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
                  titleEl.textContent = condText;
                  textEl.appendChild(titleEl);

                  const rectEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                  const textLen = textEl.textContent.length * 6.2 + 14;
                  rectEl.setAttribute("x", midX - textLen / 2);
                  rectEl.setAttribute("y", midY - 9);
                  rectEl.setAttribute("width", textLen);
                  rectEl.setAttribute("height", 18);
                  rectEl.setAttribute("rx", 9);
                  rectEl.setAttribute("fill", "rgba(15, 23, 42, 0.95)");
                  rectEl.setAttribute("stroke", "var(--warning)");
                  rectEl.setAttribute("stroke-width", "1.5");
                  rectEl.style.filter = "drop-shadow(0 2px 6px rgba(0,0,0,0.6))";

                  condGroup.appendChild(rectEl);
                  condGroup.appendChild(textEl);
                }
                this.objectsLayer.appendChild(condGroup);
              }
            }
          });
        });
      });
    } else {
      accessedTables.forEach((acc, accIdx) => {
        const tCoord = tableCoords[acc.table.id];
        if (!tCoord) return;

        const actionColor = { READ: "var(--success)", WRITE: "var(--danger)", TRIGGERED_BY: "var(--warning)" }[acc.actionType];
        const markerId = `dep-arrow-end-${acc.actionType.toLowerCase().replace('_', '-')}-${obj.id}`;
        const rowY = cy + headerHeight + (accIdx * rowHeight) + (rowHeight / 2);
        
        const accessedFields = getAccessedFields(acc.table.name, acc.table.fields, obj.sql);
        const tableWhereConds = getWhereConditions(acc.table.name, acc.table.fields, obj.sql);
        const joinConds = getJoinConditions(obj.sql);

        if (accessedFields.length > 0) {
          accessedFields.forEach(f => {
            const fIdx = acc.table.fields.findIndex(field => field.id === f.id);
            if (fIdx === -1) return;

            const tableFieldY = tCoord.y + 42 + (fIdx * 26) + 13;
            const isLeft = tCoord.side === "left";
            
            const startX = isLeft ? cx : cx + width;
            const startY = cy + height / 2;
            const endX = isLeft ? tCoord.x + tableWidth : tCoord.x;
            const endY = tableFieldY;

            const dx = Math.abs(endX - startX) * 0.45;
            const cx1 = isLeft ? startX - dx : startX + dx;
            const cy1 = startY;
            const cx2 = isLeft ? endX + dx : endX - dx;
            const cy2 = endY;

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", `M ${startX} ${startY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${endX} ${endY}`);
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", actionColor);
            path.setAttribute("stroke-width", "1.5");
            path.setAttribute("stroke-dasharray", "4 2");
            path.setAttribute("marker-end", `url(#${markerId})`);
            path.style.filter = `drop-shadow(0px 0px 3px ${actionColor}40)`;
            this.objectsLayer.appendChild(path);

            const matchingJoinConds = [];
            if (joinConds[f.name]) {
              joinConds[f.name].forEach(cond => {
                if (isExplicitFieldInCondition(cond, acc.table.name, f.name)) {
                  matchingJoinConds.push(cond);
                }
              });
            }

            const matchingWhereConds = [];
            if (tableWhereConds[f.name]) {
              tableWhereConds[f.name].forEach(cond => {
                if (isExplicitFieldInCondition(cond, acc.table.name, f.name)) {
                  matchingWhereConds.push(cond);
                }
              });
            }

            const fieldJoinCond = matchingJoinConds.join(" AND ");
            const fieldWhereCond = matchingWhereConds.join(" AND ");
            let condText = "";
            if (fieldJoinCond && fieldWhereCond) {
              condText = `${fieldJoinCond} | ${fieldWhereCond}`;
            } else {
              condText = fieldJoinCond || fieldWhereCond || "";
            }

            if (condText && !drawnBadges.has(condText)) {
              drawnBadges.add(condText);
              const midX = 0.125 * startX + 0.375 * cx1 + 0.375 * cx2 + 0.125 * endX;
              const midY = 0.125 * startY + 0.375 * cy1 + 0.375 * cy2 + 0.125 * endY;

              const condGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");

              if (fieldWhereCond && !fieldJoinCond) {
                // Draw a small baklava/diamond icon
                const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                const size = 7;
                const points = `${midX},${midY - size} ${midX + size},${midY} ${midX},${midY + size} ${midX - size},${midY}`;
                polygon.setAttribute("points", points);
                polygon.setAttribute("fill", "var(--warning)");
                polygon.setAttribute("stroke", "rgba(15, 23, 42, 0.95)");
                polygon.setAttribute("stroke-width", "1.5");
                polygon.style.filter = "drop-shadow(0 2px 5px rgba(245, 158, 11, 0.7))";
                polygon.style.cursor = "help";

                const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
                titleEl.textContent = fieldWhereCond;
                polygon.appendChild(titleEl);

                condGroup.appendChild(polygon);
              } else {
                // Draw normal cylinder/pill badge
                const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
                textEl.setAttribute("x", midX);
                textEl.setAttribute("y", midY + 3.5);
                textEl.setAttribute("text-anchor", "middle");
                textEl.setAttribute("fill", "var(--warning)");
                textEl.setAttribute("font-size", "10px");
                textEl.setAttribute("font-family", "var(--mono)");
                textEl.setAttribute("font-weight", "bold");
                textEl.style.textShadow = "0 1px 3px rgba(0,0,0,0.8)";
                textEl.textContent = condText.length > 32 ? condText.substring(0, 29) + "..." : condText;

                const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
                titleEl.textContent = condText;
                textEl.appendChild(titleEl);

                const rectEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                const textLen = textEl.textContent.length * 6.2 + 14;
                rectEl.setAttribute("x", midX - textLen / 2);
                rectEl.setAttribute("y", midY - 9);
                rectEl.setAttribute("width", textLen);
                rectEl.setAttribute("height", 18);
                rectEl.setAttribute("rx", 9);
                rectEl.setAttribute("fill", "rgba(15, 23, 42, 0.95)");
                rectEl.setAttribute("stroke", "var(--warning)");
                rectEl.setAttribute("stroke-width", "1.5");
                rectEl.style.filter = "drop-shadow(0 2px 6px rgba(0,0,0,0.6))";

                condGroup.appendChild(rectEl);
                condGroup.appendChild(textEl);
              }
              this.objectsLayer.appendChild(condGroup);
            }
          });
        } else {
          const isLeft = tCoord.side === "left";
          const startX = isLeft ? cx : cx + width;
          const startY = cy + height / 2;

          const endX = isLeft ? tCoord.x + tableWidth : tCoord.x;
          const endY = tCoord.y + 20;

          const dx = Math.abs(endX - startX) * 0.45;
          const cx1 = isLeft ? startX - dx : startX + dx;
          const cy1 = startY;
          const cx2 = isLeft ? endX + dx : endX - dx;
          const cy2 = endY;

          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", `M ${startX} ${startY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${endX} ${endY}`);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", actionColor);
          path.setAttribute("stroke-width", "1.5");
          path.setAttribute("marker-end", `url(#${markerId})`);
          
          this.objectsLayer.appendChild(path);
        }
      });
    }

    // Zoom and frame layout neatly
    let fitMinX = cx;
    let fitMinY = cy;
    let fitMaxX = cx + width;
    let fitMaxY = cy + height;

    if (hasWhere) {
      fitMaxY = Math.max(fitMaxY, cy + height + 240);
    }

    Object.values(tableCoords).forEach(tc => {
      fitMinX = Math.min(fitMinX, tc.x);
      fitMinY = Math.min(fitMinY, tc.y);
      fitMaxX = Math.max(fitMaxX, tc.x + tc.width);
      fitMaxY = Math.max(fitMaxY, tc.y + tc.height);
    });

    const padding = 100;
    const boundsWidth = (fitMaxX - fitMinX) + padding * 2;
    const boundsHeight = (fitMaxY - fitMinY) + padding * 2;

    const rect = this.cc.svg.getBoundingClientRect();
    const scaleX = rect.width / boundsWidth;
    const scaleY = rect.height / boundsHeight;

    this.cc.zoom = Math.min(Math.min(scaleX, scaleY), 1.1);
    this.cc.panX = (rect.width - (fitMaxX + fitMinX) * this.cc.zoom) / 2;
    this.cc.panY = (rect.height - (fitMaxY + fitMinY) * this.cc.zoom) / 2;
    this.cc.applyTransform();
  }
}
