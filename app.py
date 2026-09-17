import os
import sys
import io
from typing import Optional
from fastapi import FastAPI, Request, Query, Response
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# Configurar rutas del sistema
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "Backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from database import get_db, init_db
from services.reports import get_managerial_summary, generate_excel_report
from services.mail_worker import mail_worker_instance
from services.audit import get_audit_logs, log_audit_event

# Inicializar aplicacion FastAPI
app = FastAPI(
    title="PHS.OperacionesIP - Consola NOC & Métricas",
    description="Sistema de Métricas, Supervisión Operativa y Aprovisionamiento FTTH para Inter Operaciones IP",
    version="1.0.0"
)

# Montaje de archivos estaticos
FRONTEND_DIR = os.path.join(BASE_DIR, "Frontend")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

if os.path.exists(os.path.join(FRONTEND_DIR, "css")):
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
if os.path.exists(os.path.join(FRONTEND_DIR, "js")):
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

templates = Jinja2Templates(directory=TEMPLATES_DIR)

# Inicializar base de datos al arrancar
@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/", response_class=HTMLResponse)
async def serve_dashboard(request: Request):
    """Renderiza el Dashboard General de Métricas y Operaciones IP"""
    return templates.TemplateResponse(request=request, name="dashboard.html")

@app.get("/api/metrics")
async def api_get_metrics(
    area: str = Query("Todas", description="Filtro de celula: Todas, Soporte, Cabecera, Telefonía"),
    range: str = Query("all", description="Filtro de rango: today, 7days, month, all")
):
    """
    Retorna los KPIs consolidados, desglose por celula y rankings de especialistas
    segun los filtros seleccionados para alimentar el Dashboard Figma.
    """
    try:
        data = get_managerial_summary(area=area, range_filter=range)
        
        # Calcular distribucion de incidencias por categoria para Chart 2 (Doughnut)
        conn = get_db()
        cur = conn.cursor()
        
        cur.execute("""
        SELECT tt.name as category_name, tt.code as category_code, COUNT(tl.id) as count, SUM(tl.points) as points
        FROM task_logs tl
        JOIN task_types tt ON tl.task_type_id = tt.id
        GROUP BY tt.id
        ORDER BY count DESC
        """)
        categories = [dict(r) for r in cur.fetchall()]
        
        # Conteo de tickets en cola pendientes vs en progreso vs completados
        cur.execute("""
        SELECT status, COUNT(*) as count
        FROM email_tickets
        GROUP BY status
        """)
        queue_status = {r["status"]: r["count"] for r in cur.fetchall()}
        
        conn.close()
        
        data["category_distribution"] = categories
        data["queue_counts"] = {
            "total": sum(queue_status.values()),
            "pending": queue_status.get("PENDIENTE", 0),
            "in_progress": queue_status.get("EN PROGRESO", 0),
            "completed": queue_status.get("COMPLETADO", 0),
            "on_hold": queue_status.get("EN ESPERA", 0)
        }
        
        return JSONResponse(content={"status": "ok", "data": data})
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

@app.get("/api/tickets")
async def api_get_tickets(
    area: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50
):
    """Retorna la cola de trabajo activa con parametros tecnicos telco"""
    try:
        conn = get_db()
        cur = conn.cursor()
        
        query = """
        SELECT et.id, et.ticket_code, et.sender_email, et.subject, et.full_body, et.area,
               et.subscriber_code, et.serial_pon, et.node_name, et.slot_pon, et.mac_address,
               et.status, et.folder, et.created_at, et.claimed_at,
               tt.name as task_name, tt.code as task_code, tt.points, tt.sla_minutes,
               u.id as operator_id, u.name as operator_name, u.avatar as operator_avatar, u.area as operator_area
        FROM email_tickets et
        LEFT JOIN task_types tt ON et.suggested_task_type_id = tt.id
        LEFT JOIN users u ON et.claimed_by_user_id = u.id
        WHERE 1=1
        """
        params = []
        
        if area and area not in ["Todas", "Todas las Areas", ""]:
            query += " AND (et.area = ? OR u.area = ?)"
            params.extend([area, area])
            
        if status and status != "TODOS":
            query += " AND et.status = ?"
            params.append(status)
            
        query += " ORDER BY et.id DESC LIMIT ?"
        params.append(limit)
        
        cur.execute(query, params)
        raw_tickets = [dict(r) for r in cur.fetchall()]
        conn.close()

        # Mapeo de estilos y colores por área para cada ticket
        area_color_map = {
            "FTTH": {"color": "#D97706", "bg": "rgba(217, 119, 6, 0.18)", "border": "#D97706", "label": "FTTH"},
            "WAN": {"color": "#0284C7", "bg": "rgba(2, 132, 199, 0.18)", "border": "#0284C7", "label": "WAN"},
            "G.C": {"color": "#BE123C", "bg": "rgba(190, 18, 60, 0.18)", "border": "#BE123C", "label": "G.C"},
            "SEGURIDAD": {"color": "#10B981", "bg": "rgba(16, 185, 129, 0.18)", "border": "#10B981", "label": "SEGURIDAD"}
        }

        tickets = []
        for t in raw_tickets:
            item = dict(t)
            effective_area = item.get("operator_area") or item.get("area") or "FTTH"
            colors = area_color_map.get(effective_area, {"color": "#38BDF8", "bg": "rgba(56, 189, 248, 0.18)", "border": "#38BDF8", "label": effective_area})
            item["area_color"] = colors["color"]
            item["area_bg"] = colors["bg"]
            item["area_border"] = colors["border"]
            item["display_area"] = colors["label"]
            
            # Si no tiene operador asignado explícito, asignar por célula
            if not item.get("operator_name"):
                if effective_area == "FTTH":
                    item["operator_name"] = "José Corobo"
                    item["operator_avatar"] = "JC"
                elif effective_area == "SEGURIDAD":
                    item["operator_name"] = "Carlos Ruiz"
                    item["operator_avatar"] = "CR"
                elif effective_area == "WAN":
                    item["operator_name"] = "María Santos"
                    item["operator_avatar"] = "MS"
                elif effective_area == "G.C":
                    item["operator_name"] = "Roberto Méndez"
                    item["operator_avatar"] = "RM"
                else:
                    item["operator_name"] = "Operador NOC"
                    item["operator_avatar"] = "OP"
                    
            tickets.append(item)
        
        return JSONResponse(content={"status": "ok", "count": len(tickets), "tickets": tickets})
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

@app.post("/api/tickets/simulate")
async def api_simulate_ticket(area: Optional[str] = None):
    """
    Invoca el generador de casos tecnicos telco en terreno (simulador)
    creando un ticket con parametros reales (Abonado, Serial, OLT, Potencia).
    """
    try:
        res = mail_worker_instance._sync_simulator(area=area)
        return JSONResponse(content=res)
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

@app.post("/api/tickets/{ticket_id}/status")
async def api_update_ticket_status(ticket_id: int, request: Request):
    """Actualiza el estado de un ticket y registra en auditoría"""
    try:
        body = await request.json()
        new_status = body.get("status")
        if new_status not in ["PENDIENTE", "EN PROGRESO", "COMPLETADO", "EN ESPERA"]:
            return JSONResponse(status_code=400, content={"status": "error", "message": "Estado no válido"})
            
        conn = get_db()
        cur = conn.cursor()
        cur.execute("UPDATE email_tickets SET status = ? WHERE id = ?", (new_status, ticket_id))
        cur.execute("SELECT ticket_code, area FROM email_tickets WHERE id = ?", (ticket_id,))
        t = cur.fetchone()
        conn.commit()
        conn.close()
        
        if t:
            log_audit_event(
                action=f"CAMBIO_ESTADO_{new_status}",
                entity_type="TICKET",
                entity_id=t["ticket_code"],
                area=t["area"],
                details=f"Ticket {t['ticket_code']} cambió de estado a {new_status}"
            )
            
        return JSONResponse(content={"status": "ok", "ticket_id": ticket_id, "new_status": new_status})
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

@app.get("/api/reports/excel")
async def api_download_excel_report(
    area: str = Query("Todas"),
    range: str = Query("all")
):
    """Genera y descarga el libro Excel con las 3 pestañas profesionales de supervisión"""
    try:
        excel_buffer = generate_excel_report(area=area, range_filter=range)
        filename = f"Reporte_Operaciones_IP_{area}_{range}.xlsx"
        
        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

@app.get("/api/worker/status")
async def api_get_worker_status():
    """Retorna el estado de conexion del worker de correo y modo de operacion"""
    return JSONResponse(content=mail_worker_instance.get_status())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
