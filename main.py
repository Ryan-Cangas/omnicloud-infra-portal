import os
import ssl
import json
import asyncio
import inspect
import urllib.parse
from typing import Optional, List
import requests
import urllib3
import websockets
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from proxmoxer import ProxmoxAPI
from dotenv import load_dotenv

# Suppress TLS verification warnings for internal self-signed Proxmox certificates[cite: 1, 4]
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
load_dotenv()

# Hypervisor Node & Credentials Configuration[cite: 1, 4]
PROXMOX_HOST = os.getenv("PROXMOX_HOST", "192.168.1.200")
PROXMOX_USER = os.getenv("PROXMOX_USER", "root@pam")
PROXMOX_PASSWORD = os.getenv("PROXMOX_PASSWORD", "password")

# Initialize FastAPI Application[cite: 1, 4]
app = FastAPI(
    title="Sovereign Cloud CMP & Hypervisor Proxy Engine",
    description="Multi-tenant cloud management control plane with isolated hypervisor proxies.",
    version="1.0.0"
)

# Cross-Origin Resource Sharing (CORS) Middleware for local Vite development[cite: 1, 4]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Persistent Proxmox API Client for state inspection and lifecycle calls[cite: 1, 4]
proxmox = ProxmoxAPI(
    PROXMOX_HOST,
    user=PROXMOX_USER,
    password=PROXMOX_PASSWORD,
    verify_ssl=False
)

# ---------------------------------------------------------------------------
# Multi-Tenant RBAC Data Models & Context Dependency
# ---------------------------------------------------------------------------

# Static mapping simulating tenant partition allocations (To be backed by DB in production)
TENANT_VM_MAP = {
    "tenant-alpha": [100, 101, 102],
    "tenant-fintech": [103, 104],
}

class UserContext:
    """
    Encapsulates identity metadata and role boundaries for the active caller.
    Roles:
      - SuperAdmin: Global MSP cluster access across all nodes and VMs.
      - TenantAdmin: Full VM power and noVNC console access for assigned tenant VMs.
      - TenantViewer: Read-only telemetry visibility for assigned tenant VMs.
      - BillingManager: Financial and workspace access only; no hypervisor access.
    """
    def __init__(self, user_id: str, role: str, tenant_id: str):
        self.user_id = user_id
        self.role = role
        self.tenant_id = tenant_id

def get_current_user(
    x_user_id: Optional[str] = Header("admin-01", description="Caller Unique Identifier"),
    x_user_role: Optional[str] = Header("SuperAdmin", description="Caller RBAC Role"),
    x_tenant_id: Optional[str] = Header("global", description="Caller Tenant Partition ID")
) -> UserContext:
    """
    FastAPI dependency that parses and validates RBAC persona headers on protected routes.
    """
    valid_roles = ["SuperAdmin", "TenantAdmin", "TenantViewer", "BillingManager"]
    if x_user_role not in valid_roles:
        raise HTTPException(status_code=403, detail=f"Invalid RBAC Role specified: {x_user_role}")
    return UserContext(user_id=x_user_id, role=x_user_role, tenant_id=x_tenant_id)

def enforce_vm_access(vmid: int, user: UserContext, required_action: str = "view"):
    """
    Enforces isolation boundaries between tenants and role capabilities.
    Blocks cross-tenant unauthorized resource manipulation.
    """
    # 1. Billing Managers have zero access to hypervisor compute workloads
    if user.role == "BillingManager":
        raise HTTPException(
            status_code=403, 
            detail="Forbidden: Billing personas cannot interact with hypervisor workloads."
        )

    # 2. SuperAdmin bypasses tenant isolation filters
    if user.role == "SuperAdmin":
        return

    # 3. Verify target VM belongs to caller's registered tenant partition
    allowed_vmids = TENANT_VM_MAP.get(user.tenant_id, [])
    if vmid not in allowed_vmids:
        raise HTTPException(
            status_code=403, 
            detail=f"Access Denied: VM {vmid} does not belong to tenant partition '{user.tenant_id}'."
        )

    # 4. Restrict read-only viewers from mutating power states or initiating RFB console streams
    if required_action in ["power", "console"] and user.role == "TenantViewer":
        raise HTTPException(
            status_code=403, 
            detail=f"Forbidden: Role '{user.role}' does not have '{required_action}' privileges."
        )

def get_pve_auth_session():
    """
    Generates an ephemeral PVEAuthCookie and CSRF token from Proxmox.
    Required for noVNC proxy authorization since API Tokens cannot issue /vncproxy tickets.
    """
    url = f"https://{PROXMOX_HOST}:8006/api2/json/access/ticket"
    resp = requests.post(
        url,
        data={"username": PROXMOX_USER, "password": PROXMOX_PASSWORD},
        verify=False,
        timeout=10,
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="PVE Session Ticket Generation Failed")
    data = resp.json()["data"]
    return data["ticket"], data["CSRFPreventionToken"]

# ---------------------------------------------------------------------------
# API Route Controllers
# ---------------------------------------------------------------------------

@app.get("/api/v1/cluster/resources")
def get_cluster_inventory(user: UserContext = Depends(get_current_user)):
    """
    Fetches guest VM and LXC inventory, applying tenant filtering and usage percentage clamps[cite: 1, 4].
    """
    if user.role == "BillingManager":
        return []

    try:
        resources = proxmox.cluster.resources.get(type="vm")[cite: 1, 4]
        allowed_vmids = TENANT_VM_MAP.get(user.tenant_id, [])

        filtered = []
        for item in resources:
            vmid = item.get("vmid")
            
            # Non-SuperAdmins can only see instances inside their assigned tenant pool
            if user.role != "SuperAdmin" and vmid not in allowed_vmids:
                continue

            maxmem_gb = round(item.get("maxmem", 0) / (1024**3), 2)[cite: 1, 4]
            # Clamp percentage strictly between 0.0% and 100.0% to prevent ballooning artifacts
            mem_pct = round(min(max((item.get("mem", 0) / max(item.get("maxmem", 1), 1)) * 100, 0.0), 100.0), 2)
            cpu_pct = round(min(max(item.get("cpu", 0) * 100, 0.0), 100.0), 2)

            filtered.append({
                "vmid": vmid,
                "name": item.get("name", f"guest-{vmid}"),
                "node": item.get("node"),
                "type": item.get("type"),
                "status": item.get("status"),
                "uptime": item.get("uptime", 0),
                "maxmem_gb": maxmem_gb,
                "mem_usage_pct": mem_pct,
                "cpu_usage_pct": cpu_pct,
            })
        return filtered
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch resources: {str(e)}")

@app.post("/api/v1/nodes/{node}/{vm_type}/{vmid}/power/{action}")
def control_vm_power(
    node: str,
    vm_type: str,
    vmid: int,
    action: str,
    user: UserContext = Depends(get_current_user)
):
    """
    Triggers power state changes (start, shutdown, stop, reset) with tenant RBAC enforcement[cite: 1, 4].
    """
    enforce_vm_access(vmid, user, required_action="power")
    try:
        node_controller = getattr(proxmox.nodes(node), vm_type)(vmid)[cite: 1, 4]
        status_controller = getattr(node_controller.status, action)[cite: 1, 4]
        upid = status_controller.post()[cite: 1, 4]
        return {
            "status": "success", 
            "action": action, 
            "upid": upid, 
            "actor": user.user_id,
            "tenant": user.tenant_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Power control failed: {str(e)}")

@app.post("/api/v1/nodes/{node}/{vm_type}/{vmid}/vncproxy")
def generate_vnc_proxy_ticket(
    node: str,
    vm_type: str,
    vmid: int,
    user: UserContext = Depends(get_current_user)
):
    """
    Requests a short-lived VNC ticket and port assignment from Proxmox for out-of-band console access[cite: 4].
    """
    enforce_vm_access(vmid, user, required_action="console")
    try:
        session_ticket, csrf_token = get_pve_auth_session()
        url = f"https://{PROXMOX_HOST}:8006/api2/json/nodes/{node}/{vm_type}/{vmid}/vncproxy"[cite: 4]
        headers = {"CSRFPreventionToken": csrf_token}
        cookies = {"PVEAuthCookie": session_ticket}
        
        resp = requests.post(url, headers=headers, cookies=cookies, data={"websocket": 1}, verify=False, timeout=10)[cite: 4]
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Proxmox refused VNC ticket request")
            
        data = resp.json()["data"]
        return {
            "ticket": data["ticket"],
            "port": data["port"],
            "session_ticket": session_ticket,
            "user": data.get("user", PROXMOX_USER),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VNC Proxy initialization failed: {str(e)}")

@app.get("/api/v1/nodes/telemetry")
def get_node_telemetry(user: UserContext = Depends(get_current_user)):
    """
    Retrieves real bare-metal compute statistics (CPU, RAM, Rootfs storage, uptime).
    Protected exclusively for SuperAdmin roles.
    """
    if user.role != "SuperAdmin":
        raise HTTPException(status_code=403, detail="Host telemetry access restricted to SuperAdmin.")

    try:
        nodes = proxmox.nodes.get()
        if not nodes:
            raise HTTPException(status_code=404, detail="No Proxmox nodes discovered")
        primary_node = nodes[0].get("node")
        status = proxmox.nodes(primary_node).status.get()

        cpu_info = status.get("cpuinfo", {})
        memory = status.get("memory", {})
        root_fs = status.get("rootfs", {})

        return {
            "node": primary_node,
            "cpu": {
                "usage_pct": round(min(max(status.get("cpu", 0) * 100, 0.0), 100.0), 2),
                "cores": cpu_info.get("cpus", status.get("cpus", 0)),
                "sockets": cpu_info.get("sockets", 1),
                "model": cpu_info.get("model", "Physical x86_64 Cores"),
            },
            "memory": {
                "used_gb": round(memory.get("used", 0) / (1024**3), 2),
                "total_gb": round(memory.get("total", 1) / (1024**3), 2),
                "usage_pct": round(min(max((memory.get("used", 0) / max(memory.get("total", 1), 1)) * 100, 0.0), 100.0), 2),
            },
            "storage": {
                "used_gb": round(root_fs.get("used", 0) / (1024**3), 2),
                "total_gb": round(root_fs.get("total", 1) / (1024**3), 2),
                "usage_pct": round(min(max((root_fs.get("used", 0) / max(root_fs.get("total", 1), 1)) * 100, 0.0), 100.0), 2),
            },
            "system": {
                "pve_version": status.get("pveversion", "Proxmox VE"),
                "kernel_version": status.get("kversion", "Linux"),
                "uptime": status.get("uptime", 0),
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/api/v1/ws/vnc/{node}/{vm_type}/{vmid}")
async def vnc_websocket_proxy(
    websocket: WebSocket,
    node: str,
    vm_type: str,
    vmid: int,
    port: int,
    ticket: str,
    session_ticket: str,
):
    """
    Asynchronous RFB reverse-proxy tunnel.
    Bridges the browser-side noVNC binary stream to Proxmox's internal `vncwebsocket` daemon.
    Uses dynamic parameter introspection to remain compatible across all versions of `websockets`.
    """
    # Accept client WebSocket subprotocol immediately[cite: 4]
    await websocket.accept(subprotocol="binary")
    
    # Decode in case URL params arrived encoded, then safely encode once for Proxmox upstream query
    raw_ticket = urllib.parse.unquote(ticket)
    raw_session = urllib.parse.unquote(session_ticket)
    encoded_vncticket = urllib.parse.quote(raw_ticket, safe="")

    pve_ws_url = (
        f"wss://{PROXMOX_HOST}:8006/api2/json/nodes/{node}/{vm_type}/{vmid}/vncwebsocket"
        f"?port={port}&vncticket={encoded_vncticket}"
    )
    
    # Disable SSL verification for internal hypervisor bridge[cite: 4]
    ssl_context = ssl._create_unverified_context()
    headers_dict = {"Cookie": f"PVEAuthCookie={raw_session}"}

    # Introspect websockets.connect parameter signature to prevent BaseEventLoop keyword leaks
    sig = inspect.signature(websockets.connect)
    connect_kwargs = {
        "subprotocols": ["binary"],
        "ssl": ssl_context,
        "max_size": 16 * 1024 * 1024,
    }

    if "additional_headers" in sig.parameters:
        connect_kwargs["additional_headers"] = headers_dict
    elif "extra_headers" in sig.parameters:
        connect_kwargs["extra_headers"] = headers_dict
    else:
        connect_kwargs["additional_headers"] = headers_dict

    try:
        # Establish upstream connection to Proxmox[cite: 4]
        async with websockets.connect(pve_ws_url, **connect_kwargs) as pve_ws:

            # Task 1: Stream client keyboard/mouse RFB events to Proxmox[cite: 4]
            async def client_to_pve():
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await pve_ws.send(data)
                except (WebSocketDisconnect, Exception):
                    pass

            # Task 2: Stream framebuffer binary updates from Proxmox to client[cite: 4]
            async def pve_to_client():
                try:
                    async for message in pve_ws:
                        if isinstance(message, str):
                            # Convert initial RFB greeting handshake string to latin-1 bytes[cite: 4]
                            await websocket.send_bytes(message.encode("latin-1"))
                        else:
                            await websocket.send_bytes(message)
                except Exception:
                    pass

            # Concurrently execute bidirectional stream tasks[cite: 4]
            await asyncio.gather(client_to_pve(), pve_to_client())
    except Exception as e:
        print(f"[WebSocket Proxy Error]: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass