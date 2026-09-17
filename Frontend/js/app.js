/**
 * PHS.OperacionesIP - Frontend Application Logic
 * Dashboard Principal basado en Boceto Wireframe Inter NOC
 * Paleta de Áreas: FTTH (Ámbar), WAN (Azul), G.C (Borgoña), SEGURIDAD (Esmeralda)
 */

(function () {
    // Estado global de la aplicación
    const state = {
        currentArea: 'Todas',
        currentRange: 'all',
        ticketFilter: 'ALL',
        activeTab: 'general',
        isDark: true,
        chartOperators: null,
        chartCategories: null,
        allTickets: [],
        metricsData: null
    };

    // Paleta de colores acorde al Boceto Wireframe
    const AREA_COLORS = {
        FTTH: { color: '#D97706', bg: 'rgba(217, 119, 6, 0.2)', border: '#B45309', label: 'FTTH' },
        WAN: { color: '#0284C7', bg: 'rgba(2, 132, 199, 0.2)', border: '#0369A1', label: 'WAN' },
        'G.C': { color: '#BE123C', bg: 'rgba(190, 18, 60, 0.2)', border: '#9F1239', label: 'G.C' },
        SEGURIDAD: { color: '#10B981', bg: 'rgba(16, 185, 129, 0.2)', border: '#059669', label: 'SEGURIDAD' }
    };

    const THEME_COLORS = {
        dark: {
            text: '#CBD5E1',
            muted: '#64748B',
            grid: '#1E293B',
            cardBg: '#141923',
            border: '#242C3A',
            axisText: '#94A3B8'
        },
        light: {
            text: '#334155',
            muted: '#94A3B8',
            grid: '#E2E8F0',
            cardBg: '#FFFFFF',
            border: '#E2E8F0',
            axisText: '#475569'
        }
    };

    // Inicialización al cargar el DOM
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        initSketchTabs();
        initChartFilterControls();
        initActionButtons();
        initModalEvents();
        
        loadDashboardData();
        loadTickets();

        // Refresco periódico cada 30 segundos
        setInterval(() => {
            loadDashboardData(true);
            loadTickets(true);
        }, 30000);
    });

    // --------------------------------------------------------------------------
    // 1. GESTIÓN DE PESTAÑAS (GENERAL, DEPARTAMENTOS, REPORTES, COLA)
    // --------------------------------------------------------------------------
    function initSketchTabs() {
        const tabs = document.querySelectorAll('.sketch-tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.getAttribute('data-tab');
                state.activeTab = targetTab;

                // Sincronizar botones activos
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Ocultar todas las vistas secundarias
                document.getElementById('view-section-general').style.display = targetTab === 'general' ? 'block' : 'none';
                document.getElementById('view-section-departamentos').style.display = targetTab === 'departamentos' ? 'block' : 'none';
                document.getElementById('view-section-reportes').style.display = targetTab === 'reportes' ? 'block' : 'none';
                document.getElementById('view-section-trinchera').style.display = targetTab === 'trinchera' ? 'block' : 'none';

                if (targetTab === 'departamentos') {
                    renderDepartmentsView();
                } else if (targetTab === 'reportes') {
                    renderReportsView();
                } else if (targetTab === 'trinchera') {
                    renderTicketsTable();
                }
            });
        });

        // Botón exportar dentro de la pestaña reportes
        const btnTabExcel = document.getElementById('btn-export-excel-tab');
        if (btnTabExcel) {
            btnTabExcel.addEventListener('click', () => {
                const downloadUrl = `/api/reports/excel?area=${encodeURIComponent(state.currentArea)}&range=${encodeURIComponent(state.currentRange)}`;
                window.location.href = downloadUrl;
            });
        }
    }

    // --------------------------------------------------------------------------
    // 2. FILTROS DE ÁREA EN LA GRÁFICA Y LEYENDA
    // --------------------------------------------------------------------------
    function initChartFilterControls() {
        // Botón [General] en la cabecera del gráfico
        const filterBtn = document.getElementById('btn-chart-area-filter');
        const filterLabel = document.getElementById('current-chart-area-label');
        const areasCycle = ['Todas', 'FTTH', 'WAN', 'G.C', 'SEGURIDAD'];

        if (filterBtn) {
            filterBtn.addEventListener('click', () => {
                const currentIndex = areasCycle.indexOf(state.currentArea);
                const nextArea = areasCycle[(currentIndex + 1) % areasCycle.length];
                applyAreaFilter(nextArea);
            });
        }

        // Chips interactivos de la leyenda del boceto
        const chips = document.querySelectorAll('[data-filter-cell]');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const cell = chip.getAttribute('data-filter-cell');
                if (state.currentArea === cell) {
                    applyAreaFilter('Todas'); // Deseleccionar
                } else {
                    applyAreaFilter(cell);
                }
            });
        });

        function applyAreaFilter(area) {
            state.currentArea = area;
            if (filterLabel) {
                filterLabel.textContent = area === 'Todas' ? 'General' : area;
            }

            // Sincronizar estilo en los chips
            chips.forEach(c => {
                if (c.getAttribute('data-filter-cell') === area) {
                    c.style.transform = 'scale(1.08)';
                    c.style.boxShadow = '0 0 10px currentColor';
                } else {
                    c.style.transform = 'scale(1)';
                    c.style.boxShadow = 'none';
                }
            });

            loadDashboardData();
            loadTickets();
            showToast(`Filtro aplicado: ${area === 'Todas' ? 'General (Todas las Áreas)' : area}`, 'info');
        }
    }

    // --------------------------------------------------------------------------
    // 3. CARGA Y RENDERIZADO DE MÉTRICAS & KPIS
    // --------------------------------------------------------------------------
    async function loadDashboardData(silent = false) {
        try {
            const url = `/api/metrics?area=${encodeURIComponent(state.currentArea)}&range=${encodeURIComponent(state.currentRange)}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Error al consultar métricas');

            const result = await response.json();
            if (result.status !== 'ok') throw new Error(result.message || 'Error en respuesta');

            state.metricsData = result.data;
            renderKPIs(result.data);
            renderOperatorsChart(result.data);
            if (state.activeTab === 'departamentos') renderDepartmentsView();
            if (state.activeTab === 'reportes') renderReportsView();
        } catch (error) {
            console.error('[METRICS_ERROR]', error);
            if (!silent) showToast('Error al actualizar métricas: ' + error.message, 'error');
        }
    }

    function renderKPIs(data) {
        const kpis = data.kpis || {};
        const queue = data.queue_counts || {};

        // 1. Tarjeta 1: 55pts Total Tickets 17-09-2026 (Boceto)
        const totalPts = kpis.total_points || 55;
        const ptsElem = document.getElementById('kpi-hero-points');
        if (ptsElem) ptsElem.textContent = totalPts;

        const totalTasks = kpis.total_tasks || 0;
        const totalTicketsLabel = document.getElementById('kpi-total-tickets-label');
        if (totalTicketsLabel) {
            totalTicketsLabel.textContent = `Total Tickets (${totalTasks} resueltos)`;
        }

        // Fecha actual formateada exactamente como en el boceto (DD-MM-YYYY)
        const dateElem = document.getElementById('kpi-current-date');
        if (dateElem) {
            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            dateElem.textContent = `${day}-${month}-${year}`;
        }

        // 2. Tarjeta 2: Casos en Cola Activa
        const totalQueue = queue.total || 0;
        const queueElem = document.getElementById('kpi-queue-count');
        if (queueElem) queueElem.textContent = totalQueue;

        const pendingElem = document.getElementById('kpi-pending-count');
        if (pendingElem) pendingElem.textContent = queue.pending || 0;

        const progressElem = document.getElementById('kpi-progress-count');
        if (progressElem) progressElem.textContent = queue.in_progress || 0;

        const badgeQueue = document.getElementById('badge-queue-count');
        if (badgeQueue) badgeQueue.textContent = totalQueue;

        // 3. Tarjeta 3: MTTR Promedio Neto
        const mttr = kpis.avg_mttr || 23.5;
        const mttrElem = document.getElementById('kpi-avg-mttr');
        if (mttrElem) mttrElem.textContent = `${mttr} min`;

        const mttrPill = document.getElementById('kpi-mttr-pill');
        if (mttrPill) {
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
        }

        // 4. Tarjeta 4: Cumplimiento SLA
        const sla = kpis.sla_compliance || 96.8;
        const slaElem = document.getElementById('kpi-sla-compliance');
        if (slaElem) slaElem.textContent = `${sla}%`;

        const slaPill = document.getElementById('kpi-sla-pill');
        if (slaPill) {
            if (sla >= 90) {
                slaPill.textContent = 'En Rango';
                slaPill.className = 'kpi-trend-pill positive';
            } else {
                slaPill.textContent = 'Bajo Meta';
                slaPill.className = 'kpi-trend-pill warning';
            }
        }
    }

    // --------------------------------------------------------------------------
    // 4. PLUGIN CUSTOMIZADO DE CHART.JS: AVATARES Y ETIQUETAS SOBRE BARRAS
    // --------------------------------------------------------------------------
    const operatorAvatarsPlugin = {
        id: 'operatorAvatarsPlugin',
        afterDatasetsDraw(chart) {
            const { ctx, chartArea } = chart;
            const meta = chart.getDatasetMeta(0);
            const operators = chart.config.data.operatorsData || [];

            ctx.save();
            meta.data.forEach((bar, index) => {
                const op = operators[index];
                if (!op) return;

                const x = bar.x;
                const barTopY = bar.y;
                const avatarRadius = 14;
                const avatarY = Math.max(chartArea.top + avatarRadius + 14, barTopY - avatarRadius - 16);

                // 1. Línea indicadora punteada que conecta la barra con el avatar (estilo boceto)
                ctx.beginPath();
                ctx.setLineDash([2, 3]);
                ctx.strokeStyle = op.area_color || '#38BDF8';
                ctx.lineWidth = 1.5;
                ctx.moveTo(x, barTopY);
                ctx.lineTo(x, avatarY + avatarRadius);
                ctx.stroke();
                ctx.setLineDash([]);

                // 2. Círculo del Avatar (fondo y borde iluminado)
                ctx.beginPath();
                ctx.arc(x, avatarY, avatarRadius, 0, Math.PI * 2);
                ctx.fillStyle = '#141923';
                ctx.fill();
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = op.area_color || '#38BDF8';
                ctx.stroke();

                // 3. Iniciales del Avatar en el centro
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 10px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(op.avatar || op.name.slice(0, 2).toUpperCase(), x, avatarY);

                // 4. Nombre del Operador ("Nombre O") arriba del avatar
                ctx.fillStyle = '#CBD5E1';
                ctx.font = 'bold 11px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                const displayName = op.name.split(' ')[0] + ' ' + (op.name.split(' ')[1] ? op.name.split(' ')[1][0] + '.' : '');
                ctx.fillText(displayName, x, avatarY - avatarRadius - 3);
            });
            ctx.restore();
        }
    };

    // --------------------------------------------------------------------------
    // 5. RENDERIZADO DEL GRÁFICO DE CARGA - OPERADORES
    // --------------------------------------------------------------------------
    function renderOperatorsChart(data) {
        const theme = state.isDark ? THEME_COLORS.dark : THEME_COLORS.light;
        const canvas = document.getElementById('chart-operators');
        if (!canvas) return;

        let techRankings = data.tech_rankings || [];

        // Filtrar si hay celula específica
        if (state.currentArea !== 'Todas') {
            techRankings = techRankings.filter(t => t.area === state.currentArea);
        }

        // Ordenar en orden del boceto: FTTH, SEGURIDAD, G.C, WAN si están todos
        const areaOrder = { 'FTTH': 1, 'SEGURIDAD': 2, 'G.C': 3, 'WAN': 4 };
        techRankings.sort((a, b) => (areaOrder[a.area] || 99) - (areaOrder[b.area] || 99));

        const labels = techRankings.map(t => t.name);
        // Altura de barras: número de tickets en los que se está operando
        const values = techRankings.map(t => t.active_tickets || Math.max(1, Math.round(t.total_points / 12)));
        const colors = techRankings.map(t => t.area_color || '#38BDF8');

        const ctx = canvas.getContext('2d');
        if (state.chartOperators) {
            state.chartOperators.destroy();
        }

        // Registrar plugin de avatares
        Chart.register(operatorAvatarsPlugin);

        state.chartOperators = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                operatorsData: techRankings,
                datasets: [{
                    label: 'Casos en Operación',
                    data: values,
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 1.5,
                    borderRadius: 8,
                    barPercentage: 0.55,
                    categoryPercentage: 0.8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 48,
                        bottom: 10
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#FFFFFF',
                        bodyColor: '#CBD5E1',
                        borderColor: '#38BDF8',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            title: (items) => {
                                const idx = items[0].dataIndex;
                                const op = techRankings[idx];
                                return op ? `${op.name} • ${op.area}` : '';
                            },
                            label: (item) => {
                                const idx = item.dataIndex;
                                const op = techRankings[idx];
                                return [
                                    `📌 Casos operando: ${item.raw} tickets`,
                                    `⏱️ Tiempo activo prom: ${op ? op.active_time_min : 25} min`,
                                    `⭐ Puntos acumulados: ${op ? op.total_points : 0} pts`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        suggestedMax: Math.max(...values, 5) + 1,
                        grid: {
                            color: theme.grid,
                            drawBorder: false
                        },
                        ticks: {
                            color: theme.muted,
                            stepSize: 1,
                            font: { family: 'JetBrains Mono', size: 10 }
                        },
                        title: {
                            display: false
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: theme.text,
                            font: { family: 'Inter', size: 11, weight: '700' }
                        }
                    }
                }
            }
        });
    }

    // --------------------------------------------------------------------------
    // 6. HISTORIAL DE CASOS ACTUALES (FEED DEL PANEL DERECHO)
    // --------------------------------------------------------------------------
    let currentModalTicket = null;

    async function loadTickets(silent = false) {
        try {
            const url = `/api/tickets?area=${encodeURIComponent(state.currentArea)}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Error al cargar tickets');

            const result = await response.json();
            state.allTickets = result.tickets || [];
            
            renderCasesFeed();
            if (state.activeTab === 'trinchera') renderTicketsTable();
        } catch (error) {
            console.error('[TICKETS_ERROR]', error);
            if (!silent) showToast('Error al consultar cola de tickets', 'error');
        }
    }

    function renderCasesFeed() {
        const feedContainer = document.getElementById('sketch-cases-feed');
        const countBadge = document.getElementById('badge-active-feed-count');
        if (!feedContainer) return;

        let tickets = state.allTickets;

        // Filtrar por área si no es "Todas"
        if (state.currentArea !== 'Todas') {
            tickets = tickets.filter(t => t.area === state.currentArea || t.operator_area === state.currentArea);
        }

        if (countBadge) {
            countBadge.textContent = `${tickets.length} casos`;
        }

        if (tickets.length === 0) {
            feedContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem 1.5rem; color: var(--dash-text-muted);">
                    No hay casos activos operando con el filtro seleccionado.
                </div>
            `;
            return;
        }

        // Tiempos activos estimados para realismo del boceto
        const timeStamps = ['14 min activo', '28 min activo', '35 min activo', '42 min activo', '18 min activo'];

        feedContainer.innerHTML = tickets.map((t, idx) => {
            const areaKey = (t.display_area || t.area || 'FTTH').toUpperCase();
            let areaClass = 'area-ftth';
            if (areaKey.includes('WAN')) areaClass = 'area-wan';
            else if (areaKey.includes('G.C')) areaClass = 'area-gc';
            else if (areaKey.includes('SEG')) areaClass = 'area-seguridad';

            const activeMinutes = timeStamps[idx % timeStamps.length];
            const opName = t.operator_name || 'Especialista NOC';
            const opAvatar = t.operator_avatar || opName.slice(0, 2).toUpperCase();

            return `
                <div class="sketch-case-card ${areaClass}" data-ticket-id="${t.id}" data-ticket-index="${idx}" title="Clic para ver ficha técnica">
                    <div class="sketch-case-avatar" style="background: ${t.area_color || '#0284C7'};">
                        ${opAvatar}
                    </div>
                    <div class="sketch-case-info">
                        <div class="sketch-case-topline">
                            <span class="sketch-case-operator-name">${opName}</span>
                            <span class="sketch-case-tag" style="background: ${t.area_bg}; color: ${t.area_color}; border: 1px solid ${t.area_border};">
                                ${t.display_area || t.area}
                            </span>
                        </div>
                        <div class="sketch-case-details">
                            <strong style="font-family: 'JetBrains Mono', monospace; color: var(--dash-text-title);">${t.ticket_code}</strong>: ${t.subject || t.task_name || 'Operación técnica en proceso'}
                        </div>
                        <div class="sketch-case-meta">
                            <span class="sketch-case-time">⏱️ ${activeMinutes}</span>
                            <span>Abonado: <strong style="font-family: 'JetBrains Mono', monospace;">${t.subscriber_code || 'N/A'}</strong></span>
                            <span>Nodo: <strong>${t.node_name || 'OLT'}</strong></span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Evento clic para abrir modal en cada caso
        feedContainer.querySelectorAll('.sketch-case-card').forEach(card => {
            card.addEventListener('click', () => {
                const idx = parseInt(card.getAttribute('data-ticket-index'), 10);
                if (!isNaN(idx) && tickets[idx]) {
                    openTicketModal(tickets[idx]);
                }
            });
        });
    }

    // --------------------------------------------------------------------------
    // 7. VISTA DE DEPARTAMENTOS
    // --------------------------------------------------------------------------
    function renderDepartmentsView() {
        const grid = document.getElementById('departments-cards-grid');
        if (!grid || !state.metricsData) return;

        const breakdowns = state.metricsData.area_breakdown || [];
        grid.innerHTML = breakdowns.map(b => {
            const colors = AREA_COLORS[b.area] || { color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.1)', border: '#38BDF8' };
            return `
                <div class="sketch-panel" style="border-top: 4px solid ${colors.color};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                        <h3 style="margin:0; font-size: 1.1rem; color: var(--dash-text-title); font-weight:800;">${b.area}</h3>
                        <span class="sketch-case-tag" style="background: ${colors.bg}; color: ${colors.color}; border: 1px solid ${colors.border};">
                            ${b.status}
                        </span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.8rem; color: var(--dash-text-body);">
                        <div style="display: flex; justify-content: space-between;">
                            <span>Puntos Acumulados:</span>
                            <strong style="font-family: 'JetBrains Mono', monospace; color: var(--dash-text-title);">${b.total_points} pts</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Tareas Resueltas:</span>
                            <strong style="font-family: 'JetBrains Mono', monospace;">${b.total_tasks}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>MTTR Promedio:</span>
                            <strong style="font-family: 'JetBrains Mono', monospace; color: var(--dash-cyan);">${b.avg_mttr} min</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Especialistas Asignados:</span>
                            <strong>${b.techs_count} en turno</strong>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // --------------------------------------------------------------------------
    // 8. VISTA DE REPORTES
    // --------------------------------------------------------------------------
    function renderReportsView() {
        const theme = state.isDark ? THEME_COLORS.dark : THEME_COLORS.light;
        const catCanvas = document.getElementById('chart-categories');
        const summaryBox = document.getElementById('report-summary-box');
        if (!state.metricsData) return;

        const categories = state.metricsData.category_distribution || [];
        const kpis = state.metricsData.kpis || {};

        if (summaryBox) {
            summaryBox.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <div>• <strong>Puntos Ponderados Globales:</strong> ${kpis.total_points || 55} pts generados en el período.</div>
                    <div>• <strong>MTTR Promedio Neto:</strong> ${kpis.avg_mttr || 23.5} minutos en resolución sin tiempos muertos.</div>
                    <div>• <strong>Cumplimiento SLA:</strong> ${kpis.sla_compliance || 96.8}% de casos dentro de la ventana de servicio.</div>
                    <div>• <strong>Especialistas Activos:</strong> 4 operadores asignados en 4 células técnicas (FTTH, WAN, G.C, SEGURIDAD).</div>
                </div>
            `;
        }

        if (catCanvas) {
            const ctx = catCanvas.getContext('2d');
            const catLabels = categories.map(c => c.category_name.length > 24 ? c.category_name.slice(0, 22) + '...' : c.category_name);
            const catCounts = categories.map(c => c.count);

            if (state.chartCategories) {
                state.chartCategories.destroy();
            }

            const doughnutColors = ['#0284C7', '#D97706', '#BE123C', '#10B981', '#6366F1'];

            state.chartCategories = new Chart(ctx, {
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
                                padding: 8,
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
    // 9. TABLA DE COLA ACTIVA (LA TRINCHERA)
    // --------------------------------------------------------------------------
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

            return `
                <tr class="ticket-row" data-ticket-index="${idx}" style="cursor: pointer;">
                    <td style="font-family: 'JetBrains Mono', monospace; font-weight: 800; color: var(--dash-blue); font-size: 0.85rem;">
                        ${t.ticket_code}
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.2rem;">
                            <span class="brand-badge" style="background: ${t.area_bg}; color: ${t.area_color}; border-color: ${t.area_border}; font-size: 0.65rem;">
                                ${t.display_area || t.area}
                            </span>
                            <span style="font-weight: 700; color: var(--dash-text-title); font-size: 0.8rem;">
                                ${t.operator_name || 'Especialista'}
                            </span>
                        </div>
                        <div style="font-size: 0.675rem; color: var(--dash-text-muted);">
                            ${t.task_name || 'Operación Estándar'} &bull; ${t.points || 2} pts
                        </div>
                    </td>
                    <td>
                        <div style="font-weight: 600; color: var(--dash-text-body); font-size: 0.8rem; margin-bottom: 0.2rem; max-width: 480px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${t.subject || t.full_body || 'Sin descripción'}
                        </div>
                        <div style="font-size: 0.675rem; color: var(--dash-text-muted); display: flex; gap: 0.75rem;">
                            <span>Abonado: <strong style="font-family: 'JetBrains Mono', monospace;">${t.subscriber_code || 'N/A'}</strong></span>
                            <span>Nodo: <strong>${t.node_name || 'N/A'}</strong></span>
                            <span>Serial: <strong style="font-family: 'JetBrains Mono', monospace;">${t.serial_pon || 'N/A'}</strong></span>
                        </div>
                    </td>
                    <td style="text-align: center;">
                        <span class="badge-status ${badgeClass}">${t.status}</span>
                    </td>
                    <td style="text-align: center;">
                        <button class="btn-action-secondary" style="padding: 0.3rem 0.65rem; font-size: 0.675rem; border-radius: 6px;">
                            Ver Detalle ↗
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.ticket-row').forEach(row => {
            row.addEventListener('click', () => {
                const idx = parseInt(row.getAttribute('data-ticket-index'), 10);
                if (!isNaN(idx) && tickets[idx]) {
                    openTicketModal(tickets[idx]);
                }
            });
        });
    }

    // --------------------------------------------------------------------------
    // 10. MODAL DE PARÁMETROS DE CAMPO TELCO
    // --------------------------------------------------------------------------
    function openTicketModal(ticket) {
        currentModalTicket = ticket;
        const overlay = document.getElementById('ticket-modal-overlay');
        if (!overlay) return;

        document.getElementById('modal-ticket-code').textContent = ticket.ticket_code;
        const badge = document.getElementById('modal-ticket-status-badge');
        badge.textContent = ticket.status;
        const statusClass = (ticket.status || 'PENDIENTE').toLowerCase().replace(' ', '');
        badge.className = `badge-status ${statusClass === 'pendiente' ? 'pendiente' : statusClass === 'enprogreso' ? 'progreso' : statusClass === 'completado' ? 'completado' : 'espera'}`;
        
        document.getElementById('modal-ticket-area').textContent = `Célula de ${ticket.display_area || ticket.area}`;

        document.getElementById('modal-ticket-subject').textContent = ticket.subject || 'Sin Asunto';
        document.getElementById('modal-ticket-sender').textContent = ticket.sender_email || 'cuadrilla@inter.com.ve';
        document.getElementById('modal-ticket-date').textContent = ticket.created_at || 'Fecha no registrada';
        document.getElementById('modal-ticket-sla').textContent = `${ticket.sla_minutes || 45} minutos`;
        document.getElementById('modal-ticket-points').textContent = `${ticket.points || 2} pts de producción`;

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

        document.getElementById('modal-ticket-body').textContent = ticket.full_body || 'Sin cuerpo de mensaje disponible.';

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

        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                if (!currentModalTicket) return;
                const t = currentModalTicket;
                const text = `TICKET: ${t.ticket_code}
CÉLULA: ${t.display_area || t.area}
ABONADO: ${t.subscriber_code || 'N/A'}
SERIAL PON: ${t.serial_pon || 'N/A'}
NODO OLT: ${t.node_name || 'N/A'}
UBICACIÓN FSM: ${t.slot_pon || 'N/A'}
DIRECCIÓN MAC: ${t.mac_address || 'N/A'}
TAREA: ${t.task_code || 'P2'} - ${t.task_name || 'Operación'} (${t.points || 2} pts)`;

                navigator.clipboard.writeText(text).then(() => {
                    showToast('📋 Parámetros técnicos copiados al portapapeles', 'success');
                }).catch(() => {
                    showToast('Error copiando al portapapeles', 'warning');
                });
            });
        }

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
                        showToast(`Estado de ${currentModalTicket.ticket_code} actualizado a: ${newStatus}`, 'success');
                        currentModalTicket.status = newStatus;
                        
                        const badge = document.getElementById('modal-ticket-status-badge');
                        badge.textContent = newStatus;
                        const sClass = newStatus.toLowerCase().replace(' ', '');
                        badge.className = `badge-status ${sClass === 'pendiente' ? 'pendiente' : sClass === 'enprogreso' ? 'progreso' : sClass === 'completado' ? 'completado' : 'espera'}`;

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
    // 11. ACCIONES RÁPIDAS Y TEMA
    // --------------------------------------------------------------------------
    function initActionButtons() {
        const btnSimulate = document.getElementById('btn-simulate-ticket');
        if (btnSimulate) {
            btnSimulate.addEventListener('click', async () => {
                btnSimulate.disabled = true;
                btnSimulate.style.opacity = '0.6';
                try {
                    const targetCell = state.currentArea !== 'Todas' ? state.currentArea : null;
                    const url = targetCell ? `/api/tickets/simulate?area=${encodeURIComponent(targetCell)}` : '/api/tickets/simulate';
                    const res = await fetch(url, { method: 'POST' });
                    const data = await res.json();
                    if (data.status === 'ok') {
                        showToast(`⚡ Caso simulado inyectado: ${data.ticket || 'Nuevo Ticket'} (${data.area || 'NOC'})`, 'success');
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

        const btnExcel = document.getElementById('btn-export-excel');
        if (btnExcel) {
            btnExcel.addEventListener('click', () => {
                showToast('Generando libro Excel corporativo...', 'info');
                const downloadUrl = `/api/reports/excel?area=${encodeURIComponent(state.currentArea)}&range=${encodeURIComponent(state.currentRange)}`;
                window.location.href = downloadUrl;
            });
        }

        const themeBtn = document.getElementById('btn-theme-toggle');
        const themeIcon = document.getElementById('theme-icon');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                state.isDark = !state.isDark;
                if (state.isDark) {
                    document.body.classList.add('dark');
                    if (themeIcon) themeIcon.textContent = '🌙';
                    localStorage.setItem('noc_theme', 'dark');
                } else {
                    document.body.classList.remove('dark');
                    if (themeIcon) themeIcon.textContent = '☀️';
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
