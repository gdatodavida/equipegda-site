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
      adesivos | pilotos | vendas | ouvidoria | pendencias
      (marca o botão da página atual).

   3) ACESSO SÓ DA DIRETORIA
      gdaAdmin.exigir(function (sessao) { ...carrega a página... })
      - Sem login  -> manda para /admin/ (login) e depois volta.
      - Com login, mas e-mail fora da tabela gda_admins -> "Sem acesso".

   4) WHATSAPP PELO SUPORTE (celular Android)
      No Android, todo link de WhatsApp aberto pelos painéis (wa.me /
      api.whatsapp.com) abre no app WhatsApp Business — o número do
      suporte — em vez do WhatsApp pessoal. Vale para links clicados e
      para as janelas abertas pelo código (ex.: "Aprovar e enviar"); nesse
      caso aparece o botão "Enviar pelo WhatsApp do Suporte" para tocar.
      Se o WhatsApp Business não estiver instalado, abre o link normal.
      No computador e no iPhone nada muda.
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
    { id: 'vendas',       nome: 'GDA Vendas',            url: '/gda-vendas.html' },
    { id: 'ouvidoria',    nome: 'Ouvidoria',             url: '/ouvidoria-painel', cor: 'var(--g-alerta-rgb)' },
    { id: 'pendencias',   nome: 'Pendências',            url: '/pendencias', cor: 'var(--g-coral-rgb)' }
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
      return '<a href="' + a.url + '" class="gda-nav gda-nav--' + a.id + (atual ? ' atual' : '') + '"' + (a.cor ? ' style="--c:' + a.cor + '"' : '') + (atual ? ' aria-current="page"' : '') + '>' + esc(a.nome) + '</a>';
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

  // ------------------------------------------------------------------
  // 4) WhatsApp pelo suporte (WhatsApp Business no Android)
  // ------------------------------------------------------------------
  var PACOTE_BUSINESS = 'com.whatsapp.w4b';
  var ANDROID = /Android/i.test(navigator.userAgent || '');

  function ehLinkWhats(url) {
    return /^https?:\/\/(wa\.me|api\.whatsapp\.com|(www\.)?whatsapp\.com\/send)/i.test(String(url || ''));
  }
  // https://wa.me/5573999999999?text=Oi  ->  intent que abre direto o WhatsApp Business
  function intentBusiness(url) {
    var u;
    try { u = new URL(url); } catch (e) { return url; }
    var fone = /wa\.me$/i.test(u.hostname) ? u.pathname.replace(/\D/g, '') : String(u.searchParams.get('phone') || '').replace(/\D/g, '');
    var texto = u.searchParams.get('text') || '';
    var q = [];
    if (fone) q.push('phone=' + fone);
    if (texto) q.push('text=' + encodeURIComponent(texto));
    return 'intent://send/' + (q.length ? '?' + q.join('&') : '') +
      '#Intent;scheme=whatsapp;package=' + PACOTE_BUSINESS +
      ';S.browser_fallback_url=' + encodeURIComponent(url) + ';end';
  }

  function mostrarBotaoEnviar(url) {
    var velho = document.getElementById('gda-whats-suporte');
    if (velho) velho.remove();
    var fone = '';
    try { var u = new URL(url); fone = (/wa\.me$/i.test(u.hostname) ? u.pathname : (u.searchParams.get('phone') || '')).replace(/\D/g, ''); } catch (e) {}
    if (fone.length > 11 && fone.indexOf('55') === 0) fone = fone.slice(2);
    var foneFmt = fone.length === 11 ? '(' + fone.slice(0, 2) + ') ' + fone.slice(2, 7) + '-' + fone.slice(7)
      : fone.length === 10 ? '(' + fone.slice(0, 2) + ') ' + fone.slice(2, 6) + '-' + fone.slice(6) : fone;

    var box = document.createElement('div');
    box.id = 'gda-whats-suporte';
    box.setAttribute('role', 'dialog');
    box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:18px 16px calc(18px + env(safe-area-inset-bottom));' +
      'background:var(--g-card,#211B17);border-top:1px solid rgba(var(--g-ink-rgb,245,241,234),.14);box-shadow:0 -10px 30px rgba(0,0,0,.35);' +
      "font-family:'Manrope',sans-serif;display:flex;flex-direction:column;gap:10px;";
    box.innerHTML =
      '<div style="font-size:13px;font-weight:700;color:var(--g-txt2,#D8D2C7)">Mensagem pronta' + (foneFmt ? ' para ' + esc(foneFmt) : '') + '</div>' +
      '<button type="button" data-enviar style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:15px;border:none;border-radius:999px;background:#25D366;color:#0B2E17;font-family:inherit;font-weight:800;font-size:15px;cursor:pointer">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1.4-4.2A8 8 0 1 1 9 18.5L4 20Z"></path></svg>' +
        'Enviar pelo WhatsApp do Suporte</button>' +
      '<button type="button" data-cancelar style="background:none;border:none;padding:6px;color:var(--g-txt3,#A89C8E);font-family:inherit;font-weight:600;font-size:13px;cursor:pointer">Agora não</button>';
    box.querySelector('[data-enviar]').addEventListener('click', function () {
      box.remove();
      location.href = intentBusiness(url);
    });
    box.querySelector('[data-cancelar]').addEventListener('click', function () { box.remove(); });
    document.body.appendChild(box);
  }

  function ligarWhatsSuporte() {
    if (!ANDROID || window.__gdaWhatsSuporte) return;
    window.__gdaWhatsSuporte = true;

    // a) links clicados (<a href="https://wa.me/...">)
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || !ehLinkWhats(a.href)) return;
      e.preventDefault();
      location.href = intentBusiness(a.href);
    }, true);

    // b) janelas abertas pelo código depois de salvar (ex.: "Aprovar e enviar"):
    //    o Android só abre outro app com um toque, então aparece um botão
    //    "Enviar pelo WhatsApp do Suporte" para tocar.
    var abrirOriginal = window.open;
    function irPara(w, url) {
      if (!ehLinkWhats(url)) { w.location.href = url; return; }
      try { w.close(); } catch (e) {}
      mostrarBotaoEnviar(url);
    }
    window.open = function (url, nome, opcoes) {
      if (url && ehLinkWhats(url)) {
        mostrarBotaoEnviar(url);
        return null;
      }
      var w = abrirOriginal.apply(window, arguments);
      if (!w) return w;
      var loc = {
        get href() { try { return w.location.href; } catch (e) { return ''; } },
        set href(u) { irPara(w, u); },
        assign: function (u) { irPara(w, u); },
        replace: function (u) { irPara(w, u); },
        toString: function () { return this.href; }
      };
      try {
        return new Proxy(w, {
          get: function (alvo, prop) {
            if (prop === 'location') return loc;
            var v = alvo[prop];
            return typeof v === 'function' ? v.bind(alvo) : v;
          },
          set: function (alvo, prop, valor) {
            if (prop === 'location') { irPara(alvo, valor); return true; }
            alvo[prop] = valor; return true;
          }
        });
      } catch (e) { return w; }
    };
  }
  ligarWhatsSuporte();

  window.gdaAdmin = {
    areas: AREAS,
    tema: temaAtual,
    alternarTema: alternarTema,
    exigir: exigir,
    verificarAcesso: verificarAcesso,
    sair: sair,
    montarBarra: montarBarra,
    intentBusiness: intentBusiness
  };
})();
