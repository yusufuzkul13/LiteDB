import { stateManager } from "./state.js";
import { CanvasController } from "./canvas.js";
import { CanvasRenderer } from "./renderer.js";
import { UIController } from "./ui.js";

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
  const svg = document.getElementById("canvas");
  const root = document.getElementById("canvas-root");
  const wrapper = document.getElementById("canvas-wrapper");

  // Create controllers
  const cc = new CanvasController(svg, root, wrapper);
  const renderer = new CanvasRenderer(cc);
  const ui = new UIController(cc);

  // Subscribe renderer and sidebar updates to state changes
  stateManager.subscribe((state) => {
    renderer.render(state);
    ui.updateSidebarLists(state);
  });

  let lastSelectedType = null;
  window.addEventListener("elementSelected", (e) => {
    const selected = e.detail;
    renderer.render(stateManager.state);
    ui.updateSidebarLists(stateManager.state);

    const currentSelectedType = selected ? selected.type : null;
    if (lastSelectedType === "db_object" && currentSelectedType !== "db_object") {
      setTimeout(() => cc.fitToViewport(), 50);
    }
    lastSelectedType = currentSelectedType;
  });

  // Lineage legend toggle (ⓘ toggles open/closed)
  const infoBtn = document.getElementById("lineage-info-btn");
  const legendEl = document.getElementById("lineage-legend");

  if (infoBtn && legendEl) {
    infoBtn.addEventListener("click", () => {
      const isHidden = legendEl.style.display === "none";
      legendEl.style.display = isHidden ? "flex" : "none";
      infoBtn.style.background = isHidden ? "rgba(99,102,241,0.4)" : "rgba(99,102,241,0.15)";
      infoBtn.style.borderColor = isHidden ? "#6366f1" : "rgba(99,102,241,0.5)";
    });
  }

  // Export instances globally for debugging or advanced event access
  window.liteDB = {
    cc,
    renderer,
    ui,
    stateManager
  };

  // Try fetching from server first
  fetch('/api/schema')
    .then(res => {
      if (!res.ok) throw new Error("Server schema endpoint unavailable");
      return res.json();
    })
    .then(data => {
      if (data && data.tables && data.tables.length > 0) {
        stateManager.loadDiagram(data);
        setTimeout(() => cc.fitToViewport(), 100);
        cc.showToast("SQL şeması dosyalarından yüklendi!");
      } else {
        throw new Error("Empty schema");
      }
    })
    .catch(() => {
      // Fallback to local storage or sample diagram
      const saved = localStorage.getItem("lite_db_saved_diagram");
      let loaded = false;
      if (saved && saved !== "undefined" && saved !== "null") {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === "object") {
            stateManager.loadDiagram(parsed);
            setTimeout(() => cc.fitToViewport(), 100);
            loaded = true;
          }
        } catch (e) {
          console.error("Failed to parse saved diagram on startup fallback:", e);
        }
      }
      if (!loaded) {
        setupSampleDiagram();
        setTimeout(() => cc.fitToViewport(), 100);
      }
    });
});

function setupSampleDiagram() {
  const state = {
    name: "E-Ticaret Şeması",
    tables: [
      {
        id: "t_users",
        name: "users",
        x: 100,
        y: 120,
        color: "#6366f1",
        fields: [
          { id: "f_uid", name: "id", type: "INT", primary: true, notNull: true, unique: true, increment: true },
          { id: "f_uname", name: "username", type: "VARCHAR(255)", primary: false, notNull: true, unique: true, increment: false },
          { id: "f_email", name: "email", type: "VARCHAR(255)", primary: false, notNull: true, unique: true, increment: false },
          { id: "f_pass", name: "password", type: "VARCHAR(255)", primary: false, notNull: true, unique: false, increment: false }
        ]
      },
      {
        id: "t_orders",
        name: "orders",
        x: 480,
        y: 150,
        color: "#10b981",
        fields: [
          { id: "f_oid", name: "id", type: "INT", primary: true, notNull: true, unique: true, increment: true },
          { id: "f_ouser_id", name: "user_id", type: "INT", primary: false, notNull: true, unique: false, increment: false },
          { id: "f_ototal", name: "total_amount", type: "DECIMAL", primary: false, notNull: true, unique: false, increment: false },
          { id: "f_odate", name: "created_at", type: "TIMESTAMP", primary: false, notNull: true, unique: false, increment: false }
        ]
      }
    ],
    relationships: [
      {
        id: "r_u_o",
        name: "fk_orders_users",
        startTableId: "t_users",
        startFieldId: "f_uid",
        endTableId: "t_orders",
        endFieldId: "f_ouser_id",
        type: "1-N"
      }
    ],
    notes: [
      {
        id: "n_welcome",
        title: "Hoş Geldiniz",
        content: "LiteDB veritabanı şema editörüdür.\n\n- Kolonların uçlarındaki noktalardan sürükleyerek ilişki oluşturabilirsiniz.\n- Sol menüden yeni nesneler ekleyebilirsiniz.\n- Kolayca SQL üretebilirsiniz.",
        x: 100,
        y: 400,
        width: 240,
        height: 140,
        color: "#fef08a"
      }
    ],
    areas: [
      {
        id: "a_core",
        name: "Kullanıcı & Sipariş Yönetimi",
        x: 50,
        y: 50,
        width: 720,
        height: 520,
        color: "rgba(99, 102, 241, 0.05)"
      }
    ],
    enums: [
      {
        id: "e_status",
        name: "order_status",
        values: ["pending", "completed", "cancelled"]
      }
    ]
  };

  stateManager.loadDiagram(state);
}
