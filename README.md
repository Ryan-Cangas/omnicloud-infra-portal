# 🌐 OmniCloud Sovereign Control Plane

### Enterprise Infrastructure Gateway, Hypervisor Orchestrator & Edge Security Platform

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19+-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailscale](https://img.shields.io/badge/Tailscale-Mesh_SDN-231F20?style=for-the-badge&logo=tailscale&logoColor=white)](https://tailscale.com)
[![Proxmox](https://img.shields.io/badge/Proxmox_VE-8.x-E57000?style=for-the-badge&logo=proxmox&logoColor=white)](https://www.proxmox.com)
[![Wazuh](https://img.shields.io/badge/Wazuh_SIEM-OpenSearch-00A4E4?style=for-the-badge&logo=wazuh&logoColor=white)](https://wazuh.com)

A sovereign, unified cloud management platform (CMP) bridging bare-metal hypervisor orchestration, live SIEM log ingestion, software-defined overlay mesh networks, and bidirectional Notion state tracking into a zero-trust single-port control plane.

[System Architecture](#Full-System-Architecture)
[Platform Modules & Screenshots](#OmniCloud-Screenshots)
[Technical Legends](#Technical-Legends)
[RBAC Enforcement Matrix](#RBAC-Enforcement-Matrix)
[Deployment Guide](#Deployment-Guide)

---

## Full System Architecture

OmniCloud runs as a dedicated sovereign management instance inside an unprivileged Proxmox LXC container. It hosts both the async Python control plane and the compiled SPA frontend on a single port (`8000`), exposed to external clients via Tailscale Funnel over an automated Let's Encrypt TLS ingress pipeline.

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 EXTERNAL CLIENT INGRESS                                     │
│                     Public Internet / Tailnet Overlay / Mobile WebKit                       │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
                           TLS Port 443 (Let's Encrypt Wildcard)
                           Tailscale Funnel / MagicDNS Domain
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                    DEDICATED LXC CONTAINER (vmid: 200, IP: 192.168.1.62)                    │
│                                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                    Uvicorn Application Gateway (Single-Port: 8000)                    │  │
│  │                                                                                       │  │
│  │   [Static Mount: /assets] ───► Serves React 19 / TypeScript Compiled Bundle           │  │
│  │   [SPA Catch-All Route]   ───► Fallback to dist/index.html                            │  │
│  │   [REST API Routes]       ───► /api/v1/auth, /telemetry, /security, /notion           │  │
│  │   [Asynchronous WS Proxy] ───► /api/v1/ws/vnc (RFC-compliant Binary RFB Framing)      │  │
│  └──────────────────────────────────────┬────────────────────────────────────────────────┘  │
└─────────────────────────────────────────┼───────────────────────────────────────────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
    HTTPS / REST (:8006)         HTTPS / OpenSearch (:9200)   HTTPS / REST (:443)
    PVEAuthCookie / CSRF         Basic Auth (Admin / Password) Bearer Auth (API Key)
            ▼                             ▼                             ▼
┌───────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────┐
│      PROXMOX VE       │   │        WAZUH SIEM         │   │   NOTION REST CLOUD   │
│   (pve-server:8006)   │   │   (OpenSearch Indexer)    │   │  [api.notion.com/v1]  │
│                       │   │                           │   │                       │
│ • QEMU / LXC Specs    │   │ • Live Alert Indexing     │   │ • Runbooks & SOPs     │
│ • Live RRD Telemetry  │   │ • Node-Isolated Buckets   │   │ • Hardware Roadmaps   │
│ • /vncwebsocket Pipe  │   │ • Severity Aggregations   │   │ • Maintenance Windows │
└───────────────────────┘   └───────────────────────────┘   └───────────────────────┘
            │
            │ WireGuard Dynamic UDP Socket (Port 41641) / TLS Fallback (Port 443)
            ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                           TAILSCALE OVERLAY SDN MESH NETWORK                              │
│                                                                                           │
│   • Local WireGuard Sockets (pve-server: 100.116.163.29)                                  │
│   • Direct Peer-to-Peer UDP Hole-Punched Links                                            │
│   • Geographic DERP Relays (Dubai 'dxb', Bangalore 'blr', Singapore 'sin', Frankfurt)     │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

## Architecture Notes

Single-Port SPA & Backend Unification: The FastAPI server exposes endpoints prefixed with /api/v1/... while serving compiled static assets from /opt/omnicloud/omnicloud-frontend/dist through a catch-all route @app.get("/{full_path:path}").

Asynchronous RFB Tunneling: Out-of-band noVNC HTML5 consoles connect through /api/v1/ws/vnc/.... The proxy dynamically adapts connection arguments with inspect.signature(websockets.connect) and passes PVE session cookies directly into Proxmox's internal /vncwebsocket socket.

Zero-Trust Network Perimeter: Direct external ingress is managed by Tailscale Funnel on port 8000, running WireGuard overlay mesh tunnels across homelab nodes without exposing unauthenticated raw ports to the public web.

## OmniCloud Screenshots

### 1. Global Infrastructure Overview & Compute Inventory

Aggregated view of virtual machines (QEMU/KVM) and containers (LXC), showing active uptime, allocated memory pools, CPU usage, power lifecycle buttons, and out-of-band console launching.

![OmniCloud Compute Overview](/omnicloud-frontend/src/assets/omnicloud/overview.png)  
_Fig 1: Proxmox guest inventory showcasing resource consumption, guest status, and console actions._

### 2. Host Bare-Metal Telemetry & Time-Series Engine

Telemetry charts rendering real-time SVG area and line plots for CPU load, IO-wait metrics, dynamic memory utilization, bridged hypervisor RX/TX throughput, and pool volume breakdowns (SSD vs. HDD).

![Host Bare-Metal Telemetry](/omnicloud-frontend/src/assets/omnicloud/telemetry.png)  
_Fig 2: Real-time telemetry monitoring node load, memory swap pressure, and split network throughput._

### 3. SDN Tailscale Mesh Network & Route Pathing

Real-time inspection of WireGuard overlay routes, distinguishing direct point-to-point UDP hole-punched paths from geographic DERP relay fallback hops. For Guest users, all public/private IP addresses and socket tuples are masked for data privacy.

![SDN Tailscale Mesh Telemetry](/omnicloud-frontend/src/assets/omnicloud/sdn.png)  
_Fig 3: WireGuard peer discovery, direct UDP hole punching states, and geographic DERP fallback telemetry._

### 4. Security Telemetry & SIEM Audit Stream (Wazuh)

Host-intrusion event logging stream connected to the Wazuh Indexer OpenSearch API on port 9200. Allows node-specific agent isolation and severity filtering across authentication failures, root escalations, and edge alerts.

![Security Operations SIEM](/omnicloud-frontend/src/assets/omnicloud/wazuh.png)  
_Fig 4: Live event streaming classifying authentication failures, root escalations, and edge alerts._

### 5. Notion Two-Way Sync Engine

Interactive control center synchronized bidirectionally across three independent Notion databases:

- **Runbooks & SOPs:** Operational runbooks, recovery workflows, and maintenance snippets.
- **Hardware Expansion:** Lifecycle management for PCIe allocations, RAM upgrades, and hardware requests.
- **Maintenance Windows:** Calendar scheduler for Corosync node calibrations, ZFS scrubbing, and security audits.

![Notion Maintenance Windows ](/omnicloud-frontend/src/assets/omnicloud/notion1.png)
![Notion Runbooks & SOPs](/omnicloud-frontend/src/assets/omnicloud/notion2.png)
![Notion Hardware Expansion Plans](/omnicloud-frontend/src/assets/omnicloud/notion3.png)
_Fig 5: Live synchronization showing operational Runbooks, maintenance windows, and hardware expansion plans._

### 6. Sovereign Cloud Services Launchpad

Unified access dashboard linking out to containerized services, storage engines, and internal monitoring tools, styled with dark-mode SVG icons.

![Services Launchpad](/omnicloud-frontend/src/assets/omnicloud/launchpad.png)  
_Fig 6: Web application launchpad for containerized services, storage engines, and edge dashboards._

## Technical Legends

### SDN & Tailscale Mesh Terminology

| Term / Acronym       | Full Form / Concept                                           | Technical Role & Purpose                                                                                                                                                                                                                                                    |
| :------------------- | :------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DERP**             | **Designated Encrypted Relay for Packets**                    | An end-to-end encrypted packet relay operating over HTTPS/WebSockets (TCP 443). It acts as a fallback mechanism when stateful firewalls or restrictive NATs block direct UDP hole punching. Relays forward payload frames without possessing cryptographic decryption keys. |
| **Direct Path**      | **Peer-to-Peer UDP Hole Punching**                            | Point-to-point WireGuard tunnel negotiated directly between nodes via STUN NAT traversal on UDP port 41641. Delivers line-rate throughput and minimal latency.                                                                                                              |
| **IATA Codes**       | **Airport Location Identifiers** (`dxb`, `blr`, `sin`, `fra`) | Geographic identifiers assigned to regional Tailscale DERP relay nodes (e.g., `dxb` for Dubai, `blr` for Bangalore, `sin` for Singapore, `fra` for Frankfurt) to optimize fallback path routing.                                                                            |
| **100.64.0.0/10**    | **Carrier-Grade NAT (RFC 6598)**                              | Dedicated overlay IPv4 address block assigned across the tailnet to prevent subnet collisions between local homelab subnets and external remote networks.                                                                                                                   |
| **Tailscale Funnel** | **Public Ingress TLS Proxy**                                  | Reverse proxy routing incoming public internet HTTPS traffic directly to a local application port inside the tailnet with automated Let's Encrypt TLS certificate management.                                                                                               |

### RBAC Enforcement Matrix

OmniCloud applies strict boundary controls across backend routes and UI views based on the verified JWT role (SuperAdmin vs. Guest):

| Functional Area              |      SuperAdmin Role       |           Guest Role           | Enforcement Mechanism                                                              |
| :--------------------------- | :------------------------: | :----------------------------: | :--------------------------------------------------------------------------------- |
| **Authentication Flow**      | Username + Password + TOTP |   Single-Click Guest Access    | Signed HS256 JWT claim verification on every API request                           |
| **Compute Inventory**        |     View All Workloads     |       View All Workloads       | Read-only access to `/api/v1/cluster/resources`                                    |
| **Node Power Ops**           |  Start / Shutdown Allowed  |    Action Disabled & Locked    | Backend `enforce_vm_access` returns `403 Forbidden`; UI controls rendered inactive |
| **noVNC HTML5 Console**      |     Interactive Access     |    Action Disabled & Locked    | Ephemeral 30-second token generation restricted to SuperAdmin                      |
| **SDN Mesh Telemetry**       |  Full IPs & Socket Ports   | Masked IPs (`192.168.***.***`) | Client-side `formatIp()` and `formatEndpoint()` address sanitization               |
| **Notion Mutations**         |  Create / Update / Delete  |        Read-Only Access        | Upstream write protection rejecting mutating calls from guest sessions             |
| **Launchpad External Links** |  Full Ingress Redirection  |    Action Disabled & Locked    | Prevents unauthenticated guests from opening internal administration consoles      |

## Deployment Guide

#### 1. Compute Sizing (Proxmox VE LXC)

Deploy as an unprivileged container with nesting and `/dev/net/tun` passthrough:

```text
Container ID: 200
Hostname:     omnicloud
vCPU Cores:   2 Cores
Memory:       2048 MB RAM + 512 MB Swap
Root Disk:    16 GB (local-lvm or ZFS)
OS Template:  Ubuntu 24.04 LTS (Standard)
Privilege:    Unprivileged (unprivileged=1, nesting=1)
TUN Device:   /dev/net/tun passthrough enabled
```

Add device permissions in /etc/pve/lxc/your-lxc-number.conf

```text
cat << 'EOF' >> /etc/pve/lxc/200.conf
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
EOF
```

#### 2. Environment Configuration

Create /opt/omnicloud/.env with your hypervisor credentials and integration tokens:

```text
PROXMOX_HOST=your-proxmox-hostname
PROXMOX_USER=your-proxmox-user
PROXMOX_TOKEN_NAME=portal-token
PROXMOX_TOKEN_VALUE=your-token-secret-uuid-here
PROXMOX_PASSWORD=your-password-here
NOTION_API_KEY=your-notion-api-key-here
NOTION_DATABASE_ID=your-notion-database-id-here
NOTION_UPGRADES_DATABASE_ID=your-notion-upgrades-database-id-here
NOTION_MAINTENANCE_DATABASE_ID=your-notion-maintenance-database-id-here
ADMIN_MFA_SECRET=your-admin-mfa-secret-here
WAZUH_INDEXER_HOST=your-wazuh-indexer-host-here
WAZUH_INDEXER_USER=your-wazuh-indexer-user-here
WAZUH_INDEXER_PASSWORD=your-wazuh-indexer-password-here
```

#### 3. Build & Systemd Service Launch

Run these commands inside omnicloud container (inside the LXC you created):

```text
# Clone repository and set up backend virtual environment
git clone [https://github.com/ryan-cangas/omnicloud-infra-portal.git](https://github.com/ryan-cangas/omnicloud-infra-portal.git) /opt/omnicloud
cd /opt/omnicloud
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

# Compile production React frontend assets
cd /opt/omnicloud/omnicloud-frontend
npm install
npm run build

# Configure and enable systemd daemon
cat << 'EOF' > /etc/systemd/system/omnicloud.service
[Unit]
Description=OmniCloud Sovereign Control Plane
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/omnicloud
ExecStart=/opt/omnicloud/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now omnicloud.service
```

#### 4. Tailscale Public Ingress (Funnel to Internet)

```text
# Connect node to tailnet and expose via Funnel
tailscale up --hostname=omnicloud
tailscale funnel --bg 8000
```

Verify your public routing status:

```text
tailscale funnel status
```

Developed and Engineered by Ryan Cangas
Dubai, United Arab Emirates
