/* =====================================================================
   GDA Admin — peças comuns de todos os painéis da diretoria.

   1) MODO DIA / NOITE
      - Na primeira visita segue o modo do aparelho (claro/escuro).
      - O botão de sol/lua troca e a escolha fica salva NESTE aparelho,
        valendo para todas as páginas do admin.
      - Este arquivo precisa ser carregado dentro do <head>, ANTES do
        <body>, para a página já abrir na cor certa (sem "piscar").

   2) BARRA DE ATALHOS
      Coloque <div id="gda-admin-bar" data-pagina="vendas"></div> no
      topo do <body>. data-pagina = inicio | recrutamento | pedidos |
      adesivos | pilotos | vendas (marca o botão da página atual).

   3) ACESSO SÓ DA DIRETORIA
      gdaAdmin.exigir(function (sessao) { ...carrega a página... })
      - Sem login  -> manda para /admin/ (login) e depois volta.
      - Com login, mas e-mail fora da tabela gda_admins -> "Sem acesso".
   ===================================================================== */
(function () {
  'use strict';

  var CHAVE_TEMA = 'gda_tema';
  var LOGO = '/img/4ac9e9bf08b452d271c1706be86e366d.png';
  var URL_ADMIN = '/admin/';

  var AREAS = [
    { id: 'inicio',       nome: 'Início',                url: '/admin/' },
    { id: 'recrutamento', nome: 'Recrutamento',          url: '/painel-cadastros.html' },
    { id: 'pedidos',      nome: 'Painel de pedidos',     url: '/painel-pedidos.html' },
    { id: 'adesivos',     nome: 'Adesivos de reposição', url: '/painel-adesivos.html' },
    { id: 'pilotos',      nome: 'Pilotos',               url: '/pilotos-admin.html' },
    { id: 'vendas',       nome: 'GDA Vendas',            url: '/gda-vendas.html' }
  ];

  // ------------------------------------------------------------------
  // 1) Tema
  // ------------------------------------------------------------------
  function temaSalvo() {
    try { var t = localStorage.getItem(CHAVE_TEMA); return (t === 'light' || t === 'dark') ? t : ''; } catch (e) { return ''; }
  }
  function temaDoAparelho() {
    try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (e) { return 'dark'; }
  }
  function aplicarTema(t) {
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#F7F3EC' : '#14110F');
    atualizarBotaoTema();
  }
  function temaAtual() { return document.documentElement.getAttribute('data-theme') || 'dark'; }
  function alternarTema() {
    var novo = temaAtual() === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(CHAVE_TEMA, novo); } catch (e) {}
    aplicarTema(novo);
  }
  aplicarTema(temaSalvo() || temaDoAparelho()); // roda já, antes da página aparecer
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
      if (!temaSalvo()) aplicarTema(temaDoAparelho()); // sem escolha salva: acompanha o aparelho
    });
  } catch (e) {}
  // outra aba trocou o tema -> esta acompanha
  window.addEventListener('storage', function (e) { if (e.key === CHAVE_TEMA) aplicarTema(temaSalvo() || temaDoAparelho()); });

  var ICONE_SOL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>';
  var ICONE_LUA = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>';

  function atualizarBotaoTema() {
    var b = document.getElementById('gda-btn-tema');
    if (!b) return;
    var claro = temaAtual() === 'light';
    b.innerHTML = claro ? ICONE_LUA : ICONE_SOL;
    b.style.color = claro ? 'var(--g-txt2)' : 'var(--g-am-txt)';
    b.setAttribute('aria-label', claro ? 'Mudar para o modo noite' : 'Mudar para o modo dia');
    b.title = claro ? 'Modo noite' : 'Modo dia';
  }

  // ------------------------------------------------------------------
  // 2) Barra de atalhos
  // ------------------------------------------------------------------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function montarBarra() {
    var alvo = document.getElementById('gda-admin-bar');
    if (!alvo || alvo.getAttribute('data-montada')) return;
    var pagina = alvo.getAttribute('data-pagina') || '';
    var semAtalhos = alvo.hasAttribute('data-sem-atalhos');
    var links = semAtalhos ? '' : AREAS.map(function (a) {
      var atual = a.id === pagina;
      return '<a href="' + a.url + '" class="gda-nav gda-nav--' + a.id + (atual ? ' atual' : '') + '"' + (atual ? ' aria-current="page"' : '') + '>' + esc(a.nome) + '</a>';
    }).join('');
    alvo.outerHTML =
      '<header class="gda-bar" id="gda-admin-bar" data-montada="1">' +
        '<a href="' + URL_ADMIN + '" class="gda-bar__logo" aria-label="Início do admin"><img src="' + LOGO + '" alt="Equipe GDA"></a>' +
        '<nav class="gda-bar__nav" aria-label="Áreas da administração">' + links + '</nav>' +
        '<div class="gda-bar__acoes">' +
          '<span class="gda-bar__quem" id="gda-quem"></span>' +
          '<button type="button" class="gda-btn-icone" id="gda-btn-tema"></button>' +
          '<button type="button" class="gda-btn-sair" id="gda-btn-sair"' + (semAtalhos ? ' hidden' : '') + '>Sair</button>' +
        '</div>' +
      '</header>';
    document.getElementById('gda-btn-tema').addEventListener('click', alternarTema);
    document.getElementById('gda-btn-sair').addEventListener('click', sair);
    atualizarBotaoTema();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarBarra);
  else montarBarra();

  // ------------------------------------------------------------------
  // 3) Acesso só da diretoria
  // ------------------------------------------------------------------
  function sb() { return window.gdaSupabase; }

  function sair() {
    try { sessionStorage.removeItem('gda_acesso'); } catch (e) {}
    var c = sb();
    var fim = function () { location.href = URL_ADMIN; };
    if (c && c.auth) c.auth.signOut().then(fim, fim); else fim();
  }

  // Confere se o e-mail logado é da diretoria (tabela gda_admins):
  // devolve 'admin' ou '' (sem acesso).
  // Usa a função gda_acesso() do Supabase (SQL que acompanha estes arquivos).
  // Se a função ainda não existir, usa o mesmo teste do painel de Pilotos:
  // quem não é admin não enxerga a lista de pilotos.
  function verificarAcesso(sessao) {
    var uid = sessao && sessao.user && sessao.user.id;
    try {
      var guardado = JSON.parse(sessionStorage.getItem('gda_acesso') || 'null');
      if (guardado && guardado.uid === uid && guardado.nivel) return Promise.resolve(guardado.nivel);
    } catch (e) {}
    function lembrar(nivel) {
      if (nivel) { try { sessionStorage.setItem('gda_acesso', JSON.stringify({ uid: uid, nivel: nivel })); } catch (e) {} }
      return nivel || '';
    }
    return Promise.resolve(sb().rpc('gda_acesso')).then(function (r) {
      if (r && !r.error) return lembrar(r.data === 'admin' ? 'admin' : '');
      return Promise.resolve(sb().from('pilotos').select('id').limit(2)).then(function (r2) {
        return lembrar(r2 && !r2.error && r2.data && r2.data.length >= 2 ? 'admin' : '');
      });
    }, function () { return ''; });
  }

  function mostrarNegado(email) {
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el.id !== 'gda-admin-bar' && el.tagName !== 'SCRIPT') el.style.display = 'none';
    });
    var box = document.createElement('div');
    box.className = 'gda-negado';
    box.innerHTML = '<h2>Sem acesso à administração</h2>' +
      '<p>O login <strong>' + esc(email || '') + '</strong> não está na lista da diretoria. Se você é da diretoria, peça para incluírem seu e-mail na tabela <strong>gda_admins</strong> do Supabase.</p>' +
      '<button type="button">Entrar com outro e-mail</button>';
    box.querySelector('button').addEventListener('click', sair);
    document.body.appendChild(box);
  }

  // Use no lugar de window.gdaRequireAuth(...)
  function exigir(aoLiberar) {
    var c = sb();
    if (!c || !c.auth) { console.error('[GDA] Supabase não carregou.'); return; }
    c.auth.getSession().then(function (r) {
      var sessao = r && r.data && r.data.session;
      if (!sessao) {
        location.replace(URL_ADMIN + '?volta=' + encodeURIComponent(location.pathname + location.search + location.hash));
        return;
      }
      montarBarra(); // garante a barra pronta antes de preencher
      var quem = document.getElementById('gda-quem');
      if (quem) quem.textContent = sessao.user && sessao.user.email || '';
      verificarAcesso(sessao).then(function (nivel) {
        if (nivel !== 'admin') { mostrarNegado(sessao.user && sessao.user.email); return; }
        if (typeof aoLiberar === 'function') aoLiberar(sessao, nivel);
      });
    });
    c.auth.onAuthStateChange(function (evento) {
      if (evento === 'SIGNED_OUT') location.href = URL_ADMIN;
    });
  }

  window.gdaAdmin = {
    areas: AREAS,
    tema: temaAtual,
    alternarTema: alternarTema,
    exigir: exigir,
    verificarAcesso: verificarAcesso,
    sair: sair,
    montarBarra: montarBarra
  };
})();
