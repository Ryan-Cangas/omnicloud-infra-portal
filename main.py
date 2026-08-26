import os
import ssl
import asyncio
import base64
import urllib.parse
import urllib3
import requests
import websockets
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from proxmoxer import ProxmoxAPI
from proxmoxer.core import ResourceException

load_dotenv()
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = FastAPI(
    title="Sovereign Cloud Orchestrator API",
    description="Control plane for multi-tenant Proxmox infrastructure.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PVE_HOST = os.getenv("PROXMOX_HOST", "127.0.0.1")
PVE_USER = os.getenv("PROXMOX_USER", "root@pam")
PVE_PASSWORD = os.getenv("PROXMOX_PASSWORD", "root1234")
PVE_TOKEN_NAME = os.getenv("PROXMOX_TOKEN_NAME", "portal-token")
PVE_TOKEN_VALUE = os.getenv("PROXMOX_TOKEN_VALUE", "")

proxmox = ProxmoxAPI(
    PVE_HOST,
    user=PVE_USER,
    token_name=PVE_TOKEN_NAME if PVE_TOKEN_VALUE else None,
    token_value=PVE_TOKEN_VALUE if PVE_TOKEN_VALUE else None,
    password=PVE_PASSWORD if not PVE_TOKEN_VALUE else None,
    verify_ssl=False,
    timeout=10
)

def get_pve_auth_session():
    """Acquires a full PVE session ticket and CSRF token required for console websockets."""
    res = requests.post(
        f"https://{PVE_HOST}:8006/api2/json/access/ticket",
        data={"username": PVE_USER.split('!')[0], "password": PVE_PASSWORD},
        verify=False,
        timeout=5
    )
    if not res.ok:
        raise HTTPException(status_code=401, detail="Failed to authenticate with Proxmox root credentials.")
    data = res.json()["data"]
    return data["ticket"], data["CSRFPreventionToken"]

@app.get("/api/v1/cluster/resources")
def get_cluster_inventory():
    try:
        resources = proxmox.cluster.resources.get(type="vm")
        return [
            {
                "vmid": item.get("vmid"),
                "name": item.get("name", f"guest-{item.get('vmid')}"),
                "node": item.get("node"),
                "type": item.get("type"),
                "status": item.get("status"),
                "uptime": item.get("uptime", 0),
                "maxmem_gb": round(item.get("maxmem", 0) / (1024**3), 2),
                "mem_usage_pct": round((item.get("mem", 0) / max(item.get("maxmem", 1), 1)) * 100, 2),
                "cpu_usage_pct": round(item.get("cpu", 0) * 100, 2),
            }
            for item in resources
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch cluster resources: {str(e)}")

@app.post("/api/v1/nodes/{node}/{vm_type}/{vmid}/power/{action}")
def manage_power(node: str, vm_type: str, vmid: int, action: str):
    if vm_type not in ["qemu", "lxc"]:
        raise HTTPException(status_code=400, detail="vm_type must be either 'qemu' or 'lxc'")

    valid_actions = ["start", "stop", "shutdown", "reboot"]
    if action not in valid_actions:
        raise HTTPException(status_code=400, detail=f"Invalid action. Choose from: {valid_actions}")

    try:
        if vm_type == "qemu":
            task_upid = proxmox.nodes(node).qemu(vmid).status(action).post()
        else:
            task_upid = proxmox.nodes(node).lxc(vmid).status(action).post()

        return {"success": True, "node": node, "vmid": vmid, "action": action, "task_upid": task_upid}
    except ResourceException as err:
        raise HTTPException(status_code=400, detail=f"Proxmox API Error: {err.content}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


@app.post("/api/v1/nodes/{node}/{vm_type}/{vmid}/vncproxy")
def create_vnc_proxy(node: str, vm_type: str, vmid: int):
    if vm_type not in ["qemu", "lxc"]:
        raise HTTPException(status_code=400, detail="vm_type must be either 'qemu' or 'lxc'")
    try:
        session_ticket, csrf = get_pve_auth_session()

        # Call vncproxy using standard PVE auth session
        vnc_res = requests.post(
            f"https://{PVE_HOST}:8006/api2/json/nodes/{node}/{vm_type}/{vmid}/vncproxy",
            headers={"CSRFPreventionToken": csrf},
            cookies={"PVEAuthCookie": session_ticket},
            data={"websocket": 1},
            verify=False,
            timeout=5
        )
        if not vnc_res.ok:
            raise HTTPException(status_code=vnc_res.status_code, detail=f"VNC Proxy error: {vnc_res.text}")

        vnc_data = vnc_res.json()["data"]
        return {
            "node": node,
            "vmid": vmid,
            "port": vnc_data.get("port"),
            "ticket": vnc_data.get("ticket"),          # Ephemeral VNC ticket
            "session_ticket": session_ticket            # Authenticated Session cookie
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate VNC ticket: {str(e)}")
@app.websocket("/api/v1/ws/vnc/{node}/{vm_type}/{vmid}")
async def vnc_websocket_proxy(
    websocket: WebSocket,
    node: str,
    vm_type: str,
    vmid: int,
    port: int,
    ticket: str,
    session_ticket: str
):
    await websocket.accept()

    # Pass the URL-encoded vncticket parameter to Proxmox
    encoded_vncticket = urllib.parse.quote(ticket, safe='')
    pve_ws_url = f"wss://{PVE_HOST}:8006/api2/json/nodes/{node}/{vm_type}/{vmid}/vncwebsocket?port={port}&vncticket={encoded_vncticket}"

    ssl_context = ssl._create_unverified_context()

    headers = {
        "Cookie": f"PVEAuthCookie={session_ticket}"
    }

    try:
        async with websockets.connect(
            pve_ws_url,
            ssl=ssl_context,
            additional_headers=headers,
            subprotocols=["binary"]
        ) as pve_ws:

            # Pipe client bytes to Proxmox
            async def client_to_pve():
                try:
                    while True:
                        msg = await websocket.receive_bytes()
                        await pve_ws.send(msg)
                except (WebSocketDisconnect, asyncio.CancelledError):
                    pass

            # Pipe Proxmox RFB stream directly to the browser
            async def pve_to_client():
                try:
                    while True:
                        msg = await pve_ws.recv()
                        if isinstance(msg, str):
                            await websocket.send_bytes(msg.encode('utf-8'))
                        else:
                            await websocket.send_bytes(msg)
                except (websockets.ConnectionClosed, asyncio.CancelledError):
                    pass

            # Run bidirectional stream until disconnect
            done, pending = await asyncio.wait(
                [
                    asyncio.create_task(client_to_pve()),
                    asyncio.create_task(pve_to_client())
                ],
                return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()

    except Exception as e:
        print(f"Proxy bridge error: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass

def get_pve_ticket():
    # If using root credentials in .env:
    pve_password = os.getenv("root1234", "")
    if not pve_password:
        return None
    try:
        res = requests.post(
            f"https://{PVE_HOST}:8006/api2/json/access/ticket",
            data={"username": "root@pam", "password": pve_password},
            verify=False,
            timeout=5
        )
        if res.ok:
            return res.json()["data"]["ticket"]
    except Exception:
        pass
    return None