// ==========================================
// 1. HELPER: FUNÇÃO CENTRAL DE FETCH (O "Motor" AJAX)
// ==========================================
window.apiFetch = async function(endpoint, options = {}) {
    const token = localStorage.getItem('sb_token');
    
    const headers = {
        'apikey': CONFIG.SUPABASE_ANON_KEY, // Lendo do config.js
        'Content-Type': 'application/json',
        'Prefer': 'return=representation' 
    };

    if (token) {
        headers['Authorization'] = `${token}`; 
    } else if (!endpoint.includes('/auth/v1/token')) {
        console.error(`🔒 Acesso negado: Tentativa de aceder a ${endpoint} sem sessão iniciada.`);
        return Promise.reject("Sessão expirada ou não autenticada");
    }

    const config = { ...options, headers: { ...headers, ...options.headers } };
    
    console.log(`A fazer pedido AJAX para: ${CONFIG.SUPABASE_URL}${endpoint}`);
    const response = await fetch(`${CONFIG.SUPABASE_URL}${endpoint}`, config); // Lendo do config.js
    
    if (response.status === 401) {
        let serverReason = "Desconocido";
        try {
            const errorData = await response.json();
            serverReason = JSON.stringify(errorData);
        } catch(e) {}

        console.error(`💥 ERROR 401 en: ${endpoint}`);
        console.error(`🔍 MOTIVO DEL SERVIDOR:`, serverReason);

        return Promise.reject("Sessão expirada"); 
    }

    if (!response.ok) {
        let errorMsg = `Erro HTTP ${response.status}`;
        try {
            const errorData = await response.json();
            errorMsg = errorData.message || errorData.error_description || errorData.hint || errorMsg;
        } catch(e) {}
        throw new Error(errorMsg);
    }

    if (response.status === 204) return null;
    
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return response.json();
    } else {
        return null; 
    }
};

// ==========================================
// 2. LÓGICA DE LOGIN VIA AJAX
// ==========================================
const loginForm = document.getElementById('login-form');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('login-error');
        const btnLogin = document.getElementById('btn-login');

        btnLogin.textContent = 'A verificar...';
        btnLogin.disabled = true;
        errorDiv.classList.add('hidden');

        try {
            const data = await apiFetch(CONFIG.ENDPOINTS.LOGIN, {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            localStorage.setItem('sb_token', data.access_token);
            localStorage.setItem('sb_user', JSON.stringify(data.user));
            
            window.location.href = 'dashboard.html';
        } catch (error) {
            console.error(error);
            errorDiv.textContent = 'Erro no login: Verifica o email e a palavra-passe.';
            errorDiv.classList.remove('hidden');
            btnLogin.textContent = 'Entrar';
            btnLogin.disabled = false;
        }
    });
}

// ==========================================
// FUNÇÕES AUXILIARES DE SESSÃO
// ==========================================
function getCurrentUser() {
    const userStr = localStorage.getItem('sb_user');
    return userStr ? JSON.parse(userStr) : null;
}

// ==========================================
// 3. LÓGICA DO DASHBOARD (dashboard.html)
// ==========================================
const ticketsBody = document.getElementById('tickets-body');

if (ticketsBody) {
    initDashboard();
}

async function initDashboard() {
    const user = getCurrentUser();

    if (!user) {
        console.error("💥 ERROR: No hay datos de usuario en el LocalStorage.");
        window.location.href = 'index.html'; 
        return;
    }

    document.getElementById('user-email-display').textContent = user.email;

    document.getElementById('btn-logout').addEventListener('click', async () => {
        try {
            await apiFetch(CONFIG.ENDPOINTS.LOGOUT, { method: 'POST' });
        } catch(e) {}
        
        localStorage.removeItem('sb_token');
        localStorage.removeItem('sb_user');
        window.location.href = 'index.html';
    });

    setupTableFilters();
    fetchTickets();
    loadTicketsDropdown();
}

// ==========================================
// CARREGAR E FILTRAR A TABELA (SÓ DO UTILIZADOR)
// ==========================================
let tableSearchTimeout = null;

async function fetchTickets() {
    const ticketsBody = document.getElementById('tickets-body');
    ticketsBody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-blue-500 flex justify-center items-center gap-2"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> A carregar dados...</td></tr>';
    lucide.createIcons();

    const user = getCurrentUser();
    if (!user) return;

    const searchTerm = document.getElementById('table_search').value.trim();
    const sortOrder = document.getElementById('table_sort').value;
    const dateInput = document.getElementById('table_date_filter');
    const dateValue = dateInput ? dateInput.value : '';

    let url = `${CONFIG.ENDPOINTS.MANAGEMENT}?user_id=eq.${user.id}&select=*`;

    if (searchTerm.length > 0) {
        url += `&or=(title.ilike.*${searchTerm}*,internal_id.ilike.*${searchTerm}*)`;
    }

    if (dateValue) {
        url += `&task_date=eq.${dateValue}`;
    }

    switch (sortOrder) {
        case 'date_desc': url += '&order=task_date.desc,created_at.desc'; break;
        case 'date_asc': url += '&order=task_date.asc'; break;
        case 'time_desc': url += '&order=work_time_hours.desc,work_time_minutes.desc'; break;
        case 'time_asc': url += '&order=work_time_hours.asc,work_time_minutes.asc'; break;
    }
    url += `&limit=${CONFIG.UI.DASHBOARD_LIMIT}`;

    try {
        const data = await apiFetch(url);
        const dailyTotalElement = document.getElementById('daily-total');

        if (!data || data.length === 0) {
            ticketsBody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">Nenhum registo encontrado.</td></tr>';
            if (dailyTotalElement) dailyTotalElement.classList.add('hidden');
            return;
        }

        const datas = data.map(t => t.task_date);
        const dataMaisRecente = datas.sort((a, b) => b.localeCompare(a))[0];
        const registosDoDia = data.filter(t => t.task_date === dataMaisRecente);

        let totalHoras = 0; let totalMinutos = 0;
        registosDoDia.forEach(t => {
            totalHoras += t.work_time_hours || 0;
            totalMinutos += t.work_time_minutes || 0;
        });

        totalHoras += Math.floor(totalMinutos / 60);
        totalMinutos = totalMinutos % 60;

        if (dailyTotalElement) {
            const [ano, mes, dia] = dataMaisRecente.split('-');
            dailyTotalElement.innerHTML = `Total de ${dia}/${mes}: <span class="font-bold ml-1">${totalHoras}h ${totalMinutos}m</span>`;
            dailyTotalElement.classList.remove('hidden');
        }

        ticketsBody.innerHTML = ''; 
        data.forEach(ticket => {
            const horas = ticket.work_time_hours || 0;
            const minutos = ticket.work_time_minutes || 0;
            const tempoFormatado = `${horas}h ${minutos}m`;
            
            const [ano, mes, dia] = ticket.task_date.split('-');
            const dataFormatada = `${dia}/${mes}/${ano}`;

            const tr = document.createElement('tr');
            tr.className = 'mobile-card sm:table-row hover:bg-gray-50 transition border-b border-gray-100 min-w-full';
            
            tr.innerHTML = `
                <td class="sm:table-cell sm:px-4 sm:py-2 sm:w-32 whitespace-nowrap">
                    <span class="bg-green-50 text-green-700 px-2 py-1 rounded text-[10px] sm:text-xs font-medium border border-green-100 inline-flex items-center gap-1">
                        <i data-lucide="calendar" class="w-3 h-3"></i> ${dataFormatada}
                    </span>
                </td>
                <td class="sm:table-cell sm:px-4 sm:py-2">
                    <div class="flex flex-col">
                        <span class="text-[9px] sm:text-[10px] text-blue-600 font-bold mb-0">${ticket.internal_id || 'N/A'}</span>
                        <span class="text-xs sm:text-sm text-gray-800 font-medium leading-tight">${ticket.title || 'Sem título'}</span>
                    </div>
                </td>
                <td class="sm:table-cell sm:px-4 sm:py-2 sm:w-24 whitespace-nowrap text-center">
                    <span class="bg-blue-50 text-blue-700 px-2 py-1 rounded text-[10px] sm:text-xs font-medium border border-blue-100 inline-flex items-center gap-1">
                        <i data-lucide="clock" class="w-3 h-3"></i> ${tempoFormatado}
                    </span>
                </td>
                <td class="sm:table-cell sm:px-4 sm:py-2 sm:w-32 whitespace-nowrap text-right">
                    <div class="flex gap-2 sm:justify-end mt-2 sm:mt-0">
                        <button class="flex-1 sm:flex-none p-1.5 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 transition flex items-center justify-center" onclick="loadEditData(${ticket.id})">
                            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                            <span class="sm:hidden text-xs font-bold ml-2">Editar</span>
                        </button>
                        <button class="flex-1 sm:flex-none p-1.5 bg-red-100 text-red-800 rounded-md hover:bg-red-200 transition flex items-center justify-center" onclick="deleteTicket(${ticket.id})">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            <span class="sm:hidden text-xs font-bold ml-2">Apagar</span>
                        </button>
                    </div>
                </td>
            `;
            ticketsBody.appendChild(tr);
        });

        lucide.createIcons();
    } catch (error) {
        console.error('Erro ao buscar tickets:', error);
        ticketsBody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-red-500">Erro ao carregar dados.</td></tr>';
        const dailyTotalElement = document.getElementById('daily-total');
        if (dailyTotalElement) dailyTotalElement.classList.add('hidden');
    }
}

// ==========================================
// LISTENERS DOS FILTROS DA TABELA
// ==========================================
function setupTableFilters() {
    const searchInput = document.getElementById('table_search');
    const sortBtn = document.getElementById('custom_sort_btn');
    const sortOptions = document.getElementById('custom_sort_options');
    const sortLabel = document.getElementById('custom_sort_label');
    const hiddenSortInput = document.getElementById('table_sort');
    const optionItems = document.querySelectorAll('.sort-option');
    const clearTableBtn = document.getElementById('clear_table_search');
    const dateFilter = document.getElementById('table_date_filter');
    const clearDateBtn = document.getElementById('clear_date_filter');

    if (dateFilter) {
        dateFilter.addEventListener('change', () => {
            if (clearDateBtn) clearDateBtn.classList.toggle('hidden', dateFilter.value === '');
            fetchTickets(); 
        });

        if (clearDateBtn) {
            clearDateBtn.addEventListener('click', () => {
                dateFilter.value = '';
                clearDateBtn.classList.add('hidden');
                fetchTickets(); 
            });
        }
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (clearTableBtn) clearTableBtn.classList.toggle('hidden', searchInput.value.length === 0);
            clearTimeout(tableSearchTimeout);
            tableSearchTimeout = setTimeout(() => { fetchTickets(); }, CONFIG.UI.SEARCH_DELAY_MS);
        });

        if (clearTableBtn) {
            clearTableBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearTableBtn.classList.add('hidden'); 
                fetchTickets(); 
                searchInput.focus(); 
            });
        }
    }

    if (sortBtn) {
        sortBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            sortOptions.classList.toggle('hidden');
        });

        optionItems.forEach(item => {
            item.addEventListener('click', () => {
                sortLabel.textContent = item.textContent;
                hiddenSortInput.value = item.getAttribute('data-value');
                sortOptions.classList.add('hidden');
                fetchTickets(); 
            });
        });

        document.addEventListener('click', (e) => {
            if (!sortBtn.contains(e.target) && !sortOptions.contains(e.target)) {
                sortOptions.classList.add('hidden');
            }
        });
    }
}

// ==========================================
// LÓGICA DO FORMULÁRIO (Adicionar / Editar)
// ==========================================
const recordForm = document.getElementById('record-form');
let currentEditId = null; 

if (recordForm) {
    document.getElementById('task_date').value = new Date().toISOString().split('T')[0];

    recordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btnSave = document.getElementById('btn-save');
        btnSave.textContent = 'A guardar...';
        btnSave.disabled = true;

        const user = getCurrentUser();
        if (!user) {
            alert('Sessão expirada. Por favor, faz login novamente.');
            window.location.href = 'index.html';
            return;
        }

        const taskDate = document.getElementById('task_date').value;
        const workHours = document.getElementById('work_hours').value || 0;
        const workMinutes = document.getElementById('work_minutes').value || 0;
        const selectValue = document.getElementById('ticket_select').value;

        if (!selectValue) {
            showToast('Por favor, pesquisa e seleciona um ticket da lista.', 'error');
            btnSave.disabled = false;
            btnSave.textContent = currentEditId ? 'Atualizar Registo' : 'Guardar Registo';
            return; 
        }

        const [internalId, title] = selectValue.split('||');

        const recordData = { 
            internal_id: internalId, 
            title: title, 
            work_time_hours: parseInt(workHours), 
            work_time_minutes: parseInt(workMinutes), 
            task_date: taskDate,
            user_id: user.id,        
            user_email: user.email    
        };

        try {
            if (currentEditId) {
                await apiFetch(`${CONFIG.ENDPOINTS.MANAGEMENT}?id=eq.${currentEditId}`, {
                    method: 'PATCH',
                    body: JSON.stringify(recordData)
                });
                showToast('Registo atualizado com sucesso!', 'success');
            } else {
                await apiFetch(CONFIG.ENDPOINTS.MANAGEMENT, {
                    method: 'POST',
                    body: JSON.stringify(recordData)
                });
                showToast('Registo guardado com sucesso!', 'success');
            }

            recordForm.reset(); 
            fetchTickets(); 
        } catch (error) {
            console.error('Erro ao guardar:', error);
            showToast('Erro ao guardar o registo.', 'error');
        } finally {
            btnSave.disabled = false;
            btnSave.textContent = currentEditId ? 'Atualizar Registo' : 'Guardar Registo';
        }
    });

    recordForm.addEventListener('reset', () => {
        currentEditId = null;
        document.getElementById('btn-save').textContent = 'Guardar Registo';
        document.querySelector('button[type="reset"]').textContent = 'Limpar';
        
        document.getElementById('ticket_search').value = '';
        document.getElementById('ticket_select').value = '';
        
        setTimeout(() => document.getElementById('task_date').value = new Date().toISOString().split('T')[0], 10);
    });
}

// ==========================================
// LÓGICA DE APAGAR (Delete)
// ==========================================
window.deleteTicket = async function(id) {
    const confirmar = confirm("Tens a certeza que queres apagar este registo? Esta ação não pode ser desfeita.");
    if (!confirmar) return;

    try {
        await apiFetch(`${CONFIG.ENDPOINTS.MANAGEMENT}?id=eq.${id}`, { method: 'DELETE' });
        showToast('Registo apagado com sucesso!', 'success');
        fetchTickets(); 
    } catch (error) {
        console.error('Erro ao apagar:', error);
        showToast('Erro ao apagar o registo.', 'error');
    }
};

// ==========================================
// SMART DROPDOWN (Pesquisa Híbrida de Tickets)
// ==========================================
let initialTickets = []; 
let searchTimeout = null; 

async function loadTicketsDropdown() {
    try {
        const data = await apiFetch(`${CONFIG.ENDPOINTS.TICKETS}?select=id,title&order=created_at.desc&limit=${CONFIG.UI.DROPDOWN_INITIAL_LIMIT}`);
        if (data) initialTickets = data;
    } catch(e) {
        console.warn('Não foi possível carregar a lista inicial de tickets');
    }
    setupTicketSearch();
}

function renderDropdown(tickets) {
    const dropdown = document.getElementById('ticket_dropdown');
    dropdown.innerHTML = ''; 

    if (tickets.length === 0) {
        dropdown.innerHTML = '<li class="px-4 py-2 text-sm text-gray-500">Nenhum ticket encontrado.</li>';
        dropdown.classList.remove('hidden');
        return;
    }

    tickets.forEach(ticket => {
        const li = document.createElement('li');
        li.className = 'px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors border-b border-gray-50';
        li.textContent = ticket.title;
        li.addEventListener('click', () => {
            document.getElementById('ticket_search').value = ticket.title; 
            document.getElementById('ticket_select').value = `${ticket.id}||${ticket.title}`; 
            dropdown.classList.add('hidden'); 
        });

        dropdown.appendChild(li);
    });

    dropdown.classList.remove('hidden');
}

function setupTicketSearch() {
    const searchInput = document.getElementById('ticket_search');
    const dropdown = document.getElementById('ticket_dropdown');

    searchInput.addEventListener('focus', () => {
        if (searchInput.value.length === 0) {
            renderDropdown(initialTickets);
        } else {
            dropdown.classList.remove('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim();
        clearTimeout(searchTimeout); 

        if (term.length === 0) {
            renderDropdown(initialTickets);
            document.getElementById('ticket_select').value = ''; 
            return;
        }

        if (term.length < 3) {
            dropdown.innerHTML = '<li class="px-4 py-2 text-sm text-gray-500">Escreve pelo menos 3 caracteres...</li>';
            dropdown.classList.remove('hidden');
            document.getElementById('ticket_select').value = ''; 
            return;
        }

        searchTimeout = setTimeout(async () => {
            dropdown.innerHTML = '<li class="px-4 py-2 text-sm text-blue-600 flex items-center gap-2"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> A procurar...</li>';
            lucide.createIcons();

            try {
                const data = await apiFetch(`${CONFIG.ENDPOINTS.TICKETS}?select=id,title&title=ilike.*${term}*&order=created_at.desc&limit=${CONFIG.UI.DROPDOWN_SEARCH_LIMIT}`);
                renderDropdown(data);
            } catch (error) {
                dropdown.innerHTML = '<li class="px-4 py-2 text-sm text-red-500">Erro na pesquisa.</li>';
            }
        }, CONFIG.UI.SEARCH_DELAY_MS);
    });
}

// ==========================================
// FUNCIÓN PARA CARGAR DATOS EN EL FORMULARIO
// ==========================================
window.loadEditData = async function(id) {
    try {
        const data = await apiFetch(`${CONFIG.ENDPOINTS.MANAGEMENT}?id=eq.${id}&select=*`);
        
        if (!data || data.length === 0) throw new Error("Registo não encontrado");
        
        const record = data[0];

        document.getElementById('task_date').value = record.task_date;
        document.getElementById('work_hours').value = record.work_time_hours;
        document.getElementById('work_minutes').value = record.work_time_minutes;
        
        document.getElementById('ticket_select').value = `${record.internal_id}||${record.title}`;
        document.getElementById('ticket_search').value = record.title;

        currentEditId = record.id;
        document.getElementById('btn-save').textContent = 'Atualizar Registo';
        document.querySelector('button[type="reset"]').textContent = 'Cancelar'; 

        document.getElementById('form-section').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Erro ao buscar dados para edição:', error);
        showToast('Erro ao carregar os dados para edição.', 'error');
    }
};

// ==========================================
// LÓGICA DO BOTÃO X NO FORMULÁRIO
// ==========================================
function setupFormClearButton() {
    const ticketSearch = document.getElementById('ticket_search');
    const clearTicketBtn = document.getElementById('clear_ticket_search');
    const ticketHidden = document.getElementById('ticket_select');

    if (ticketSearch && clearTicketBtn) {
        ticketSearch.addEventListener('input', () => {
            clearTicketBtn.classList.toggle('hidden', ticketSearch.value.length === 0);
            if (ticketSearch.value === '') {
                if(ticketHidden) ticketHidden.value = '';
            }
        });

        clearTicketBtn.addEventListener('click', () => {
            ticketSearch.value = '';
            if(ticketHidden) ticketHidden.value = '';
            clearTicketBtn.classList.add('hidden'); 
            ticketSearch.focus(); 
            
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupFormClearButton();
});

// ==========================================
// SISTEMA DE NOTIFICAÇÕES (TOAST)
// ==========================================
window.showToast = function(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed top-5 right-5 z-50 flex flex-col gap-3 pointer-events-none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    
    let bgColor, textColor, icon;
    if (type === 'success') {
        bgColor = 'bg-green-100'; textColor = 'text-green-800';
        icon = '<i data-lucide="check-circle" class="w-5 h-5"></i>';
    } else if (type === 'error') {
        bgColor = 'bg-red-100'; textColor = 'text-red-800';
        icon = '<i data-lucide="alert-circle" class="w-5 h-5"></i>';
    } else {
        bgColor = 'bg-blue-100'; textColor = 'text-blue-800';
        icon = '<i data-lucide="info" class="w-5 h-5"></i>';
    }

    toast.className = `flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border border-white/20 ${bgColor} ${textColor} transform transition-all duration-300 translate-x-full opacity-0 max-w-sm`;
    toast.innerHTML = `${icon} <span class="text-sm font-semibold">${message}</span>`;

    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300); 
    }, 3000);
};