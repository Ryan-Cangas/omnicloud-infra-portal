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
  A multi-tenant Sovereign Cloud Management Platform (CMP) combining infrastructure orchestration, role-based boundary enforcement, out-of-band noVNC HTML5 web console streaming, and real-time CRM telemetry.
</p>

[System Architecture](#-system-architecture) •
[Key Capabilities](#-key-capabilities) •
[RBAC Enforcement Matrix](#-rbac-enforcement-matrix) •
[Time Horizon Engine](#-time-horizon-engine) •
[Setup Guide](#-setup-guide) •
[Roadmap](#-sprint-roadmap)

</div>

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│                         React / Vite Frontend (SPA)                            │
│                                                                                │
│  [Persona Selector]        [Horizon Engine]         [noVNC RFB HTML5 Canvas]   │
│  (SuperAdmin / Tenants)    (Week / Month / Quarter) (Scale Viewport + Auto-Fit)│
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       │
            HTTP/REST (Port 8000)      │      Raw Binary WS (Port 8000)
            [X-User-Role, X-Tenant-Id] │      [/api/v1/ws/vnc/...]
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                           FastAPI Control Plane                                │
│                                                                                │
│   ┌───────────────────────────────┐     ┌──────────────────────────────────┐   │
│   │ Multi-Tenant RBAC Dependency  │     │ Asynchronous RFB Reverse Proxy   │   │
│   │  - Identity & Boundary Check  │     │  - inspect.signature Handshake   │   │
│   │  - VM Partition Isolation     │     │  - Safe Ticket/Cookie Forwarding │   │
│   │  - Action Guard (Power/VNC)   │     │  - Non-Blocking Binary Framing   │   │
│   └──────────────┬────────────────┘     └─────────────────┬────────────────┘   │
└──────────────────┼────────────────────────────────────────┼────────────────────┘
                   │                                        │
                   │ TLS REST (Port 8006)                   │ WSS Tunnel (Port 8006)
                   │ PVEAuthCookie + CSRF                   │ Cookie: PVEAuthCookie
                   ▼                                        ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                         Proxmox VE Hypervisor Node                             │
│                                                                                │
│   ┌───────────────────────────────┐     ┌──────────────────────────────────┐   │
│   │ /api2/json Control Endpoints  │     │ internal /vncwebsocket Daemon    │   │
│   │  - /cluster/resources         │     │  - Direct QEMU / KVM Socket      │   │
│   │  - /nodes/{node}/status       │     │  - LXC Pseudo-Terminal Pipe      │   │
│   │  - /nodes/.../status/{action} │     └──────────────────────────────────┘   │
│   └───────────────────────────────┘                                            │
└────────────────────────────────────────────────────────────────────────────────┘
```
