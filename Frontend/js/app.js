/**
 * PHS.OperacionesIP - Frontend Application Logic
 * Figma Reference: Sistema de Métricas y Desarrollo (Node 8-4)
 * Header Navigation con Efecto Glow / Iluminación Dinámica
 */

(function () {
    // Estado global de la aplicación
    const state = {
        currentArea: 'Todas',
        currentRange: 'all',
        ticketFilter: 'ALL',
        isDark: true,
        chartOperators: null,
        chartCategories: null,
        allTickets: []
    };

    // Paleta de colores acorde a tokens Figma
    const THEME_COLORS = {
        dark: {
            text: '#CBD5E1',
            muted: '#64748B',
            grid: '#1E293B',
            cardBg: '#0D1527',
            blue: '#0066CC',
            cyan: '#38BDF8',
            amber: '#F59E0B',
            emerald: '#10B981',
            purple: '#818CF8'
        },
        light: {
            text: '#334155',
            muted: '#94A3B8',
            grid: '#E2E8F0',
            cardBg: '#FFFFFF',
            blue: '#0056B3',
            cyan: '#0284C7',
            amber: '#D97706',
            emerald: '#059669',
            purple: '#4F46E5'
        }
    };

    // Inicialización al cargar el DOM
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        initGlowingNavbar();
        initFilterPills();
        initActionButtons();
        initModalEvents();
        loadDashboardData();
        loadTickets();

        // Polling suave cada 30 segundos
        setInterval(() => {
            loadDashboardData(true);
            loadTickets(true);
        }, 30000);
    });

    // --------------------------------------------------------------------------
    // 1. EFECTO GLOW E INTERACCIÓN DEL NAVBAR SUPERIOR
    // --------------------------------------------------------------------------
    function initGlowingNavbar() {
        const glowItems = document.querySelectorAll('.nav-glow-item');
        
        // Seguimiento dinámico de la posición del cursor para el resplandor
        glowItems.forEach(item => {
            item.addEventListener('mousemove', (e) => {
                const rect = item.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                item.style.setProperty('--mouse-x', `${x}px`);
                item.style.setProperty('--mouse-y', `${y}px`);
            });
        });

        // Navegación por células técnicas
        const cellButtons = document.querySelectorAll('[data-cell]');
        cellButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetArea = btn.getAttribute('data-cell');
                state.currentArea = targetArea;

                // Sincronizar estado visual de los botones activos
                cellButtons.forEach(b => {
                    if (b.getAttribute('data-cell') === targetArea) {
                        b.classList.add('active');
                    } else {
                        b.classList.remove('active');
                    }
                });

                // Actualizar títulos de vista
                const title = document.getElementById('view-title');
                const subtitle = document.getElementById('view-subtitle');
                if (targetArea === 'Todas') {
                    title.textContent = 'Dashboard General de Operaciones IP';
                    subtitle.textContent = 'Consola Unificada de Productividad Ponderada, SLAs y Cola Activa FTTH';
                } else {
                    title.textContent = `Célula de ${targetArea} • Operaciones IP`;
                    subtitle.textContent = `Monitoreo especializado de productividad y resolución para ${targetArea}`;
                }

                // Cerrar drawer móvil si estaba abierto
                const drawer = document.getElementById('mobile-drawer');
                if (drawer) drawer.classList.remove('show');

                loadDashboardData();
                loadTickets();
                showToast(`Filtrado por: ${targetArea}`, 'info');
            });
        });

        // Botones para scroll a la cola activa
        const queueBtns = [document.getElementById('nav-btn-queue'), document.getElementById('mobile-nav-btn-queue')];
        queueBtns.forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => {
                    const drawer = document.getElementById('mobile-drawer');
                    if (drawer) drawer.classList.remove('show');
                    document.getElementById('section-queue').scrollIntoView({ behavior: 'smooth' });
                });
            }
        });

        // Menú Hamburguesa Móvil
        const mobileToggle = document.getElementById('btn-mobile-toggle');
        const mobileDrawer = document.getElementById('mobile-drawer');
        if (mobileToggle && mobileDrawer) {
            mobileToggle.addEventListener('click', () => {
                mobileDrawer.classList.toggle('show');
            });
        }
    }

    // --------------------------------------------------------------------------
    // 2. CARGA DE MÉTRICAS Y DATOS DEL DASHBOARD
    // --------------------------------------------------------------------------
    async function loadDashboardData(silent = false) {
        try {
            const url = `/api/metrics?area=${encodeURIComponent(state.currentArea)}&range=${encodeURIComponent(state.currentRange)}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Error al consultar métricas');
            
            const result = await response.json();
            if (result.status !== 'ok') throw new Error(result.message || 'Error en respuesta');

            renderKPIs(result.data);
            renderCharts(result.data);
        } catch (error) {
            console.error('[METRICS_ERROR]', error);
            if (!silent) showToast('Error al actualizar métricas: ' + error.message, 'error');
        }
    }

    function renderKPIs(data) {
        const kpis = data.kpis || {};
        const queue = data.queue_counts || {};

        // 1. Hero KPI: Puntos de Producción
        const totalPts = kpis.total_points || 0;
        document.getElementById('kpi-hero-points').textContent = `${totalPts} pts`;
        
        // Meta objetivo de referencia: 150 puntos
        const targetPts = 150;
        const progressPct = Math.min(100, Math.round((totalPts / targetPts) * 100));
        document.getElementById('kpi-progress-text').textContent = `${progressPct}% de la meta (${targetPts} pts)`;
        document.getElementById('kpi-progress-bar').style.width = `${progressPct}%`;

        // 2. Tickets en Cola
        const totalQueue = queue.total || 0;
        document.getElementById('kpi-queue-count').textContent = totalQueue;
        document.getElementById('kpi-pending-count').textContent = queue.pending || 0;
        document.getElementById('kpi-progress-count').textContent = queue.in_progress || 0;
        
        const badgeCount = document.getElementById('badge-queue-count');
        if (badgeCount) badgeCount.textContent = totalQueue;

        // 3. MTTR Promedio Neto
        const mttr = kpis.avg_mttr || 0;
        document.getElementById('kpi-avg-mttr').textContent = `${mttr} min`;
        const mttrPill = document.getElementById('kpi-mttr-pill');
        if (mttr <= 30) {
            mttrPill.textContent = 'Óptimo';
            mttrPill.className = 'kpi-trend-pill positive';
        } else if (mttr <= 45) {
            mttrPill.textContent = 'Moderado';
            mttrPill.className = 'kpi-trend-pill warning';
        } else {
            mttrPill.textContent = 'Alerta';
            mttrPill.className = 'kpi-trend-pill negative';
        }

        // 4. Cumplimiento SLA
        const sla = kpis.sla_compliance || 100;
        const slaElem = document.getElementById('kpi-sla-compliance');
        slaElem.textContent = `${sla}%`;
        const slaPill = document.getElementById('kpi-sla-pill');
        if (sla >= 90) {
            slaElem.style.color = 'var(--dash-emerald)';
            slaPill.textContent = 'En Rango';
            slaPill.className = 'kpi-trend-pill positive';
        } else {
            slaElem.style.color = 'var(--dash-amber)';
            slaPill.textContent = 'Bajo Meta';
            slaPill.className = 'kpi-trend-pill warning';
        }

        // Contador total de tareas
        const totalTasks = kpis.total_tasks || 0;
        const badgeTasks = document.getElementById('badge-total-tasks');
        if (badgeTasks) badgeTasks.textContent = `${totalTasks} tareas resueltas`;
    }

    // --------------------------------------------------------------------------
    // 3. RENDERIZADO DE GRÁFICAS (CHART.JS)
    // --------------------------------------------------------------------------
    function renderCharts(data) {
        const theme = state.isDark ? THEME_COLORS.dark : THEME_COLORS.light;
        const techRankings = data.tech_rankings || [];
        const categories = data.category_distribution || [];

        // --- Gráfica 1: Carga Actual por Especialista (Barras Horizontales) ---
        const opCanvas = document.getElementById('chart-operators');
        if (opCanvas) {
            const labels = techRankings.map(t => t.name);
            const pointsData = techRankings.map(t => t.total_points);
            const ctx1 = opCanvas.getContext('2d');
            
            if (state.chartOperators) {
                state.chartOperators.destroy();
            }

            state.chartOperators = new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Puntos Acumulados',
                        data: pointsData,
                        backgroundColor: (ctx) => {
                            const colors = ['#0066CC', '#0284C7', '#F59E0B', '#818CF8', '#10B981'];
                            return colors[ctx.dataIndex % colors.length];
                        },
                        borderRadius: 6,
                        barThickness: 18
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (item) => ` ${item.raw} pts de producción`
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: theme.grid, drawBorder: false },
                            ticks: { color: theme.muted, font: { size: 10 } }
                        },
                        y: {
                            grid: { display: false, drawBorder: false },
                            ticks: { color: theme.text, font: { size: 11, weight: '600' } }
                        }
                    }
                }
            });
        }

        // --- Gráfica 2: Incidencias por Categoría (Doughnut) ---
        const catCanvas = document.getElementById('chart-categories');
        if (catCanvas) {
            const ctx2 = catCanvas.getContext('2d');
            const catLabels = categories.map(c => c.category_name.length > 22 ? c.category_name.slice(0, 20) + '...' : c.category_name);
            const catCounts = categories.map(c => c.count);

            if (state.chartCategories) {
                state.chartCategories.destroy();
            }

            const doughnutColors = ['#0066CC', '#0284C7', '#F59E0B', '#10B981', '#818CF8', '#EC4899'];

            state.chartCategories = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: catLabels.length ? catLabels : ['Modo Bridge', 'Demonio OLT', 'Discrepancia MAC', 'Telefonía SIP'],
                    datasets: [{
                        data: catCounts.length ? catCounts : [12, 8, 15, 6],
                        backgroundColor: doughnutColors,
                        borderWidth: 2,
                        borderColor: theme.cardBg
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                boxWidth: 10,
                                padding: 10,
                                color: theme.text,
                                font: { size: 10 }
                            }
                        }
                    }
                }
            });
        }
    }

    // --------------------------------------------------------------------------
    // 4. COLA DE TRABAJO ACTIVA (LA TRINCHERA) Y MODAL DE DETALLES
    // --------------------------------------------------------------------------
    let currentModalTicket = null;

    async function loadTickets(silent = false) {
        try {
            const url = `/api/tickets?area=${encodeURIComponent(state.currentArea)}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Error al cargar tickets');
            
            const result = await response.json();
            state.allTickets = result.tickets || [];
            renderTicketsTable();
        } catch (error) {
            console.error('[TICKETS_ERROR]', error);
            if (!silent) showToast('Error al consultar cola de tickets', 'error');
        }
    }

    function renderTicketsTable() {
        const tbody = document.getElementById('table-body');
        if (!tbody) return;

        let tickets = state.allTickets;
        if (state.ticketFilter === 'PENDING') {
            tickets = tickets.filter(t => t.status === 'PENDIENTE');
        }

        if (tickets.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 2.5rem; color: var(--dash-text-muted);">
                        No hay incidencias en la cola con los filtros seleccionados.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = tickets.map((t, idx) => {
            const statusClass = (t.status || 'PENDIENTE').toLowerCase().replace(' ', '');
            const badgeClass = statusClass === 'pendiente' ? 'pendiente' :
                               statusClass === 'enprogreso' ? 'progreso' :
                               statusClass === 'completado' ? 'completado' : 'espera';

            // Colores por celula técnica
            let areaBg = 'rgba(56, 189, 248, 0.15)';
            let areaColor = '#38BDF8';
            let areaBorder = 'rgba(56, 189, 248, 0.3)';
            if (t.area === 'Cabecera') {
                areaBg = 'rgba(245, 158, 11, 0.15)';
                areaColor = '#F59E0B';
                areaBorder = 'rgba(245, 158, 11, 0.3)';
            } else if (t.area === 'Telefonía') {
                areaBg = 'rgba(129, 140, 248, 0.15)';
                areaColor = '#818CF8';
                areaBorder = 'rgba(129, 140, 248, 0.3)';
            }

            return `
                <tr class="ticket-row" data-ticket-index="${idx}">
                    <!-- Columna 1: Ticket de Referencia -->
                    <td style="font-family: 'JetBrains Mono', monospace; font-weight: 800; color: var(--dash-blue); font-size: 0.85rem;">
                        ${t.ticket_code}
                    </td>

                    <!-- Columna 2: Categoría de la Tarea y Área Asignada -->
                    <td>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem;">
                            <span class="brand-badge" style="background: ${areaBg}; color: ${areaColor}; border-color: ${areaBorder}; font-size: 0.65rem;">
                                ${t.area}
                            </span>
                            <span style="font-weight: 700; color: var(--dash-text-title); font-size: 0.8rem;">
                                ${t.task_name || 'Operación Estándar'}
                            </span>
                        </div>
                        <div style="font-size: 0.675rem; color: var(--dash-text-muted);">
                            Código: <strong style="font-family: 'JetBrains Mono', monospace;">${t.task_code || 'P2'}</strong> &bull; ${t.points || 2} pts &bull; SLA: ${t.sla_minutes || 45}m
                        </div>
                    </td>

                    <!-- Columna 3: Descripción Breve -->
                    <td>
                        <div style="font-weight: 600; color: var(--dash-text-body); font-size: 0.8rem; margin-bottom: 0.2rem; max-width: 520px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${t.subject || ''}">
                            ${t.subject || t.full_body || 'Sin descripción'}
                        </div>
                        <div style="font-size: 0.675rem; color: var(--dash-text-muted); display: flex; gap: 0.75rem;">
                            <span>Abonado: <strong style="font-family: 'JetBrains Mono', monospace;">${t.subscriber_code || 'N/A'}</strong></span>
                            <span>Nodo: <strong>${t.node_name || 'N/A'}</strong></span>
                            <span>Serial: <strong style="font-family: 'JetBrains Mono', monospace;">${t.serial_pon || 'N/A'}</strong></span>
                        </div>
                    </td>

                    <!-- Columna 4: Estado -->
                    <td style="text-align: center;">
                        <span class="badge-status ${badgeClass}">
                            ${t.status}
                        </span>
                    </td>

                    <!-- Columna 5: Acción -->
                    <td style="text-align: center;">
                        <button class="btn-action-secondary" style="padding: 0.3rem 0.65rem; font-size: 0.675rem; border-radius: 6px;" title="Ver ficha técnica completa">
                            Ver Detalle ↗
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Agregar evento de click a todas las filas para abrir el modal
        const rows = tbody.querySelectorAll('.ticket-row');
        rows.forEach(row => {
            row.addEventListener('click', () => {
                const idx = parseInt(row.getAttribute('data-ticket-index'), 10);
                if (!isNaN(idx) && tickets[idx]) {
                    openTicketModal(tickets[idx]);
                }
            });
        });
    }

    // --------------------------------------------------------------------------
    // 5. CONTROL DEL MODAL DE DETALLES DEL TICKET
    // --------------------------------------------------------------------------
    function openTicketModal(ticket) {
        currentModalTicket = ticket;
        const overlay = document.getElementById('ticket-modal-overlay');
        if (!overlay) return;

        // 1. Cabecera
        document.getElementById('modal-ticket-code').textContent = ticket.ticket_code;
        const badge = document.getElementById('modal-ticket-status-badge');
        badge.textContent = ticket.status;
        const statusClass = (ticket.status || 'PENDIENTE').toLowerCase().replace(' ', '');
        badge.className = `badge-status ${statusClass === 'pendiente' ? 'pendiente' : statusClass === 'enprogreso' ? 'progreso' : statusClass === 'completado' ? 'completado' : 'espera'}`;
        
        document.getElementById('modal-ticket-area').textContent = `Célula de ${ticket.area}`;

        // 2. Descripción General
        document.getElementById('modal-ticket-subject').textContent = ticket.subject || 'Sin Asunto';
        document.getElementById('modal-ticket-sender').textContent = ticket.sender_email || 'cuadrilla@inter.com.ve';
        document.getElementById('modal-ticket-date').textContent = ticket.created_at || 'Fecha no registrada';
        document.getElementById('modal-ticket-sla').textContent = `${ticket.sla_minutes || 45} minutos`;
        document.getElementById('modal-ticket-points').textContent = `${ticket.points || 2} pts de producción`;

        // 3. Parámetros Técnicos Telco Extraídos
        const sub = ticket.subscriber_code || 'N/A';
        const perm = (sub !== 'N/A' && sub.length >= 2) ? `(Permisor ${sub.slice(0, 2)})` : '';
        document.getElementById('modal-param-sub').textContent = `${sub} ${perm}`;

        let vendor = '';
        if (ticket.serial_pon) {
            if (ticket.serial_pon.startsWith('FHTT')) vendor = ' [FiberHome / Inter]';
            else if (ticket.serial_pon.startsWith('HWTC')) vendor = ' [Huawei / Netuno]';
            else if (ticket.serial_pon.startsWith('ZTEG')) vendor = ' [ZTE]';
        }
        document.getElementById('modal-param-serial').textContent = `${ticket.serial_pon || 'N/A'}${vendor}`;
        document.getElementById('modal-param-node').textContent = ticket.node_name || 'N/A';
        document.getElementById('modal-param-slot').textContent = ticket.slot_pon || 'Consultar OLT vía Serial';
        document.getElementById('modal-param-mac').textContent = ticket.mac_address || 'No provista';
        document.getElementById('modal-param-task').textContent = `${ticket.task_code || 'P2'} • ${ticket.task_name || 'Operación Estándar'}`;

        // 4. Reporte Completo
        document.getElementById('modal-ticket-body').textContent = ticket.full_body || 'Sin cuerpo de mensaje disponible.';

        // Mostrar overlay con animación
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeTicketModal() {
        const overlay = document.getElementById('ticket-modal-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // Inicializar eventos del modal (cerrar, copiar, cambiar estado)
    function initModalEvents() {
        const overlay = document.getElementById('ticket-modal-overlay');
        const closeBtn = document.getElementById('modal-close-btn');
        const footerClose = document.getElementById('modal-footer-close');
        const copyBtn = document.getElementById('btn-modal-copy');

        if (closeBtn) closeBtn.addEventListener('click', closeTicketModal);
        if (footerClose) footerClose.addEventListener('click', closeTicketModal);

        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeTicketModal();
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeTicketModal();
        });

        // Botón copiar parámetros técnicos
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                if (!currentModalTicket) return;
                const t = currentModalTicket;
                const text = `TICKET: ${t.ticket_code}
CÉLULA: ${t.area}
ABONADO: ${t.subscriber_code || 'N/A'}
SERIAL PON: ${t.serial_pon || 'N/A'}
NODO OLT: ${t.node_name || 'N/A'}
UBICACIÓN FSM: ${t.slot_pon || 'N/A'}
DIRECCIÓN MAC: ${t.mac_address || 'N/A'}
TAREA: ${t.task_code} - ${t.task_name} (${t.points} pts)`;

                navigator.clipboard.writeText(text).then(() => {
                    showToast('📋 Parámetros técnicos copiados al portapapeles', 'success');
                }).catch(() => {
                    showToast('Error copiando al portapapeles', 'warning');
                });
            });
        }

        // Botones de cambio de estado en el modal
        const statusBtns = document.querySelectorAll('[data-new-status]');
        statusBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!currentModalTicket) return;
                const newStatus = btn.getAttribute('data-new-status');
                
                btn.disabled = true;
                btn.style.opacity = '0.6';
                try {
                    const res = await fetch(`/api/tickets/${currentModalTicket.id}/status`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                    });
                    const data = await res.json();
                    if (data.status === 'ok') {
                        showToast(`Estado de ${currentModalTicket.ticket_code} cambiado a: ${newStatus}`, 'success');
                        currentModalTicket.status = newStatus;
                        
                        // Actualizar badge del modal
                        const badge = document.getElementById('modal-ticket-status-badge');
                        badge.textContent = newStatus;
                        const sClass = newStatus.toLowerCase().replace(' ', '');
                        badge.className = `badge-status ${sClass === 'pendiente' ? 'pendiente' : sClass === 'enprogreso' ? 'progreso' : sClass === 'completado' ? 'completado' : 'espera'}`;

                        // Refrescar datos globales y tabla
                        await loadDashboardData(true);
                        await loadTickets(true);
                    } else {
                        showToast(data.message || 'Error cambiando estado', 'error');
                    }
                } catch (e) {
                    showToast('Error de conexión al actualizar estado', 'error');
                } finally {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                }
            });
        });
    }

    // --------------------------------------------------------------------------
    // 6. FILTROS Y ACCIONES
    // --------------------------------------------------------------------------
    function initFilterPills() {
        // Filtros temporales
        const rangePills = document.querySelectorAll('[data-range]');
        rangePills.forEach(pill => {
            pill.addEventListener('click', () => {
                rangePills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                state.currentRange = pill.getAttribute('data-range');
                loadDashboardData();
            });
        });

        // Filtros de tabla
        const btnAll = document.getElementById('filter-tickets-all');
        const btnPending = document.getElementById('filter-tickets-pending');
        if (btnAll && btnPending) {
            btnAll.addEventListener('click', () => {
                btnAll.classList.add('active');
                btnPending.classList.remove('active');
                state.ticketFilter = 'ALL';
                renderTicketsTable();
            });
            btnPending.addEventListener('click', () => {
                btnPending.classList.add('active');
                btnAll.classList.remove('active');
                state.ticketFilter = 'PENDING';
                renderTicketsTable();
            });
        }
    }

    function initActionButtons() {
        // Simular Incidencia
        const btnSimulate = document.getElementById('btn-simulate-ticket');
        if (btnSimulate) {
            btnSimulate.addEventListener('click', async () => {
                btnSimulate.disabled = true;
                btnSimulate.style.opacity = '0.6';
                try {
                    const res = await fetch(`/api/tickets/simulate?area=${encodeURIComponent(state.currentArea)}`, {
                        method: 'POST'
                    });
                    const data = await res.json();
                    if (data.status === 'ok') {
                        showToast(`⚡ Caso generado: ${data.ticket || 'Nuevo ticket'}`, 'success');
                        await loadDashboardData(true);
                        await loadTickets(true);
                    } else {
                        showToast('Aviso: ' + (data.message || 'Error al simular'), 'warning');
                    }
                } catch (e) {
                    showToast('Error simulando caso: ' + e.message, 'error');
                } finally {
                    btnSimulate.disabled = false;
                    btnSimulate.style.opacity = '1';
                }
            });
        }

        // Exportar Excel
        const btnExcel = document.getElementById('btn-export-excel');
        if (btnExcel) {
            btnExcel.addEventListener('click', () => {
                showToast('Generando libro Excel corporativo...', 'info');
                const downloadUrl = `/api/reports/excel?area=${encodeURIComponent(state.currentArea)}&range=${encodeURIComponent(state.currentRange)}`;
                window.location.href = downloadUrl;
            });
        }

        // Alternar Modo Oscuro / Claro
        const themeBtn = document.getElementById('btn-theme-toggle');
        const themeIcon = document.getElementById('theme-icon');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                state.isDark = !state.isDark;
                if (state.isDark) {
                    document.body.classList.add('dark');
                    themeIcon.textContent = '🌙';
                    localStorage.setItem('noc_theme', 'dark');
                } else {
                    document.body.classList.remove('dark');
                    themeIcon.textContent = '☀️';
                    localStorage.setItem('noc_theme', 'light');
                }
                loadDashboardData(true);
            });
        }
    }

    function initTheme() {
        const saved = localStorage.getItem('noc_theme');
        const themeIcon = document.getElementById('theme-icon');
        if (saved === 'light') {
            state.isDark = false;
            document.body.classList.remove('dark');
            if (themeIcon) themeIcon.textContent = '☀️';
        } else {
            state.isDark = true;
            document.body.classList.add('dark');
            if (themeIcon) themeIcon.textContent = '🌙';
        }
    }

    // --------------------------------------------------------------------------
    // 6. UTILIDAD TOAST NOTIFICATIONS
    // --------------------------------------------------------------------------
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast-card';
        
        let icon = 'ℹ️';
        let borderColor = '#38BDF8';
        if (type === 'success') { icon = '✅'; borderColor = '#10B981'; }
        if (type === 'warning') { icon = '⚠️'; borderColor = '#F59E0B'; }
        if (type === 'error') { icon = '❌'; borderColor = '#EF4444'; }

        toast.style.borderLeft = `4px solid ${borderColor}`;
        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

})();
