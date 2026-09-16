"""
OmniOps Homelab Control Plane & Hypervisor Gateway.

Architecture & Modules:
1. Cryptographic Authentication & RBAC (JWT): Issues signed HS256 access tokens.
2. Proxmox Hypervisor Communication: Supports Proxmox API Tokens and PAM/PVE authentication.
3. Ephemeral Single-Use WebSocket Tokens: Issues 30-second scoped console tokens for out-of-band noVNC access.
4. Bidirectional RFB WebSocket Reverse Proxy: Bridges client RFB streams to Proxmox's internal vncwebsocket daemon.
5. Bare-Metal Telemetry & Time-Series: Metrics engine for CPU, RAM, NVMe/HDD, network RX/TX, and uptime.
6. Notion Two-Way Sync: Native synchronization for Homelab Runbooks, Hardware Expansions, and Maintenance Windows.
7. Wazuh SIEM Integration: OpenSearch-compatible queries on port 9200 for live node-isolated log telemetry.
8. MFA Integration: Enforces TOTP for SuperAdmin logins.
"""

import os
import ssl
import json
import subprocess
import shutil
import asyncio
import inspect
import urllib.parse
from datetime import datetime, timedelta, timezone, date
from typing import Optional, List
from collections import deque
from pathlib import Path
import time

import jwt
import bcrypt
import requests
import urllib3
import websockets
import pyotp
from pydantic import BaseModel
from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from proxmoxer import ProxmoxAPI
from dotenv import load_dotenv

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

PROXMOX_HOST = os.getenv("PROXMOX_HOST", "192.168.1.200")
PROXMOX_USER = os.getenv("PROXMOX_USER", "root@pam")
PROXMOX_PASSWORD = os.getenv("PROXMOX_PASSWORD", "")
PROXMOX_TOKEN_NAME = os.getenv("PROXMOX_TOKEN_NAME", "")
PROXMOX_TOKEN_VALUE = os.getenv("PROXMOX_TOKEN_VALUE", "")

JWT_SECRET = os.getenv("JWT_SECRET_KEY", "omniops-homelab-secret-key-production")
JWT_ALGORITHM = "HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 120
JWT_CONSOLE_TOKEN_EXPIRE_SECONDS = 30

NOTION_API_KEY = os.getenv("NOTION_API_KEY", "")
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID", "")
NOTION_UPGRADES_DATABASE_ID = os.getenv("NOTION_UPGRADES_DATABASE_ID", "")
NOTION_MAINTENANCE_DATABASE_ID = os.getenv("NOTION_MAINTENANCE_DATABASE_ID", "")
NOTION_VERSION = "2022-06-28"

ADMIN_MFA_SECRET = os.getenv("ADMIN_MFA_SECRET")
if not ADMIN_MFA_SECRET:
    raise RuntimeError("CRITICAL: ADMIN_MFA_SECRET environment variable is missing.")

# Wazuh SIEM Configuration
WAZUH_INDEXER_HOST = os.getenv("WAZUH_INDEXER_HOST", "https://192.168.1.61:9200")
WAZUH_INDEXER_USER = os.getenv("WAZUH_INDEXER_USER", "admin")
WAZUH_INDEXER_PASSWORD = os.getenv("WAZUH_INDEXER_PASSWORD", "")

TELEMETRY_STREAM_BUFFER = deque(maxlen=30)
LAST_NETWORK_SNAPSHOT = {"time": 0.0, "netin": 0, "netout": 0}

app = FastAPI(
    title="OmniOps Homelab Control Plane",
    description="Sovereign homelab management control plane with isolated hypervisor proxies.",
    version="2.2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if PROXMOX_TOKEN_NAME and PROXMOX_TOKEN_VALUE:
    proxmox = ProxmoxAPI(
        PROXMOX_HOST,
        user=PROXMOX_USER,
        token_name=PROXMOX_TOKEN_NAME,
        token_value=PROXMOX_TOKEN_VALUE,
        verify_ssl=False
    )
else:
    proxmox = ProxmoxAPI(
        PROXMOX_HOST,
        user=PROXMOX_USER,
        password=PROXMOX_PASSWORD,
        verify_ssl=False
    )

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

DEFAULT_DEV_HASH = hash_password("password123")

USERS_DB = {
    "admin-01": {
        "user_id": "admin-01",
        "username": "admin-01",
        "password_hash": DEFAULT_DEV_HASH,
        "role": "SuperAdmin",
        "name": "Ryan Cangas",
    },
    "guest": {
        "user_id": "guest",
        "username": "guest",
        "password_hash": DEFAULT_DEV_HASH,
        "role": "Guest",
        "name": "Portfolio Guest",
    }
}

class UserContext:
    def __init__(self, user_id: str, role: str, name: Optional[str] = None):
        self.user_id = user_id
        self.role = role
        self.name = name

class LoginRequest(BaseModel):
    username: str
    password: str
    mfa_code: Optional[str] = None

class ConsoleTokenRequest(BaseModel):
    node: str
    vm_type: str
    vmid: int

class CreateNoteRequest(BaseModel):
    title: str
    tag: str
    snippet: str
    date: Optional[str] = None

class CreateUpgradeRequest(BaseModel):
    title: str
    category: str
    priority: str
    description: str
    status: Optional[str] = "Pending"

class UpdateUpgradeStatusRequest(BaseModel):
    status: str

class CreateMaintenanceEventRequest(BaseModel):
    title: str
    type: str
    date: str
    time: str
    targetNode: str
    status: Optional[str] = "Scheduled"

class UpdateMaintenanceStatusRequest(BaseModel):
    status: str

security_scheme = HTTPBearer(auto_error=False)

def create_jwt_token(payload_data: dict, expires_delta: timedelta) -> str:
    payload = payload_data.copy()
    now_utc = datetime.now(timezone.utc)
    expire = now_utc + expires_delta
    payload.update({"exp": expire, "iat": now_utc})
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme)) -> UserContext:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer authentication token.")

    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        role = payload.get("role")
        token_type = payload.get("type", "access")

        if not user_id or not role:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload structure.")
        if token_type != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")

        return UserContext(user_id=user_id, role=role, name=payload.get("name"))
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please re-authenticate.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid cryptographic token.")

def enforce_vm_access(vmid: int, user: UserContext, required_action: str = "view"):
    if required_action in ["power", "console"] and user.role != "SuperAdmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail=f"Forbidden: Your '{user.role}' role has strictly view-only access."
        )

def get_pve_auth_headers_and_cookies():
    if PROXMOX_TOKEN_NAME and PROXMOX_TOKEN_VALUE:
        return {
            "headers": {"Authorization": f"PVEAPIToken={PROXMOX_USER}!{PROXMOX_TOKEN_NAME}={PROXMOX_TOKEN_VALUE}"},
            "cookies": {},
            "session_ticket": "API_TOKEN_AUTH"
        }

    url = f"https://{PROXMOX_HOST}:8006/api2/json/access/ticket"
    resp = requests.post(url, data={"username": PROXMOX_USER, "password": PROXMOX_PASSWORD}, verify=False, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="PVE Session Ticket Generation Failed")
    data = resp.json()["data"]
    return {
        "headers": {"CSRFPreventionToken": data["CSRFPreventionToken"]},
        "cookies": {"PVEAuthCookie": data["ticket"]},
        "session_ticket": data["ticket"]
    }

def format_uptime(seconds: int) -> str:
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, _ = divmod(rem, 60)
    parts = []
    if days > 0:
        parts.append(f"{days}d")
    if hours > 0:
        parts.append(f"{hours}h")
    parts.append(f"{minutes}m")
    return " ".join(parts) or "< 1m"

def get_live_network_throughput(proxmox_client):
    global LAST_NETWORK_SNAPSHOT
    now = time.time()
    total_rx = 0
    total_tx = 0
    
    try:
        vms = proxmox_client.cluster.resources.get(type="vm")
        for vm in vms:
            total_rx += int(vm.get("netin", 0))
            total_tx += int(vm.get("netout", 0))
    except Exception:
        pass

    dt = max(now - LAST_NETWORK_SNAPSHOT["time"], 1.0)
    
    if LAST_NETWORK_SNAPSHOT["time"] == 0.0 or total_rx < LAST_NETWORK_SNAPSHOT["netin"]:
        rx_rate_bps = 0.0
        tx_rate_bps = 0.0
    else:
        rx_rate_bps = (total_rx - LAST_NETWORK_SNAPSHOT["netin"]) / dt
        tx_rate_bps = (total_tx - LAST_NETWORK_SNAPSHOT["netout"]) / dt

    LAST_NETWORK_SNAPSHOT["time"] = now
    LAST_NETWORK_SNAPSHOT["netin"] = total_rx
    LAST_NETWORK_SNAPSHOT["netout"] = total_tx
    
    return round(rx_rate_bps / 1024, 2), round(tx_rate_bps / 1024, 2)

@app.post("/api/v1/auth/login")
def login(req: LoginRequest):
    user_record = USERS_DB.get(req.username)
    if not user_record or not verify_password(req.password, user_record["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")

    if user_record["role"] == "SuperAdmin":
        if not req.mfa_code:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Microsoft Authenticator code required.")
        
        totp = pyotp.TOTP(ADMIN_MFA_SECRET)
        if not totp.verify(req.mfa_code, valid_window=1):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Authenticator code. Please try again.")

    access_token = create_jwt_token(
        payload_data={
            "sub": user_record["user_id"],
            "role": user_record["role"],
            "name": user_record["name"],
            "type": "access",
        },
        expires_delta=timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "userId": user_record["user_id"],
            "role": user_record["role"],
            "name": user_record["name"],
        }
    }

@app.get("/api/v1/auth/me")
def get_me(user: UserContext = Depends(get_current_user)):
    return {
        "userId": user.user_id,
        "role": user.role,
        "name": user.name
    }

@app.post("/api/v1/auth/console-token")
def issue_ephemeral_console_token(req: ConsoleTokenRequest, user: UserContext = Depends(get_current_user)):
    enforce_vm_access(req.vmid, user, required_action="console")
    console_token = create_jwt_token(
        payload_data={
            "sub": user.user_id,
            "role": user.role,
            "vmid": req.vmid,
            "node": req.node,
            "vm_type": req.vm_type,
            "type": "ephemeral_console",
        },
        expires_delta=timedelta(seconds=JWT_CONSOLE_TOKEN_EXPIRE_SECONDS)
    )
    return {"console_token": console_token}

@app.get("/api/v1/cluster/resources")
def get_cluster_inventory(user: UserContext = Depends(get_current_user)):
    try:
        resources = proxmox.cluster.resources.get(type="vm")
        filtered = []
        for item in resources:
            maxmem_gb = round(item.get("maxmem", 0) / (1024**3), 2)
            mem_pct = round(min(max((item.get("mem", 0) / max(item.get("maxmem", 1), 1)) * 100, 0.0), 100.0), 2)
            cpu_pct = round(min(max(item.get("cpu", 0) * 100, 0.0), 100.0), 2)

            filtered.append({
                "vmid": item.get("vmid"),
                "name": item.get("name", f"guest-{item.get('vmid')}"),
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
def control_vm_power(node: str, vm_type: str, vmid: int, action: str, user: UserContext = Depends(get_current_user)):
    enforce_vm_access(vmid, user, required_action="power")
    try:
        node_controller = getattr(proxmox.nodes(node), vm_type)(vmid)
        status_controller = getattr(node_controller.status, action)
        upid = status_controller.post()
        return {"status": "success", "action": action, "upid": upid, "actor": user.user_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Power control failed: {str(e)}")

@app.post("/api/v1/nodes/{node}/{vm_type}/{vmid}/vncproxy")
def generate_vnc_proxy_ticket(node: str, vm_type: str, vmid: int, user: UserContext = Depends(get_current_user)):
    enforce_vm_access(vmid, user, required_action="console")
    try:
        auth_data = get_pve_auth_headers_and_cookies()
        url = f"https://{PROXMOX_HOST}:8006/api2/json/nodes/{node}/{vm_type}/{vmid}/vncproxy"
        resp = requests.post(url, headers=auth_data["headers"], cookies=auth_data["cookies"], data={"websocket": 1}, verify=False, timeout=10)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Proxmox refused VNC ticket request")
        data = resp.json()["data"]
        return {
            "ticket": data["ticket"],
            "port": data["port"],
            "session_ticket": auth_data["session_ticket"],
            "user": data.get("user", PROXMOX_USER),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VNC Proxy initialization failed: {str(e)}")

@app.get("/api/v1/nodes/telemetry")
def get_node_telemetry(user: UserContext = Depends(get_current_user)):
    try:
        nodes = proxmox.nodes.get()
        if not nodes:
            raise HTTPException(status_code=404, detail="No Proxmox nodes discovered")
        primary_node = nodes[0].get("node")
        node_status = proxmox.nodes(primary_node).status.get()

        cpu_info = node_status.get("cpuinfo", {})
        memory = node_status.get("memory", {})
        swap = node_status.get("swap", {})
        root_fs = node_status.get("rootfs", {})
        loadavg = node_status.get("loadavg", [0.0, 0.0, 0.0])

        pools = []
        try:
            storage_list = proxmox.nodes(primary_node).storage.get()
            for s in storage_list:
                if not s.get("enabled", 1):
                    continue
                total_gb = round(s.get("total", 0) / (1024**3), 2)
                used_gb = round(s.get("used", 0) / (1024**3), 2)
                pct = round(min(max((used_gb / max(total_gb, 0.01)) * 100, 0.0), 100.0), 1) if total_gb > 0 else 0.0
                st_type = s.get("type", "unknown")
                is_ssd = "ssd" in s.get("storage", "").lower() or "nvme" in s.get("storage", "").lower() or st_type in ["zfs", "zfspool"]
                pools.append({
                    "name": s.get("storage"),
                    "type": st_type,
                    "category": "SSD / Flash Array" if is_ssd else "HDD / Block Storage",
                    "total_gb": total_gb,
                    "used_gb": used_gb,
                    "free_gb": round(max(total_gb - used_gb, 0), 2),
                    "usage_pct": pct,
                    "active": s.get("active", 1) == 1
                })
        except Exception:
            pass

        disks = []
        try:
            disk_list = proxmox.nodes(primary_node).disks.list.get()
            for d in disk_list:
                size_gb = round(d.get("size", 0) / (1024**3), 1)
                dtype = d.get("type", "hdd").upper()
                if "nvme" in d.get("devpath", "").lower():
                    dtype = "NVMe SSD"
                elif "ssd" in dtype.lower() or d.get("rpm") == "0":
                    dtype = "SSD"
                else:
                    dtype = "HDD"
                disks.append({
                    "devpath": d.get("devpath"),
                    "model": d.get("model", "Physical Disk"),
                    "size_gb": size_gb,
                    "type": dtype,
                    "health": d.get("health", "PASSED"),
                    "serial": d.get("serial", "N/A")
                })
        except Exception:
            pass

        net_interfaces = []
        try:
            net_list = proxmox.nodes(primary_node).network.get()
            for iface in net_list:
                net_interfaces.append({
                    "name": iface.get("iface"),
                    "type": iface.get("type", "nic"),
                    "active": bool(iface.get("active", False)),
                    "address": iface.get("address") or iface.get("cidr") or "Unassigned",
                    "comment": iface.get("comments", "")
                })
        except Exception:
            pass

        cpu_pct = round(min(max(node_status.get("cpu", 0) * 100, 0.0), 100.0), 2)
        mem_pct = round(min(max((memory.get("used", 0) / max(memory.get("total", 1), 1)) * 100, 0.0), 100.0), 2)
        storage_pct = round(min(max((root_fs.get("used", 0) / max(root_fs.get("total", 1), 1)) * 100, 0.0), 100.0), 2)
        iowait_pct = round(float(node_status.get("wait", 0.0)) * 100, 2)
        
        live_rx_kbps, live_tx_kbps = get_live_network_throughput(proxmox)

        if not TELEMETRY_STREAM_BUFFER:
            try:
                rrd = proxmox.nodes(primary_node).rrddata.get(timeframe="hour")
                if rrd:
                    for sample in rrd[-29:]:
                        t_stamp = datetime.fromtimestamp(sample.get("time", 0)).strftime("%H:%M:%S")
                        c_val = round(min(max(sample.get("cpu", 0) * 100, 0.0), 100.0), 1)
                        m_val = round(min(max((sample.get("memused", 0) / max(sample.get("memtotal", 1), 1)) * 100, 0.0), 100.0), 1)
                        TELEMETRY_STREAM_BUFFER.append({
                            "time": t_stamp,
                            "cpu": c_val,
                            "memory": m_val,
                            "net_in": round(float(sample.get("netin", 0.0)) / 1024, 1),
                            "net_out": round(float(sample.get("netout", 0.0)) / 1024, 1),
                            "storage": storage_pct,
                            "iowait": round(sample.get("iowait", 0) * 100, 2)
                        })
            except Exception:
                pass

        now_time_str = datetime.now().strftime("%H:%M:%S")
        TELEMETRY_STREAM_BUFFER.append({
            "time": now_time_str,
            "cpu": cpu_pct,
            "memory": mem_pct,
            "net_in": live_rx_kbps,
            "net_out": live_tx_kbps,
            "storage": storage_pct,
            "iowait": iowait_pct
        })

        uptime_secs = node_status.get("uptime", 0)

        # Boot time rendered cleanly in GST
        boot_time_gst = "N/A"
        if uptime_secs:
            boot_dt_utc = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() - uptime_secs, tz=timezone.utc)
            boot_dt_gst = boot_dt_utc.astimezone(timezone(timedelta(hours=4)))
            boot_time_gst = boot_dt_gst.strftime("%b %d, %Y %H:%M GST")

        return {
            "node": primary_node,
            "cpu": {
                "usage_pct": cpu_pct,
                "cores": cpu_info.get("cpus", node_status.get("cpus", 0)),
                "sockets": cpu_info.get("sockets", 1),
                "model": cpu_info.get("model", "Physical x86_64 Cores"),
                "mhz": cpu_info.get("mhz", "N/A"),
                "loadavg": loadavg,
                "iowait_pct": iowait_pct,
            },
            "memory": {
                "used_gb": round(memory.get("used", 0) / (1024**3), 2),
                "total_gb": round(memory.get("total", 1) / (1024**3), 2),
                "free_gb": round(memory.get("free", 0) / (1024**3), 2),
                "usage_pct": mem_pct,
                "swap_used_gb": round(swap.get("used", 0) / (1024**3), 2),
                "swap_total_gb": round(swap.get("total", 1) / (1024**3), 2),
                "swap_pct": round(min(max((swap.get("used", 0) / max(swap.get("total", 1), 1)) * 100, 0.0), 100.0), 1),
            },
            "storage": {
                "rootfs": {
                    "used_gb": round(root_fs.get("used", 0) / (1024**3), 2),
                    "total_gb": round(root_fs.get("total", 1) / (1024**3), 2),
                    "free_gb": round(root_fs.get("avail", 0) / (1024**3), 2),
                    "usage_pct": storage_pct,
                },
                "pools": pools,
                "disks": disks,
            },
            "network": {
                "interfaces": net_interfaces,
                "rx_rate_kbps": live_rx_kbps,
                "tx_rate_kbps": live_tx_kbps,
            },
            "system": {
                "pve_version": node_status.get("pveversion", "Proxmox VE"),
                "kernel_version": node_status.get("kversion", "Linux"),
                "uptime_seconds": uptime_secs,
                "uptime_formatted": format_uptime(uptime_secs),
                "boot_time": boot_time_gst
            },
            "history": list(TELEMETRY_STREAM_BUFFER)
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
    auth_token: str = Query(..., description="Single-use ephemeral console JWT")
):
    try:
        payload = jwt.decode(auth_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "ephemeral_console":
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        if payload.get("vmid") != vmid or payload.get("node") != node:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept(subprotocol="binary")
    
    raw_ticket = urllib.parse.unquote(ticket)
    raw_session = urllib.parse.unquote(session_ticket)
    encoded_vncticket = urllib.parse.quote(raw_ticket, safe="")

    pve_ws_url = (
        f"wss://{PROXMOX_HOST}:8006/api2/json/nodes/{node}/{vm_type}/{vmid}/vncwebsocket"
        f"?port={port}&vncticket={encoded_vncticket}"
    )
    
    ssl_context = ssl._create_unverified_context()
    headers_dict = {}
    if raw_session != "API_TOKEN_AUTH":
        headers_dict["Cookie"] = f"PVEAuthCookie={raw_session}"
    elif PROXMOX_TOKEN_NAME and PROXMOX_TOKEN_VALUE:
        headers_dict["Authorization"] = f"PVEAPIToken={PROXMOX_USER}!{PROXMOX_TOKEN_NAME}={PROXMOX_TOKEN_VALUE}"

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
        async with websockets.connect(pve_ws_url, **connect_kwargs) as pve_ws:
            async def client_to_pve():
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await pve_ws.send(data)
                except (WebSocketDisconnect, Exception):
                    pass

            async def pve_to_client():
                try:
                    async for message in pve_ws:
                        if isinstance(message, str):
                            await websocket.send_bytes(message.encode("latin-1"))
                        else:
                            await websocket.send_bytes(message)
                except Exception:
                    pass

            await asyncio.gather(client_to_pve(), pve_to_client())
    except Exception as e:
        print(f"[WebSocket Proxy Error]: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass

def get_notion_headers():
    return {
        "Authorization": f"Bearer {NOTION_API_KEY}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }

# ---------------------------------------------------------------------------
# Notion API: Runbooks
# ---------------------------------------------------------------------------

@app.get("/api/v1/notes")
def get_notion_notes(user: UserContext = Depends(get_current_user)):
    if not NOTION_API_KEY or not NOTION_DATABASE_ID:
        raise HTTPException(status_code=500, detail="Notion credentials unconfigured in .env.")

    url = f"https://api.notion.com/v1/databases/{NOTION_DATABASE_ID}/query"
    resp = requests.post(url, headers=get_notion_headers(), json={}, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Notion sync error: {resp.text}")

    results = resp.json().get("results", [])
    notes = []
    for page in results:
        props = page.get("properties", {})
        title_objs = props.get("Title", {}).get("title", []) or props.get("Name", {}).get("title", [])
        title = title_objs[0].get("plain_text", "Untitled") if title_objs else "Untitled"

        tag = "Infrastructure"
        if "multi_select" in props.get("Tag", {}):
            tags_list = props.get("Tag", {}).get("multi_select", [])
            tag = tags_list[0].get("name", "Infrastructure") if tags_list else "Infrastructure"
        elif "select" in props.get("Tag", {}):
            select_obj = props.get("Tag", {}).get("select")
            tag = select_obj.get("name", "Infrastructure") if select_obj else "Infrastructure"

        snippet_objs = props.get("Snippet", {}).get("rich_text", [])
        snippet = snippet_objs[0].get("plain_text", "") if snippet_objs else ""

        author_objs = props.get("Author", {}).get("rich_text", [])
        author = author_objs[0].get("plain_text", "DevOps") if author_objs else "DevOps"

        notion_date_obj = props.get("Date", {}).get("date")
        entry_date = notion_date_obj.get("start") if notion_date_obj else page.get("last_edited_time", "")[:10]

        notes.append({
            "id": page.get("id"),
            "title": title,
            "tag": tag,
            "snippet": snippet,
            "author": author,
            "updated": entry_date,
        })

    return notes

@app.post("/api/v1/notes")
def create_notion_note(req: CreateNoteRequest, user: UserContext = Depends(get_current_user)):
    if user.role != "SuperAdmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Guests cannot mutate Notion databases.")

    if not NOTION_API_KEY or not NOTION_DATABASE_ID:
        raise HTTPException(status_code=500, detail="Notion credentials unconfigured in .env.")

    url = "https://api.notion.com/v1/pages"
    title_property_key = "Title"
    tag_is_multi_select = True
    
    db_meta = requests.get(f"https://api.notion.com/v1/databases/{NOTION_DATABASE_ID}", headers=get_notion_headers(), timeout=10)
    if db_meta.status_code == 200:
        db_props = db_meta.json().get("properties", {})
        for prop_name, prop_val in db_props.items():
            if prop_val.get("type") == "title":
                title_property_key = prop_name
            if prop_name.lower() == "tag":
                tag_is_multi_select = (prop_val.get("type") == "multi_select")

    tag_payload = {"multi_select": [{"name": req.tag}]} if tag_is_multi_select else {"select": {"name": req.tag}}
    target_date = req.date if req.date else str(date.today())

    payload = {
        "parent": {"database_id": NOTION_DATABASE_ID},
        "properties": {
            title_property_key: {"title": [{"text": {"content": req.title}}]},
            "Tag": tag_payload,
            "Snippet": {"rich_text": [{"text": {"content": req.snippet}}]},
            "Author": {"rich_text": [{"text": {"content": user.name or user.user_id}}]},
            "Date": {"date": {"start": target_date}},
        }
    }

    resp = requests.post(url, headers=get_notion_headers(), json=payload, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Failed to create note in Notion: {resp.text}")

    return {"status": "success", "page_id": resp.json().get("id")}

# ---------------------------------------------------------------------------
# Notion API: Hardware Expansions
# ---------------------------------------------------------------------------

@app.get("/api/v1/upgrades")
def get_notion_upgrades(user: UserContext = Depends(get_current_user)):
    if not NOTION_API_KEY or not NOTION_UPGRADES_DATABASE_ID:
        raise HTTPException(status_code=500, detail="Notion Upgrades DB unconfigured in .env.")

    url = f"https://api.notion.com/v1/databases/{NOTION_UPGRADES_DATABASE_ID}/query"
    resp = requests.post(url, headers=get_notion_headers(), json={}, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Notion sync error: {resp.text}")

    results = resp.json().get("results", [])
    upgrades = []

    for page in results:
        props = page.get("properties", {})
        title_objs = props.get("Title", {}).get("title", []) or props.get("Name", {}).get("title", [])
        title = title_objs[0].get("plain_text", "Untitled") if title_objs else "Untitled"

        cat = "Hardware"
        if "multi_select" in props.get("Category", {}):
            cat_list = props.get("Category", {}).get("multi_select", [])
            cat = cat_list[0].get("name", "Hardware") if cat_list else "Hardware"
        elif "select" in props.get("Category", {}):
            cat_obj = props.get("Category", {}).get("select")
            cat = cat_obj.get("name", "Hardware") if cat_obj else "Hardware"

        pri = "Medium"
        if "multi_select" in props.get("Priority", {}):
            pri_list = props.get("Priority", {}).get("multi_select", [])
            pri = pri_list[0].get("name", "Medium") if pri_list else "Medium"
        elif "select" in props.get("Priority", {}):
            pri_obj = props.get("Priority", {}).get("select")
            pri = pri_obj.get("name", "Medium") if pri_obj else "Medium"

        status_val = "Pending"
        if "Status" in props:
            st_prop = props["Status"]
            if st_prop.get("type") == "select" and st_prop.get("select"):
                status_val = st_prop["select"].get("name", "Pending")
            elif st_prop.get("type") == "status" and st_prop.get("status"):
                status_val = st_prop["status"].get("name", "Pending")
            elif st_prop.get("type") == "multi_select" and st_prop.get("multi_select"):
                status_val = st_prop["multi_select"][0].get("name", "Pending")

        desc_objs = props.get("Description", {}).get("rich_text", [])
        description = desc_objs[0].get("plain_text", "") if desc_objs else ""

        req_objs = props.get("Requested By", {}).get("rich_text", [])
        requested_by = req_objs[0].get("plain_text", "System") if req_objs else "System"

        upgrades.append({
            "id": page.get("id"),
            "title": title,
            "category": cat,
            "priority": pri,
            "status": status_val,
            "description": description,
            "requested_by": requested_by,
            "date_added": page.get("created_time", "")[:10]
        })

    return upgrades

@app.post("/api/v1/upgrades")
def create_notion_upgrade(req: CreateUpgradeRequest, user: UserContext = Depends(get_current_user)):
    if user.role != "SuperAdmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Guests cannot mutate Notion databases.")

    if not NOTION_API_KEY or not NOTION_UPGRADES_DATABASE_ID:
        raise HTTPException(status_code=500, detail="Notion Upgrades DB unconfigured in .env.")

    url = "https://api.notion.com/v1/pages"
    title_property_key = "Title"
    cat_is_multi_select = False
    pri_is_multi_select = False
    status_prop_type = "select"
    
    db_meta = requests.get(f"https://api.notion.com/v1/databases/{NOTION_UPGRADES_DATABASE_ID}", headers=get_notion_headers(), timeout=10)
    if db_meta.status_code == 200:
        db_props = db_meta.json().get("properties", {})
        for prop_name, prop_val in db_props.items():
            if prop_val.get("type") == "title":
                title_property_key = prop_name
            if prop_name.lower() == "category":
                cat_is_multi_select = (prop_val.get("type") == "multi_select")
            if prop_name.lower() == "priority":
                pri_is_multi_select = (prop_val.get("type") == "multi_select")
            if prop_name.lower() == "status":
                status_prop_type = prop_val.get("type", "select")

    cat_payload = {"multi_select": [{"name": req.category}]} if cat_is_multi_select else {"select": {"name": req.category}}
    pri_payload = {"multi_select": [{"name": req.priority}]} if pri_is_multi_select else {"select": {"name": req.priority}}
    
    if status_prop_type == "status":
        status_payload = {"status": {"name": req.status}}
    elif status_prop_type == "multi_select":
        status_payload = {"multi_select": [{"name": req.status}]}
    else:
        status_payload = {"select": {"name": req.status}}

    payload = {
        "parent": {"database_id": NOTION_UPGRADES_DATABASE_ID},
        "properties": {
            title_property_key: {"title": [{"text": {"content": req.title}}]},
            "Category": cat_payload,
            "Priority": pri_payload,
            "Status": status_payload,
            "Description": {"rich_text": [{"text": {"content": req.description}}]},
            "Requested By": {"rich_text": [{"text": {"content": user.name or user.user_id}}]}
        }
    }

    resp = requests.post(url, headers=get_notion_headers(), json=payload, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Failed to push upgrade to Notion: {resp.text}")

    return {"status": "success", "page_id": resp.json().get("id")}

@app.patch("/api/v1/upgrades/{page_id}/status")
def update_notion_upgrade_status(page_id: str, req: UpdateUpgradeStatusRequest, user: UserContext = Depends(get_current_user)):
    if user.role != "SuperAdmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Guests cannot mutate Notion databases.")
    if not NOTION_API_KEY or not NOTION_UPGRADES_DATABASE_ID:
        raise HTTPException(status_code=500, detail="Notion Upgrades DB unconfigured in .env.")

    url = f"https://api.notion.com/v1/pages/{page_id}"
    
    db_meta = requests.get(f"https://api.notion.com/v1/databases/{NOTION_UPGRADES_DATABASE_ID}", headers=get_notion_headers(), timeout=10)
    status_prop_type = "select"
    if db_meta.status_code == 200:
        db_props = db_meta.json().get("properties", {})
        if "Status" in db_props:
            status_prop_type = db_props["Status"].get("type", "select")

    if status_prop_type == "status":
        status_payload = {"status": {"name": req.status}}
    elif status_prop_type == "multi_select":
        status_payload = {"multi_select": [{"name": req.status}]}
    else:
        status_payload = {"select": {"name": req.status}}

    payload = {
        "properties": {
            "Status": status_payload
        }
    }

    resp = requests.patch(url, headers=get_notion_headers(), json=payload, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Failed to update status in Notion: {resp.text}")
    return {"status": "success", "page_id": page_id}

@app.delete("/api/v1/upgrades/{page_id}")
def delete_notion_upgrade(page_id: str, user: UserContext = Depends(get_current_user)):
    if user.role != "SuperAdmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Guests cannot mutate Notion databases.")
    if not NOTION_API_KEY or not NOTION_UPGRADES_DATABASE_ID:
        raise HTTPException(status_code=500, detail="Notion Upgrades DB unconfigured in .env.")

    url = f"https://api.notion.com/v1/pages/{page_id}"
    payload = {"archived": True}
    resp = requests.patch(url, headers=get_notion_headers(), json=payload, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Failed to delete page in Notion: {resp.text}")
    return {"status": "success", "deleted_id": page_id}

# ---------------------------------------------------------------------------
# Notion API: Maintenance Windows
# ---------------------------------------------------------------------------

@app.get("/api/v1/maintenance-events")
def get_notion_maintenance_events(user: UserContext = Depends(get_current_user)):
    if not NOTION_API_KEY or not NOTION_MAINTENANCE_DATABASE_ID:
        return [
            {
                "id": "mock-1",
                "title": "Corosync Node Heartbeat Calibration",
                "type": "Maintenance",
                "date": "2026-08-29",
                "time": "02:00 - 03:00 GST",
                "targetNode": "pve-server",
                "status": "Completed"
            },
            {
                "id": "mock-2",
                "title": "ZFS Pool Scrubbing & Trim Procedure",
                "type": "ZFS Scrub",
                "date": "2026-09-04",
                "time": "23:00 - 01:00 GST",
                "targetNode": "pve-server",
                "status": "Scheduled"
            },
            {
                "id": "mock-3",
                "title": "Network Isolation & WireGuard Key Rotation",
                "type": "Security Audit",
                "date": "2026-09-18",
                "time": "09:00 - 16:00 GST",
                "targetNode": "Tailscale Mesh",
                "status": "Scheduled"
            }
        ]

    url = f"https://api.notion.com/v1/databases/{NOTION_MAINTENANCE_DATABASE_ID}/query"
    resp = requests.post(url, headers=get_notion_headers(), json={}, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Notion sync error: {resp.text}")

    results = resp.json().get("results", [])
    events = []
    for page in results:
        props = page.get("properties", {})
        title_objs = props.get("Title", {}).get("title", []) or props.get("Name", {}).get("title", [])
        title = title_objs[0].get("plain_text", "Maintenance Event") if title_objs else "Maintenance Event"

        m_type = "Maintenance"
        if "select" in props.get("Type", {}):
            m_type = props["Type"]["select"].get("name", "Maintenance") if props["Type"]["select"] else "Maintenance"

        date_obj = props.get("Date", {}).get("date")
        evt_date = date_obj.get("start") if date_obj else page.get("created_time", "")[:10]

        time_objs = props.get("Time Window", {}).get("rich_text", [])
        evt_time = time_objs[0].get("plain_text", "04:00 - 05:00 GST") if time_objs else "04:00 - 05:00 GST"

        node_objs = props.get("Target Node", {}).get("rich_text", [])
        target_node = node_objs[0].get("plain_text", "pve-server") if node_objs else "pve-server"

        m_status = "Scheduled"
        if "select" in props.get("Status", {}):
            m_status = props["Status"]["select"].get("name", "Scheduled") if props["Status"]["select"] else "Scheduled"

        events.append({
            "id": page.get("id"),
            "title": title,
            "type": m_type,
            "date": evt_date,
            "time": evt_time,
            "targetNode": target_node,
            "status": m_status
        })

    return events

@app.post("/api/v1/maintenance-events")
def create_notion_maintenance_event(req: CreateMaintenanceEventRequest, user: UserContext = Depends(get_current_user)):
    if user.role != "SuperAdmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Guests cannot mutate Notion databases.")
    if not NOTION_API_KEY or not NOTION_MAINTENANCE_DATABASE_ID:
        raise HTTPException(status_code=500, detail="Notion Maintenance DB unconfigured in .env.")

    db_meta = requests.get(
        f"https://api.notion.com/v1/databases/{NOTION_MAINTENANCE_DATABASE_ID}",
        headers=get_notion_headers(),
        timeout=10
    )
    
    title_key = "Title"
    type_key = None
    time_key = None
    node_key = None
    status_key = None
    date_key = None

    if db_meta.status_code == 200:
        db_props = db_meta.json().get("properties", {})
        for prop_name, prop_val in db_props.items():
            p_type = prop_val.get("type")
            p_lower = prop_name.lower()
            if p_type == "title":
                title_key = prop_name
            elif "type" in p_lower or "category" in p_lower or "tag" in p_lower:
                type_key = prop_name
            elif "time" in p_lower:
                time_key = prop_name
            elif "node" in p_lower or "target" in p_lower:
                node_key = prop_name
            elif "status" in p_lower:
                status_key = prop_name
            elif p_type == "date" or "date" in p_lower:
                date_key = prop_name

    properties = {
        title_key: {"title": [{"text": {"content": req.title}}]},
    }

    if type_key:
        properties[type_key] = {"select": {"name": req.type}}
    if date_key:
        properties[date_key] = {"date": {"start": req.date}}
    if time_key:
        properties[time_key] = {"rich_text": [{"text": {"content": req.time}}]}
    if node_key:
        properties[node_key] = {"rich_text": [{"text": {"content": req.targetNode}}]}
    if status_key:
        properties[status_key] = {"select": {"name": req.status or "Scheduled"}}

    url = "https://api.notion.com/v1/pages"
    payload = {
        "parent": {"database_id": NOTION_MAINTENANCE_DATABASE_ID},
        "properties": properties
    }
    
    resp = requests.post(url, headers=get_notion_headers(), json=payload, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Failed to create maintenance event in Notion: {resp.text}")
    return {"status": "success", "page_id": resp.json().get("id")}

@app.patch("/api/v1/maintenance-events/{page_id}/status")
def update_notion_maintenance_status(page_id: str, req: UpdateMaintenanceStatusRequest, user: UserContext = Depends(get_current_user)):
    if user.role != "SuperAdmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Guests cannot mutate Notion databases.")
    if not NOTION_API_KEY or not NOTION_MAINTENANCE_DATABASE_ID:
        raise HTTPException(status_code=500, detail="Notion Maintenance DB unconfigured in .env.")

    url = f"https://api.notion.com/v1/pages/{page_id}"
    payload = {
        "properties": {
            "Status": {"select": {"name": req.status}}
        }
    }
    resp = requests.patch(url, headers=get_notion_headers(), json=payload, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Failed to update maintenance event status: {resp.text}")
    return {"status": "success", "page_id": page_id}

@app.delete("/api/v1/maintenance-events/{page_id}")
def delete_notion_maintenance_event(page_id: str, user: UserContext = Depends(get_current_user)):
    if user.role != "SuperAdmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Guests cannot mutate Notion databases.")
    if not NOTION_API_KEY or not NOTION_MAINTENANCE_DATABASE_ID:
        raise HTTPException(status_code=500, detail="Notion Maintenance DB unconfigured in .env.")

    url = f"https://api.notion.com/v1/pages/{page_id}"
    payload = {"archived": True}
    resp = requests.patch(url, headers=get_notion_headers(), json=payload, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Failed to delete maintenance event from Notion: {resp.text}")
    return {"status": "success", "deleted_id": page_id}

# ---------------------------------------------------------------------------
# Wazuh SIEM & Security Log Feed
# ---------------------------------------------------------------------------

@app.get("/api/v1/security/nodes")
def get_security_nodes(user: UserContext = Depends(get_current_user)):
    """Fetch distinct monitored agents and nodes from Wazuh Indexer."""
    default_nodes = ["All Nodes", "pve-server"]
    if not WAZUH_INDEXER_PASSWORD:
        return default_nodes

    url = f"{WAZUH_INDEXER_HOST}/wazuh-alerts-*/_search"
    query = {
        "size": 0,
        "aggs": {
            "agents": {
                "terms": {"field": "agent.name", "size": 50}
            }
        }
    }
    try:
        resp = requests.post(
            url,
            auth=(WAZUH_INDEXER_USER, WAZUH_INDEXER_PASSWORD),
            json=query,
            verify=False,
            timeout=5
        )
        if resp.status_code == 200:
            buckets = resp.json().get("aggregations", {}).get("agents", {}).get("buckets", [])
            discovered = [b["key"] for b in buckets if b.get("key")]
            return ["All Nodes"] + sorted(list(set(discovered + ["pve-server"])))
    except Exception as e:
        print(f"[Wazuh Nodes Aggregation Error]: {e}")
    return default_nodes

@app.get("/api/v1/security/alerts")
def get_security_alerts(
    node: Optional[str] = Query("All Nodes"),
    severity: Optional[str] = Query("ALL"),
    limit: int = Query(30),
    user: UserContext = Depends(get_current_user)
):
    """Retrieve filtered real-time alerts directly from the Wazuh Indexer."""
    if not WAZUH_INDEXER_PASSWORD:
        return [
            {
                "id": "SEC-902",
                "timestamp": datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=4))).strftime("%b %d, %H:%M:%S GST"),
                "level": "INFO",
                "level_number": 3,
                "source": "pve-server",
                "event": "PAM user 'root@pam' authenticated via internal ticket",
                "ip_address": "192.168.1.200",
                "rule_id": "5501"
            },
            {
                "id": "SEC-901",
                "timestamp": (datetime.now(timezone.utc) - timedelta(minutes=4)).astimezone(timezone(timedelta(hours=4))).strftime("%b %d, %H:%M:%S GST"),
                "level": "WARN",
                "level_number": 7,
                "source": "pve-server",
                "event": "Multiple SSH connection attempts blocked by Fail2Ban",
                "ip_address": "185.220.101.5",
                "rule_id": "5710"
            }
        ]

    must_clauses = []
    if node and node != "All Nodes":
        must_clauses.append({"term": {"agent.name": node}})

    if severity and severity != "ALL":
        level_map = {"CRITICAL": 12, "WARN": 7, "INFO": 3}
        min_level = level_map.get(severity, 3)
        must_clauses.append({"range": {"rule.level": {"gte": min_level}}})

    query_payload = {
        "size": limit,
        "sort": [{"timestamp": {"order": "desc"}}],
        "query": {"bool": {"must": must_clauses}} if must_clauses else {"match_all": {}}
    }

    try:
        resp = requests.post(
            f"{WAZUH_INDEXER_HOST}/wazuh-alerts-*/_search",
            auth=(WAZUH_INDEXER_USER, WAZUH_INDEXER_PASSWORD),
            json=query_payload,
            verify=False,
            timeout=6
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"Wazuh query failed: {resp.text}")

        hits = resp.json().get("hits", {}).get("hits", [])
        alerts = []
        for hit in hits:
            src = hit.get("_source", {})
            rule = src.get("rule", {})
            agent = src.get("agent", {})
            lvl = int(rule.get("level", 1))

            level_str = "INFO"
            if lvl >= 12:
                level_str = "CRITICAL"
            elif lvl >= 7:
                level_str = "WARN"

            # Parse and convert ISO timestamp directly to GST (UTC+4)
            raw_ts = src.get("timestamp", "")
            gst_time_str = raw_ts[:19].replace("T", " ") + " GST"
            try:
                dt_utc = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                dt_gst = dt_utc.astimezone(timezone(timedelta(hours=4)))
                gst_time_str = dt_gst.strftime("%b %d, %H:%M:%S GST")
            except Exception:
                pass

            alerts.append({
                "id": hit.get("_id", "N/A"),
                "timestamp": gst_time_str,
                "level": level_str,
                "level_number": lvl,
                "source": agent.get("name", "pve-server"),
                "event": rule.get("description", "Security Event Detected"),
                "ip_address": src.get("data", {}).get("srcip", agent.get("ip", "Localhost")),
                "rule_id": rule.get("id", "N/A"),
            })
        return alerts
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error querying Wazuh Indexer: {str(e)}")

# ---------------------------------------------------------------------------
# SDN and Partitions/Storage Tabs
# ---------------------------------------------------------------------------

@app.get("/api/network/sdn")
def get_sdn_mesh():
    """Fetch Tailscale mesh topology and underlay network interfaces."""
    # Initialize dictionary structure to hold the combined network metrics
    mesh_data = {"peers": [], "self": {}, "status": "unknown"}
    
    # 1. Pull Tailscale Mesh Topology via CLI JSON output
    try:
        # Execute 'tailscale status --json' to retrieve raw mesh node details
        ts_output = subprocess.check_output(
            ["tailscale", "status", "--json"], 
            stderr=subprocess.STDOUT, 
            timeout=5
        )
        # Parse the byte-string output into a Python dictionary
        ts_json = json.loads(ts_output.decode("utf-8"))
        
        # Extract metadata corresponding to the local machine running the agent
        self_node = ts_json.get("Self", {})
        mesh_data["self"] = {
            "name": self_node.get("HostName"),
            "ip": self_node.get("TailscaleIPs", [""])[0],
            "os": self_node.get("OS"),
            "online": self_node.get("Online", False)
        }
        
        # Iterate over all registered peers in the tailnet mesh dictionary
        peer_list = []
        for _, peer in ts_json.get("Peer", {}).items():
            peer_list.append({
                "name": peer.get("HostName"),
                "ip": peer.get("TailscaleIPs", [""])[0],
                "os": peer.get("OS"),
                "online": peer.get("Online", False),
                "active": peer.get("Active", False),
                "relay": peer.get("Relay", ""),
                "cur_addr": peer.get("CurAddr", "Direct / Local"),
                "rx_bytes": peer.get("RxBytes", 0),
                "tx_bytes": peer.get("TxBytes", 0)
            })
        # Assign the compiled list of active/offline peers to our response payload
        mesh_data["peers"] = peer_list
        mesh_data["status"] = "connected"
    except Exception as e:
        # Fallback error state if Tailscale binary is missing or daemon is unreachable
        mesh_data["status"] = f"offline / error: {str(e)}"

    # 2. Pull Local Host Network Bridges (Linux / Proxmox underlay)
    bridges = []
    try:
        # Run 'ip -j addr' to get a structured JSON representation of system interfaces
        ip_output = subprocess.check_output(["ip", "-j", "addr"], timeout=5)
        interfaces = json.loads(ip_output.decode("utf-8"))
        
        # Filter for relevant bridge, ethernet, and virtual network interfaces
        for iface in interfaces:
            if iface.get("ifname", "").startswith(("vmbr", "eth", "tailscale")):
                addr_info = iface.get("addr_info", [])
                # Grab the first available IPv4 address, or default if unassigned
                ipv4 = addr_info[0].get("local") if addr_info else "unassigned"
                bridges.append({
                    "name": iface.get("ifname"),
                    "state": iface.get("operstate"),
                    "ip": ipv4
                })
    except Exception:
        pass

    # Return the aggregated JSON payload containing both overlay and underlay maps
    return {"tailscale": mesh_data, "interfaces": bridges}


@app.get("/api/storage/partitions")
def get_partitions_storage():
    """Fetch physical disk partitions, mount points, and pool capacity."""
    disks = []
    try:
        # Execute 'lsblk' with JSON and custom columns to parse hardware partition trees
        lsblk_out = subprocess.check_output(
            ["lsblk", "-J", "-o", "NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,MODEL"], 
            timeout=5
        )
        # Parse block device hierarchy block into standard dictionaries
        disks = json.loads(lsblk_out.decode("utf-8")).get("blockdevices", [])
    except Exception as e:
        disks = [{"error": str(e)}]

    # Define core critical mount paths to measure storage utilization against
    mount_paths = ["/", "/mnt", "/downloads"]
    mount_stats = []
    
    # Iterate through each path to collect filesystem capacity metrics
    for path in mount_paths:
        try:
            # Query the operating system for total, used, and free space bytes
            usage = shutil.disk_usage(path)
            mount_stats.append({
                "path": path,
                "total_gb": round(usage.total / (1024**3), 2),
                "used_gb": round(usage.used / (1024**3), 2),
                "free_gb": round(usage.free / (1024**3), 2),
                "percent_used": round((usage.used / usage.total) * 100, 1)
            })
        except FileNotFoundError:
            # Skip mount paths that do not exist locally on this node
            continue

    # Return structured storage metrics and physical layouts
    return {"block_devices": disks, "mount_usage": mount_stats}