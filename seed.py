import os
import sys
import hashlib
import random
from datetime import datetime, timedelta

# Asegurar que Backend este en sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "Backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from database import get_db, init_db

def seed(skip_init=False):
    if not skip_init:
        init_db()
        
    conn = get_db()
    cur = conn.cursor()
    
    # 1. Catálogo P1 a P5 de Tareas Ponderadas
    task_types = [
        ("P1-SOP-01", "Verificación Estado ONT en OLT", "Soporte", 1, 15, "Chequeo rápido de potencia óptica y status en OLT FiberHome/Huawei."),
        ("P2-SOP-01", "Operación Estándar de Soporte", "Soporte", 2, 30, "Aprovisionamiento regular de parámetros de navegación."),
        ("P2-SOP-02", "Resolución Discrepancia MAC (Roja a Verde)", "Soporte", 2, 30, "Normalización de MAC Address entre CRM 815 y OLT."),
        ("P3-SOP-01", "Desatasco Demonio OLT (VLAN / Whitelist)", "Soporte", 3, 45, "Liberación de serial trabado en demonio y pase a Whitelist."),
        ("P4-SOP-01", "Soporte a Modo Bridge con IP Certificada", "Soporte", 5, 60, "Configuración avanzada WAN IP fija y vinculación de router cliente."),
        ("P3-TEL-01", "Depuración Falla Señalización SIP", "Telefonía", 3, 45, "Revisión de dialplan y resolución de errores SIP 403 / timeout."),
        ("P4-TEL-01", "Diagnóstico Degradación MOS y Jitter", "Telefonía", 5, 60, "Inspección de calidad de audio y pérdida de paquetes en línea VoIP."),
        ("P3-CAB-01", "Sustitución Módulo SFP en Switch", "Cabecera", 3, 45, "Cambio físico y validación óptica de transceptor en agregación."),
        ("P5-CAB-01", "Habilitación PortChannel 10G -> 20G", "Cabecera", 8, 120, "Ampliación de enlaces troncales saturados en switch de distribución core.")
    ]
    
    for code, name, area, points, sla, desc in task_types:
        cur.execute("""
        INSERT OR IGNORE INTO task_types (code, name, area, points, sla_minutes, description)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (code, name, area, points, sla, desc))
    
    # 2. Usuarios y Especialistas por Célula
    pwd_hash = hashlib.sha256("admin123".encode("utf-8")).hexdigest()
    users = [
        ("José Corobo", "joseacorobo@gmail.com", pwd_hash, "Soporte", "ESPECIALISTA", "JC", "Mañana"),
        ("Carlos Ruiz", "carlos.ruiz@inter.com.ve", pwd_hash, "Soporte", "ESPECIALISTA", "CR", "Tarde"),
        ("María Santos", "maria.santos@inter.com.ve", pwd_hash, "Cabecera", "ESPECIALISTA", "MS", "Mañana"),
        ("Roberto Méndez", "roberto.mendez@inter.com.ve", pwd_hash, "Telefonía", "ESPECIALISTA", "RM", "Tarde"),
        ("Admin NOC", "admin.noc@inter.com.ve", pwd_hash, "Operaciones IP", "ADMINISTRADOR", "AD", "Rotativo")
    ]
    
    for name, email, p_hash, area, role, avatar, shift in users:
        cur.execute("""
        INSERT OR IGNORE INTO users (name, email, password_hash, area, role, avatar, shift, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Activo')
        """, (name, email, p_hash, area, role, avatar, shift))
        
    conn.commit()
    
    # Obtener IDs de usuarios y tareas para asignación
    cur.execute("SELECT id, name, area FROM users")
    user_rows = cur.fetchall()
    users_by_name = {u["name"]: dict(u) for u in user_rows}
    
    cur.execute("SELECT id, code, name, points, area, sla_minutes FROM task_types")
    tasks_by_code = {t["code"]: dict(t) for t in cur.fetchall()}
    
    # 3. Tickets Activos en Cola ("La Trinchera")
    tickets_seed = [
        ("INC-60234", "cuadrilla.chacao@inter.com.ve", "Cliente IP Certificada sin tráfico / Modo Bridge", "Modo bridge con IP certificada, validar WANMAC en 815", "Soporte", "1029384756", "FHTT1A2B3C4D", "OLT-CHAC-01", "Slot 3 / PON 4 / Ct.Onu 18", "00:1A:2B:3C:4D:5E", "P4-SOP-01", "PENDIENTE", "INBOX"),
        ("INC-60235", "cuadrilla.centro@inter.com.ve", "Falla ONT Discovery permanente - Nodo Chacao", "La ONT emite -19.4 dBm pero no sube a Whitelist. Demonio atascado.", "Soporte", "2589301245", "HWTC9F8E7D6C", "OLT-CCS-02", "Slot 1 / PON 2 / Ct.Onu 5", "A4:B2:39:10:8C:7F", "P3-SOP-01", "EN PROGRESO", "INBOX"),
        ("INC-60236", "monitoreo.core@inter.com.ve", "Alerta de saturación enlace troncal OLT", "Enlace troncal OLT-CCS-01 slot uplink 1 saturado al 79.4%.", "Cabecera", "N/A", "N/A", "OLT-CCS-01", "Slot 19 / PortChannel 1", "N/A", "P5-CAB-01", "EN PROGRESO", "INBOX"),
        ("INC-60237", "soporte.voip@inter.com.ve", "Falla registro SIP en ONT residencial", "Reporta SIP 403 Forbidden. Revisar dialplan.", "Telefonía", "3045812903", "FHTT5D4C3B2A", "OLT-VAL-02", "Slot 2 / PON 8 / Ct.Onu 12", "C8:9E:43:55:A1:02", "P3-TEL-01", "PENDIENTE", "INBOX"),
        ("INC-60238", "cuadrilla.este@inter.com.ve", "Discrepancia MAC en portal 815 (MAC Roja)", "Se requiere sincronizar serial y pasar MAC a verde.", "Soporte", "1083920194", "FHTT882910AA", "OLT-BARU-01", "Slot 4 / PON 1 / Ct.Onu 22", "E0:D5:5E:21:44:90", "P2-SOP-02", "PENDIENTE", "INBOX"),
        ("INC-60239", "planta.externa@inter.com.ve", "Sustitución transceptor SFP por atenuación", "Módulo óptico con fallas intermitentes de potencia.", "Cabecera", "N/A", "N/A", "OLT-MAR-01", "Slot 1 / Port 4", "N/A", "P3-CAB-01", "COMPLETADO", "INBOX"),
        ("INC-60240", "atencion.vip@inter.com.ve", "Auditoría MOS y jitter en conmutador PBX", "Cliente reporta llamadas entrecortadas hacia conmutador IP.", "Telefonía", "2599401290", "HWTC441299FF", "OLT-CCS-03", "Slot 5 / PON 2 / Ct.Onu 3", "00:25:96:FF:11:88", "P4-TEL-01", "PENDIENTE", "INBOX"),
        ("INC-60241", "cuadrilla.altamira@inter.com.ve", "Verificación estado óptico ONT nueva", "Instalación completada, confirmar sincronismo en OLT.", "Soporte", "1077281903", "ZTEG99112233", "OLT-ALTA-01", "Slot 2 / PON 6 / Ct.Onu 14", "18:66:DA:55:20:11", "P1-SOP-01", "PENDIENTE", "INBOX"),
        ("INC-60242", "cuadrilla.valencia@inter.com.ve", "Migración Plan 500M con IP fija", "Configurar router en modo bridge y aprovisionar pool IP.", "Soporte", "3098112001", "FHTT9900AABB", "OLT-VAL-01", "Slot 1 / PON 3 / Ct.Onu 9", "70:85:C2:A1:00:FF", "P4-SOP-01", "EN ESPERA", "INBOX")
    ]
    
    for code, sender, subj, body, area, sub, serial, node, slot, mac, task_code, status, folder in tickets_seed:
        t_id = tasks_by_code.get(task_code, {}).get("id", 1)
        cur.execute("""
        INSERT OR IGNORE INTO email_tickets (
            ticket_code, sender_email, subject, full_body, area,
            subscriber_code, serial_pon, node_name, slot_pon, mac_address,
            suggested_task_type_id, status, folder
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (code, sender, subj, body, area, sub, serial, node, slot, mac, t_id, status, folder))
    
    # 4. Histórico de Tareas Resueltas (task_logs) para totalizar ~145 pts
    cur.execute("SELECT COUNT(*) FROM task_logs")
    count_logs = cur.fetchone()[0]
    
    if count_logs == 0:
        print("[SEED] Generando historico de produccion ponderada...")
        tech_list = [
            ("José Corobo", "Soporte", ["P1-SOP-01", "P2-SOP-01", "P2-SOP-02", "P3-SOP-01", "P4-SOP-01"], 48),
            ("Carlos Ruiz", "Soporte", ["P1-SOP-01", "P2-SOP-01", "P2-SOP-02", "P3-SOP-01"], 36),
            ("María Santos", "Cabecera", ["P3-CAB-01", "P5-CAB-01"], 35),
            ("Roberto Méndez", "Telefonía", ["P3-TEL-01", "P4-TEL-01"], 26)
        ]
        
        now = datetime.now()
        for tech_name, tech_area, allowed_tasks, target_points in tech_list:
            u = users_by_name.get(tech_name)
            if not u:
                continue
            u_id = u["id"]
            current_pts = 0
            
            while current_pts < target_points:
                t_code = random.choice(allowed_tasks)
                t_info = tasks_by_code.get(t_code)
                pts = t_info["points"]
                sla = t_info["sla_minutes"]
                
                net_dur = max(5, int(random.gauss(sla * 0.7, sla * 0.15)))
                wait_dur = random.choice([0, 0, 5, 10, 15])
                gross_dur = net_dur + wait_dur
                
                days_ago = random.randint(0, 4)
                hours_ago = random.randint(1, 8)
                created_dt = (now - timedelta(days=days_ago, hours=hours_ago)).strftime("%Y-%m-%d %H:%M:%S")
                
                sim_inc = f"INC-{random.randint(50000, 59999)}"
                
                cur.execute("""
                INSERT INTO task_logs (
                    ticket_code, user_id, task_type_id, description, points,
                    duration_minutes, wait_minutes, net_duration, area, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    sim_inc, u_id, t_info["id"], f"Resolución de incidencia técnica: {t_info['name']}",
                    pts, gross_dur, wait_dur, net_dur, tech_area, created_dt
                ))
                current_pts += pts
                
    conn.commit()
    conn.close()
    print("[SEED] Base de datos SQLite inicializada y poblada con éxito.")

if __name__ == "__main__":
    seed()
