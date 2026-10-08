/* Carrinho local: guarda somente referências; preços vêm do catálogo atual. */
(function () {
  'use strict';
  var L = window.Ligue;
  var CHAVE = 'ligue-fraldas-carrinho-v1';
  var itens = [];
  var catalogo;
  var dialogo;
  var aviso;
  var retorno;
  var pronto;

  function ler() {
    try {
      var dados = JSON.parse(localStorage.getItem(CHAVE) || '[]');
      return Array.isArray(dados) ? dados : [];
    } catch (e) { return []; }
  }

  function validar(dados) {
    var validos = [];
    dados.forEach(function (item) {
      if (!item || typeof item.id !== 'string') return;
      var p = catalogo.porId.get(item.id);
      if (!p || !p.precoCentavos || p.tamanhos.indexOf(item.tamanho) === -1 ||
          !Number.isInteger(item.quantidade) || item.quantidade < 1) return;
      var existente = validos.find(function (i) { return i.id === item.id && i.tamanho === item.tamanho; });
      if (existente) existente.quantidade = Math.min(99, existente.quantidade + item.quantidade);
      else validos.push({ id: item.id, tamanho: item.tamanho, quantidade: Math.min(99, item.quantidade) });
    });
    return validos;
  }

  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(itens)); }
    catch (e) { aviso.textContent = 'Seu carrinho funciona nesta página, mas este navegador não permitiu salvá-lo.'; }
  }

  function carregar() {
    if (!pronto) {
      pronto = L.carregarCatalogo().then(function (dados) {
        catalogo = dados;
        itens = validar(ler());
        renderizar();
      }).catch(function (erro) { pronto = null; throw erro; });
    }
    return pronto;
  }

  function mensagem() {
    var total = 0;
    var nome = dialogo.querySelector('[data-carrinho-nome]').value.trim().replace(/\s+/g, ' ');
    var linhas = ['Oi, me chamo ' + nome + '! Gostaria dos seguintes itens:', ''];
    itens.forEach(function (item) {
      var p = catalogo.porId.get(item.id);
      var subtotal = p.precoCentavos * item.quantidade;
      total += subtotal;
      linhas.push('• ' + p.nome + ' — ' + item.tamanho + ' — ' +
        L.plural(item.quantidade, 'pacote', 'pacotes') + ' × ' + L.moeda(p.precoCentavos) + ' = ' + L.moeda(subtotal));
    });
    linhas.push('', 'Total dos produtos: ' + L.moeda(total), '', 'Por gentileza.');
    return linhas.join('\n');
  }

  function renderizar() {
    var quantidade = 0;
    var total = 0;
    dialogo.querySelector('[data-carrinho-itens]').innerHTML = itens.map(function (item, i) {
      var p = catalogo.porId.get(item.id);
      var subtotal = p.precoCentavos * item.quantidade;
      quantidade += item.quantidade;
      total += subtotal;
      return '<li class="carrinho-item">' +
        L.imagemProduto(p.imagens[0], p.nome, 'width="72" height="72"') +
        '<div class="carrinho-item__info"><a href="' + L.urlProduto(p.id) + '"><strong>' + L.esc(p.nome) + '</strong></a>' +
        '<p>' + L.esc(item.tamanho) + '</p><p>' + L.moeda(p.precoCentavos) + ' por pacote</p>' +
        '<div class="carrinho-item__controles"><label>Pacotes <input type="number" min="1" max="99" step="1" value="' + item.quantidade + '"' +
        ' data-quantidade="' + i + '" aria-label="Quantidade de pacotes de ' + L.esc(p.nome + ', ' + item.tamanho) + '"></label>' +
        '<button type="button" data-remover="' + i + '" aria-label="Remover ' + L.esc(p.nome + ', ' + item.tamanho) + '">Remover</button></div>' +
        '<strong class="carrinho-item__subtotal">Subtotal: ' + L.moeda(subtotal) + '</strong></div></li>';
    }).join('');
    document.querySelectorAll('[data-carrinho-contagem]').forEach(function (el) { el.textContent = quantidade; });
    dialogo.querySelector('[data-carrinho-vazio]').hidden = itens.length > 0;
    dialogo.querySelector('[data-carrinho-total]').textContent = L.moeda(total);
    dialogo.querySelector('[data-carrinho-pedido]').hidden = !itens.length;
    dialogo.querySelector('[data-carrinho-mensagem]').value = itens.length ? mensagem() : '';
  }

  function abrir() {
    if (!dialogo.open) {
      retorno = document.activeElement;
      dialogo.showModal();
      document.body.classList.add('carrinho-aberto');
    }
    carregar().catch(function () {
      aviso.textContent = 'Não foi possível carregar o carrinho. Confira sua conexão e tente novamente.';
    });
  }

  L.adicionarAoCarrinho = function (id, tamanho) {
    return carregar().then(function () {
      var p = catalogo.porId.get(id);
      if (!p || !p.precoCentavos || p.tamanhos.indexOf(tamanho) === -1) return false;
      var item = itens.find(function (i) { return i.id === id && i.tamanho === tamanho; });
      if (item && item.quantidade >= 99) {
        abrir();
        aviso.textContent = 'Limite de 99 pacotes por tamanho. Para quantidades maiores, fale com a loja.';
        return false;
      }
      if (item) item.quantidade += 1;
      else itens.push({ id: id, tamanho: tamanho, quantidade: 1 });
      aviso.textContent = p.nome + ' adicionado ao carrinho.';
      salvar();
      renderizar();
      abrir();
      return true;
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    dialogo = document.createElement('dialog');
    dialogo.className = 'carrinho';
    dialogo.id = 'carrinho';
    dialogo.setAttribute('aria-labelledby', 'carrinho-titulo');
    dialogo.innerHTML = '<div class="carrinho__cabecalho"><h2 id="carrinho-titulo">Seu carrinho</h2>' +
      '<button type="button" class="icone-btn" data-carrinho-fechar aria-label="Fechar carrinho" autofocus>' + L.icone('fechar') + '</button></div>' +
      '<p class="carrinho__aviso" role="status" aria-live="polite" data-carrinho-aviso></p>' +
      '<p data-carrinho-vazio>Seu carrinho está vazio. Escolha um produto e seu tamanho para começar.</p>' +
      '<ul class="carrinho__itens" data-carrinho-itens></ul>' +
      '<div class="carrinho__rodape"><p class="carrinho__total">Total dos produtos <strong data-carrinho-total>R$ 0,00</strong></p>' +
      '<p class="produto__dica">A loja confirma disponibilidade, entrega e pagamento pelo WhatsApp.</p>' +
      '<form class="carrinho__pedido" data-carrinho-pedido action="https://wa.me/' + L.esc(window.LIGUE_CONFIG.whatsapp.numero) + '" method="get" target="_blank" rel="noopener" hidden>' +
      '<label for="carrinho-nome">Seu nome</label>' +
      '<input id="carrinho-nome" type="text" data-carrinho-nome autocomplete="name" placeholder="Como podemos chamar você?" maxlength="80" required aria-describedby="carrinho-nome-dica">' +
      '<p class="produto__dica" id="carrinho-nome-dica">Seu nome vai junto com o pedido na mensagem do WhatsApp.</p>' +
      '<input type="hidden" name="text" data-carrinho-mensagem>' +
      '<button type="submit" class="btn btn--wa btn--bloco" data-carrinho-finalizar>' + L.icone('whatsapp') + 'Finalizar pelo WhatsApp</button></form>' +
      '<button type="button" class="btn btn--contorno btn--bloco" data-carrinho-fechar>Continuar comprando</button></div>';
    document.body.appendChild(dialogo);
    aviso = dialogo.querySelector('[data-carrinho-aviso]');
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-carrinho-abrir]')) abrir();
      if (e.target.closest('[data-carrinho-fechar]')) dialogo.close();
      var remover = e.target.closest('[data-remover]');
      if (remover) {
        var indice = Number(remover.dataset.remover);
        var nome = catalogo.porId.get(itens[indice].id).nome;
        itens.splice(indice, 1);
        aviso.textContent = nome + ' removido do carrinho.';
        salvar();
        renderizar();
        var proximo = dialogo.querySelector('[data-remover="' + Math.min(indice, itens.length - 1) + '"]');
        (proximo || dialogo.querySelector('[data-carrinho-fechar]')).focus();
      }
    });
    dialogo.addEventListener('close', function () {
      document.body.classList.remove('carrinho-aberto');
      if (retorno && retorno.isConnected) retorno.focus();
    });
    dialogo.addEventListener('input', function (e) {
      if (!e.target.matches('[data-carrinho-nome]')) return;
      e.target.setCustomValidity(e.target.value.trim() ? '' : 'Informe seu nome para continuar.');
      dialogo.querySelector('[data-carrinho-mensagem]').value = itens.length ? mensagem() : '';
    });
    dialogo.addEventListener('change', function (e) {
      if (!e.target.matches('[data-quantidade]')) return;
      var indice = Number(e.target.dataset.quantidade);
      var quantidade = Number(e.target.value);
      if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 99) {
        e.target.value = itens[indice].quantidade;
        aviso.textContent = 'Informe uma quantidade inteira de 1 a 99 pacotes.';
        return;
      }
      itens[indice].quantidade = quantidade;
      aviso.textContent = 'Quantidade e total atualizados.';
      salvar();
      renderizar();
      dialogo.querySelector('[data-quantidade="' + indice + '"]').focus();
    });
    document.addEventListener('submit', function (e) {
      if (e.target.matches('[data-carrinho-pedido]')) {
        var nome = dialogo.querySelector('[data-carrinho-nome]');
        nome.value = nome.value.trim().replace(/\s+/g, ' ');
        nome.setCustomValidity(nome.value ? '' : 'Informe seu nome para continuar.');
        if (!itens.length || !e.target.reportValidity()) {
          e.preventDefault();
          return;
        }
        dialogo.querySelector('[data-carrinho-mensagem]').value = mensagem();
        return;
      }
      var form = e.target.closest('[data-compra-card]');
      if (!form) return;
      e.preventDefault();
      L.adicionarAoCarrinho(form.dataset.compraCard, form.elements.tamanho.value).catch(function () {
        abrir();
        aviso.textContent = 'Não foi possível adicionar o produto. Tente novamente.';
      });
    });
    window.addEventListener('storage', function (e) {
      if ((e.key === CHAVE || e.key === null) && catalogo) {
        itens = validar(ler());
        renderizar();
      }
    });
    carregar().catch(function () { /* Abrir o carrinho permite tentar novamente. */ });
  });
})();
