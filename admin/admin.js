/* Painel da Ligue Fraldas: produtos, fotos, categorias, lixeira e histórico. */
(function () {
  'use strict';

  var csrf = '';
  var loja = { versao: 0, categorias: [], produtos: [], lixeira: [] };
  var rascunho = null;      // produto em edição (modelo do formulário)
  var editandoId = null;    // id do produto em edição (null = novo)
  var alterado = false;     // há mudanças não salvas no editor
  var chave = 0;            // gera chaves internas para linhas do editor
  var $ = function (s) { return document.querySelector(s); };

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function norm(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function slug(s) {
    return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  }

  function codigoTamanho(rotulo) {
    return String(rotulo || '').split(/\s*[—–]\s*/)[0].trim();
  }

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

  function moeda(centavos) {
    return 'R$ ' + paraInput(centavos);
  }

  function dataHora(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function foto(src) {
    return src ? '<img src="../' + esc(src) + '" alt="" loading="lazy">' : '<span class="prod__sem"></span>';
  }

  function nomeCategoria(id) {
    var c = loja.categorias.find(function (x) { return x.id === id; });
    return c ? c.nome : id;
  }

  function aviso(texto, erro) {
    var el = $('#aviso');
    el.textContent = texto;
    el.className = 'aviso' + (erro ? ' aviso--erro' : '');
    el.hidden = !texto;
    clearTimeout(aviso.t);
    if (texto && !erro) aviso.t = setTimeout(function () { el.hidden = true; }, 4000);
  }

  /* ------------------------------------------------------------------ */
  /* Comunicação com o servidor                                          */
  /* ------------------------------------------------------------------ */

  function tratarResposta(r) {
    return r.json().catch(function () { return { erro: 'Resposta inválida do servidor (' + r.status + ').' }; })
      .then(function (j) {
        if (!r.ok) {
          if (j.login) mostrarLogin();
          var erro = new Error(j.erro || 'Erro ' + r.status);
          erro.lista = j.erros || null;
          erro.conflito = !!j.conflito;
          throw erro;
        }
        return j;
      });
  }

  function api(acao, dados) {
    return fetch('api.php', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(Object.assign({ acao: acao }, dados || {}))
    }).then(tratarResposta);
  }

  // Alterações levam a versão do catálogo: se outra janela salvou antes, o servidor recusa.
  function alterar(acao, dados) {
    return api(acao, Object.assign({ versao: loja.versao }, dados || {})).then(function (r) {
      aplicarLoja(r);
      return r;
    }).catch(function (erro) {
      if (erro.conflito) {
        aviso(erro.message, true);
        carregar();
      }
      throw erro;
    });
  }

  function aplicarLoja(r) {
    loja = { versao: r.versao, categorias: r.categorias, produtos: r.produtos, lixeira: r.lixeira };
    $('#aviso-importado').hidden = !r.importado;
    var n = loja.lixeira.length;
    $('#contagem-lixeira').hidden = !n;
    $('#contagem-lixeira').textContent = n;
    montarFiltroCategoria();
    desenharProdutos();
    desenharCategorias();
    desenharLixeira();
  }

  function carregar() {
    return api('carregar').then(aplicarLoja).catch(function (e) { aviso(e.message, true); });
  }

  /* ------------------------------------------------------------------ */
  /* Navegação                                                           */
  /* ------------------------------------------------------------------ */

  function mostrarLogin() {
    $('#tela-painel').hidden = true;
    $('#tela-login').hidden = false;
  }

  function mostrarPainel() {
    $('#tela-login').hidden = true;
    $('#tela-painel').hidden = false;
    carregar();
  }

  function irPara(secao) {
    if (secao !== 'editor' && !$('#secao-editor').hidden && alterado &&
        !confirm('Sair do produto sem salvar as alterações?')) return false;
    document.querySelectorAll('[data-secao]').forEach(function (s) { s.hidden = s.dataset.secao !== secao; });
    var aba = secao === 'editor' ? 'produtos' : secao;
    document.querySelectorAll('.aba').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.aba === aba)); });
    if (secao !== 'editor') { rascunho = null; alterado = false; }
    if (secao === 'historico') carregarHistorico();
    window.scrollTo(0, 0);
    return true;
  }

  document.querySelectorAll('.aba').forEach(function (b) {
    b.addEventListener('click', function () { irPara(b.dataset.aba); });
  });

  window.addEventListener('beforeunload', function (e) {
    if (alterado) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ------------------------------------------------------------------ */
  /* Lista de produtos                                                   */
  /* ------------------------------------------------------------------ */

  function montarFiltroCategoria() {
    var sel = $('#filtro-categoria');
    var atual = sel.value;
    sel.innerHTML = '<option value="">Todas as categorias</option>' + loja.categorias.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.nome) + '</option>';
    }).join('');
    sel.value = atual;
  }

  function filtrados() {
    var termo = norm($('#busca').value.trim());
    var cat = $('#filtro-categoria').value;
    var st = $('#filtro-status').value;
    return loja.produtos.filter(function (p) {
      var ativo = p.ativo !== false;
      if (cat && p.categoria !== cat) return false;
      if (st === 'ativos' && !ativo) return false;
      if (st === 'suspensos' && ativo) return false;
      return !termo || norm(p.nome + ' ' + (p.marca || '')).indexOf(termo) !== -1;
    });
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

  function desenharProdutos() {
    var lista = filtrados();
    var suspensos = loja.produtos.filter(function (p) { return p.ativo === false; }).length;
    $('#contagem').textContent = lista.length + ' de ' + loja.produtos.length + ' produtos' +
      (suspensos ? ' · ' + suspensos + ' suspenso' + (suspensos > 1 ? 's' : '') : '');
    $('#linhas').innerHTML = lista.map(function (p) {
      var ativo = p.ativo !== false;
      var emb = p.embalagens || [];
      var linha = '<tr data-id="' + esc(p.id) + '"' + (ativo ? '' : ' class="suspenso"') + '>' +
        '<td data-rotulo="Produto"><div class="prod">' + foto((p.imagens || [])[0]) +
          '<div><strong>' + esc(p.nome) + '</strong><small>' + esc(p.marca || '') + '</small></div></div></td>' +
        '<td data-rotulo="Categoria">' + esc(nomeCategoria(p.categoria)) + '</td>' +
        '<td data-rotulo="Preço">' + (emb.length ? '<span class="dica">Por embalagem, abaixo</span>' : formPreco(p.precoCentavos, p.nome)) + '</td>' +
        '<td data-rotulo="Situação">' + botaoSituacao(ativo) + '</td>' +
        '<td data-rotulo="Ações"><div class="acoes-linha">' +
          '<button type="button" class="btn btn--sm btn--primario" data-editar>Editar</button>' +
          '<button type="button" class="btn btn--sm btn--perigo" data-excluir>Excluir</button></div></td></tr>';
      linha += emb.map(function (e) {
        var embAtiva = e.ativo !== false;
        return '<tr class="emb' + (ativo && embAtiva ? '' : ' suspenso') + '" data-id="' + esc(p.id) + '" data-emb="' + esc(e.id) + '">' +
          '<td data-rotulo="Embalagem" class="emb__nome">↳ ' + esc(e.rotulo) +
            (e.tamanhos && e.tamanhos.length ? ' <small>(' + esc(e.tamanhos.map(codigoTamanho).join(', ')) + ')</small>' : '') + '</td><td></td>' +
          '<td data-rotulo="Preço">' + formPreco(e.precoCentavos, p.nome + ' — ' + e.rotulo) + '</td>' +
          '<td data-rotulo="Situação">' + botaoSituacao(embAtiva) + '</td>' +
          '<td data-rotulo="Capa"><label class="marcar" title="O card do site mostra o preço e a foto desta embalagem">' +
            '<input type="checkbox" data-capa' + (p.embalagemCapa === e.id ? ' checked' : '') + '> Capa</label></td></tr>';
      }).join('');
      return linha;
    }).join('') || '<tr><td colspan="5" class="vazio">Nenhum produto encontrado.</td></tr>';
  }

  function alvoDaLinha(tr) {
    var p = loja.produtos.find(function (x) { return x.id === tr.dataset.id; });
    var e = tr.dataset.emb ? (p.embalagens || []).find(function (x) { return x.id === tr.dataset.emb; }) : null;
    return { p: p, e: e, item: e || p, nome: e ? p.nome + ' — ' + e.rotulo : p.nome };
  }

  $('#linhas').addEventListener('submit', function (ev) {
    var form = ev.target.closest('[data-preco]');
    if (!form) return;
    ev.preventDefault();
    var a = alvoDaLinha(form.closest('tr'));
    var input = form.querySelector('input');
    var centavos = paraCentavos(input.value);
    if (!centavos) { aviso('Preço inválido. Use o formato 54,90.', true); input.focus(); return; }
    if (centavos === a.item.precoCentavos) { input.value = paraInput(centavos); return; }
    form.querySelector('button').disabled = true;
    alterar('alterarPreco', { id: a.p.id, embalagem: a.e ? a.e.id : undefined, precoCentavos: centavos })
      .then(function () { aviso('Preço de "' + a.nome + '" atualizado para ' + moeda(centavos) + '.'); })
      .catch(function (err) { aviso(err.message, true); form.querySelector('button').disabled = false; });
  });

  $('#linhas').addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr');
    if (!tr || !tr.dataset.id) return;
    var a = alvoDaLinha(tr);
    if (ev.target.closest('[data-editar]')) {
      abrirEditor(a.p);
    } else if (ev.target.closest('[data-excluir]')) {
      if (!confirm('Excluir "' + a.p.nome + '"? Ele sai do site e vai para a Lixeira, de onde pode ser restaurado.')) return;
      alterar('excluirProduto', { id: a.p.id })
        .then(function () { aviso('"' + a.p.nome + '" foi para a Lixeira.'); })
        .catch(function (err) { aviso(err.message, true); });
    } else if (ev.target.closest('[data-capa]')) {
      var marcar = ev.target.checked;
      alterar('definirCapa', { id: a.p.id, embalagem: marcar ? a.e.id : '' })
        .then(function () {
          aviso(marcar ? 'O card de "' + a.p.nome + '" agora mostra ' + a.e.rotulo + ' (' + moeda(a.e.precoCentavos) + ').'
            : 'O card de "' + a.p.nome + '" volta a mostrar o menor preço.');
        })
        .catch(function (err) { aviso(err.message, true); desenharProdutos(); });
    } else if (ev.target.closest('[data-alternar]')) {
      var novo = a.item.ativo === false;
      if (!novo && !confirm('Suspender "' + a.nome + '"? ' + (a.e ? 'Essa embalagem' : 'Ele') + ' some do site até ser reativado.')) return;
      ev.target.disabled = true;
      alterar('alternarAtivo', { id: a.p.id, embalagem: a.e ? a.e.id : undefined, ativo: novo })
        .then(function () { aviso('"' + a.nome + '" ' + (novo ? 'reativado.' : 'suspenso.')); })
        .catch(function (err) { aviso(err.message, true); ev.target.disabled = false; });
    }
  });

  ['#busca', '#filtro-categoria', '#filtro-status'].forEach(function (s) {
    $(s).addEventListener('input', desenharProdutos);
  });

  $('#novo-produto').addEventListener('click', function () { abrirEditor(null); });

  /* ------------------------------------------------------------------ */
  /* Editor de produto                                                   */
  /* ------------------------------------------------------------------ */

  function novaChave() { chave += 1; return 'k' + chave; }

  // Converte o produto salvo para o modelo do formulário (linhas com chaves estáveis,
  // para que renomear um tamanho não desfaça os vínculos com embalagens e fotos).
  function modeloDoProduto(p) {
    var tamanhos = (p && p.tamanho && p.tamanho.length ? p.tamanho : ['Único']).map(function (t) { return { k: novaChave(), texto: t }; });
    var chavePorTamanho = function (rotulo) {
      var achado = tamanhos.find(function (t) { return t.texto === rotulo || codigoTamanho(t.texto) === rotulo; });
      return achado ? achado.k : null;
    };
    var embalagens = ((p && p.embalagens) || []).map(function (e) {
      var tam = (e.tamanhos && e.tamanhos.length ? e.tamanhos.map(chavePorTamanho).filter(Boolean) : tamanhos.map(function (t) { return t.k; }));
      return { k: novaChave(), id: e.id, rotulo: e.rotulo, preco: paraInput(e.precoCentavos), tam: tam, ativo: e.ativo !== false };
    });
    var chavePorEmbalagem = function (id) {
      var achado = embalagens.find(function (e) { return e.id === id; });
      return achado ? achado.k : '';
    };
    var imagens = ((p && p.imagens) || []).map(function (src) {
      var regras = ((p && p.fotosPorOpcao) || []).filter(function (f) { return f.imagem === src; }).map(function (f) {
        return { tamanho: f.tamanho ? chavePorTamanho(f.tamanho) || '' : '', embalagem: f.embalagem ? chavePorEmbalagem(f.embalagem) : '' };
      });
      return { caminho: src, regras: regras };
    });
    return {
      nome: p ? p.nome : '',
      categoria: p ? p.categoria : (loja.categorias[0] || {}).id,
      marca: p ? p.marca || '' : '',
      descricao: p ? p.descricao || '' : '',
      palavrasChave: p && p.palavrasChave ? p.palavrasChave.join(', ') : '',
      ativo: p ? p.ativo !== false : true,
      destaque: p ? p.destaque === true : false,
      ordem: p && Number.isInteger(p.ordem) ? p.ordem : undefined,
      tamanhos: tamanhos,
      modoPreco: embalagens.length ? 'embalagens' : 'unico',
      preco: p && !embalagens.length ? paraInput(p.precoCentavos) : '',
      embalagens: embalagens,
      imagens: imagens,
      capa: p && p.embalagemCapa ? chavePorEmbalagem(p.embalagemCapa) : '',
      informacoes: ((p && p.informacoes) || []).map(function (i) { return { rotulo: i.rotulo || '', valor: i.valor || '' }; })
    };
  }

  function abrirEditor(produto) {
    if (!irPara('editor')) return;
    editandoId = produto ? produto.id : null;
    rascunho = modeloDoProduto(produto);
    alterado = false;
    $('#editor-titulo').textContent = produto ? 'Editar: ' + produto.nome : 'Novo produto';
    $('#editor-erros').hidden = true;
    $('#envio-status').textContent = '';
    var f = $('#form-produto');
    f.querySelector('[name=categoria]').innerHTML = loja.categorias.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.nome) + '</option>';
    }).join('');
    ['nome', 'categoria', 'marca', 'descricao', 'palavrasChave', 'preco'].forEach(function (n) { f.elements[n].value = rascunho[n] || ''; });
    f.elements.ativo.checked = rascunho.ativo;
    f.elements.destaque.checked = rascunho.destaque;
    f.querySelectorAll('[name=modoPreco]').forEach(function (r) { r.checked = r.value === rascunho.modoPreco; });
    desenharEditor();
    f.elements.nome.focus();
  }

  function rotuloTamanho(k) {
    var t = rascunho.tamanhos.find(function (x) { return x.k === k; });
    return t ? (codigoTamanho(t.texto) || '(sem nome)') : '';
  }

  function desenharEditor() {
    $('#preco-unico').hidden = rascunho.modoPreco !== 'unico';
    $('#preco-embalagens').hidden = rascunho.modoPreco !== 'embalagens';

    $('#lista-tamanhos').innerHTML = rascunho.tamanhos.map(function (t, i) {
      return '<li data-k="' + t.k + '"><input data-campo="tamanho" value="' + esc(t.texto) + '" maxlength="60" aria-label="Tamanho ' + (i + 1) + '" placeholder="Ex.: M — 24 unidades">' +
        '<button type="button" class="btn btn--sm btn--contorno" data-remover="tamanho" aria-label="Remover tamanho">×</button></li>';
    }).join('');

    $('#lista-embalagens').innerHTML = rascunho.embalagens.map(function (e, i) {
      return '<li class="embalagem" data-k="' + e.k + '">' +
        '<div class="embalagem__linha">' +
          '<label class="campo">Embalagem<input data-campo="rotulo" value="' + esc(e.rotulo) + '" maxlength="60" placeholder="Ex.: 16 unidades"></label>' +
          '<label class="campo campo--preco">Preço (R$)<input data-campo="precoEmb" inputmode="decimal" value="' + esc(e.preco) + '" placeholder="42,90"></label>' +
          '<label class="marcar"><input type="checkbox" data-campo="ativoEmb"' + (e.ativo ? ' checked' : '') + '> Ativa</label>' +
          '<label class="marcar" title="O card do site mostra o preço e a foto desta embalagem"><input type="checkbox" data-campo="capaEmb"' + (rascunho.capa === e.k ? ' checked' : '') + '> Capa do anúncio</label>' +
          '<button type="button" class="btn btn--sm btn--contorno" data-remover="embalagem" aria-label="Remover embalagem ' + (i + 1) + '">×</button>' +
        '</div>' +
        '<div class="embalagem__tamanhos">' + marcadoresDeTamanho(e) + '</div></li>';
    }).join('');

    desenharFotos();

    $('#lista-informacoes').innerHTML = rascunho.informacoes.map(function (inf, i) {
      return '<li data-i="' + i + '"><input data-campo="infoRotulo" value="' + esc(inf.rotulo) + '" maxlength="60" placeholder="Rótulo (ex.: Tamanho M)" aria-label="Rótulo da informação ' + (i + 1) + '">' +
        '<input data-campo="infoValor" value="' + esc(inf.valor) + '" maxlength="300" placeholder="Valor" aria-label="Valor da informação ' + (i + 1) + '">' +
        '<button type="button" class="btn btn--sm btn--contorno" data-remover="informacao" aria-label="Remover informação">×</button></li>';
    }).join('');
  }

  function desenharFotos() {
    var opcoesTam = '<option value="">qualquer tamanho</option>' + rascunho.tamanhos.map(function (t) {
      return '<option value="' + t.k + '">Tamanho ' + esc(rotuloTamanho(t.k)) + '</option>';
    }).join('');
    var opcoesEmb = rascunho.modoPreco === 'embalagens' && rascunho.embalagens.length
      ? '<option value="">qualquer embalagem</option>' + rascunho.embalagens.map(function (e) {
          return '<option value="' + e.k + '">' + esc(e.rotulo || '(embalagem sem nome)') + '</option>';
        }).join('')
      : '';
    var selecionar = function (html, valor) {
      return html.replace('value="' + valor + '"', 'value="' + valor + '" selected');
    };
    $('#lista-fotos').innerHTML = rascunho.imagens.map(function (img, i) {
      return '<li class="foto" data-i="' + i + '">' +
        '<div class="foto__img">' + foto(img.caminho) + (i === 0 ? '<span class="foto__capa">Capa</span>' : '') + '</div>' +
        '<div class="foto__acoes">' +
          '<button type="button" class="btn btn--sm btn--contorno" data-mover="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Mover para a esquerda">◀</button>' +
          '<button type="button" class="btn btn--sm btn--contorno" data-mover="1"' + (i === rascunho.imagens.length - 1 ? ' disabled' : '') + ' aria-label="Mover para a direita">▶</button>' +
          (i ? '<button type="button" class="btn btn--sm btn--contorno" data-capa>Tornar capa</button>' : '') +
          '<button type="button" class="btn btn--sm btn--perigo" data-remover="foto" aria-label="Remover foto">×</button>' +
        '</div>' +
        '<div class="foto__regras"><span class="dica">Mostrar quando o cliente escolher:</span>' +
          (img.regras.length ? img.regras.map(function (r, ri) {
            return '<div class="regra" data-ri="' + ri + '">' +
              '<select data-campo="regraTam" aria-label="Tamanho">' + selecionar(opcoesTam, r.tamanho) + '</select>' +
              (opcoesEmb ? '<select data-campo="regraEmb" aria-label="Embalagem">' + selecionar(opcoesEmb, r.embalagem) + '</select>' : '') +
              '<button type="button" class="btn btn--sm btn--contorno" data-remover="regra" aria-label="Remover vínculo">×</button></div>';
          }).join('') : '<span class="dica"> (foto geral)</span>') +
          '<button type="button" class="btn btn--sm btn--contorno" data-adicionar="regra">+ vincular a uma opção</button>' +
        '</div></li>';
    }).join('') || '<li class="dica">Nenhuma foto ainda. Todo anúncio precisa de pelo menos uma.</li>';
  }

  // Lê os campos digitados para o modelo (sem redesenhar, para não perder o foco).
  $('#form-produto').addEventListener('input', function (ev) {
    alterado = true;
    var el = ev.target;
    if (['nome', 'categoria', 'marca', 'descricao', 'palavrasChave', 'preco'].indexOf(el.name) !== -1) rascunho[el.name] = el.value;
    if (el.name === 'ativo' || el.name === 'destaque') rascunho[el.name] = el.checked;
    var li = el.closest('li');
    var campo = el.dataset.campo;
    if (campo === 'tamanho') rascunho.tamanhos.find(function (t) { return t.k === li.dataset.k; }).texto = el.value;
    var emb = li && li.classList.contains('embalagem') ? rascunho.embalagens.find(function (e) { return e.k === li.dataset.k; }) : null;
    if (emb && campo === 'rotulo') emb.rotulo = el.value;
    if (emb && campo === 'precoEmb') emb.preco = el.value;
    if (emb && campo === 'ativoEmb') emb.ativo = el.checked;
    if (emb && campo === 'capaEmb') {
      // Uma capa por produto: marcar uma desmarca as outras; desmarcar volta ao menor preço.
      rascunho.capa = el.checked ? emb.k : '';
      document.querySelectorAll('#lista-embalagens [data-campo=capaEmb]').forEach(function (c) { if (c !== el) c.checked = false; });
    }
    if (emb && el.dataset.tam) {
      emb.tam = emb.tam.filter(function (k) { return k !== el.dataset.tam; });
      if (el.checked) emb.tam.push(el.dataset.tam);
    }
    if (campo === 'infoRotulo') rascunho.informacoes[li.dataset.i].rotulo = el.value;
    if (campo === 'infoValor') rascunho.informacoes[li.dataset.i].valor = el.value;
    if (campo === 'regraTam' || campo === 'regraEmb') {
      var regra = rascunho.imagens[el.closest('.foto').dataset.i].regras[el.closest('.regra').dataset.ri];
      regra[campo === 'regraTam' ? 'tamanho' : 'embalagem'] = el.value;
    }
    if (el.name === 'modoPreco') {
      rascunho.modoPreco = el.value;
      if (el.value === 'embalagens' && !rascunho.embalagens.length) adicionarEmbalagem();
      desenharEditor();
    }
  });

  // Ao terminar de editar um tamanho ou embalagem, atualiza só os nomes que dependem dele
  // (caixas "Existe em" e listas das fotos). Redesenhar o editor inteiro tiraria o cursor
  // do campo seguinte, por exemplo o preço.
  function marcadoresDeTamanho(e) {
    return '<span class="dica">Existe em:</span>' + rascunho.tamanhos.map(function (t) {
      return '<label class="marcar"><input type="checkbox" data-tam="' + t.k + '"' + (e.tam.indexOf(t.k) !== -1 ? ' checked' : '') + '> ' + esc(rotuloTamanho(t.k)) + '</label>';
    }).join('');
  }

  $('#form-produto').addEventListener('change', function (ev) {
    var campo = ev.target.dataset.campo;
    if (campo === 'tamanho') {
      document.querySelectorAll('#lista-embalagens .embalagem').forEach(function (li) {
        var e = rascunho.embalagens.find(function (x) { return x.k === li.dataset.k; });
        if (e) li.querySelector('.embalagem__tamanhos').innerHTML = marcadoresDeTamanho(e);
      });
    }
    if (campo === 'tamanho' || campo === 'rotulo') desenharFotos();
  });

  function adicionarEmbalagem() {
    rascunho.embalagens.push({ k: novaChave(), id: '', rotulo: '', preco: '', tam: rascunho.tamanhos.map(function (t) { return t.k; }), ativo: true });
  }

  $('#form-produto').addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    var li = b.closest('li');
    var adicionar = b.dataset.adicionar;
    var remover = b.dataset.remover;
    if (b.hasAttribute('data-cancelar')) { irPara('produtos'); return; }
    if (!adicionar && !remover && !b.dataset.mover && !b.hasAttribute('data-capa')) return;
    alterado = true;
    if (adicionar === 'tamanho') rascunho.tamanhos.push({ k: novaChave(), texto: '' });
    if (adicionar === 'embalagem') adicionarEmbalagem();
    if (adicionar === 'informacao') rascunho.informacoes.push({ rotulo: '', valor: '' });
    if (adicionar === 'regra') rascunho.imagens[b.closest('.foto').dataset.i].regras.push({ tamanho: '', embalagem: '' });
    if (remover === 'tamanho') {
      if (rascunho.tamanhos.length === 1) { aviso('O produto precisa de pelo menos um tamanho (use "Único").', true); return; }
      rascunho.tamanhos = rascunho.tamanhos.filter(function (t) { return t.k !== li.dataset.k; });
      rascunho.embalagens.forEach(function (e) { e.tam = e.tam.filter(function (k) { return k !== li.dataset.k; }); });
      rascunho.imagens.forEach(function (img) { img.regras.forEach(function (r) { if (r.tamanho === li.dataset.k) r.tamanho = ''; }); });
    }
    if (remover === 'embalagem') {
      if (rascunho.capa === li.dataset.k) rascunho.capa = '';
      rascunho.embalagens = rascunho.embalagens.filter(function (e) { return e.k !== li.dataset.k; });
      rascunho.imagens.forEach(function (img) { img.regras.forEach(function (r) { if (r.embalagem === li.dataset.k) r.embalagem = ''; }); });
    }
    if (remover === 'informacao') rascunho.informacoes.splice(Number(li.dataset.i), 1);
    if (remover === 'foto') {
      if (!confirm('Remover esta foto do produto?')) return;
      rascunho.imagens.splice(Number(b.closest('.foto').dataset.i), 1);
    }
    if (remover === 'regra') rascunho.imagens[b.closest('.foto').dataset.i].regras.splice(Number(b.closest('.regra').dataset.ri), 1);
    if (b.dataset.mover) {
      var i = Number(b.closest('.foto').dataset.i);
      var j = i + Number(b.dataset.mover);
      var tmp = rascunho.imagens[i]; rascunho.imagens[i] = rascunho.imagens[j]; rascunho.imagens[j] = tmp;
    }
    if (b.hasAttribute('data-capa')) {
      var capa = rascunho.imagens.splice(Number(b.closest('.foto').dataset.i), 1)[0];
      rascunho.imagens.unshift(capa);
    }
    desenharEditor();
  });

  /* ---- envio de fotos ---- */

  // Avisos para a foto ficar boa no site (que mostra a foto inteira num quadrado).
  // Não impedem o envio: a regra completa está no guia "Como preparar as fotos".
  function problemasDaFoto(largura, altura) {
    var problemas = [];
    var menor = Math.min(largura, altura);
    var proporcao = Math.max(largura, altura) / menor;
    if (menor < 800) problemas.push('pequena (' + largura + '×' + altura + ' px): pode ficar borrada, o ideal é ter pelo menos 800 px no lado menor');
    if (proporcao > 2) problemas.push('muito comprida: o pacote vai aparecer pequeno no quadrado, recorte mais perto dele');
    return problemas;
  }

  function medirFoto(arquivo) {
    if (!window.createImageBitmap) return Promise.resolve(null);
    return createImageBitmap(arquivo).then(function (bitmap) {
      return { largura: bitmap.width, altura: bitmap.height };
    }).catch(function () { return null; });
  }

  // Reduz a foto no navegador antes de enviar (até 1600 px, JPEG): envio mais rápido e
  // dentro do limite da hospedagem. Se o navegador não conseguir, envia o original.
  function reduzirFoto(arquivo) {
    if (!window.createImageBitmap) return Promise.resolve(arquivo);
    return createImageBitmap(arquivo).then(function (bitmap) {
      var escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      var tela = document.createElement('canvas');
      tela.width = Math.round(bitmap.width * escala);
      tela.height = Math.round(bitmap.height * escala);
      var ctx = tela.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, tela.width, tela.height);
      ctx.drawImage(bitmap, 0, 0, tela.width, tela.height);
      return new Promise(function (ok) { tela.toBlob(function (blob) { ok(blob || arquivo); }, 'image/jpeg', 0.88); });
    }).catch(function () { return arquivo; });
  }

  function enviarFoto(arquivo) {
    return reduzirFoto(arquivo).then(function (conteudo) {
      var dados = new FormData();
      dados.append('acao', 'enviarFoto');
      dados.append('nome', rascunho.nome || 'produto');
      dados.append('foto', conteudo, (arquivo.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg');
      return fetch('api.php?acao=enviarFoto', {
        method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf }, body: dados
      }).then(tratarResposta);
    });
  }

  $('#enviar-fotos').addEventListener('change', function (ev) {
    var arquivos = Array.from(ev.target.files || []);
    ev.target.value = '';
    if (!arquivos.length || !rascunho) return;
    var status = $('#envio-status');
    var feitos = 0;
    var falhas = [];
    var alertas = [];
    status.textContent = 'Enviando ' + arquivos.length + ' foto(s)…';
    arquivos.reduce(function (fila, arquivo) {
      return fila.then(function () {
        // Mede a foto original (antes da redução) para avisar sobre resolução e formato.
        return medirFoto(arquivo).then(function (medida) {
          return enviarFoto(arquivo).then(function (r) {
            if (medida) {
              problemasDaFoto(medida.largura, medida.altura).forEach(function (p) { alertas.push(arquivo.name + ': ' + p + '.'); });
            }
            if (!rascunho) return;
            rascunho.imagens.push({ caminho: r.caminho, regras: [] });
            alterado = true;
            feitos += 1;
            desenharFotos();
          });
        }).catch(function (erro) { falhas.push(arquivo.name + ': ' + erro.message); });
      });
    }, Promise.resolve()).then(function () {
      status.innerHTML = esc(feitos + ' foto(s) enviada(s).' + (falhas.length ? ' Falharam: ' + falhas.join(' · ') : '') +
        (feitos ? ' Lembre de salvar o produto.' : '')) +
        (alertas.length ? '<br><span class="envio-alerta">Atenção, confira a prévia: ' + esc(alertas.join(' ')) +
          ' Veja "Como preparar as fotos".</span>' : '');
    });
  });

  /* ---- salvar ---- */

  function produtoDoModelo() {
    var tamanhos = rascunho.tamanhos.map(function (t) { return t.texto.trim(); });
    var porChave = {};
    rascunho.tamanhos.forEach(function (t) { porChave[t.k] = t.texto.trim(); });
    var idsUsados = rascunho.embalagens.map(function (e) { return e.id; }).filter(Boolean);
    var embalagens = rascunho.modoPreco === 'embalagens' ? rascunho.embalagens.map(function (e) {
      if (!e.id) {
        // Id estável, criado a partir da quantidade e dos tamanhos (ex.: "16-unidades-g").
        var parcial = e.tam.length < rascunho.tamanhos.length;
        var base = slug(e.rotulo + (parcial ? ' ' + e.tam.map(function (k) { return codigoTamanho(porChave[k]); }).join(' ') : '')).slice(0, 60);
        var id = base;
        for (var n = 2; idsUsados.indexOf(id) !== -1; n++) id = base + '-' + n;
        idsUsados.push(id);
        e.id = id;
      }
      return {
        id: e.id,
        rotulo: e.rotulo.trim(),
        precoCentavos: paraCentavos(e.preco),
        tamanhos: e.tam.map(function (k) { return porChave[k]; }).filter(Boolean),
        ativo: e.ativo
      };
    }) : [];
    var idPorChave = {};
    rascunho.embalagens.forEach(function (e) { idPorChave[e.k] = e.id; });
    var fotosPorOpcao = [];
    rascunho.imagens.forEach(function (img) {
      img.regras.forEach(function (r) {
        var regra = { imagem: img.caminho };
        if (r.tamanho && porChave[r.tamanho]) regra.tamanho = codigoTamanho(porChave[r.tamanho]);
        if (r.embalagem && embalagens.length && idPorChave[r.embalagem]) regra.embalagem = idPorChave[r.embalagem];
        if (regra.tamanho || regra.embalagem) fotosPorOpcao.push(regra);
      });
    });
    return {
      nome: rascunho.nome.trim(),
      categoria: rascunho.categoria,
      marca: rascunho.marca.trim(),
      descricao: rascunho.descricao.trim(),
      tamanhos: tamanhos,
      precoCentavos: rascunho.modoPreco === 'unico' ? paraCentavos(rascunho.preco) : undefined,
      embalagens: embalagens,
      imagens: rascunho.imagens.map(function (i) { return i.caminho; }),
      fotosPorOpcao: fotosPorOpcao,
      informacoes: rascunho.informacoes,
      palavrasChave: rascunho.palavrasChave.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      destaque: rascunho.destaque,
      ativo: rascunho.ativo,
      ordem: rascunho.ordem,
      embalagemCapa: embalagens.length && rascunho.capa ? idPorChave[rascunho.capa] : undefined
    };
  }

  function mostrarErros(lista) {
    var caixa = $('#editor-erros');
    caixa.innerHTML = '<strong>Corrija antes de salvar:</strong><ul>' + lista.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
    caixa.hidden = false;
    caixa.scrollIntoView({ block: 'center' });
  }

  $('#form-produto').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var produto = produtoDoModelo();
    var erros = [];
    if (!produto.nome) erros.push('Informe o nome do produto.');
    if (!produto.descricao) erros.push('Informe a descrição.');
    if (produto.tamanhos.some(function (t) { return !t; })) erros.push('Preencha ou remova os tamanhos vazios.');
    if (rascunho.modoPreco === 'unico' && !produto.precoCentavos) erros.push('Informe o preço (formato 54,90).');
    if (rascunho.modoPreco === 'embalagens') {
      if (!produto.embalagens.length) erros.push('Cadastre pelo menos uma embalagem.');
      produto.embalagens.forEach(function (e, i) {
        if (!e.rotulo) erros.push('Embalagem ' + (i + 1) + ': informe a quantidade (ex.: 16 unidades).');
        if (!e.precoCentavos) erros.push('Embalagem ' + (e.rotulo || i + 1) + ': informe o preço (formato 42,90).');
        if (!e.tamanhos.length) erros.push('Embalagem ' + (e.rotulo || i + 1) + ': marque em que tamanhos ela existe.');
      });
    }
    if (!produto.imagens.length) erros.push('Envie pelo menos uma foto.');
    if (erros.length) { mostrarErros(erros); return; }
    var botoes = document.querySelectorAll('#form-produto [type=submit]');
    botoes.forEach(function (b) { b.disabled = true; });
    alterar('salvarProduto', { id: editandoId || undefined, produto: produto }).then(function (r) {
      alterado = false;
      aviso('"' + r.produto.nome + '" salvo. O site já mostra a versão nova.');
      irPara('produtos');
    }).catch(function (err) {
      if (err.lista) mostrarErros(err.lista); else if (!err.conflito) mostrarErros([err.message]);
    }).then(function () { botoes.forEach(function (b) { b.disabled = false; }); });
  });

  /* ------------------------------------------------------------------ */
  /* Categorias                                                          */
  /* ------------------------------------------------------------------ */

  var categoriasEditadas = [];

  function usoDaCategoria(id) {
    return loja.produtos.concat(loja.lixeira).filter(function (p) { return p.categoria === id; }).length;
  }

  function desenharCategorias() {
    categoriasEditadas = loja.categorias.map(function (c) { return { id: c.id, nome: c.nome }; });
    renderCategorias();
  }

  function renderCategorias() {
    $('#lista-categorias').innerHTML = categoriasEditadas.map(function (c, i) {
      var uso = c.id ? usoDaCategoria(c.id) : 0;
      return '<li data-i="' + i + '"><input data-campo="categoria" value="' + esc(c.nome) + '" maxlength="60" aria-label="Nome da categoria ' + (i + 1) + '">' +
        '<span class="dica">' + (uso ? uso + ' produto' + (uso > 1 ? 's' : '') : 'vazia') + '</span>' +
        '<button type="button" class="btn btn--sm btn--contorno" data-mover-cat="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Subir">▲</button>' +
        '<button type="button" class="btn btn--sm btn--contorno" data-mover-cat="1"' + (i === categoriasEditadas.length - 1 ? ' disabled' : '') + ' aria-label="Descer">▼</button>' +
        '<button type="button" class="btn btn--sm btn--perigo" data-remover-cat' + (uso ? ' disabled title="Mova os produtos antes de apagar"' : '') + ' aria-label="Apagar categoria">×</button></li>';
    }).join('');
  }

  $('#lista-categorias').addEventListener('input', function (ev) {
    categoriasEditadas[ev.target.closest('li').dataset.i].nome = ev.target.value;
  });

  $('#secao-categorias').addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    var li = b.closest('li');
    var i = li ? Number(li.dataset.i) : -1;
    if (b.dataset.adicionar === 'categoria') {
      categoriasEditadas.push({ id: '', nome: '' });
      renderCategorias();
      $('#lista-categorias li:last-child input').focus();
    } else if (b.dataset.moverCat) {
      var j = i + Number(b.dataset.moverCat);
      var tmp = categoriasEditadas[i]; categoriasEditadas[i] = categoriasEditadas[j]; categoriasEditadas[j] = tmp;
      renderCategorias();
    } else if (b.hasAttribute('data-remover-cat')) {
      categoriasEditadas.splice(i, 1);
      renderCategorias();
    } else if (b.id === 'salvar-categorias') {
      b.disabled = true;
      alterar('salvarCategorias', { categorias: categoriasEditadas })
        .then(function () { aviso('Categorias salvas.'); })
        .catch(function (err) { aviso(err.lista ? err.lista.join(' ') : err.message, true); })
        .then(function () { b.disabled = false; });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Lixeira                                                             */
  /* ------------------------------------------------------------------ */

  function desenharLixeira() {
    $('#lista-lixeira').innerHTML = loja.lixeira.map(function (p) {
      return '<li data-id="' + esc(p.id) + '"><div class="prod">' + foto((p.imagens || [])[0]) +
        '<div><strong>' + esc(p.nome) + '</strong><small>Excluído em ' + esc(dataHora(p.excluidoEm)) + '</small></div></div>' +
        '<div class="acoes-linha"><button type="button" class="btn btn--sm btn--primario" data-restaurar>Restaurar</button>' +
        '<button type="button" class="btn btn--sm btn--perigo" data-apagar>Excluir de vez</button></div></li>';
    }).join('') || '<li class="dica">A lixeira está vazia.</li>';
  }

  $('#lista-lixeira').addEventListener('click', function (ev) {
    var li = ev.target.closest('li[data-id]');
    if (!li) return;
    var p = loja.lixeira.find(function (x) { return x.id === li.dataset.id; });
    if (ev.target.closest('[data-restaurar]')) {
      alterar('restaurarProduto', { id: p.id })
        .then(function () { aviso('"' + p.nome + '" voltou para os produtos.'); })
        .catch(function (err) { aviso(err.message, true); });
    } else if (ev.target.closest('[data-apagar]')) {
      if (!confirm('Excluir "' + p.nome + '" de vez? Ele só poderá voltar restaurando uma versão do Histórico.')) return;
      alterar('excluirDefinitivo', { id: p.id })
        .then(function () { aviso('"' + p.nome + '" excluído.'); })
        .catch(function (err) { aviso(err.message, true); });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Histórico                                                           */
  /* ------------------------------------------------------------------ */

  function carregarHistorico() {
    $('#lista-historico').innerHTML = '<li class="dica">Carregando…</li>';
    api('listarHistorico').then(function (r) {
      $('#lista-historico').innerHTML = r.versoes.map(function (v) {
        return '<li data-arquivo="' + esc(v.arquivo) + '"><div><strong>' + esc(dataHora(v.salvoEm || v.copiadoEm)) + '</strong>' +
          '<small>' + (v.produtos == null ? '?' : v.produtos) + ' produtos' + (v.lixeira ? ' · ' + v.lixeira + ' na lixeira' : '') + '</small></div>' +
          '<button type="button" class="btn btn--sm btn--contorno" data-restaurar-versao>Restaurar esta versão</button></li>';
      }).join('') || '<li class="dica">Ainda não há versões guardadas. Elas aparecem a partir da segunda alteração salva.</li>';
    }).catch(function (err) { $('#lista-historico').innerHTML = '<li class="erro">' + esc(err.message) + '</li>'; });
  }

  $('#lista-historico').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-restaurar-versao]');
    if (!b) return;
    var li = b.closest('li');
    if (!confirm('Voltar o catálogo inteiro para a versão de ' + li.querySelector('strong').textContent + '? A versão atual fica guardada no Histórico.')) return;
    b.disabled = true;
    alterar('restaurarVersao', { arquivo: li.dataset.arquivo })
      .then(function () { aviso('Versão restaurada.'); carregarHistorico(); })
      .catch(function (err) { aviso(err.message, true); b.disabled = false; });
  });

  /* ------------------------------------------------------------------ */
  /* Login                                                               */
  /* ------------------------------------------------------------------ */

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
    if (alterado && !confirm('Sair sem salvar o produto em edição?')) return;
    alterado = false;
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
          erro.innerHTML = 'O painel ainda não tem uma senha configurada. ' +
            '<a href="instalar.php">Configurar o acesso</a>.';
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
