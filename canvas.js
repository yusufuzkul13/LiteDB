import { stateManager } from "./state.js";

export class CanvasController {
  constructor(svgEl, rootEl, wrapperEl) {
    this.svg = svgEl;
    this.root = rootEl;
    this.wrapper = wrapperEl;

    // Viewport state
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;

    // Dragging state
    this.activeTool = "select"; // 'select' or 'hand'
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    this.draggedNode = null; // { type: 'table'|'note'|'area', id, startX, startY, offsetX, offsetY }
    this.linkingField = null; // { tableId, fieldId, element }

    this.selectedElement = null; // { type: 'table'|'relationship'|'note'|'area'|'enum', id }

    this.initEvents();
  }

  initEvents() {
    // Zoom with wheel
    this.wrapper.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = this.svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Coordinate before zoom
      const beforeZoomX = (mouseX - this.panX) / this.zoom;
      const beforeZoomY = (mouseY - this.panY) / this.zoom;

      const zoomFactor = 1.1;
      if (e.deltaY < 0) {
        this.zoom = Math.min(this.zoom * zoomFactor, 3);
      } else {
        this.zoom = Math.max(this.zoom / zoomFactor, 0.2);
      }

      // Adjust pan so mouse point remains stable
      this.panX = mouseX - beforeZoomX * this.zoom;
      this.panY = mouseY - beforeZoomY * this.zoom;

      this.applyTransform();
    });

    // Panning & dragging movements
    this.svg.addEventListener("mousedown", (e) => {
      if (e.button === 2) return; // ignore right click for drag

      // Panning check
      if (this.activeTool === "hand" || e.button === 1 || e.shiftKey) {
        this.isPanning = true;
        this.panStartX = e.clientX - this.panX;
        this.panStartY = e.clientY - this.panY;
        this.svg.classList.add("panning");
        return;
      }

      // Check if clicked background
      if (e.target.id === "canvas-bg") {
        if (this.selectedElement && this.selectedElement.type === "db_object") {
          return;
        }
        this.selectElement(null);
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.panStartX;
        this.panY = e.clientY - this.panStartY;
        this.applyTransform();
        return;
      }

      if (this.draggedNode) {
        const svgCoords = this.getSVGCoords(e);
        const dist = Math.hypot(svgCoords.x - this.draggedNode.startX, svgCoords.y - this.draggedNode.startY);
        if (dist > 3) {
          this.draggedNode.hasDragged = true;
        }

        const newX = svgCoords.x - this.draggedNode.offsetX;
        const newY = svgCoords.y - this.draggedNode.offsetY;

        // Snap to grid
        const snap = 10;
        const snappedX = Math.round(newX / snap) * snap;
        const snappedY = Math.round(newY / snap) * snap;

        if (this.draggedNode.type === "table") {
          stateManager.updateTable(this.draggedNode.id, { x: snappedX, y: snappedY });
        } else if (this.draggedNode.type === "note") {
          stateManager.updateNote(this.draggedNode.id, { x: snappedX, y: snappedY });
        } else if (this.draggedNode.type === "area") {
          stateManager.updateArea(this.draggedNode.id, { x: snappedX, y: snappedY });
        }
        return;
      }

      if (this.linkingField) {
        const svgCoords = this.getSVGCoords(e);
        const preview = document.getElementById("link-preview");
        if (preview) {
          preview.setAttribute("x2", svgCoords.x);
          preview.setAttribute("y2", svgCoords.y);
        }
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (this.isPanning) {
        this.isPanning = false;
        this.svg.classList.remove("panning");
      }

      if (this.draggedNode) {
        // If it was a simple click (not dragged), or if we are not in db_object mode, update selection
        if (!this.draggedNode.hasDragged) {
          this.selectElement(this.draggedNode.type, this.draggedNode.id);
        } else {
          // If it was a drag, only change selection if the currently selected element is NOT a db_object
          if (!this.selectedElement || this.selectedElement.type !== "db_object") {
            this.selectElement(this.draggedNode.type, this.draggedNode.id);
          }
        }
        this.draggedNode = null;
      }

      if (this.linkingField) {
        // Find if ended on another field anchor
        const target = e.target;
        if (target.classList.contains("field-anchor")) {
          const targetTableId = target.getAttribute("data-table-id");
          const targetFieldId = target.getAttribute("data-field-id");

          if (targetTableId && targetFieldId && (targetTableId !== this.linkingField.tableId || targetFieldId !== this.linkingField.fieldId)) {
            // Create relationship
            stateManager.addRelationship({
              id: "rel_" + Math.random().toString(36).substr(2, 9),
              startTableId: this.linkingField.tableId,
              startFieldId: this.linkingField.fieldId,
              endTableId: targetTableId,
              endFieldId: targetFieldId,
              type: "1-N"
            });
            this.showToast("İlişki oluşturuldu");
          }
        }

        this.linkingField = null;
        const preview = document.getElementById("link-preview");
        if (preview) preview.setAttribute("opacity", "0");
      }
    });

    // Tool switcher clicks
    document.getElementById("tool-select").addEventListener("click", () => this.setTool("select"));
    document.getElementById("tool-hand").addEventListener("click", () => this.setTool("hand"));
    document.getElementById("btn-zoom-in").addEventListener("click", () => this.zoomStep(1.2));
    document.getElementById("btn-zoom-out").addEventListener("click", () => this.zoomStep(1 / 1.2));
    document.getElementById("btn-fit").addEventListener("click", () => this.fitToViewport());
    document.getElementById("fc-zoom-in").addEventListener("click", () => this.zoomStep(1.2));
    document.getElementById("fc-zoom-out").addEventListener("click", () => this.zoomStep(1 / 1.2));
    document.getElementById("fc-fit").addEventListener("click", () => this.fitToViewport());
  }

  setTool(tool) {
    this.activeTool = tool;
    document.getElementById("tool-select").classList.toggle("active", tool === "select");
    document.getElementById("tool-hand").classList.toggle("active", tool === "hand");
    this.svg.classList.toggle("hand", tool === "hand");
  }

  zoomStep(factor) {
    const rect = this.svg.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const beforeZoomX = (cx - this.panX) / this.zoom;
    const beforeZoomY = (cy - this.panY) / this.zoom;

    this.zoom = Math.min(Math.max(this.zoom * factor, 0.2), 3);

    this.panX = cx - beforeZoomX * this.zoom;
    this.panY = cy - beforeZoomY * this.zoom;

    this.applyTransform();
  }

  applyTransform() {
    this.root.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
    
    // Update zoom label in UI
    const zoomText = Math.round(this.zoom * 100) + "%";
    document.getElementById("zoom-level").innerText = zoomText;
    document.getElementById("fc-zoom-level").innerText = zoomText;
  }

  getSVGCoords(e) {
    const rect = this.svg.getBoundingClientRect();
    const x = (e.clientX - rect.left - this.panX) / this.zoom;
    const y = (e.clientY - rect.top - this.panY) / this.zoom;
    return { x, y };
  }

  fitToViewport() {
    const state = stateManager.state;
    if (state.tables.length === 0 && state.notes.length === 0 && state.areas.length === 0) {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.applyTransform();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // Gather bounds
    state.tables.forEach(t => {
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + 220);
      maxY = Math.max(maxY, t.y + 150 + t.fields.length * 26);
    });

    state.notes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + (n.width || 180));
      maxY = Math.max(maxY, n.y + (n.height || 120));
    });

    if (minX === Infinity) return;

    const padding = 60;
    const boundsWidth = (maxX - minX) + padding * 2;
    const boundsHeight = (maxY - minY) + padding * 2;

    const rect = this.svg.getBoundingClientRect();
    const scaleX = rect.width / boundsWidth;
    const scaleY = rect.height / boundsHeight;

    this.zoom = Math.min(Math.min(scaleX, scaleY), 1.5);
    this.panX = (rect.width - (maxX + minX) * this.zoom) / 2;
    this.panY = (rect.height - (maxY + minY) * this.zoom) / 2;

    this.applyTransform();
  }

  selectElement(type, id) {
    this.selectedElement = type ? { type, id } : null;
    
    // Dispatch selected element event
    const event = new CustomEvent("elementSelected", { detail: this.selectedElement });
    window.dispatchEvent(event);

    // Redraw highlight styles
    document.querySelectorAll(".table-card, .note-card, .area-element").forEach(el => {
      el.classList.remove("selected");
    });
    if (type) {
      const selectedEl = document.getElementById(`${type}-${id}`);
      if (selectedEl) selectedEl.classList.add("selected");
    }
  }

  startDragging(type, id, e) {
    if (this.activeTool === "hand") return;
    e.stopPropagation();
    const svgCoords = this.getSVGCoords(e);
    let currentX = 0;
    let currentY = 0;

    if (type === "table") {
      const node = stateManager.state.tables.find(t => t.id === id);
      currentX = node.x;
      currentY = node.y;
    } else if (type === "note") {
      const node = stateManager.state.notes.find(n => n.id === id);
      currentX = node.x;
      currentY = node.y;
    } else if (type === "area") {
      const node = stateManager.state.areas.find(a => a.id === id);
      currentX = node.x;
      currentY = node.y;
    }

    this.draggedNode = {
      type,
      id,
      startX: svgCoords.x,
      startY: svgCoords.y,
      offsetX: svgCoords.x - currentX,
      offsetY: svgCoords.y - currentY,
      hasDragged: false
    };
  }

  startLinking(tableId, fieldId, e, anchorEl) {
    e.stopPropagation();
    e.preventDefault();

    const rect = anchorEl.getBoundingClientRect();
    const svgRect = this.svg.getBoundingClientRect();
    const startX = (rect.left + rect.width / 2 - svgRect.left - this.panX) / this.zoom;
    const startY = (rect.top + rect.height / 2 - svgRect.top - this.panY) / this.zoom;

    this.linkingField = { tableId, fieldId };

    const preview = document.getElementById("link-preview");
    if (preview) {
      preview.setAttribute("x1", startX);
      preview.setAttribute("y1", startY);
      preview.setAttribute("x2", startX);
      preview.setAttribute("y2", startY);
      preview.setAttribute("opacity", "1");
    }
  }

  showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }
}
