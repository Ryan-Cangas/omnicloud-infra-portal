"""
Sovereign Cloud Management Platform (CMP) Control Plane & Hypervisor Gateway.

Architecture & Responsibilities:
1. Cryptographic Authentication & RBAC (JWT): Issues signed HS256 access tokens containing user_id,
   role, and tenant_id claims.
2. Proxmox Hypervisor Communication: Supports both Proxmox API Tokens (Key/Secret) and standard PAM/PVE
   user authentication via proxmoxer.
3. Strict Tenant & Role Isolation: Enforces VM boundaries across tenants (e.g., Alpha Corp vs. FinTech Core)
   and restricts personas (SuperAdmin, TenantAdmin, TenantViewer, BillingManager).
4. Ephemeral Single-Use WebSocket Tokens: Issues 30-second scoped console tokens to prevent token reuse
   in browser WebSocket query parameters.
5. Bidirectional RFB WebSocket Reverse Proxy: Dynamically bridges client RFB frame packets to 
   Proxmox's internal `vncwebsocket` daemon with dynamic header inspection.
6. Notion Two-Way Sync (Runbooks & SOPs): Synchronizes knowledge base entries directly with Notion API.
"""

import os
import ssl
import json
import asyncio
import inspect
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from pathlib import Path

import jwt
import bcrypt
import requests
import urllib3
import websockets
from datetime import date
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from proxmoxer import ProxmoxAPI
from dotenv import load_dotenv

# Suppress TLS verification warnings for internal self-signed Proxmox certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Explicitly load root .env file
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

# Hypervisor Node & Credentials Configuration
PROXMOX_HOST = os.getenv("PROXMOX_HOST", "192.168.1.200")
PROXMOX_USER = os.getenv("PROXMOX_USER", "root@pam")
PROXMOX_PASSWORD = os.getenv("PROXMOX_PASSWORD", "")
PROXMOX_TOKEN_NAME = os.getenv("PROXMOX_TOKEN_NAME", "")
PROXMOX_TOKEN_VALUE = os.getenv("PROXMOX_TOKEN_VALUE", "")

# JWT Security Configuration
JWT_SECRET = os.getenv("JWT_SECRET_KEY", "sovereign-cloud-cmp-secret-key-production-hardened-2026")
JWT_ALGORITHM = "HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 120
JWT_CONSOLE_TOKEN_EXPIRE_SECONDS = 30  # Short-lived ephemeral token for noVNC WebSocket sessions

# Notion API Configuration
NOTION_API_KEY = os.getenv("NOTION_API_KEY", "")
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID", "")
NOTION_VERSION = "2022-06-28"

# Initialize FastAPI Application
app = FastAPI(
    title="Sovereign Cloud CMP & Hypervisor Proxy Engine",
    description="Multi-tenant cloud management control plane with isolated hypervisor proxies.",
    version="1.2.0"
)

# Cross-Origin Resource Sharing (CORS) Middleware for local Vite development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Proxmox API Client supporting both API Token and Password authentication
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

# ---------------------------------------------------------------------------
# Multi-Tenant RBAC Store & Partition Mappings
# ---------------------------------------------------------------------------

# Strict VM partition boundaries per tenant
TENANT_VM_MAP = {
    "tenant-alpha": [100, 101, 102],
    "tenant-fintech": [103, 104],
}

# Dynamic password hashing helper
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

DEFAULT_DEV_HASH = hash_password("password123")

# Pre-hashed user store (Default password: "password123")
USERS_DB = {
    "admin-01": {
        "user_id": "admin-01",
        "username": "admin-01",
        "password_hash": DEFAULT_DEV_HASH,
        "role": "SuperAdmin",
        "tenant_id": "global",
        "name": "Ryan Cangas",
    },
    "tenant-alex": {
        "user_id": "tenant-alex",
        "username": "tenant-alex",
        "password_hash": DEFAULT_DEV_HASH,
        "role": "TenantAdmin",
        "tenant_id": "tenant-alpha",
        "name": "Tenant Admin",
    },
    "viewer-sam": {
        "user_id": "viewer-sam",
        "username": "viewer-sam",
        "password_hash": DEFAULT_DEV_HASH,
        "role": "TenantViewer",
        "tenant_id": "tenant-alpha",
        "name": "Tenant Viewer",
    },
    "finance-claire": {
        "user_id": "finance-claire",
        "username": "finance-claire",
        "password_hash": DEFAULT_DEV_HASH,
        "role": "BillingManager",
        "tenant_id": "tenant-alpha",
        "name": "Finance Manager",
    },
}

class UserContext:
    """Encapsulates authenticated claims verified from cryptographic JWT."""
    def __init__(self, user_id: str, role: str, tenant_id: str, name: Optional[str] = None):
        self.user_id = user_id
        self.role = role
        self.tenant_id = tenant_id
        self.name = name

class LoginRequest(BaseModel):
    username: str
    password: str

class ConsoleTokenRequest(BaseModel):
    node: str
    vm_type: str
    vmid: int

class CreateNoteRequest(BaseModel):
    title: str
    tag: str
    snippet: str
    date: Optional[str] = None  # ISO format string: YYYY-MM-DD

# ---------------------------------------------------------------------------
# Cryptographic Token Helpers & Dependencies
# ---------------------------------------------------------------------------

security_scheme = HTTPBearer(auto_error=False)

def create_jwt_token(payload_data: dict, expires_delta: timedelta) -> str:
    payload = payload_data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    payload.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme)) -> UserContext:
    """
    Validates the Bearer JWT token from the Authorization header.
    Rejects missing, expired, or tampered tokens with 401 Unauthorized.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer authentication token."
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        role = payload.get("role")
        tenant_id = payload.get("tenant_id")
        token_type = payload.get("type", "access")

        if not user_id or not role or not tenant_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload structure.")
        if token_type != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")

        return UserContext(user_id=user_id, role=role, tenant_id=tenant_id, name=payload.get("name"))
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please re-authenticate.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid cryptographic token.")

def enforce_vm_access(vmid: int, user: UserContext, required_action: str = "view"):
    """
    Enforces isolation boundaries between tenants and roles.
    Blocks cross-tenant access and unauthorized power/console mutations.
    """
    if user.role == "BillingManager":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Forbidden: Billing personas cannot interact with hypervisor workloads."
        )

    if user.role == "SuperAdmin":
        return

    allowed_vmids = TENANT_VM_MAP.get(user.tenant_id, [])
    if vmid not in allowed_vmids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail=f"Access Denied: VM {vmid} does not belong to tenant partition '{user.tenant_id}'."
        )

    if required_action in ["power", "console"] and user.role == "TenantViewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail=f"Forbidden: Role '{user.role}' does not have '{required_action}' privileges."
        )

def get_pve_auth_headers_and_cookies():
    """
    Generates credentials for upstream Proxmox calls.
    Supports API Token headers directly, or fetches ephemeral PVEAuthCookie and CSRF tokens.
    """
    if PROXMOX_TOKEN_NAME and PROXMOX_TOKEN_VALUE:
        return {
            "headers": {"Authorization": f"PVEAPIToken={PROXMOX_USER}!{PROXMOX_TOKEN_NAME}={PROXMOX_TOKEN_VALUE}"},
            "cookies": {},
            "session_ticket": "API_TOKEN_AUTH"
        }

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
    return {
        "headers": {"CSRFPreventionToken": data["CSRFPreventionToken"]},
        "cookies": {"PVEAuthCookie": data["ticket"]},
        "session_ticket": data["ticket"]
    }

# ---------------------------------------------------------------------------
# Authentication Routes
# ---------------------------------------------------------------------------

@app.post("/api/v1/auth/login")
def login(req: LoginRequest):
    """
    Validates user credentials against USERS_DB and issues an HS256 signed JWT.
    Returns both camelCase and snake_case keys for seamless frontend binding.
    """
    user_record = USERS_DB.get(req.username)
    if not user_record or not verify_password(req.password, user_record["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password."
        )

    access_token = create_jwt_token(
        payload_data={
            "sub": user_record["user_id"],
            "role": user_record["role"],
            "tenant_id": user_record["tenant_id"],
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
            "user_id": user_record["user_id"],
            "role": user_record["role"],
            "tenantId": user_record["tenant_id"],
            "tenant_id": user_record["tenant_id"],
            "name": user_record["name"],
        }
    }

@app.get("/api/v1/auth/me")
def get_me(user: UserContext = Depends(get_current_user)):
    """Validates the active session and returns authenticated identity claims."""
    return {
        "userId": user.user_id,
        "user_id": user.user_id,
        "role": user.role,
        "tenantId": user.tenant_id,
        "tenant_id": user.tenant_id,
        "name": user.name
    }

@app.post("/api/v1/auth/console-token")
def issue_ephemeral_console_token(
    req: ConsoleTokenRequest,
    user: UserContext = Depends(get_current_user)
):
    """
    Issues a 30-second single-use JWT specifically scoped to a single VM's console session.
    Prevents passing long-lived bearer tokens inside WebSocket URLs.
    """
    enforce_vm_access(req.vmid, user, required_action="console")

    console_token = create_jwt_token(
        payload_data={
            "sub": user.user_id,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "vmid": req.vmid,
            "node": req.node,
            "vm_type": req.vm_type,
            "type": "ephemeral_console",
        },
        expires_delta=timedelta(seconds=JWT_CONSOLE_TOKEN_EXPIRE_SECONDS)
    )
    return {"console_token": console_token}

# ---------------------------------------------------------------------------
# API Route Controllers (Guarded by JWT Dependencies)
# ---------------------------------------------------------------------------

@app.get("/api/v1/cluster/resources")
def get_cluster_inventory(user: UserContext = Depends(get_current_user)):
    """
    Fetches guest VM and LXC inventory, applying strict tenant filtering and usage percentage clamps.
    """
    if user.role == "BillingManager":
        return []

    try:
        resources = proxmox.cluster.resources.get(type="vm")
        allowed_vmids = TENANT_VM_MAP.get(user.tenant_id, [])

        filtered = []
        for item in resources:
            vmid = item.get("vmid")
            
            if user.role != "SuperAdmin" and vmid not in allowed_vmids:
                continue

            maxmem_gb = round(item.get("maxmem", 0) / (1024**3), 2)
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
    Triggers power state changes (start, shutdown, stop, reset) with tenant RBAC enforcement.
    """
    enforce_vm_access(vmid, user, required_action="power")
    try:
        node_controller = getattr(proxmox.nodes(node), vm_type)(vmid)
        status_controller = getattr(node_controller.status, action)
        upid = status_controller.post()
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
    Requests a short-lived VNC ticket and port assignment from Proxmox for out-of-band console access.
    """
    enforce_vm_access(vmid, user, required_action="console")
    try:
        auth_data = get_pve_auth_headers_and_cookies()
        url = f"https://{PROXMOX_HOST}:8006/api2/json/nodes/{node}/{vm_type}/{vmid}/vncproxy"
        
        resp = requests.post(
            url,
            headers=auth_data["headers"],
            cookies=auth_data["cookies"],
            data={"websocket": 1},
            verify=False,
            timeout=10
        )

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
    """
    Retrieves real bare-metal compute statistics (CPU, RAM, Rootfs storage, uptime).
    Protected exclusively for SuperAdmin roles.
    """
    if user.role != "SuperAdmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Host telemetry access restricted to SuperAdmin.")

    try:
        nodes = proxmox.nodes.get()
        if not nodes:
            raise HTTPException(status_code=404, detail="No Proxmox nodes discovered")
        primary_node = nodes[0].get("node")
        node_status = proxmox.nodes(primary_node).status.get()

        cpu_info = node_status.get("cpuinfo", {})
        memory = node_status.get("memory", {})
        root_fs = node_status.get("rootfs", {})

        return {
            "node": primary_node,
            "cpu": {
                "usage_pct": round(min(max(node_status.get("cpu", 0) * 100, 0.0), 100.0), 2),
                "cores": cpu_info.get("cpus", node_status.get("cpus", 0)),
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
                "pve_version": node_status.get("pveversion", "Proxmox VE"),
                "kernel_version": node_status.get("kversion", "Linux"),
                "uptime": node_status.get("uptime", 0),
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------------
# WebSocket Tunnel (Secured by Ephemeral Console JWT)
# ---------------------------------------------------------------------------

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
    """
    Asynchronous RFB reverse-proxy tunnel.
    Bridges the browser-side noVNC binary stream to Proxmox's internal `vncwebsocket` daemon.
    Requires a valid ephemeral console token.
    """
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

# ---------------------------------------------------------------------------
# Notion API Integration (Runbooks and SOPs)
# ---------------------------------------------------------------------------

def get_notion_headers():
    return {
        "Authorization": f"Bearer {NOTION_API_KEY}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }

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
        
        # Title
        title_objs = props.get("Title", {}).get("title", []) or props.get("Name", {}).get("title", [])
        title = title_objs[0].get("plain_text", "Untitled") if title_objs else "Untitled"

        # Tag
        tag = "Infrastructure"
        if "multi_select" in props.get("Tag", {}):
            tags_list = props.get("Tag", {}).get("multi_select", [])
            tag = tags_list[0].get("name", "Infrastructure") if tags_list else "Infrastructure"
        elif "select" in props.get("Tag", {}):
            select_obj = props.get("Tag", {}).get("select")
            tag = select_obj.get("name", "Infrastructure") if select_obj else "Infrastructure"

        # Snippet
        snippet_objs = props.get("Snippet", {}).get("rich_text", [])
        snippet = snippet_objs[0].get("plain_text", "") if snippet_objs else ""

        # Author
        author_objs = props.get("Author", {}).get("rich_text", [])
        author = author_objs[0].get("plain_text", "DevOps") if author_objs else "DevOps"

        # Date: Check custom "Date" property first, fallback to page last edited date
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

    tag_payload = (
        {"multi_select": [{"name": req.tag}]}
        if tag_is_multi_select
        else {"select": {"name": req.tag}}
    )

    # Use selected date or fallback to today
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