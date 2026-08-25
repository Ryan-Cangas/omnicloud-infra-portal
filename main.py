import os
import urllib3
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from proxmoxer import ProxmoxAPI
from proxmoxer.core import ResourceException

load_dotenv()

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = FastAPI(
    title="Sovereign Cloud Orchestrator API",
    description="Control plane for multi-tenant Proxmox infrastructure and CRM integration.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load connection settings from environment variables
PVE_HOST = os.getenv("PROXMOX_HOST", "127.0.0.1")
PVE_USER = os.getenv("PROXMOX_USER", "portal-api@pve")
PVE_TOKEN_NAME = os.getenv("PROXMOX_TOKEN_NAME", "portal-token")
PVE_TOKEN_VALUE = os.getenv("PROXMOX_TOKEN_VALUE", "")

proxmox = ProxmoxAPI(
    PVE_HOST,
    user=PVE_USER,
    token_name=PVE_TOKEN_NAME,
    token_value=PVE_TOKEN_VALUE,
    verify_ssl=False,
    timeout=10
)

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

        return {
            "success": True,
            "node": node,
            "vmid": vmid,
            "action": action,
            "task_upid": task_upid
        }
    except ResourceException as err:
        raise HTTPException(status_code=400, detail=f"Proxmox API Error: {err.content}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")