(function () {
  'use strict';

  var csrf = '';
  var produtos = [];
  var categorias = {};
  var $ = function (s) { return document.querySelector(s); };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(acao, dados) {
    var corpo = Object.assign({ acao: acao }, dados || {});
    return fetch('api.php', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(corpo)
    }).then(function (r) {
      return r.json().catch(function () { return { erro: 'Resposta inválida do servidor.' }; })
        .then(function (j) {
          if (!r.ok) {
            if (j.login) mostrarLogin();
            throw new Error(j.erro || 'Erro ' + r.status);
          }
          return j;
        });
    });
  }

  function mostrarLogin() {
    $('#tela-painel').hidden = true;
    $('#tela-login').hidden = false;
  }

  function mostrarPainel() {
    $('#tela-login').hidden = true;
    $('#tela-painel').hidden = false;
    carregar();
  }

  function aviso(texto, erro) {
    var el = $('#aviso');
    el.textContent = texto;
    el.className = 'aviso' + (erro ? ' aviso--erro' : '');
    el.hidden = !texto;
    clearTimeout(aviso.t);
    if (texto && !erro) aviso.t = setTimeout(function () { el.hidden = true; }, 3000);
  }

  /* ---------- preço ---------- */

  function paraInput(centavos) {
    return centavos ? (centavos / 100).toFixed(2).replace('.', ',') : '';
  }

  // "54,90" | "54.90" | "1.234,50" -> centavos (inteiro) ou null
  function paraCentavos(texto) {
    var t = String(texto).trim().replace(/\s/g, '').replace(/^R\$/i, '');
    if (t.indexOf(',') !== -1) t = t.replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    var c = Math.round(parseFloat(t) * 100);
    return c > 0 ? c : null;
  }

  /* ---------- lista ---------- */

  function carregar() {
    api('listar').then(function (r) {
      produtos = r.produtos;
      categorias = {};
      r.categorias.forEach(function (c) { categorias[c.id] = c.nome; });
      montarFiltroCategoria();
      desenhar();
    }).catch(function (e) { aviso(e.message, true); });
  }

  function montarFiltroCategoria() {
    var sel = $('#filtro-categoria');
    var atual = sel.value;
    var usadas = {};
    produtos.forEach(function (p) { usadas[p.categoria] = true; });
    sel.innerHTML = '<option value="">Todas as categorias</option>' +
      Object.keys(usadas).map(function (id) {
        return '<option value="' + esc(id) + '">' + esc(categorias[id] || id) + '</option>';
      }).join('');
    sel.value = atual;
  }

  function norm(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function filtrados() {
    var termo = norm($('#busca').value.trim());
    var cat = $('#filtro-categoria').value;
    var st = $('#filtro-status').value;
    return produtos.filter(function (p) {
      if (cat && p.categoria !== cat) return false;
      if (st === 'ativos' && !p.ativo) return false;
      if (st === 'suspensos' && p.ativo) return false;
      return !termo || norm(p.nome + ' ' + p.marca).indexOf(termo) !== -1;
    });
  }

  function desenhar() {
    var lista = filtrados();
    var suspensos = produtos.filter(function (p) { return !p.ativo; }).length;
    $('#contagem').textContent = lista.length + ' de ' + produtos.length + ' produtos' +
      (suspensos ? ' · ' + suspensos + ' suspenso' + (suspensos > 1 ? 's' : '') : '');
    $('#linhas').innerHTML = lista.map(function (p) {
      var temEmb = p.embalagens && p.embalagens.length;
      var celulaPreco = temEmb
        ? '<span class="dica">Preço por embalagem, abaixo</span>'
        : formPreco(p.precoCentavos, p.nome);
      var linha = '<tr data-id="' + esc(p.id) + '"' + (p.ativo ? '' : ' class="suspenso"') + '>' +
        '<td data-rotulo="Produto"><div class="prod">' +
          (p.imagem ? '<img src="../' + esc(p.imagem) + '" alt="" loading="lazy">' : '<span class="prod__sem"></span>') +
          '<div><strong>' + esc(p.nome) + '</strong><small>' + esc(p.marca) + '</small></div></div></td>' +
        '<td data-rotulo="Categoria">' + esc(categorias[p.categoria] || p.categoria) + '</td>' +
        '<td data-rotulo="Preço">' + celulaPreco + '</td>' +
        '<td data-rotulo="Situação">' + botaoSituacao(p.ativo, temEmb ? 'o produto todo' : '') + '</td></tr>';
      if (temEmb) {
        linha += p.embalagens.map(function (e) {
          return '<tr class="emb' + (p.ativo && e.ativo ? '' : ' suspenso') + '" data-id="' + esc(p.id) + '" data-emb="' + esc(e.id) + '">' +
            '<td data-rotulo="Embalagem" class="emb__nome">↳ ' + esc(e.rotulo) + '</td><td></td>' +
            '<td data-rotulo="Preço">' + formPreco(e.precoCentavos, p.nome + ' — ' + e.rotulo) + '</td>' +
            '<td data-rotulo="Situação">' + botaoSituacao(e.ativo, '') + '</td></tr>';
        }).join('');
      }
      return linha;
    }).join('') || '<tr><td colspan="4" class="vazio">Nenhum produto encontrado.</td></tr>';
  }

  function achar(id) {
    return produtos.find(function (p) { return p.id === id; });
  }

  function formPreco(centavos, nome) {
    return '<form class="preco" data-preco>' +
      '<span>R$</span><input inputmode="decimal" value="' + esc(paraInput(centavos)) + '" aria-label="Preço de ' + esc(nome) + '" required>' +
      '<button class="btn btn--sm btn--primario" type="submit">Salvar</button></form>';
  }

  function botaoSituacao(ativo) {
    return '<button type="button" class="btn btn--sm ' + (ativo ? 'btn--contorno' : 'btn--alerta') + '" data-alternar>' +
      (ativo ? 'Suspender' : 'Reativar') + '</button>' +
      '<span class="etiqueta ' + (ativo ? 'etiqueta--ok' : 'etiqueta--off') + '">' + (ativo ? 'Ativo' : 'Suspenso') + '</span>';
  }

  // O alvo da edição é o produto ou, nas linhas de embalagem, a embalagem dentro dele.
  function alvoDaLinha(tr) {
    var p = achar(tr.dataset.id);
    var e = tr.dataset.emb ? p.embalagens.find(function (x) { return x.id === tr.dataset.emb; }) : null;
    return { p: p, e: e, item: e || p, nome: e ? p.nome + ' — ' + e.rotulo : p.nome };
  }

  /* ---------- eventos ---------- */

  $('#linhas').addEventListener('submit', function (e) {
    var form = e.target.closest('[data-preco]');
    if (!form) return;
    e.preventDefault();
    var tr = form.closest('tr');
    var a = alvoDaLinha(tr);
    var input = form.querySelector('input');
    var centavos = paraCentavos(input.value);
    if (!centavos) { aviso('Preço inválido. Use o formato 54,90.', true); input.focus(); return; }
    if (centavos === a.item.precoCentavos) { input.value = paraInput(centavos); return; }
    var botao = form.querySelector('button');
    botao.disabled = true;
    api('atualizar', { id: a.p.id, embalagem: a.e ? a.e.id : undefined, precoCentavos: centavos }).then(function () {
      a.item.precoCentavos = centavos;
      input.value = paraInput(centavos);
      aviso('Preço de "' + a.nome + '" atualizado para R$ ' + paraInput(centavos) + '.');
    }).catch(function (err) { aviso(err.message, true); })
      .then(function () { botao.disabled = false; });
  });

  $('#linhas').addEventListener('click', function (e) {
    var botao = e.target.closest('[data-alternar]');
    if (!botao) return;
    var a = alvoDaLinha(botao.closest('tr'));
    var novo = !a.item.ativo;
    if (!novo && !confirm('Suspender "' + a.nome + '"? ' + (a.e ? 'Essa embalagem' : 'Ele') + ' some do site até ser reativado.')) return;
    botao.disabled = true;
    api('atualizar', { id: a.p.id, embalagem: a.e ? a.e.id : undefined, ativo: novo }).then(function () {
      a.item.ativo = novo;
      desenhar();
      aviso('"' + a.nome + '" ' + (novo ? 'reativado.' : 'suspenso.'));
    }).catch(function (err) { aviso(err.message, true); botao.disabled = false; });
  });

  ['#busca', '#filtro-categoria', '#filtro-status'].forEach(function (s) {
    $(s).addEventListener('input', desenhar);
  });

  $('#form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    var erro = $('#login-erro');
    erro.hidden = true;
    api('login', { usuario: f.usuario.value, senha: f.senha.value }).then(function (r) {
      csrf = r.csrf;
      f.senha.value = '';
      mostrarPainel();
    }).catch(function (err) {
      erro.textContent = err.message;
      erro.hidden = false;
    });
  });

  $('#sair').addEventListener('click', function () {
    api('logout').catch(function () {}).then(function () {
      fetch('api.php?acao=sessao', { credentials: 'same-origin' }).then(function (r) { return r.json(); })
        .then(function (r) { csrf = r.csrf; mostrarLogin(); });
    });
  });

  fetch('api.php?acao=sessao', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (r) {
      csrf = r.csrf;
      if (r.logado) {
        mostrarPainel();
      } else {
        mostrarLogin();
        if (r.configurado === false) {
          var erro = $('#login-erro');
          erro.textContent = 'O painel ainda não tem uma senha configurada na hospedagem.';
          erro.hidden = false;
        }
      }
    })
    .catch(function () {
      mostrarLogin();
      var erro = $('#login-erro');
      erro.textContent = 'Não foi possível falar com o servidor (api.php). O admin precisa rodar na hospedagem com PHP.';
      erro.hidden = false;
    });
})();
