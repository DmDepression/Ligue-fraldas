/* Página do catálogo: busca, filtros, ordenação e paginação */
(function () {
  'use strict';

  var L = window.Ligue;
  var C = window.LIGUE_CONFIG;

  document.addEventListener('DOMContentLoaded', function () {
    var q = function (seletor) { return document.querySelector(seletor); };
    var el = {
      aviso: q('[data-catalogo-aviso]'),
      catalogo: q('[data-catalogo]'),
      busca: q('#busca'),
      buscaForm: q('[data-busca-form]'),
      ordem: q('[data-ordem]'),
      filtros: q('#filtros'),
      filtrosBotao: q('[data-filtros-botao]'),
      filtrosTotal: q('[data-filtros-total]'),
      categorias: q('[data-filtro-categorias]'),
      grupoMarcas: q('[data-grupo-marcas]'),
      marcas: q('[data-filtro-marcas]'),
      contagem: q('[data-contagem]'),
      ativos: q('[data-filtros-ativos]'),
      lista: q('[data-lista]'),
      mais: q('[data-mais]'),
      maisInfo: q('[data-mais-info]'),
      maisBotao: q('[data-mais-botao]'),
      ajudaWhatsApp: q('[data-ajuda-whatsapp]')
    };
    if (!el.catalogo) return;

    var mobile = window.matchMedia('(max-width: 959.98px)');
    var catalogo = null;
    var estado = lerUrl();
    var resultado = [];
    var exibidos = 0;
    var espera = null;

    el.ordem.innerHTML = Object.keys(L.ordenacoes).map(function (chave) {
      return '<option value="' + chave + '">' + L.esc(L.ordenacoes[chave].rotulo) + '</option>';
    }).join('');

    L.aoRecarregar(el.aviso, carregar);
    ligarEventos();
    carregar();

    /* ---------------- carregamento ---------------- */

    function carregar() {
      el.aviso.hidden = false;
      el.aviso.setAttribute('aria-busy', 'true');
      el.aviso.classList.remove('grade-produtos--aviso');
      el.aviso.innerHTML = L.esqueletos(8);

      L.carregarCatalogo().then(function (c) {
        catalogo = c;
        el.aviso.setAttribute('aria-busy', 'false');

        if (!c.produtos.length) {
          el.aviso.classList.add('grade-produtos--aviso');
          el.aviso.innerHTML = L.avisoCatalogoVazio(2);
          return;
        }

        el.aviso.hidden = true;
        el.aviso.innerHTML = '';
        el.catalogo.hidden = false;

        if (estado.categoria && !catalogo.categoria(estado.categoria)) estado.categoria = '';
        if (!L.ordenacoes[estado.ordem]) estado.ordem = 'destaques';
        el.busca.value = estado.termo;
        el.ordem.value = estado.ordem;

        atualizar();
        if (location.hash === '#busca') focarBusca();
      }).catch(function () {
        el.aviso.setAttribute('aria-busy', 'false');
        el.aviso.classList.add('grade-produtos--aviso');
        el.aviso.innerHTML = L.avisoErro(2);
      });
    }

    /* ---------------- estado na URL ---------------- */

    function lerUrl() {
      var p = new URLSearchParams(location.search);
      return {
        termo: (p.get('q') || '').trim(),
        categoria: p.get('categoria') || '',
        marca: p.get('marca') || '',
        ordem: p.get('ordem') || 'destaques'
      };
    }

    function escreverUrl() {
      var p = new URLSearchParams();
      if (estado.termo) p.set('q', estado.termo);
      if (estado.categoria) p.set('categoria', estado.categoria);
      if (estado.marca) p.set('marca', estado.marca);
      if (estado.ordem !== 'destaques') p.set('ordem', estado.ordem);
      var qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    }

    /* ---------------- renderização ---------------- */

    function atualizar() {
      resultado = L.ordenar(L.filtrar(catalogo.produtos, estado), estado.ordem);
      exibidos = 0;
      el.lista.innerHTML = '';

      renderizarFiltros();
      renderizarAtivos();

      var temFiltro = estado.termo || estado.categoria || estado.marca;
      if (!resultado.length) {
        el.lista.classList.add('grade-produtos--aviso');
        el.lista.innerHTML = semResultados();
        el.contagem.textContent = 'Nenhum produto encontrado';
        el.mais.hidden = true;
      } else {
        el.lista.classList.remove('grade-produtos--aviso');
        el.contagem.textContent = temFiltro
          ? L.plural(resultado.length, 'produto encontrado', 'produtos encontrados')
          : L.plural(resultado.length, 'produto', 'produtos');
        mostrarMais(false);
      }

      el.ajudaWhatsApp.href = L.linkWhatsApp(estado.termo
        ? 'Olá! Estou procurando "' + estado.termo + '". Vocês têm na loja?'
        : undefined);

      escreverUrl();
    }

    function mostrarMais(focar) {
      var inicio = exibidos;
      var proximos = resultado.slice(inicio, inicio + C.catalogo.porPagina);
      el.lista.insertAdjacentHTML('beforeend', L.cardsProdutos(proximos, catalogo, 2));
      exibidos += proximos.length;

      el.mais.hidden = exibidos >= resultado.length;
      el.maisInfo.textContent = 'Mostrando ' + exibidos + ' de ' + resultado.length;

      if (focar) {
        var link = el.lista.querySelectorAll('.card__link')[inicio];
        if (link) link.focus();
      }
    }

    function contar(produtos, chave) {
      var mapa = new Map();
      produtos.forEach(function (p) {
        var k = chave(p);
        mapa.set(k, (mapa.get(k) || 0) + 1);
      });
      return mapa;
    }

    function opcao(tipo, valor, rotulo, total, ativo) {
      return '<li><button type="button" class="filtro-opcao" data-' + tipo + '="' + L.esc(valor) + '"' +
        ' aria-pressed="' + ativo + '"' + (total === 0 && !ativo ? ' data-vazio' : '') + '>' +
        '<span>' + L.esc(rotulo) + '</span><span class="filtro-opcao__total">' + total + '</span></button></li>';
    }

    function marcasDoCatalogo() {
      var vistas = new Map();
      catalogo.produtos.forEach(function (p) {
        var k = L.normalizar(p.marca);
        if (k && !vistas.has(k)) vistas.set(k, p.marca);
      });
      return Array.from(vistas.values()).sort(L.comparador);
    }

    function renderizarFiltros() {
      // As contagens de cada filtro consideram os outros filtros já aplicados.
      var baseCategorias = L.filtrar(catalogo.produtos, { termo: estado.termo, marca: estado.marca });
      var porCategoria = contar(baseCategorias, function (p) { return p.categoria; });
      el.categorias.innerHTML = opcao('categoria', '', 'Todas', baseCategorias.length, !estado.categoria) +
        catalogo.categoriasComProdutos().map(function (c) {
          return opcao('categoria', c.id, c.nome, porCategoria.get(c.id) || 0, estado.categoria === c.id);
        }).join('');

      var marcas = marcasDoCatalogo();
      el.grupoMarcas.hidden = marcas.length < 2;
      if (marcas.length < 2) return;

      var baseMarcas = L.filtrar(catalogo.produtos, { termo: estado.termo, categoria: estado.categoria });
      var porMarca = contar(baseMarcas, function (p) { return L.normalizar(p.marca); });
      var marcaAtual = L.normalizar(estado.marca);
      el.marcas.innerHTML = opcao('marca', '', 'Todas', baseMarcas.length, !marcaAtual) +
        marcas.map(function (m) {
          var k = L.normalizar(m);
          return opcao('marca', m, m, porMarca.get(k) || 0, marcaAtual === k);
        }).join('');
    }

    function renderizarAtivos() {
      var itens = [];
      if (estado.termo) itens.push(['termo', '“' + estado.termo + '”']);
      if (estado.categoria) itens.push(['categoria', catalogo.categoria(estado.categoria).nome]);
      if (estado.marca) itens.push(['marca', estado.marca]);

      el.ativos.innerHTML = itens.map(function (item) {
        return '<li><button type="button" class="chip chip--ativo" data-remover="' + item[0] + '"' +
          ' aria-label="Remover filtro: ' + L.esc(item[1]) + '">' + L.esc(item[1]) + L.icone('fechar') + '</button></li>';
      }).join('') + (itens.length > 1 ? '<li><button type="button" class="chip chip--limpar" data-limpar>Limpar tudo</button></li>' : '');

      var total = (estado.categoria ? 1 : 0) + (estado.marca ? 1 : 0);
      el.filtrosTotal.hidden = !total;
      el.filtrosTotal.textContent = total;
    }

    function semResultados() {
      var termo = estado.termo;
      return '<div class="aviso">' +
        '<span class="aviso__icone">' + L.icone('busca') + '</span>' +
        '<h2 class="aviso__titulo">Nenhum produto encontrado' + (termo ? ' para “' + L.esc(termo) + '”' : '') + '.</h2>' +
        '<p>Tente outra palavra ou limpe os filtros. Se preferir, pergunte direto para a loja.</p>' +
        '<div class="aviso__acoes">' +
          '<button type="button" class="btn btn--primario" data-limpar>Limpar filtros</button>' +
          '<a class="btn btn--wa" href="' + L.esc(L.linkWhatsApp(termo ? 'Olá! Estou procurando "' + termo + '". Vocês têm na loja?' : undefined)) + '"' +
            ' target="_blank" rel="noopener">' + L.icone('whatsapp') + '<span>Perguntar pelo WhatsApp</span></a>' +
        '</div></div>';
    }

    /* ---------------- interação ---------------- */

    function abrirFiltros(aberto) {
      el.filtros.classList.toggle('aberto', aberto);
      el.filtrosBotao.setAttribute('aria-expanded', String(aberto));
    }

    function focarBusca() {
      el.busca.focus({ preventScroll: true });
      el.busca.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function limpar() {
      estado.termo = '';
      estado.categoria = '';
      estado.marca = '';
      el.busca.value = '';
      atualizar();
    }

    function ligarEventos() {
      el.busca.addEventListener('input', function () {
        clearTimeout(espera);
        espera = setTimeout(function () {
          estado.termo = el.busca.value.trim();
          atualizar();
        }, 250);
      });

      el.buscaForm.addEventListener('submit', function (e) {
        e.preventDefault();
        clearTimeout(espera);
        estado.termo = el.busca.value.trim();
        atualizar();
        el.busca.blur(); // fecha o teclado no celular
      });

      el.ordem.addEventListener('change', function () {
        estado.ordem = el.ordem.value;
        atualizar();
      });

      el.filtrosBotao.addEventListener('click', function () {
        abrirFiltros(el.filtrosBotao.getAttribute('aria-expanded') !== 'true');
      });

      el.filtros.addEventListener('click', function (e) {
        var botao = e.target.closest('.filtro-opcao');
        if (!botao) return;
        var tipo = botao.hasAttribute('data-categoria') ? 'categoria' : 'marca';
        var valor = botao.getAttribute('data-' + tipo);
        estado[tipo] = valor;
        atualizar();

        if (mobile.matches) {
          abrirFiltros(false);
          el.filtrosBotao.focus();
        } else {
          // os botões foram recriados: devolve o foco ao equivalente
          var novo = el.filtros.querySelector('[data-' + tipo + '="' + CSS.escape(valor) + '"]');
          if (novo) novo.focus();
        }
      });

      el.maisBotao.addEventListener('click', function () { mostrarMais(true); });

      el.catalogo.addEventListener('click', function (e) {
        var remover = e.target.closest('[data-remover]');
        if (remover) {
          var campo = remover.getAttribute('data-remover');
          estado[campo] = '';
          if (campo === 'termo') el.busca.value = '';
          atualizar();
          (el.ativos.querySelector('button') || el.busca).focus();
          return;
        }
        if (e.target.closest('[data-limpar]')) {
          limpar();
          el.busca.focus();
        }
      });

      var atalhoBusca = q('[data-focar-busca]');
      if (atalhoBusca) {
        atalhoBusca.addEventListener('click', function (e) {
          if (el.catalogo.hidden) return;
          e.preventDefault();
          focarBusca();
        });
      }

      mobile.addEventListener('change', function () { abrirFiltros(false); });
    }
  });
})();
