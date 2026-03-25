// 1. Configuração do Supabase
const supabaseUrl = 'https://ibpgiqwcuhypwwapafnc.supabase.co';
const supabaseKey = 'sb_publishable_nyD73iRFwU9OGos23psE7g_ys0oNWSm';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// ==========================================
// LÓGICA DE LOGIN (index.html)
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

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            errorDiv.textContent = 'Erro no login: Verifica o email e a palavra-passe.';
            errorDiv.classList.remove('hidden');
            btnLogin.textContent = 'Entrar';
            btnLogin.disabled = false;
        } else {
            window.location.href = 'dashboard.html';
        }
    });
}

// ==========================================
// LÓGICA DO DASHBOARD (dashboard.html)
// ==========================================
const ticketsBody = document.getElementById('tickets-body');

if (ticketsBody) {
    initDashboard();
}

async function initDashboard() {
    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('user-email-display').textContent = user.email;

    document.getElementById('btn-logout').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = 'index.html';
    });

    setupTableFilters();
    fetchTickets();
    loadTicketsDropdown();
}

// ==========================================
// CARREGAR E FILTRAR A TABELA (Server-Side)
// ==========================================
let tableSearchTimeout = null;

async function fetchTickets() {
    const ticketsBody = document.getElementById('tickets-body');
    ticketsBody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-blue-500 flex justify-center items-center gap-2"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> A carregar dados...</td></tr>';
    lucide.createIcons();

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // 1. Ler os valores atuais dos filtros
    const searchTerm = document.getElementById('table_search').value.trim();
    const sortOrder = document.getElementById('table_sort').value;
    const dateInput = document.getElementById('table_date_filter');
    const dateValue = dateInput ? dateInput.value : '';

    // 2. Começar a construir a Query base
    let query = supabaseClient
        .from('ticket_management')
        .select('*')
        .eq('user_id', user.id)
        .limit(100);

    // 3. Aplicar a Pesquisa
    if (searchTerm.length > 0) {
        query = query.or(`title.ilike.%${searchTerm}%,internal_id.ilike.%${searchTerm}%`);
    }

    // 3.5. Aplicar o Filtro de Data
    if (dateValue) {
        query = query.eq('task_date', dateValue);
    }

    // 4. Aplicar a Ordenação
    switch (sortOrder) {
        case 'date_desc':
            query = query.order('task_date', { ascending: false }).order('created_at', { ascending: false });
            break;
        case 'date_asc':
            query = query.order('task_date', { ascending: true });
            break;
        case 'time_desc':
            query = query.order('work_time_hours', { ascending: false }).order('work_time_minutes', { ascending: false });
            break;
        case 'time_asc':
            query = query.order('work_time_hours', { ascending: true }).order('work_time_minutes', { ascending: true });
            break;
    }

    // 5. Executar a Query
    const { data, error } = await query;
    const dailyTotalElement = document.getElementById('daily-total');

    if (error) {
        console.error('Erro ao buscar tickets:', error);
        ticketsBody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-red-500">Erro ao carregar dados.</td></tr>';
        if (dailyTotalElement) dailyTotalElement.classList.add('hidden');
        return;
    }

    if (!data || data.length === 0) {
        ticketsBody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">Nenhum registo encontrado.</td></tr>';
        if (dailyTotalElement) dailyTotalElement.classList.add('hidden');
        return;
    }

    // ==========================================
    // NOVA LÓGICA: CALCULAR O TOTAL DO DIA MAIS RECENTE
    // ==========================================
    
    // A. Encontrar a data mais recente (como estão em YYYY-MM-DD, a ordem alfabética funciona perfeitamente)
    const datas = data.map(t => t.task_date);
    const dataMaisRecente = datas.sort((a, b) => b.localeCompare(a))[0];

    // B. Filtrar os registos que pertencem APENAS a essa data
    const registosDoDia = data.filter(t => t.task_date === dataMaisRecente);

    // C. Somar tudo
    let totalHoras = 0;
    let totalMinutos = 0;

    registosDoDia.forEach(t => {
        totalHoras += t.work_time_hours || 0;
        totalMinutos += t.work_time_minutes || 0;
    });

    // D. Converter minutos excedentes em horas (ex: 75 min = +1 hora e 15 min)
    totalHoras += Math.floor(totalMinutos / 60);
    totalMinutos = totalMinutos % 60;

    // E. Atualizar o HTML
    if (dailyTotalElement) {
        const [ano, mes, dia] = dataMaisRecente.split('-');
        dailyTotalElement.innerHTML = `Total de ${dia}/${mes}: <span class="font-bold ml-1">${totalHoras}h ${totalMinutos}m</span>`;
        dailyTotalElement.classList.remove('hidden');
    }
    // ==========================================

    // 6. Pintar a tabela
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

    // Lógica do Filtro de Data
    if (dateFilter) {
        dateFilter.addEventListener('change', () => {
            // Mostra ou esconde o X
            if (clearDateBtn) {
                clearDateBtn.classList.toggle('hidden', dateFilter.value === '');
            }
            fetchTickets(); // Recarrega a tabela com a nova data
        });

        // Quando clica no X da data
        if (clearDateBtn) {
            clearDateBtn.addEventListener('click', () => {
                dateFilter.value = '';
                clearDateBtn.classList.add('hidden');
                fetchTickets(); // Atualiza a tabela
            });
        }
    }

    // 1. Lógica do Buscador (Debounce 400ms) e Botão X
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            // Mostra ou esconde o X dependendo se há texto
            if (clearTableBtn) {
                clearTableBtn.classList.toggle('hidden', searchInput.value.length === 0);
            }

            clearTimeout(tableSearchTimeout);
            tableSearchTimeout = setTimeout(() => {
                fetchTickets();
            }, 400);
        });

        // Quando clica no X da tabela
        if (clearTableBtn) {
            clearTableBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearTableBtn.classList.add('hidden'); // Esconde o X
                fetchTickets(); // Atualiza a tabela imediatamente
                searchInput.focus(); // Devolve o cursor ao input para continuar a escrever
            });
        }
    }

    // 2. Lógica de Abrir/Fechar o Menu Customizado
    if (sortBtn) {
        sortBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita que feche logo a seguir
            sortOptions.classList.toggle('hidden');
        });

        // Clicar numa das opções bonitas
        optionItems.forEach(item => {
            item.addEventListener('click', () => {
                // Atualizamos o texto visível e o valor oculto
                sortLabel.textContent = item.textContent;
                hiddenSortInput.value = item.getAttribute('data-value');
                
                // Fechamos o menu e procuramos na base de dados
                sortOptions.classList.add('hidden');
                fetchTickets(); 
            });
        });

        // Se clicar fora do menu, ele fecha-se automaticamente
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
        const btnReset = document.querySelector('button[type="reset"]'); 
        
        btnSave.textContent = 'A guardar...';
        btnSave.disabled = true;

        const { data: { user } } = await supabaseClient.auth.getUser();

        if (!user) {
            alert('Sessão expirada. Por favor, faz login novamente.');
            window.location.href = 'index.html';
            return;
        }

        const taskDate = document.getElementById('task_date').value;
        const workHours = document.getElementById('work_hours').value || 0;
        const workMinutes = document.getElementById('work_minutes').value || 0;
        const selectValue = document.getElementById('ticket_select').value;

        // --- AÑADE ESTA VALIDACIÓN AQUÍ ---
        if (!selectValue) {
            showToast('Por favor, pesquisa e seleciona um ticket da lista.', 'error');
            btnSave.disabled = false;
            btnSave.textContent = currentEditId ? 'Atualizar Registo' : 'Guardar Registo';
            return; // Detiene la ejecución
        }
        // ----------------------------------

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

        let dbError;

        if (currentEditId) {
            const { error } = await supabaseClient
                .from('ticket_management')
                .update(recordData)
                .eq('id', currentEditId);
            dbError = error;
        } else {
            const { error } = await supabaseClient
                .from('ticket_management')
                .insert([recordData]);
            dbError = error;
        }

        btnSave.disabled = false;

        if (dbError) {
            console.error('Erro ao guardar:', dbError);
            showToast('Erro ao guardar o registo.', 'error');
            btnSave.textContent = currentEditId ? 'Atualizar Registo' : 'Guardar Registo';
        } else {
            const mensagem = currentEditId ? 'Registo atualizado com sucesso!' : 'Registo guardado com sucesso!';
            showToast(mensagem, 'success');
            
            recordForm.reset(); 
            fetchTickets(); 
        }
    });

    // Detectar quando se pulsa el botão "Limpar" / "Cancelar"
    recordForm.addEventListener('reset', () => {
        currentEditId = null;
        document.getElementById('btn-save').textContent = 'Guardar Registo';
        document.querySelector('button[type="reset"]').textContent = 'Limpar';
        
        // Vaciamos el desplegable inteligente (el visible y el oculto)
        document.getElementById('ticket_search').value = '';
        document.getElementById('ticket_select').value = '';
        
        setTimeout(() => document.getElementById('task_date').valueAsDate = new Date(), 10);
    });
}

// ==========================================
// LÓGICA DE APAGAR (Delete)
// ==========================================
window.deleteTicket = async function(id) {
    const confirmar = confirm("Tens a certeza que queres apagar este registo? Esta ação não pode ser desfeita.");
    
    if (!confirmar) return;

    const { error } = await supabaseClient
        .from('ticket_management')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Erro ao apagar:', error);
        showToast('Erro ao apagar o registo.', 'error');
    } else {
        showToast('Registo apagado com sucesso!', 'success');
        fetchTickets(); // Atualiza a tabela após apagar
    }
};

// ==========================================
// SMART DROPDOWN (Pesquisa Híbrida de Tickets)
// ==========================================
let initialTickets = []; // Guarda os últimos 50 para acesso rápido
let searchTimeout = null; // Controla o delay da escrita (Debounce)

async function loadTicketsDropdown() {
    // 1. Carregar os 50 mais recentes assim que a página abre
    const { data, error } = await supabaseClient
        .from('tickets')
        .select('id, subject')
        .order('created_at', { ascending: false })
        .limit(50);

    if (!error && data) {
        initialTickets = data;
    }
    
    setupTicketSearch();
}

function renderDropdown(tickets) {
    const dropdown = document.getElementById('ticket_dropdown');
    dropdown.innerHTML = ''; // Limpar lista

    if (tickets.length === 0) {
        dropdown.innerHTML = '<li class="px-4 py-2 text-sm text-gray-500">Nenhum ticket encontrado.</li>';
        dropdown.classList.remove('hidden');
        return;
    }

    // Criar as linhas (opções) na lista
    tickets.forEach(ticket => {
        const li = document.createElement('li');
        li.className = 'px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors border-b border-gray-50';
        li.textContent = ticket.subject;
        
        // Quando o utilizador clica numa opção:
        li.addEventListener('click', () => {
            document.getElementById('ticket_search').value = ticket.subject; // Texto visível
            document.getElementById('ticket_select').value = `${ticket.id}||${ticket.subject}`; // Valor oculto p/ guardar
            dropdown.classList.add('hidden'); // Esconder a lista
        });

        dropdown.appendChild(li);
    });

    dropdown.classList.remove('hidden');
}

function setupTicketSearch() {
    const searchInput = document.getElementById('ticket_search');
    const dropdown = document.getElementById('ticket_dropdown');

    // Mostrar os recentes ao clicar no input (se estiver vazio)
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.length === 0) {
            renderDropdown(initialTickets);
        } else {
            dropdown.classList.remove('hidden');
        }
    });

    // Esconder a lista ao clicar fora dela
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    // A MÁGICA: Detetar o que o utilizador escreve
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim();

        clearTimeout(searchTimeout); // Cancelar a pesquisa anterior se ele ainda estiver a escrever

        // Se apagou tudo, volta a mostrar os recentes
        if (term.length === 0) {
            renderDropdown(initialTickets);
            document.getElementById('ticket_select').value = ''; 
            return;
        }

        // Se escreveu pouco, pede para escrever mais
        if (term.length < 3) {
            dropdown.innerHTML = '<li class="px-4 py-2 text-sm text-gray-500">Escreve pelo menos 3 caracteres...</li>';
            dropdown.classList.remove('hidden');
            document.getElementById('ticket_select').value = ''; 
            return;
        }

        // Se escreveu 3 ou mais, pesquisar no Supabase após 400ms (Debounce)
        searchTimeout = setTimeout(async () => {
            dropdown.innerHTML = '<li class="px-4 py-2 text-sm text-blue-600 flex items-center gap-2"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> A procurar...</li>';
            lucide.createIcons();

            const { data, error } = await supabaseClient
                .from('tickets')
                .select('id, subject')
                .ilike('subject', `%${term}%`) // O símbolo % funciona como "contém esta palavra"
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) {
                dropdown.innerHTML = '<li class="px-4 py-2 text-sm text-red-500">Erro na pesquisa.</li>';
            } else {
                renderDropdown(data);
            }
        }, 400);
    });
}
// ==========================================
// FUNCIÓN PARA CARGAR DATOS EN EL FORMULARIO
// ==========================================
window.loadEditData = async function(id) {
    const { data, error } = await supabaseClient
        .from('ticket_management')
        .select('*')
        .eq('id', id)
        .single(); 

    if (error) {
        console.error('Erro ao buscar dados para edição:', error);
        showToast('Erro ao carregar os dados para edição.', 'error');
        return;
    }

    document.getElementById('task_date').value = data.task_date;
    document.getElementById('work_hours').value = data.work_time_hours;
    document.getElementById('work_minutes').value = data.work_time_minutes;
    
    // Actualizamos el ID oculto que se guarda en BD
    document.getElementById('ticket_select').value = `${data.internal_id}||${data.title}`;
    
    // Actualizamos el texto visible que lee el usuario en el cajón de búsqueda
    document.getElementById('ticket_search').value = data.title;

    currentEditId = data.id;
    document.getElementById('btn-save').textContent = 'Atualizar Registo';
    
    // <--- MAGIA AQUÍ: Cambiamos el texto del botón a "Cancelar"
    document.querySelector('button[type="reset"]').textContent = 'Cancelar'; 

    document.getElementById('form-section').scrollIntoView({ behavior: 'smooth' });
};

// ==========================================
// LÓGICA DO BOTÃO X NO FORMULÁRIO
// ==========================================
function setupFormClearButton() {
    const ticketSearch = document.getElementById('ticket_search');
    const clearTicketBtn = document.getElementById('clear_ticket_search');
    const ticketHidden = document.getElementById('ticket_select');

    if (ticketSearch && clearTicketBtn) {
        // Mostrar/esconder o X ao escrever
        ticketSearch.addEventListener('input', () => {
            clearTicketBtn.classList.toggle('hidden', ticketSearch.value.length === 0);
            
            // Se apagar tudo, limpa o ID oculto também
            if (ticketSearch.value === '') {
                if(ticketHidden) ticketHidden.value = '';
            }
        });

        // Quando clica no X
        clearTicketBtn.addEventListener('click', () => {
            ticketSearch.value = '';
            if(ticketHidden) ticketHidden.value = '';
            clearTicketBtn.classList.add('hidden'); // Esconde o X novamente
            ticketSearch.focus(); // Devolve o cursor para o input
            
            // Recarrega os ícones caso seja necessário
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
    }
}

// Garante que a função roda quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
    setupFormClearButton();
});

// ==========================================
// SISTEMA DE NOTIFICAÇÕES (TOAST)
// ==========================================
window.showToast = function(message, type = 'success') {
    // 1. Procurar ou criar o contentor principal no canto superior direito
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        // Fica fixo no topo à direita, sobrepondo tudo (z-50)
        container.className = 'fixed top-5 right-5 z-50 flex flex-col gap-3 pointer-events-none';
        document.body.appendChild(container);
    }

    // 2. Criar a "tostada" (o aviso)
    const toast = document.createElement('div');
    
    // 3. Escolher cores e ícones baseados no tipo de aviso
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

    // Estilo do Toast com animação (começa fora do ecrã com translate-x-full)
    toast.className = `flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border border-white/20 ${bgColor} ${textColor} transform transition-all duration-300 translate-x-full opacity-0 max-w-sm`;
    toast.innerHTML = `${icon} <span class="text-sm font-semibold">${message}</span>`;

    // 4. Adicionar ao ecrã e renderizar o ícone
    container.appendChild(toast);
    lucide.createIcons();

    // 5. Animar a entrada (desliza para a esquerda)
    setTimeout(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    }, 10);

    // 6. Animar a saída e apagar do HTML após 3 segundos
    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300); // Espera a animação acabar para destruir
    }, 3000);
};