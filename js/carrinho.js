/* Carrinho local: guarda somente referências; preços vêm do catálogo atual. */
(function () {
  'use strict';
  var L = window.Ligue;
  var CHAVE = 'ligue-fraldas-carrinho-v1';
  var CHAVE_PEDIDO = 'ligue-fraldas-pedido-v1';
  var LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I, que se confundem ao ditar
  var itens = [];
  var catalogo;
  var dialogo;
  var aviso;
  var retorno;
  var pronto;
  var canal = 'whatsapp';
  var pedidoAtual = null;

  // Número do pedido: o mesmo enquanto o carrinho não muda. Se o cliente mandar o mesmo
  // carrinho pelo WhatsApp e por e-mail, a loja vê o mesmo número e não separa duas vezes.
  function numeroPedido() {
    var assinatura = JSON.stringify(itens);
    if (!pedidoAtual) {
      try { pedidoAtual = JSON.parse(localStorage.getItem(CHAVE_PEDIDO) || 'null'); } catch (e) { pedidoAtual = null; }
    }
    if (pedidoAtual && pedidoAtual.assinatura === assinatura && /^LF-\d{6}-[A-HJ-NP-Z2-9]{4}$/.test(pedidoAtual.numero)) {
      return pedidoAtual.numero;
    }
    var sorteio = new Uint8Array(4);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(sorteio);
    else for (var i = 0; i < sorteio.length; i++) sorteio[i] = Math.floor(Math.random() * 256);
    var d = new Date();
    var data = String(d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    pedidoAtual = {
      numero: 'LF-' + data + '-' + Array.from(sorteio, function (n) { return LETRAS[n % LETRAS.length]; }).join(''),
      assinatura: assinatura
    };
    try { localStorage.setItem(CHAVE_PEDIDO, JSON.stringify(pedidoAtual)); } catch (e) { /* vale só nesta página */ }
    return pedidoAtual.numero;
  }

  function ler() {
    try {
      var dados = JSON.parse(localStorage.getItem(CHAVE) || '[]');
      return Array.isArray(dados) ? dados : [];
    } catch (e) { return []; }
  }

  var removidos = 0;

  function validar(dados) {
    var validos = [];
    removidos = 0;
    dados.forEach(function (item) {
      if (!item || typeof item.id !== 'string') return;
      var p = catalogo.porId.get(item.id);
      var d = L.resolverItem(p, item.tamanho, item.embalagem || '');
      if (!d || !Number.isInteger(item.quantidade) || item.quantidade < 1) { removidos += 1; return; }
      var existente = validos.find(function (i) { return i.id === item.id && i.tamanho === item.tamanho && i.embalagem === d.embalagem; });
      if (existente) existente.quantidade = Math.min(99, existente.quantidade + item.quantidade);
      else validos.push({ id: item.id, tamanho: item.tamanho, embalagem: d.embalagem, quantidade: Math.min(99, item.quantidade) });
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
        if (removidos) {
          aviso.textContent = 'Saiu do seu carrinho o que ficou fora de estoque ou mudou no catálogo. Confira os itens.';
          salvar();
        }
      }).catch(function (erro) { pronto = null; throw erro; });
    }
    return pronto;
  }

  function detalhe(item) {
    return L.resolverItem(catalogo.porId.get(item.id), item.tamanho, item.embalagem || '');
  }

  function mensagem() {
    var total = 0;
    var nome = dialogo.querySelector('[data-carrinho-nome]').value.trim().replace(/\s+/g, ' ');
    var linhas = ['Oi, me chamo ' + nome + '! Gostaria dos seguintes itens:', 'Pedido nº ' + numeroPedido(), ''];
    itens.forEach(function (item) {
      var p = catalogo.porId.get(item.id);
      var d = detalhe(item);
      var subtotal = d.preco * item.quantidade;
      total += subtotal;
      linhas.push('• ' + p.nome + ' — ' + d.descricao + ' — ' +
        L.plural(item.quantidade, 'pacote', 'pacotes') + ' × ' + L.moeda(d.preco) + ' = ' + L.moeda(subtotal));
    });
    linhas.push('', 'Total dos produtos: ' + L.moeda(total), '', 'Por gentileza.');
    return linhas.join('\n');
  }

  function renderizar() {
    var quantidade = 0;
    var total = 0;
    dialogo.querySelector('[data-carrinho-itens]').innerHTML = itens.map(function (item, i) {
      var p = catalogo.porId.get(item.id);
      var d = detalhe(item);
      var subtotal = d.preco * item.quantidade;
      quantidade += item.quantidade;
      total += subtotal;
      // Foto da opção comprada (ex.: Bigfral XG com 7 unidades), não a capa do produto.
      var foto = L.fotoDaOpcao(p, item.tamanho, item.embalagem) || p.imagens[0];
      return '<li class="carrinho-item">' +
        L.imagemProduto(foto, p.nome + ', ' + d.descricao, 'width="72" height="72"') +
        '<div class="carrinho-item__info"><a href="' + L.urlProduto(p.id) + '"><strong>' + L.esc(p.nome) + '</strong></a>' +
        '<p>' + L.esc(d.descricao) + '</p><p>' + L.moeda(d.preco) + ' por pacote</p>' +
        '<div class="carrinho-item__controles"><label>Pacotes <input type="number" min="1" max="99" step="1" value="' + item.quantidade + '"' +
        ' data-quantidade="' + i + '" aria-label="Quantidade de pacotes de ' + L.esc(p.nome + ', ' + d.descricao) + '"></label>' +
        '<button type="button" data-remover="' + i + '" aria-label="Remover ' + L.esc(p.nome + ', ' + d.descricao) + '">Remover</button></div>' +
        '<strong class="carrinho-item__subtotal">Subtotal: ' + L.moeda(subtotal) + '</strong></div></li>';
    }).join('');
    document.querySelectorAll('[data-carrinho-contagem]').forEach(function (el) { el.textContent = quantidade; });
    dialogo.querySelector('[data-carrinho-vazio]').hidden = itens.length > 0;
    dialogo.querySelector('[data-carrinho-total]').textContent = L.moeda(total);
    dialogo.querySelector('[data-carrinho-pedido]').hidden = !itens.length;
    dialogo.querySelector('[data-carrinho-numero]').textContent = itens.length ? numeroPedido() : '';
    dialogo.querySelector('[data-carrinho-mensagem]').value = itens.length ? mensagem() : '';
    if (itens.length) dialogo.querySelector('[data-carrinho-enviado]').hidden = true;
  }

  // WhatsApp abre a conversa com o pedido escrito; e-mail é enviado pelo site (pedido.php).
  function escolherCanal(novo) {
    canal = novo;
    dialogo.querySelectorAll('[data-canal]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.canal === canal)); });
    var porEmail = canal === 'email';
    dialogo.querySelector('[data-campos-email]').hidden = !porEmail;
    // Desativados no WhatsApp: um e-mail mal digitado escondido não pode travar o envio.
    var telefone = dialogo.querySelector('[data-carrinho-telefone]');
    telefone.required = porEmail;
    telefone.disabled = !porEmail;
    dialogo.querySelector('[data-carrinho-email]').disabled = !porEmail;
    var botao = dialogo.querySelector('[data-carrinho-finalizar]');
    botao.classList.toggle('btn--wa', !porEmail);
    botao.classList.toggle('btn--primario', porEmail);
    botao.querySelector('use').setAttribute('href', porEmail ? '#i-email' : '#i-whatsapp');
    botao.querySelector('span').textContent = porEmail ? 'Enviar pedido por e-mail' : 'Finalizar pelo WhatsApp';
  }

  function validarTelefone(campo) {
    var digitos = campo.value.replace(/\D/g, '').length;
    campo.setCustomValidity(digitos >= 10 && digitos <= 13 ? '' : 'Informe o telefone com DDD, por exemplo (21) 99999-9999.');
  }

  function enviarPorEmail() {
    var botao = dialogo.querySelector('[data-carrinho-finalizar]');
    var telefone = dialogo.querySelector('[data-carrinho-telefone]').value.trim();
    var numero = numeroPedido();
    botao.disabled = true;
    aviso.textContent = 'Enviando o pedido ' + numero + '…';
    fetch('pedido.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numero: numero,
        nome: dialogo.querySelector('[data-carrinho-nome]').value,
        telefone: telefone,
        email: dialogo.querySelector('[data-carrinho-email]').value.trim(),
        site: dialogo.querySelector('[data-carrinho-isca]').value,
        itens: itens.map(function (i) { return { id: i.id, tamanho: i.tamanho, embalagem: i.embalagem || '', quantidade: i.quantidade }; })
      })
    }).then(function (r) {
      return r.json().catch(function () { return { erro: 'Resposta inválida do servidor (' + r.status + ').' }; }).then(function (j) {
        if (!r.ok || !j.ok) throw new Error(j.erro || 'Não foi possível enviar o pedido (' + r.status + ').');
        return j;
      });
    }).then(function (j) {
      itens = [];
      salvar();
      renderizar();
      aviso.textContent = '';
      var enviado = dialogo.querySelector('[data-carrinho-enviado]');
      enviado.innerHTML = '<strong>Pedido ' + L.esc(j.numero) + ' enviado!</strong> A loja recebeu seu pedido por e-mail e vai ' +
        'falar com você pelo telefone ' + L.esc(telefone) + ' para confirmar disponibilidade, entrega e pagamento.';
      enviado.hidden = false;
      enviado.focus();
    }).catch(function (erro) {
      aviso.textContent = erro.message + ' Se preferir, escolha WhatsApp e envie por lá.';
    }).then(function () { botao.disabled = false; });
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

  L.adicionarAoCarrinho = function (id, tamanho, embalagem) {
    return carregar().then(function () {
      var p = catalogo.porId.get(id);
      var d = L.resolverItem(p, tamanho, embalagem || '');
      if (!d) return false;
      var item = itens.find(function (i) { return i.id === id && i.tamanho === tamanho && i.embalagem === d.embalagem; });
      if (item && item.quantidade >= 99) {
        abrir();
        aviso.textContent = 'Limite de 99 pacotes por tamanho. Para quantidades maiores, fale com a loja.';
        return false;
      }
      if (item) item.quantidade += 1;
      else itens.push({ id: id, tamanho: tamanho, embalagem: d.embalagem, quantidade: 1 });
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
      '<div class="carrinho__enviado" role="status" tabindex="-1" data-carrinho-enviado hidden></div>' +
      '<p data-carrinho-vazio>Seu carrinho está vazio. Escolha um produto e seu tamanho para começar.</p>' +
      '<ul class="carrinho__itens" data-carrinho-itens></ul>' +
      '<div class="carrinho__rodape"><p class="carrinho__total">Total dos produtos <strong data-carrinho-total>R$ 0,00</strong></p>' +
      '<p class="produto__dica">A loja confirma disponibilidade, entrega e pagamento depois de receber o pedido.</p>' +
      // Só o campo "text" tem name: é o único que vai no endereço do WhatsApp (nada de telefone ou e-mail na URL).
      '<form class="carrinho__pedido" data-carrinho-pedido action="https://wa.me/' + L.esc(window.LIGUE_CONFIG.whatsapp.numero) + '" method="get" target="_blank" rel="noopener" hidden>' +
      '<p class="carrinho__numero">Pedido nº <strong data-carrinho-numero></strong></p>' +
      '<label for="carrinho-nome">Seu nome</label>' +
      '<input id="carrinho-nome" type="text" data-carrinho-nome autocomplete="name" placeholder="Como podemos chamar você?" maxlength="80" required aria-describedby="carrinho-nome-dica">' +
      '<p class="produto__dica" id="carrinho-nome-dica">Seu nome vai junto com o pedido.</p>' +
      '<div class="carrinho__canais" role="group" aria-labelledby="carrinho-canais-titulo">' +
        '<span id="carrinho-canais-titulo">Enviar o pedido por</span>' +
        '<button type="button" class="carrinho__canal" data-canal="whatsapp" aria-pressed="true">' + L.icone('whatsapp') + 'WhatsApp</button>' +
        '<button type="button" class="carrinho__canal" data-canal="email" aria-pressed="false">' + L.icone('email') + 'E-mail</button>' +
      '</div>' +
      '<div class="carrinho__campos-email" data-campos-email hidden>' +
        '<label for="carrinho-telefone">Telefone ou WhatsApp</label>' +
        '<input id="carrinho-telefone" type="tel" data-carrinho-telefone autocomplete="tel" inputmode="tel" maxlength="20" placeholder="(21) 99999-9999" aria-describedby="carrinho-email-dica" disabled>' +
        '<label for="carrinho-email">Seu e-mail <small>(opcional)</small></label>' +
        '<input id="carrinho-email" type="email" data-carrinho-email autocomplete="email" maxlength="120" placeholder="voce@exemplo.com" disabled>' +
        '<p class="produto__dica" id="carrinho-email-dica">O pedido vai para o e-mail da loja, que fala com você pelo telefone informado.</p>' +
      '</div>' +
      '<input class="carrinho__isca" type="text" data-carrinho-isca tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<input type="hidden" name="text" data-carrinho-mensagem>' +
      '<button type="submit" class="btn btn--wa btn--bloco" data-carrinho-finalizar>' + L.icone('whatsapp') + '<span>Finalizar pelo WhatsApp</span></button></form>' +
      '<button type="button" class="btn btn--contorno btn--bloco" data-carrinho-fechar>Continuar comprando</button></div>';
    document.body.appendChild(dialogo);
    aviso = dialogo.querySelector('[data-carrinho-aviso]');
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-carrinho-abrir]')) abrir();
      if (e.target.closest('[data-carrinho-fechar]')) dialogo.close();
      var botaoCanal = e.target.closest('[data-canal]');
      if (botaoCanal) escolherCanal(botaoCanal.dataset.canal);
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
      if (e.target.matches('[data-carrinho-telefone]')) { validarTelefone(e.target); return; }
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
        if (canal === 'email') {
          e.preventDefault();
          validarTelefone(dialogo.querySelector('[data-carrinho-telefone]'));
          if (itens.length && e.target.reportValidity()) enviarPorEmail();
          return;
        }
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
