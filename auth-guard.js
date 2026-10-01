// Equipe GDA — proteção de login para os painéis administrativos.
// Inclua depois de js/supabase-client.js. Redireciona pra login.html se
// ninguém estiver logado, e liga o botão de sair (#btn-logout), se existir
// na página.
(function () {
  'use strict';

  function currentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  window.gdaRequireAuth = function (onReady) {
    if (!window.gdaSupabase) {
      console.error('[GDA] cliente Supabase indisponível.');
      return;
    }
    window.gdaSupabase.auth.getSession().then(function (result) {
      var session = result && result.data && result.data.session;
      if (!session) {
        window.location.href = 'login.html?redirect=' + encodeURIComponent(currentPage());
        return;
      }
      var logoutBtn = document.getElementById('btn-logout');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
          window.gdaSupabase.auth.signOut().then(function () {
            window.location.href = 'login.html';
          });
        });
      }
      if (typeof onReady === 'function') onReady(session);
    });

    window.gdaSupabase.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') {
        window.location.href = 'login.html';
      }
    });
  };
})();
