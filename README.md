<div align="center">

# 🌐 OmniCloud Infrastructure Portal
### Sovereign Cloud Management Platform (CMP) & Proxmox Orchestrator

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0+-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4+-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Proxmox](https://img.shields.io/badge/Proxmox_VE-8.x-E57000?style=for-the-badge&logo=proxmox&logoColor=white)](https://www.proxmox.com)

<p align="center">
  A multi-tenant Sovereign Cloud Management Platform (CMP) and partner portal providing isolated compute telemetry, role-based access control, and low-latency out-of-band noVNC HTML5 terminal tunneling.
</p>

<!-- Demo Video / Animated GIF Showcase -->
<p align="center">
  <img src="./docs/assets/demo-preview.gif" alt="OmniCloud Platform Demo" width="850px" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);" />
</p>

[Key Features](#-key-features) •
[Architecture](#-architecture) •
[RBAC Capabilities](#-rbac-persona-matrix) •
[Quickstart](#-getting-started) •
[Roadmap](#-sprint-roadmap)

</div>

---

## 📸 Interface Previews

<div align="center">
  <table>
    <tr>
      <td width="50%">
        <h4 align="center">Interactive VM/LXC Terminal (noVNC)</h4>
        <img src="./docs/assets/terminal-preview.png" alt="noVNC Web Terminal" />
      </td>
      <td width="50%">
        <h4 align="center">Bare-Metal Node Analytics</h4>
        <img src="./docs/assets/analytics-preview.png" alt="Proxmox Analytics" />
      </td>
    </tr>
    <tr>
      <td width="50%">
        <h4 align="center">Multi-Tenant Workspaces</h4>
        <img src="./docs/assets/workspaces-preview.png" alt="Tenant Workspaces" />
      </td>
      <td width="50%">
        <h4 align="center">Integrated Partner CRM & Billing</h4>
        <img src="./docs/assets/orders-preview.png" alt="Billing Statements" />
      </td>
    </tr>
  </table>
</div>

---

## ✨ Key Features

* **⚡ Out-of-Band RFB WebSocket Proxy:** Direct non-blocking binary stream pass-through via FastAPI to Proxmox VE's `vncwebsocket` daemon, completely eliminating client-side SSL and self-signed certificate hurdles.
* **🛡️ Multi-Tenant RBAC Partitioning:** Strict isolation separating SuperAdmins, Tenant Administrators, Read-only Viewers, and Financial Operators.
* **📊 Bare-Metal Telemetry Ingestion:** Real-time polling of host socket topologies, memory pools, root storage pools, and kernel versions.
* **🎮 Guest Lifecycle Controls:** Start, graceful shutdown, and console triggers guarded by strict tenant ownership checks.
* **💼 Integrated Sovereign CMP Suite:** Native operational workspaces, customer accounts, billing invoices, tasks queue, documentation vault, and support channels.

---

## 🏛️ System Architecture

```text
  ┌────────────────────────────────────────────────────────┐
  │         React + TypeScript Frontend (Vite)             │
  │     (noVNC RFB Canvas + CMP Scaffolding + TailWind)    │
  └───────────────────────────┬────────────────────────────┘
                              │ HTTP / WS (ws://localhost:8000)
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │                 FastAPI Control Plane                  │
  │   - Multi-Tenant RBAC Dependency Engine                │
  │   - Ephemeral VNC Ticket Session Acquisition           │
  │   - Bidirectional Async RFB WebSocket Bridge           │
  └───────────────────────────┬────────────────────────────┘
                              │ TLS (Self-Signed / Port 8006)
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │              Proxmox Virtual Environment               │
  │   - QEMU Virtual Machines / LXC Containers             │
  │   - /api2/json/access/ticket & /vncwebsocket daemons   │
  └────────────────────────────────────────────────────────┘
