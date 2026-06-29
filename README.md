# LiteDB SQL Visualizer 🚀

LiteDB SQL Visualizer is a premium, high-fidelity, interactive web application designed to automatically parse, visualize, design, and explore database schemas. It operates either as a **standalone database design editor** or directly integrated with an MS SQL Server/LiteDB backend for real-time schema synchronization.

Features a state-of-the-art **Concentric Radial Star-System Layout Algorithm** that automatically arranges complex database schemas into highly readable, non-overlapping concentric circles based on table relationship connectivity (hub tables at the center, isolated tables on the outer orbits).

---

## ✨ Key Features

* **Intelligent Star-System Auto-Layout:** BFS-based concentric layout automatically structures tables based on relationship distance. Dynamic collision avoidance ensures **zero overlaps** regardless of table sizes.
* **Focus Lock Mode (Hand Tool):** Activate the **Hand tool** and click a table to lock relationship highlighting. Walk through complex connection lines easily; the lock stays active even as you drag the canvas, until cleared.
* **Offline Schema Designer:** Design schemas fully offline! Add, modify, or delete tables, columns, and relationships manually without needing any database connection.
* **Direct SQL DDL Parser:** Create tables by pasting raw SQL DDL code (`CREATE TABLE...`) directly into the canvas.
* **Interactive DB Object Editor:** Create, update, and manage other Database Objects (Views, Stored Procedures, Functions, Triggers) directly within the UI sidebar.
* **Auto-Sync & Fetch:** Connect to a running backend server to automatically sync schemas, draw dependency lineages, and generate updated SQL DDL scripts.
* **Vast Zoom Controls:** Interactive pan & zoom range stretching down to 2% (0.02) to inspect massive enterprise database structures.

---

## 🛠️ Tech Stack

* **Frontend:** Vanilla HTML5, CSS3, Modern ES6+ Javascript
* **Icons & UI:** Custom SVGs, Google Fonts (Inter/Outfit), sleek glassmorphic aesthetics
* **Module Bundler & Server:** Vite, Node.js, Express (Backend API for schema sync)

---

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/yusufuzkul13/LiteDB.git
   cd LiteDB
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📖 License

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** License.

* **You are free to:** Share, copy, redistribute, adapt, remix, transform, and build upon the material.
* **Under the following terms:**
  * **Attribution:** You must give appropriate credit, provide a link to the license, and indicate if changes were made.
  * **Non-Commercial:** You may **NOT** use the material for commercial purposes.

See the [LICENSE](LICENSE) file for the full public license text.
