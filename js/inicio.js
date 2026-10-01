/* Página inicial: categorias e produtos em destaque */
(function () {
  'use strict';

  var L = window.Ligue;
  var C = window.LIGUE_CONFIG;

  document.addEventListener('DOMContentLoaded', function () {
    var grade = document.querySelector('[data-produtos-inicio]');
    var chips = document.querySelector('[data-categorias-inicio]');
    if (!grade) return;

    L.aoRecarregar(grade, carregar);
    carregar();

    function carregar() {
      grade.setAttribute('aria-busy', 'true');
      grade.classList.remove('grade-produtos--aviso');
      grade.innerHTML = L.esqueletos(4);

      L.carregarCatalogo().then(function (catalogo) {
        grade.setAttribute('aria-busy', 'false');

        if (!catalogo.produtos.length) {
          grade.classList.add('grade-produtos--aviso');
          grade.innerHTML = L.avisoCatalogoVazio(3);
          return;
        }

        document.querySelectorAll('[data-requer-produtos]').forEach(function (el) { el.hidden = false; });

        var categorias = catalogo.categoriasComProdutos();
        if (chips && categorias.length > 1) {
          chips.innerHTML = categorias.map(function (c) {
            return '<li><a class="chip" href="catalogo.html?categoria=' + encodeURIComponent(c.id) + '">' +
              L.esc(c.nome) + ' <span class="chip__total">' + c.total + '</span></a></li>';
          }).join('');
          chips.hidden = false;
        }

        var destaques = L.ordenar(catalogo.produtos, 'destaques').slice(0, C.catalogo.destaquesNoInicio);
        grade.innerHTML = L.cardsProdutos(destaques, catalogo, 3);
      }).catch(function () {
        grade.setAttribute('aria-busy', 'false');
        grade.classList.add('grade-produtos--aviso');
        grade.innerHTML = L.avisoErro(3);
      });
    }
  });
})();
