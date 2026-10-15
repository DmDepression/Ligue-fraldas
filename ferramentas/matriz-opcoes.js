/*
 * Matriz de opções do catálogo — conferência da interface sem dependências.
 *
 * Uso: suba o servidor local (python -m http.server 5500), abra http://localhost:5500 no navegador,
 * cole este arquivo inteiro no console (F12) e aguarde. Para cada produto e cada combinação de
 * tamanho/embalagem, a matriz marca a opção na página do produto, adiciona ao carrinho e registra:
 * preço exibido, foto principal, foto do item no carrinho, descrição, preço e total do carrinho e a
 * linha da mensagem de WhatsApp. No fim mostra a tabela e as divergências encontradas.
 * Não envia nada: o carrinho de teste é esvaziado a cada produto.
 */
(async () => {
  'use strict';
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const arquivo = (src) => (src || '').split('/').pop().split('?')[0];
  const ids = (await (await fetch('data/produtos.json', { cache: 'reload' })).json()).map((p) => p.id);
  const quadro = document.createElement('iframe');
  quadro.style.cssText = 'width:390px;height:800px;position:fixed;right:0;bottom:0;z-index:9999;border:2px solid #0c55ae;background:#fff';
  document.body.appendChild(quadro);

  const abrir = async (url) => {
    try { quadro.contentWindow.localStorage.removeItem('ligue-fraldas-carrinho-v1'); } catch (e) { /* primeira carga */ }
    quadro.src = url;
    await new Promise((r) => { quadro.onload = r; });
    for (let i = 0; i < 100; i++) {
      const d = quadro.contentDocument;
      if (d.querySelector('[data-produto][aria-busy="false"]') && d.querySelector('#carrinho')) break;
      await espera(50);
    }
    await espera(150);
    return quadro.contentDocument;
  };
  const marcar = async (input) => { input.click(); input.dispatchEvent(new Event('change', { bubbles: true })); await espera(60); };
  const pagina = (d) => {
    const img = d.querySelector('[data-imagem-principal] img');
    return {
      preco: ((d.querySelector('[data-preco]') || {}).textContent || '').replace('por pacote', '').trim(),
      foto: img ? arquivo(img.getAttribute('src')) : '(sem foto)'
    };
  };
  const carrinho = async (d) => {
    const itens = [...d.querySelectorAll('.carrinho-item')];
    const item = itens[itens.length - 1];
    const r = item ? {
      fotoCarrinho: arquivo(item.querySelector('img') && item.querySelector('img').getAttribute('src')),
      descricao: item.querySelector('.carrinho-item__info p').textContent,
      precoCarrinho: item.querySelectorAll('.carrinho-item__info p')[1].textContent.replace(' por pacote', ''),
      total: d.querySelector('[data-carrinho-total]').textContent,
      whatsapp: d.querySelector('[data-carrinho-mensagem]').value.split('\n').find((l) => l.startsWith('•')) || ''
    } : { fotoCarrinho: '(não adicionou)' };
    for (let i = 0; i < 10; i++) { const b = d.querySelector('[data-remover]'); if (!b) break; b.click(); await espera(30); }
    const dialogo = d.querySelector('#carrinho');
    if (dialogo.open) dialogo.close();
    return r;
  };

  const linhas = [];
  for (const id of ids) {
    const d = await abrir('produto.html?id=' + encodeURIComponent(id));
    const inicial = pagina(d);
    const tamanhos = [...d.querySelectorAll('input[data-grupo="Tamanho"]')];
    for (const tamanho of (tamanhos.length ? tamanhos : [null])) {
      if (tamanho) await marcar(tamanho);
      const soTamanho = pagina(d).preco;
      const embalagens = [...d.querySelectorAll('input[data-grupo="Embalagem"]')].filter((e) => !e.disabled);
      for (const embalagem of (embalagens.length ? embalagens : [null])) {
        if (embalagem) await marcar(embalagem);
        const vista = pagina(d);
        const adicionar = d.querySelector('[data-produto] [data-produto-adicionar]');
        if (adicionar) { adicionar.click(); await espera(150); }
        linhas.push(Object.assign({
          produto: id,
          tamanho: tamanho ? tamanho.value : '(único)',
          embalagem: embalagem ? embalagem.getAttribute('data-rotulo') : '',
          precoInicial: inicial.preco,
          precoSoTamanho: embalagens.length ? soTamanho : '',
          preco: vista.preco,
          foto: vista.foto
        }, adicionar ? await carrinho(d) : { fotoCarrinho: '(sem carrinho)' }));
      }
    }
    if (tamanhos.length > 1) {
      const fotos = [];
      for (const t of [tamanhos[0], tamanhos[tamanhos.length - 1], tamanhos[0]]) { await marcar(t); fotos.push(pagina(d).foto); }
      if (fotos[0] !== fotos[2]) linhas.push({ produto: id, tamanho: 'ida e volta', foto: fotos.join(' → '), problema: 'foto não volta' });
    }
  }
  quadro.remove();

  const problemas = linhas.filter((l) => {
    if (l.problema) return true;
    if (l.fotoCarrinho && !l.fotoCarrinho.startsWith('(') && l.fotoCarrinho !== l.foto) return (l.problema = 'foto do carrinho ≠ foto da página');
    if (l.precoCarrinho && l.precoCarrinho !== l.preco) return (l.problema = 'preço do carrinho ≠ preço da página');
    if (l.total && l.total !== l.precoCarrinho) return (l.problema = 'total ≠ preço de 1 pacote');
    if (l.whatsapp && !l.whatsapp.includes(l.descricao)) return (l.problema = 'mensagem sem a opção escolhida');
    return false;
  });
  console.table(linhas);
  console.log(problemas.length ? problemas : 'Nenhuma divergência em ' + linhas.length + ' combinações.');
  window.matrizOpcoes = { linhas, problemas };
  return problemas.length ? problemas : 'OK: ' + linhas.length + ' combinações sem divergência';
})();
