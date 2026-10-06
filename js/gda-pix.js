// Equipe GDA — Pix via Mercado Pago (lado do site).
// Depende de: SDK do Supabase + js/supabase-client.js (window.gdaSupabase).
//
//   gdaPix.criar({ tipo: 'adesivo', cadastro_id })          → Promise<{ ok, data | erro }>
//   gdaPix.criar({ tipo: 'camisa',  pedido_id })            → idem
//   gdaPix.mostrar(container, pagamento, { onAprovado, onFalha, onNovoCodigo }) → { parar() }
//
// O valor NUNCA é enviado pelo site: o servidor calcula a partir do banco.
(function () {
  'use strict';

  // Nomes (slugs) reais das funções no Supabase — são os que aparecem na URL .../functions/v1/<slug>
  var FUNCOES = {
    criar: 'bright-worker',      // criar-pix
    verificar: 'dynamic-action'  // verificar-pix
  };

  var MENSAGENS = {
    cadastro_nao_aprovado: 'Seu cadastro ainda não foi aprovado.',
    cadastro_nao_encontrado: 'Não encontramos o seu cadastro.',
    adesivo_ja_pago: 'O adesivo deste cadastro já está pago.',
    pedido_nao_encontrado: 'Não encontramos o seu pedido.',
    pedido_nao_pendente: 'Este pedido não está mais aguardando pagamento.',
    pix_apenas_a_vista: 'O Pix automático é só para pedidos à vista.',
    pedido_sem_itens: 'O pedido não tem itens.',
    quantidades_invalidas: 'As quantidades do pedido são inválidas.',
    mercadopago_recusou: 'O Mercado Pago não conseguiu gerar o Pix agora. Tente de novo em instantes.',
    falha_ao_registrar: 'Não foi possível registrar o pagamento. Tente de novo.',
    erro_rede: 'Não foi possível conectar. Verifique sua internet e tente de novo.',
    erro_interno: 'Algo deu errado do nosso lado. Tente de novo em instantes.'
  };

  function mensagemDeErro(codigo) {
    return MENSAGENS[codigo] || 'Não foi possível gerar o Pix agora. Tente de novo ou fale com o suporte.';
  }

  function invocar(nome, body) {
    if (!window.gdaSupabase || !window.gdaSupabase.functions) {
      return Promise.resolve({ ok: false, erro: 'erro_rede' });
    }
    return window.gdaSupabase.functions.invoke(nome, { body: body }).then(function (r) {
      if (!r.error) return { ok: true, data: r.data };
      var ctx = r.error.context;
      if (ctx && typeof ctx.json === 'function') {
        return ctx.json().then(function (j) {
          return { ok: false, erro: (j && j.error) || 'erro_interno' };
        }).catch(function () { return { ok: false, erro: 'erro_rede' }; });
      }
      return { ok: false, erro: 'erro_rede' };
    }).catch(function () { return { ok: false, erro: 'erro_rede' }; });
  }

  function criar(body) {
    return invocar(FUNCOES.criar, body).then(function (r) {
      if (!r.ok) r.mensagem = mensagemDeErro(r.erro);
      return r;
    });
  }

  function brl(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }

  function el(tag, estilo, texto) {
    var e = document.createElement(tag);
    if (estilo) e.setAttribute('style', estilo);
    if (texto != null) e.textContent = texto;
    return e;
  }

  function copiar(texto) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(texto).then(function () { return true; }, function () { return copiarFallback(texto); });
      }
    } catch (e) { /* cai no fallback */ }
    return Promise.resolve(copiarFallback(texto));
  }

  function copiarFallback(texto) {
    try {
      var ta = document.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  function mmss(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var ss = s % 60;
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return (h > 0 ? h + ':' + p(m) : m) + ':' + p(ss);
  }

  var FONTE = "'Manrope', sans-serif";
  var TITULO = "'Oswald', sans-serif";

  function mostrar(container, pg, opts) {
    opts = opts || {};
    container.innerHTML = '';

    var timers = [];
    var parado = false;
    var finalizado = false;
    function parar() {
      parado = true;
      timers.forEach(function (t) { clearInterval(t); });
      timers = [];
    }

    var caixa = el('div', 'display:flex;flex-direction:column;align-items:center;gap:14px;padding:22px 18px;background:#171310;border:1px solid rgba(255,219,0,0.35);border-radius:14px;');
    caixa.appendChild(el('span', 'font-family:' + TITULO + ';font-weight:600;font-size:16px;color:#F5F1EA;', 'Pague com Pix'));
    caixa.appendChild(el('span', 'font-family:' + TITULO + ';font-weight:700;font-size:26px;color:#FFDB00;', brl(pg.valor)));

    if (pg.qr_code_base64) {
      var moldura = el('div', 'background:#fff;padding:10px;border-radius:12px;line-height:0;width:min(230px,100%);box-sizing:border-box;');
      var img = document.createElement('img');
      img.alt = 'QR Code do Pix';
      img.src = 'data:image/png;base64,' + pg.qr_code_base64;
      img.setAttribute('style', 'width:100%;height:auto;display:block;');
      moldura.appendChild(img);
      caixa.appendChild(moldura);
    }

    caixa.appendChild(el('span', 'font-family:' + FONTE + ';font-size:13px;line-height:1.5;color:#D8D2C7;text-align:center;',
      'Abra o app do seu banco, escolha Pix e leia o QR Code — ou use o Pix Copia e Cola abaixo.'));

    var linhaCodigo = el('div', 'width:100%;display:flex;align-items:center;gap:10px;box-sizing:border-box;padding:10px 12px;background:#0F0C0A;border-radius:10px;');
    var codigo = el('span', 'flex:1;min-width:0;font-family:monospace;font-size:12px;color:#A89C8E;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;');
    codigo.textContent = pg.qr_code || '';
    var btnCopiar = el('button', 'flex-shrink:0;padding:9px 16px;border-radius:999px;background:#FFDB00;color:#14110F;font-family:' + FONTE + ';font-weight:700;font-size:12px;border:none;cursor:pointer;', 'Copiar código');
    btnCopiar.type = 'button';
    btnCopiar.addEventListener('click', function () {
      copiar(pg.qr_code || '').then(function (ok) {
        btnCopiar.textContent = ok ? 'Copiado ✓' : 'Selecione e copie';
        setTimeout(function () { btnCopiar.textContent = 'Copiar código'; }, 2500);
      });
    });
    linhaCodigo.appendChild(codigo);
    linhaCodigo.appendChild(btnCopiar);
    if (pg.qr_code) caixa.appendChild(linhaCodigo);

    var status = el('div', 'display:flex;align-items:center;gap:8px;font-family:' + FONTE + ';font-size:13px;font-weight:600;color:#FFDB00;');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    var bolinha = el('span', 'width:8px;height:8px;border-radius:999px;background:#FFDB00;display:inline-block;animation:gda-pix-pulso 1.2s ease-in-out infinite;');
    var statusTexto = el('span', '', 'Aguardando o pagamento…');
    bolinha.className = 'gda-pix-bolinha';
    status.appendChild(bolinha);
    status.appendChild(statusTexto);
    caixa.appendChild(status);

    var expira = el('span', 'font-family:' + FONTE + ';font-size:12px;color:#6B655C;');
    caixa.appendChild(expira);

    var acao = el('div', 'display:none;width:100%;flex-direction:column;align-items:center;gap:8px;');
    caixa.appendChild(acao);

    if (!document.getElementById('gda-pix-estilo')) {
      var st = document.createElement('style');
      st.id = 'gda-pix-estilo';
      st.textContent = '@keyframes gda-pix-pulso{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}' +
        '@media (prefers-reduced-motion: reduce){.gda-pix-bolinha{animation:none !important}}';
      document.head.appendChild(st);
    }

    container.appendChild(caixa);

    var expiraMs = pg.expira_em ? new Date(pg.expira_em).getTime() : 0;

    function falhou(tipo) {
      if (finalizado) return;
      finalizado = true;
      parar();
      bolinha.style.display = 'none';
      statusTexto.style.color = '#E8806F';
      statusTexto.textContent = tipo === 'recusado'
        ? 'O pagamento não foi aprovado.'
        : 'Este código expirou.';
      expira.textContent = '';
      acao.style.display = 'flex';
      acao.innerHTML = '';
      var novo = el('button', 'padding:11px 22px;border-radius:999px;background:#FFDB00;color:#14110F;font-family:' + FONTE + ';font-weight:700;font-size:13px;border:none;cursor:pointer;', 'Gerar novo código Pix');
      novo.type = 'button';
      novo.addEventListener('click', function () {
        if (opts.onNovoCodigo) opts.onNovoCodigo();
      });
      acao.appendChild(novo);
      if (opts.onFalha) opts.onFalha(tipo);
    }

    function aprovado() {
      if (finalizado) return;
      finalizado = true;
      parar();
      bolinha.style.display = 'none';
      statusTexto.style.color = '#7FD99A';
      statusTexto.textContent = 'Pagamento confirmado ✓';
      expira.textContent = '';
      if (opts.onAprovado) opts.onAprovado();
    }

    function tickRelogio() {
      if (finalizado || !expiraMs) return;
      var resta = expiraMs - Date.now();
      if (resta <= 0) {
        expira.textContent = 'Verificando…';
      } else {
        expira.textContent = 'O código vale por mais ' + mmss(resta);
      }
    }

    var ciclos = 0;
    function consultar() {
      if (parado || finalizado || !window.gdaSupabase) return;
      ciclos++;
      // a cada ~12 s pede ao servidor que confira direto no Mercado Pago (rede de segurança do webhook)
      if (ciclos % 3 === 0) invocar(FUNCOES.verificar, { pagamento_id: pg.pagamento_id });
      window.gdaSupabase.rpc('consultar_pagamento', { p_pagamento_id: pg.pagamento_id }).then(function (r) {
        if (parado || finalizado || r.error) return;
        var linha = r.data && r.data[0];
        var s = linha && linha.status;
        if (s === 'aprovado') { aprovado(); return; }
        if (s === 'recusado') { falhou('recusado'); return; }
        if (s === 'expirado' || s === 'cancelado') { falhou('expirado'); return; }
        if (expiraMs && Date.now() > expiraMs + 90000) falhou('expirado');
      });
    }

    tickRelogio();
    consultar();
    timers.push(setInterval(tickRelogio, 1000));
    timers.push(setInterval(consultar, 4000));

    return { parar: parar };
  }

  window.gdaPix = { criar: criar, mostrar: mostrar, mensagemDeErro: mensagemDeErro };
})();
