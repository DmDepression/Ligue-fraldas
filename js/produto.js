/* Página individual do produto: produto.html?id=<id do produto> */
(function () {
  'use strict';

  var L = window.Ligue;
  var C = window.LIGUE_CONFIG;
  var esc = L.esc;

  document.addEventListener('DOMContentLoaded', function () {
    var alvo = document.querySelector('[data-produto]');
    if (!alvo) return;

    var id = new URLSearchParams(location.search).get('id') || '';
    var canonical = document.querySelector('link[rel="canonical"]');
    var baseSite = canonical ? canonical.href : location.href;

    L.aoRecarregar(alvo, carregar);
    carregar();

    function carregar() {
      alvo.setAttribute('aria-busy', 'true');
      L.carregarCatalogo().then(function (catalogo) {
        alvo.setAttribute('aria-busy', 'false');
        var produto = catalogo.porId.get(id);
        if (produto) mostrar(produto, catalogo);
        else naoEncontrado(catalogo);
      }).catch(function () {
        alvo.setAttribute('aria-busy', 'false');
        alvo.innerHTML = L.avisoErro(1);
      });
    }

    /* ---------------- produto ---------------- */

    function mostrar(p, catalogo) {
      var categoria = catalogo.categoria(p.categoria);
      var urlCategoria = 'catalogo.html?categoria=' + encodeURIComponent(p.categoria);

      document.querySelector('[data-migalhas]').insertAdjacentHTML('beforeend',
        '<li><a href="' + urlCategoria + '">' + esc(categoria.nome) + '</a></li>' +
        '<li><span aria-current="page">' + esc(p.nome) + '</span></li>');

      alvo.innerHTML =
        '<article class="produto">' +
          galeria(p) +
          '<div class="produto__info">' +
            '<p class="produto__categoria"><a href="' + urlCategoria + '">' + esc(categoria.nome) + '</a></p>' +
            '<h1 class="produto__nome">' + esc(p.nome) + '</h1>' +
            (p.marca ? '<p class="produto__marca">Marca: <strong>' + esc(p.marca) + '</strong></p>' : '') +
            descricao(p.descricao) +
            (p.precoCentavos ? '<p class="produto-preco produto-preco--grande" data-preco>' + textoPreco(p) + '</p>' : '') +
            opcoes(p) +
            '<div class="produto__cta">' +
              (p.precoCentavos ? '<button type="button" class="btn btn--primario btn--grande btn--bloco" data-produto-adicionar>' +
                L.icone('sacola') + '<span>Adicionar ao carrinho</span></button><p class="produto__dica" role="status" data-compra-aviso></p>' : '') +
              '<a class="btn btn--wa btn--grande btn--bloco" href="#" data-produto-whatsapp target="_blank" rel="noopener">' +
                L.icone('whatsapp') + '<span>Consultar pelo WhatsApp</span></a>' +
              '<a class="btn btn--contorno btn--grande btn--bloco" href="' + L.linkTelefone(0) + '">' +
                L.icone('telefone') + '<span>Ligar para a loja</span></a>' +
              '<p class="produto__nota">' + L.icone('info') +
                '<span>Disponibilidade, entrega e pagamento são confirmados pela loja no atendimento.</span></p>' +
            '</div>' +
            informacoes(p.informacoes) +
          '</div>' +
        '</article>';

      ligarGaleria(p);
      ligarOpcoes(p);
      ligarCompra(p);
      atualizarSeo(p, categoria);
      relacionados(p, catalogo, categoria, urlCategoria);

      document.querySelector('[data-barra-produto]').hidden = false;
      document.body.classList.add('com-barra-produto');
    }

    function textoPreco(p, embalagem) {
      var valor = embalagem ? embalagem.precoCentavos : p.precoCentavos;
      return (!embalagem && p.precosDiferem && p.mostrarPrecoAPartir ? '<small>a partir de </small>' : '') + L.moeda(valor) + '<small>por pacote</small>';
    }

    function codigoTamanho(rotulo) {
      return L.normalizar(String(rotulo || '').split(/[—–]/)[0]).replace(/\s+/g, '').replace(/\//g, '-');
    }

    function imagemDoTamanho(p, tamanho) {
      var codigo = codigoTamanho(tamanho);
      if (!codigo) return -1;
      return p.imagens.findIndex(function (src) {
        var nome = L.normalizar(src.split('/').pop().replace(/\.[^.]+$/, ''));
        return nome.endsWith('-' + codigo);
      });
    }

    function imagemDasOpcoes(p, tamanho, embalagem) {
      var codigo = codigoTamanho(tamanho);
      var fotos = p.fotosPorOpcao || [];
      var foto = null;
      if (codigo && embalagem) {
        foto = fotos.find(function (f) { return codigoTamanho(f.tamanho) === codigo && f.embalagem === embalagem; });
      }
      if (!foto && embalagem) {
        foto = fotos.find(function (f) { return !f.tamanho && f.embalagem === embalagem; });
      }
      if (!foto && codigo) {
        foto = fotos.find(function (f) { return codigoTamanho(f.tamanho) === codigo && !f.embalagem; });
      }
      return foto ? p.imagens.indexOf(foto.imagem) : imagemDoTamanho(p, tamanho);
    }

    function selecionarImagem(p, indice) {
      if (indice < 0 || indice >= p.imagens.length) return;
      var principal = alvo.querySelector('[data-imagem-principal]');
      if (!principal) return;
      principal.innerHTML = L.imagemProduto(p.imagens[indice], p.nome + ' — imagem da opção selecionada', 'width="800" height="800"');
      alvo.querySelectorAll('.miniatura').forEach(function (botao) {
        botao.setAttribute('aria-pressed', String(Number(botao.getAttribute('data-imagem')) === indice));
      });
    }

    function galeria(p) {
      var principal = p.imagens.length
        ? L.imagemProduto(p.imagens[0], p.nome, 'width="800" height="800" fetchpriority="high"')
        : L.semImagem();

      var miniaturas = p.imagens.length > 1
        ? '<ul class="produto__miniaturas">' + p.imagens.map(function (src, i) {
            return '<li><button type="button" class="miniatura" data-imagem="' + i + '" aria-pressed="' + (i === 0) + '"' +
              ' aria-label="Ver imagem ' + (i + 1) + ' de ' + p.imagens.length + '">' +
              '<img src="' + esc(src) + '" alt="" loading="lazy" width="96" height="96" data-fallback></button></li>';
          }).join('') + '</ul>'
        : '';

      return '<div class="produto__galeria"><div class="produto__imagem" data-imagem-principal>' + principal + '</div>' +
        miniaturas + '</div>';
    }

    function descricao(texto) {
      if (!texto) return '';
      return '<div class="produto__descricao">' + texto.split(/\n\s*\n/).map(function (paragrafo) {
        return '<p>' + esc(paragrafo.trim()).replace(/\n/g, '<br>') + '</p>';
      }).join('') + '</div>';
    }

    // Tamanhos e variações viram opções clicáveis; o que for escolhido entra na mensagem do WhatsApp.
    function gruposDeOpcoes(p) {
      var grupos = [];
      if (p.tamanhos.length) grupos.push({ nome: 'Tamanho', opcoes: p.tamanhos });
      if (p.embalagens.length) {
        grupos.push({
          nome: 'Embalagem',
          embalagens: p.embalagens,
          opcoes: p.embalagens.map(function (e) { return e.rotulo; })
        });
      }
      return grupos.concat(p.variacoes);
    }

    function opcoes(p) {
      var grupos = gruposDeOpcoes(p);
      if (!grupos.length) return '';
      var gruposVisiveis = grupos.filter(function (g) { return g.opcoes.length > 1; });
      if (!gruposVisiveis.length) return '';

      return '<form class="produto__opcoes" data-opcoes>' +
        gruposVisiveis.map(function (g, gi) {
          var unica = g.opcoes.length === 1;
          return '<fieldset class="opcoes">' +
            '<legend class="opcoes__titulo">' + esc(g.nome) + '</legend>' +
            '<div class="opcoes__lista">' + g.opcoes.map(function (o, oi) {
              var e = g.embalagens && g.embalagens[oi];
              return '<label class="opcao"><input type="radio" name="opcao-' + gi + '" value="' + esc(e ? e.id : o) + '"' +
                ' data-grupo="' + esc(g.nome) + '" data-rotulo="' + esc(o) + '"' +
                (e ? ' data-tamanhos="' + esc(e.tamanhos.join('|')) + '"' : '') + (unica ? ' checked' : '') + '>' +
                '<span>' + esc(o) + '</span></label>';
            }).join('') + '</div></fieldset>';
        }).join('') +
        '<p class="produto__dica">Escolha o tamanho e a embalagem (quantidade de unidades) antes de adicionar ao carrinho.</p>' +
        '</form>';
    }

    function informacoes(lista) {
      if (!lista.length) return '';
      return '<section class="produto__detalhes" aria-labelledby="detalhes-titulo">' +
        '<h2 class="produto__subtitulo" id="detalhes-titulo">Informações do produto</h2>' +
        '<dl class="tabela-info">' + lista.map(function (i) {
          return '<div class="tabela-info__linha' + (i.rotulo ? '' : ' tabela-info__linha--livre') + '">' +
            '<dt' + (i.rotulo ? '' : ' class="sr-only"') + '>' + esc(i.rotulo || 'Informação') + '</dt>' +
            '<dd>' + esc(i.valor) + '</dd></div>';
        }).join('') + '</dl></section>';
    }

    function ligarGaleria(p) {
      var principal = alvo.querySelector('[data-imagem-principal]');
      alvo.querySelectorAll('.miniatura').forEach(function (botao) {
        botao.addEventListener('click', function () {
          var i = Number(botao.getAttribute('data-imagem'));
          principal.innerHTML = L.imagemProduto(p.imagens[i], p.nome + ' — imagem ' + (i + 1), 'width="800" height="800"');
          alvo.querySelectorAll('.miniatura').forEach(function (b) {
            b.setAttribute('aria-pressed', String(b === botao));
          });
        });
      });
    }

    // Mostra só as embalagens que existem para o tamanho escolhido e atualiza o preço.
    function ajustarEmbalagens(p, form) {
      if (!form || !p.embalagens.length) return;
      var tamanhoMarcado = form.querySelector('input[data-grupo="Tamanho"]:checked');
      var tamanho = tamanhoMarcado ? tamanhoMarcado.value : (p.tamanhos.length === 1 ? p.tamanhos[0] : '');
      var radios = Array.from(form.querySelectorAll('input[data-grupo="Embalagem"]'));
      radios.forEach(function (r) {
        var permitidos = r.getAttribute('data-tamanhos');
        var ok = !permitidos || (tamanho && permitidos.split('|').indexOf(tamanho) !== -1);
        r.disabled = !ok;
        r.closest('.opcao').hidden = !ok && !!tamanhoMarcado;
        r.closest('.opcao').classList.toggle('opcao--indisponivel', !ok);
        if (!ok && r.checked) r.checked = false;
      });
      var disponiveis = radios.filter(function (r) { return !r.disabled; });
      if (tamanhoMarcado && disponiveis.length === 1) disponiveis[0].checked = true;
      var marcada = radios.find(function (r) { return r.checked; });
      var embalagem = marcada ? p.embalagens.find(function (e) { return e.id === marcada.value; }) : null;
      var preco = alvo.querySelector('[data-preco]');
      if (preco) preco.innerHTML = textoPreco(p, embalagem);
    }

    function ligarOpcoes(p) {
      var form = alvo.querySelector('[data-opcoes]');
      var atualizar = function () {
        ajustarEmbalagens(p, form);
        var escolhas = form
          ? Array.from(form.querySelectorAll('input:checked')).map(function (input) {
              return { nome: input.getAttribute('data-grupo'), valor: input.getAttribute('data-rotulo') || input.value };
            })
          : [];
        var tamanhoMarcado = form && form.querySelector('input[data-grupo="Tamanho"]:checked');
        var tamanho = tamanhoMarcado ? tamanhoMarcado.value : (p.tamanhos.length === 1 ? p.tamanhos[0] : '');
        var embalagemMarcada = form && form.querySelector('input[data-grupo="Embalagem"]:checked');
        selecionarImagem(p, imagemDasOpcoes(p, tamanho, embalagemMarcada ? embalagemMarcada.value : ''));
        var link = L.linkWhatsApp(L.mensagemProduto(p, escolhas));
        document.querySelectorAll('[data-produto-whatsapp]').forEach(function (a) { a.href = link; });
        L.definirWhatsAppFlutuante(L.mensagemProduto(p, escolhas));
      };
      if (form) {
        form.addEventListener('change', atualizar);
        form.addEventListener('submit', function (e) { e.preventDefault(); });
      }
      atualizar();
    }

    function ligarCompra(p) {
      var barra = document.querySelector('[data-barra-produto]');
      if (p.precoCentavos) {
        barra.innerHTML = '<button type="button" class="btn btn--primario btn--bloco" data-produto-adicionar>' +
          L.icone('sacola') + '<span>Adicionar ao carrinho</span></button>';
      }
      document.querySelectorAll('[data-produto-adicionar]').forEach(function (botao) {
        botao.addEventListener('click', function () {
          var selecionado = alvo.querySelector('input[data-grupo="Tamanho"]:checked');
          var tamanho = selecionado ? selecionado.value : (p.tamanhos.length === 1 ? p.tamanhos[0] : '');
          var aviso = alvo.querySelector('[data-compra-aviso]');
          if (!tamanho) {
            aviso.textContent = 'Selecione um tamanho para adicionar este produto ao carrinho.';
            var primeira = alvo.querySelector('input[data-grupo="Tamanho"]');
            if (primeira) primeira.focus();
            return;
          }
          var embalagem = alvo.querySelector('input[data-grupo="Embalagem"]:checked');
          if (p.embalagens.length && !embalagem) {
            aviso.textContent = 'Selecione a embalagem (quantidade de unidades) para adicionar ao carrinho.';
            var primeiraEmb = alvo.querySelector('input[data-grupo="Embalagem"]:not(:disabled)');
            if (primeiraEmb) primeiraEmb.focus();
            return;
          }
          aviso.textContent = '';
          L.adicionarAoCarrinho(p.id, tamanho, embalagem ? embalagem.value : '').catch(function () {
            aviso.textContent = 'Não foi possível adicionar o produto. Tente novamente.';
          });
        });
      });
    }

    function relacionados(p, catalogo, categoria, urlCategoria) {
      var secao = document.querySelector('[data-relacionados]');
      var outros = catalogo.produtos.filter(function (o) { return o.categoria === p.categoria && o.id !== p.id; });
      if (!secao || !outros.length) return;

      secao.querySelector('[data-relacionados-lista]').innerHTML =
        L.cardsProdutos(L.ordenar(outros, 'destaques').slice(0, 4), catalogo, 3);
      var link = secao.querySelector('[data-relacionados-link]');
      link.href = urlCategoria;
      link.firstChild.textContent = 'Ver tudo em ' + categoria.nome;
      secao.hidden = false;
    }

    /* ---------------- SEO ---------------- */

    function meta(atributo, nome, valor) {
      var tag = document.head.querySelector('meta[' + atributo + '="' + nome + '"]');
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(atributo, nome);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', valor);
    }

    function jsonLd(dados) {
      var script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(dados);
      document.head.appendChild(script);
    }

    function atualizarSeo(p, categoria) {
      var url = new URL(L.urlProduto(p.id), baseSite).href;
      var titulo = p.nome + ' – ' + C.loja.nome;
      var resumo = (p.descricao || (p.nome + (p.marca ? ', ' + p.marca : '') + '. ' + categoria.nome + '.'))
        .replace(/\s+/g, ' ').slice(0, 150) +
        ' Consulte na Ligue Fraldas Geriátricas, Vila Isabel (RJ).';
      var imagens = p.imagens.map(function (src) { return new URL(src, baseSite).href; });

      document.title = titulo;
      meta('name', 'description', resumo);
      meta('property', 'og:title', titulo);
      meta('property', 'og:description', resumo);
      meta('property', 'og:url', url);
      if (imagens.length) meta('property', 'og:image', imagens[0]);
      if (canonical) canonical.href = url;

      var produto = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: p.nome,
        sku: p.id,
        url: url,
        category: categoria.nome
      };
      if (p.descricao) produto.description = p.descricao;
      if (p.marca) produto.brand = { '@type': 'Brand', name: p.marca };
      if (imagens.length) produto.image = imagens;
      jsonLd(produto);

      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: new URL('./', baseSite).href },
          { '@type': 'ListItem', position: 2, name: 'Produtos', item: new URL('catalogo.html', baseSite).href },
          { '@type': 'ListItem', position: 3, name: categoria.nome, item: new URL('catalogo.html?categoria=' + encodeURIComponent(p.categoria), baseSite).href },
          { '@type': 'ListItem', position: 4, name: p.nome, item: url }
        ]
      });
    }

    /* ---------------- não encontrado ---------------- */

    function naoEncontrado(catalogo) {
      document.title = 'Produto não encontrado – ' + C.loja.nome;
      meta('name', 'robots', 'noindex');

      var temProdutos = catalogo.produtos.length > 0;
      alvo.innerHTML = '<div class="aviso aviso--pagina">' +
        '<span class="aviso__icone">' + L.icone('busca') + '</span>' +
        '<h1 class="aviso__titulo">Produto não encontrado</h1>' +
        '<p>' + (temProdutos
          ? 'Este produto pode ter saído do catálogo ou o link está incompleto.'
          : 'Estamos preparando nosso catálogo. Em breve você poderá consultar nossos produtos aqui.') + '</p>' +
        '<div class="aviso__acoes">' +
          '<a class="btn btn--primario" href="catalogo.html">' + L.icone('sacola') + '<span>Ver catálogo</span></a>' +
          '<a class="btn btn--wa" href="' + esc(L.linkWhatsApp()) + '" target="_blank" rel="noopener">' +
            L.icone('whatsapp') + '<span>Fale conosco pelo WhatsApp</span></a>' +
        '</div></div>';
    }
  });
})();
