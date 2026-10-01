/*
 * Ligue Fraldas Geriátricas — funções compartilhadas por todas as páginas:
 * utilidades, links de contato, carregamento do catálogo e cards de produto.
 */
(function () {
  'use strict';

  var C = window.LIGUE_CONFIG;
  var L = (window.Ligue = {});

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  var ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  L.esc = function (valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (c) { return ENTIDADES[c]; });
  };

  // Minúsculas e sem acentos, para a busca encontrar "lenco" em "Lenço".
  L.normalizar = function (valor) {
    return String(valor == null ? '' : valor)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim();
  };

  L.comparador = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true }).compare;

  L.icone = function (nome, classe) {
    return '<svg class="icone' + (classe ? ' ' + classe : '') + '" aria-hidden="true" focusable="false">' +
      '<use href="#i-' + nome + '"></use></svg>';
  };

  L.plural = function (n, singular, plural) {
    return n + ' ' + (n === 1 ? singular : plural);
  };

  /* ------------------------------------------------------------------ */
  /* Contato                                                             */
  /* ------------------------------------------------------------------ */

  L.linkWhatsApp = function (mensagem) {
    return 'https://wa.me/' + C.whatsapp.numero + '?text=' +
      encodeURIComponent(mensagem || C.whatsapp.mensagemPadrao);
  };

  L.linkTelefone = function (indice) {
    return 'tel:' + C.telefones[indice || 0].numero;
  };

  L.urlProduto = function (id) {
    return 'produto.html?id=' + encodeURIComponent(id);
  };

  L.urlAbsoluta = function (relativa) {
    return new URL(relativa, location.href).href;
  };

  // Mensagem pré-preenchida ao consultar um produto pelo WhatsApp.
  // `escolhas` = [{ nome: 'Tamanho', valor: 'G' }, ...] (opcional)
  L.mensagemProduto = function (produto, escolhas) {
    var linhas = ['Olá! Vi no site e gostaria de consultar este produto:', '*' + produto.nome + '*'];
    if (produto.marca) linhas.push('Marca: ' + produto.marca);
    (escolhas || []).forEach(function (e) { linhas.push(e.nome + ': ' + e.valor); });
    linhas.push(L.urlAbsoluta(L.urlProduto(produto.id)));
    return linhas.join('\n');
  };

  L.definirWhatsAppFlutuante = function (mensagem) {
    var botao = document.querySelector('.wa-flutuante');
    if (botao) botao.href = L.linkWhatsApp(mensagem);
  };

  /* ------------------------------------------------------------------ */
  /* Catálogo: carregamento e normalização dos dados                     */
  /* ------------------------------------------------------------------ */

  function texto(v) {
    return v == null ? '' : String(v).trim();
  }

  function lista(v) {
    if (v == null || v === '') return [];
    return Array.isArray(v) ? v : [v];
  }

  function numero(v, padrao) {
    var n = Number(v);
    return v !== '' && v != null && isFinite(n) ? n : padrao;
  }

  function rotuloDeId(id) {
    var t = id.replace(/[-_]+/g, ' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Aceita: [{ nome, opcoes: [] }], ["A", "B"] ou { "Embalagem": ["8 un", "16 un"] }
  function normalizarVariacoes(v) {
    if (!v) return [];
    if (!Array.isArray(v) && typeof v === 'object') {
      return Object.keys(v).map(function (nome) {
        return { nome: texto(nome), opcoes: lista(v[nome]).map(texto).filter(Boolean) };
      }).filter(function (g) { return g.nome && g.opcoes.length; });
    }
    var soltas = [];
    var grupos = [];
    lista(v).forEach(function (item) {
      if (item && typeof item === 'object') {
        var opcoes = lista(item.opcoes).map(texto).filter(Boolean);
        if (opcoes.length) grupos.push({ nome: texto(item.nome) || 'Opção', opcoes: opcoes });
      } else if (texto(item)) {
        soltas.push(texto(item));
      }
    });
    if (soltas.length) grupos.unshift({ nome: 'Variação', opcoes: soltas });
    return grupos;
  }

  // Aceita: [{ rotulo, valor }], ["texto livre"] ou { "Rótulo": "valor" }
  function normalizarInformacoes(v) {
    if (!v) return [];
    if (!Array.isArray(v) && typeof v === 'object') {
      return Object.keys(v).map(function (k) { return { rotulo: texto(k), valor: texto(v[k]) }; })
        .filter(function (i) { return i.valor; });
    }
    return lista(v).map(function (item) {
      if (item && typeof item === 'object') return { rotulo: texto(item.rotulo), valor: texto(item.valor) };
      return { rotulo: '', valor: texto(item) };
    }).filter(function (i) { return i.valor; });
  }

  function normalizarProduto(bruto, posicao) {
    if (!bruto || typeof bruto !== 'object' || bruto.ativo === false) return null;

    var id = texto(bruto.id);
    var nome = texto(bruto.nome);
    if (!id || !nome) {
      console.warn('[Catálogo] Produto ignorado: "id" e "nome" são obrigatórios.', bruto);
      return null;
    }

    var imagens = [];
    lista(bruto.imagem).concat(lista(bruto.imagens)).map(texto).forEach(function (src) {
      if (src && imagens.indexOf(src) === -1) imagens.push(src);
    });

    return {
      id: id,
      nome: nome,
      categoria: texto(bruto.categoria) || 'outros',
      marca: texto(bruto.marca),
      descricao: texto(bruto.descricao),
      tamanhos: lista(bruto.tamanho != null ? bruto.tamanho : bruto.tamanhos).map(texto).filter(Boolean),
      variacoes: normalizarVariacoes(bruto.variacoes),
      informacoes: normalizarInformacoes(bruto.informacoes),
      imagens: imagens,
      palavrasChave: lista(bruto.palavrasChave).map(texto).filter(Boolean),
      destaque: bruto.destaque === true,
      ordem: numero(bruto.ordem, Infinity),
      criadoEm: texto(bruto.criadoEm),
      posicao: posicao
    };
  }

  function montarCatalogo(dadosProdutos, dadosCategorias) {
    var brutosProdutos = Array.isArray(dadosProdutos) ? dadosProdutos : (dadosProdutos && dadosProdutos.produtos) || [];
    var brutasCategorias = Array.isArray(dadosCategorias) ? dadosCategorias : (dadosCategorias && dadosCategorias.categorias) || [];

    var categorias = new Map();
    brutasCategorias.forEach(function (c, i) {
      var id = c && texto(c.id);
      if (!id) return;
      categorias.set(id, { id: id, nome: texto(c.nome) || rotuloDeId(id), ordem: numero(c.ordem, i), total: 0 });
    });

    var produtos = [];
    var porId = new Map();

    brutosProdutos.forEach(function (bruto, i) {
      var p = normalizarProduto(bruto, i);
      if (!p) return;
      if (porId.has(p.id)) {
        console.warn('[Catálogo] Produto com id repetido ignorado:', p.id);
        return;
      }
      if (!categorias.has(p.categoria)) {
        categorias.set(p.categoria, { id: p.categoria, nome: rotuloDeId(p.categoria), ordem: 9999, total: 0 });
      }
      var categoria = categorias.get(p.categoria);
      categoria.total += 1;

      p.busca = L.normalizar([
        p.nome, p.marca, categoria.nome, p.descricao, p.tamanhos.join(' '),
        p.variacoes.map(function (g) { return g.opcoes.join(' '); }).join(' '),
        p.palavrasChave.join(' ')
      ].join(' '));

      produtos.push(p);
      porId.set(p.id, p);
    });

    var listaCategorias = Array.from(categorias.values()).sort(function (a, b) {
      return (a.ordem - b.ordem) || L.comparador(a.nome, b.nome);
    });

    return {
      produtos: produtos,
      porId: porId,
      categorias: listaCategorias,
      categoria: function (id) { return categorias.get(id); },
      // Só exibimos categorias que têm produtos — nada de prateleira vazia.
      categoriasComProdutos: function () {
        return listaCategorias.filter(function (c) { return c.total > 0; });
      }
    };
  }

  function buscarJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (resposta) {
      if (!resposta.ok) throw new Error('HTTP ' + resposta.status + ' ao carregar ' + url);
      return resposta.json();
    });
  }

  var carregamento = null;

  L.carregarCatalogo = function () {
    if (!carregamento) {
      carregamento = Promise.all([buscarJSON(C.catalogo.produtos), buscarJSON(C.catalogo.categorias)])
        .then(function (r) { return montarCatalogo(r[0], r[1]); })
        .catch(function (erro) {
          carregamento = null;
          if (location.protocol === 'file:') {
            console.error('[Catálogo] O catálogo precisa ser aberto por um servidor (http://). Veja o README.');
          }
          throw erro;
        });
    }
    return carregamento;
  };

  /* ------------------------------------------------------------------ */
  /* Ordenação e filtros                                                 */
  /* ------------------------------------------------------------------ */

  L.ordenacoes = {
    destaques: {
      rotulo: 'Destaques',
      comparar: function (a, b) {
        return (b.destaque - a.destaque) || (a.ordem - b.ordem) || (a.posicao - b.posicao);
      }
    },
    'nome-az': { rotulo: 'Nome: A a Z', comparar: function (a, b) { return L.comparador(a.nome, b.nome); } },
    'nome-za': { rotulo: 'Nome: Z a A', comparar: function (a, b) { return L.comparador(b.nome, a.nome); } },
    recentes: {
      rotulo: 'Mais recentes',
      comparar: function (a, b) {
        return b.criadoEm.localeCompare(a.criadoEm) || (b.posicao - a.posicao);
      }
    },
    marca: {
      rotulo: 'Marca',
      comparar: function (a, b) {
        if (!a.marca !== !b.marca) return a.marca ? -1 : 1;
        return L.comparador(a.marca, b.marca) || L.comparador(a.nome, b.nome);
      }
    }
  };

  L.ordenar = function (produtos, chave) {
    var ordem = L.ordenacoes[chave] || L.ordenacoes.destaques;
    return produtos.slice().sort(function (a, b) {
      return ordem.comparar(a, b) || (a.ordem - b.ordem) || (a.posicao - b.posicao);
    });
  };

  // filtros = { termo, categoria, marca } — campos vazios são ignorados
  L.filtrar = function (produtos, filtros) {
    var termos = L.normalizar(filtros.termo).split(/\s+/).filter(Boolean);
    var marca = L.normalizar(filtros.marca);
    return produtos.filter(function (p) {
      if (filtros.categoria && p.categoria !== filtros.categoria) return false;
      if (marca && L.normalizar(p.marca) !== marca) return false;
      return termos.every(function (t) { return p.busca.indexOf(t) !== -1; });
    });
  };

  /* ------------------------------------------------------------------ */
  /* Componentes                                                         */
  /* ------------------------------------------------------------------ */

  L.imagemProduto = function (src, alt, extra) {
    if (!src) return L.semImagem();
    return '<img src="' + L.esc(src) + '" alt="' + L.esc(alt) + '" data-fallback ' + (extra || '') + '>';
  };

  L.semImagem = function () {
    return '<div class="sem-imagem"><img src="img/logo.svg" alt="" width="80" height="80">' +
      '<span>Imagem em breve</span></div>';
  };

  L.cardProduto = function (p, catalogo, nivel) {
    var h = 'h' + (nivel || 3);
    var categoria = catalogo.categoria(p.categoria);
    var url = L.urlProduto(p.id);
    var tamanhos = p.tamanhos.length
      ? '<p class="card__tamanhos"><span class="sr-only">Tamanhos: </span>' +
        p.tamanhos.map(function (t) { return '<span class="etiqueta">' + L.esc(t) + '</span>'; }).join('') + '</p>'
      : '';

    return '' +
      '<article class="card">' +
        '<div class="card__midia">' +
          L.imagemProduto(p.imagens[0], p.nome, 'loading="lazy" decoding="async" width="480" height="480"') +
          (p.destaque ? '<span class="selo">Destaque</span>' : '') +
        '</div>' +
        '<div class="card__corpo">' +
          '<p class="card__categoria">' + L.esc(categoria ? categoria.nome : '') + '</p>' +
          '<' + h + ' class="card__nome"><a class="card__link" href="' + url + '">' + L.esc(p.nome) + '</a></' + h + '>' +
          (p.marca ? '<p class="card__marca">' + L.esc(p.marca) + '</p>' : '') +
          tamanhos +
        '</div>' +
        '<div class="card__acoes">' +
          '<a class="btn btn--wa btn--sm btn--bloco" href="' + L.esc(L.linkWhatsApp(L.mensagemProduto(p))) + '"' +
            ' target="_blank" rel="noopener" aria-label="Consultar pelo WhatsApp: ' + L.esc(p.nome) + '">' +
            L.icone('whatsapp') + '<span>Consultar pelo WhatsApp</span></a>' +
        '</div>' +
      '</article>';
  };

  L.cardsProdutos = function (produtos, catalogo, nivel) {
    return produtos.map(function (p) { return L.cardProduto(p, catalogo, nivel); }).join('');
  };

  L.esqueletos = function (quantidade) {
    var card = '<div class="card card--esqueleto" aria-hidden="true"><div class="card__midia"></div>' +
      '<div class="card__corpo"><span class="esq esq--curto"></span><span class="esq"></span>' +
      '<span class="esq esq--medio"></span></div></div>';
    return new Array(quantidade + 1).join(card);
  };

  function botoesContato(mensagem) {
    return '<div class="aviso__acoes">' +
      '<a class="btn btn--wa" href="' + L.esc(L.linkWhatsApp(mensagem)) + '" target="_blank" rel="noopener">' +
        L.icone('whatsapp') + '<span>Fale conosco pelo WhatsApp</span></a>' +
      '<a class="btn btn--contorno" href="' + L.linkTelefone(0) + '">' +
        L.icone('telefone') + '<span>Ligar ' + L.esc(C.telefones[0].exibicao) + '</span></a>' +
      '</div>';
  }

  L.avisoCatalogoVazio = function (nivel) {
    var h = 'h' + (nivel || 3);
    return '<div class="aviso">' +
      '<span class="aviso__icone">' + L.icone('sacola') + '</span>' +
      '<' + h + ' class="aviso__titulo">Estamos preparando nosso catálogo.</' + h + '>' +
      '<p>Em breve você poderá consultar nossos produtos aqui.</p>' +
      '<p class="aviso__extra">Enquanto isso, fale com a loja pelo WhatsApp ou por telefone para saber o que temos disponível.</p>' +
      botoesContato() +
      '</div>';
  };

  L.avisoErro = function (nivel) {
    var h = 'h' + (nivel || 3);
    return '<div class="aviso" role="alert">' +
      '<span class="aviso__icone">' + L.icone('info') + '</span>' +
      '<' + h + ' class="aviso__titulo">Não foi possível carregar os produtos agora.</' + h + '>' +
      '<p>Verifique sua conexão e tente de novo. Se preferir, consulte a loja diretamente.</p>' +
      '<p><button type="button" class="btn btn--primario btn--sm" data-recarregar>Tentar novamente</button></p>' +
      botoesContato() +
      '</div>';
  };

  L.aoRecarregar = function (container, acao) {
    container.addEventListener('click', function (e) {
      if (e.target.closest('[data-recarregar]')) acao();
    });
  };

  /* ------------------------------------------------------------------ */
  /* Estrutura comum das páginas                                         */
  /* ------------------------------------------------------------------ */

  function iniciarMenu() {
    var botao = document.querySelector('[data-menu-botao]');
    var menu = document.getElementById('menu');
    if (!botao || !menu) return;

    function definir(aberto) {
      botao.setAttribute('aria-expanded', String(aberto));
      botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
      botao.querySelector('use').setAttribute('href', aberto ? '#i-fechar' : '#i-menu');
      menu.classList.toggle('aberto', aberto);
    }

    botao.addEventListener('click', function () {
      definir(botao.getAttribute('aria-expanded') !== 'true');
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) definir(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('aberto')) {
        definir(false);
        botao.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (menu.classList.contains('aberto') && !menu.contains(e.target) && !botao.contains(e.target)) definir(false);
    });
    window.matchMedia('(min-width: 960px)').addEventListener('change', function (e) {
      if (e.matches) definir(false);
    });
  }

  function iniciarCabecalho() {
    var cabecalho = document.querySelector('.cabecalho');
    if (!cabecalho) return;
    var atualizar = function () { cabecalho.classList.toggle('rolado', window.scrollY > 8); };
    window.addEventListener('scroll', atualizar, { passive: true });
    atualizar();
  }

  // Links de WhatsApp escritos no HTML recebem o número e a mensagem do config.js
  function iniciarWhatsApp() {
    document.querySelectorAll('[data-whatsapp]').forEach(function (a) {
      a.href = L.linkWhatsApp(a.getAttribute('data-whatsapp') || undefined);
    });
  }

  // Enquanto não houver Instagram, os elementos [data-instagram] mostram "em breve".
  // Com a URL preenchida no config.js, eles viram links.
  function iniciarInstagram() {
    var url = C.instagram && C.instagram.url;
    if (!url) return;
    var usuario = C.instagram.usuario || '';

    document.querySelectorAll('[data-instagram]').forEach(function (el) {
      var link = document.createElement('a');
      link.className = el.className;
      link.innerHTML = el.innerHTML;
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.setAttribute('data-instagram', 'ativo');
      link.querySelectorAll('[data-instagram-texto]').forEach(function (t) {
        var modelo = t.getAttribute('data-instagram-texto') || '{usuario}';
        t.textContent = modelo.replace('{usuario}', usuario).trim() || 'Seguir no Instagram';
      });
      el.replaceWith(link);
    });
  }

  function iniciarAno() {
    document.querySelectorAll('[data-ano]').forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
  }

  // Imagem de produto que não carregar vira o quadro "Imagem em breve"
  function iniciarFallbackImagens() {
    document.addEventListener('error', function (e) {
      var img = e.target;
      if (img.tagName === 'IMG' && img.hasAttribute('data-fallback')) {
        img.removeAttribute('data-fallback');
        img.outerHTML = L.semImagem();
      }
    }, true);
  }

  iniciarFallbackImagens();

  document.addEventListener('DOMContentLoaded', function () {
    iniciarMenu();
    iniciarCabecalho();
    iniciarWhatsApp();
    iniciarInstagram();
    iniciarAno();
  });
})();
