# Sovereign Cloud Infrastructure Orchestrator & CRM Engine

A high-performance control plane connecting enterprise CRM pipelines directly to Proxmox VE hypervisors for automated VM provisioning, lifecycle operations, and telemetry metering.

## Features

- **Cluster Inventory Discovery:** Real-time metrics streaming across QEMU VMs and LXC containers.
- **Granular Lifecycle Control:** Safe execution of start, stop, shutdown, and reboot tasks via Proxmox REST API tokens.
- **Lightweight Footprint:** Built with FastAPI and optimized for ultra-low memory usage (<100MB RAM).

## Setup

1. Clone repo: `git clone https://github.com/<your-username>/sovereign-cloud-orchestrator.git`
2. Create environment: `python -m venv .venv && source .venv/bin/activate` (or `.venv\Scripts\activate` on Windows)
3. Install dependencies: `pip install -r requirements.txt`
4. Copy environment template: `cp .env.example .env` and fill in your Proxmox credentials.
5. Run server: `uvicorn main:app --reload --port 8000`
