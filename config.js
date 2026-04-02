// config.js
const CONFIG = {
    // 1. Base de Dados e Autenticação
    SUPABASE_URL: 'https://supabase1.myserver.pt', //https://supabase1.myserver.pt/rest/v1/meshgroups
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjEyMzQ1Njc4LCJleHAiOjI2MTIzNDU2Nzh9.szPPmYS9Pa9WENwHSgsrd7i_YaYLmmORiVqA9jguyGc',

    // 2. Rotas da API (Endpoints)
    ENDPOINTS: {
        LOGIN: '/auth/v1/token?grant_type=password',
        LOGOUT: '/auth/v1/logout',
        MANAGEMENT: '/rest/v1/ticket_management',
        TICKETS: '/rest/v1/tickets'
    },

    // 3. Configuração da Interface (UI)
    UI: {
        DASHBOARD_LIMIT: 100,
        DROPDOWN_INITIAL_LIMIT: 50,
        DROPDOWN_SEARCH_LIMIT: 20,
        SEARCH_DELAY_MS: 400
    }
};