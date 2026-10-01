// Equipe GDA — cliente Supabase compartilhado.
// Inclua este arquivo DEPOIS do script do SDK:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="js/supabase-client.js"></script>
//
// Usa só a chave "anon public" — ela é feita pra ficar exposta no site.
// As regras de segurança (RLS) é que decidem o que cada visitante pode
// ler/gravar; estão definidas em supabase/schema.sql.
(function () {
  'use strict';

  var SUPABASE_URL = 'https://ofonhqvmrwsdtxdbuupn.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mb25ocXZtcndzZHR4ZGJ1dXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzAyNTQsImV4cCI6MjEwNjQwNjI1NH0.J45rRR2zCgQsLy77OHXpxrrjgAxK3E85KZ_QZwISa-8';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('[GDA] SDK do Supabase não carregou — verifique a conexão ou o script do CDN.');
    return;
  }

  window.gdaSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
