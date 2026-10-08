// Executar com Node e Playwright disponíveis: node ferramentas/testar-carrinho.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');

(async () => {
  const raiz = path.resolve(__dirname, '..');
  const saida = path.resolve(raiz, '..', 'preview-ligue');
  await fs.mkdir(saida, { recursive: true });
  const tipos = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const arquivo = path.resolve(raiz, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!arquivo.startsWith(raiz + path.sep)) throw Error('Caminho inválido');
      res.setHeader('Content-Type', tipos[path.extname(arquivo)] || 'application/octet-stream');
      res.end(await fs.readFile(arquivo));
    } catch (e) { res.statusCode = 404; res.end('Não encontrado'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const base = 'http://127.0.0.1:' + server.address().port;
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const ir = async url => { await page.goto(base + url); await page.waitForFunction(() => !!window.Ligue && !!document.querySelector('#carrinho')); };
    const fechar = async () => { await page.locator('[data-carrinho-fechar]').first().click(); };
    const total = async esperado => assert.equal((await page.locator('[data-carrinho-total]').innerText()).replace(/\s/g, ' '), esperado);
    const adicionar = async (id, tamanho) => {
      const form = page.locator('[data-compra-card="' + id + '"]');
      await form.locator('select').selectOption(tamanho);
      await form.locator('button').click();
      await page.waitForFunction(() => document.querySelector('#carrinho').open);
    };
    await ir('/');
    assert.equal(await page.locator('#produtos, [data-compra-card]').count(), 0);
    assert.match(await page.locator('h1').innerText(), /quem você ama/);
    assert.equal(await page.locator('.contato-card--instagram').getAttribute('href'), 'https://www.instagram.com/liguefraldas/');
    assert.ok(await page.locator('#busca-hero').isVisible());
    await page.screenshot({ path: path.join(saida, 'inicio-desktop.png'), fullPage: true });
    await page.getByRole('link', { name: 'Ver produtos', exact: true }).click();
    await page.waitForSelector('[data-compra-card]');
    assert.equal(await page.locator('[data-compra-card]').count(), 3);
    for (const img of await page.locator('.card__midia img').all()) {
      await img.scrollIntoViewIfNeeded();
      await img.evaluate(el => el.decode());
    }
    assert.equal(await page.locator('.card__midia img').evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth > 0)), true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(saida, 'catalogo-desktop.png'), fullPage: true });
    // Seleção obrigatória: um clique sem tamanho não deve adicionar.
    await page.locator('[data-compra-card]').first().locator('button').click();
    assert.equal(await page.locator('#carrinho').evaluate(el => el.open), false);
    await adicionar('higifral-confort', 'M — 24 unidades');
    await total('R$ 54,90');
    await fechar();
    await adicionar('tena-slip-noturna', 'EG — 24 unidades');
    await fechar();
    await adicionar('vida-nova-confort', 'XG — 26 unidades');
    await total('R$ 224,70');
    const qtd = page.locator('[data-quantidade="0"]');
    await qtd.fill('2');
    await qtd.dispatchEvent('change');
    await total('R$ 279,60');
    await qtd.fill('0');
    await qtd.dispatchEvent('change');
    assert.equal(await qtd.inputValue(), '2');
    await total('R$ 279,60');
    // Nome obrigatório, espaços em branco e codificação de acentos na mensagem.
    const nome = page.locator('[data-carrinho-nome]');
    await page.locator('[data-carrinho-finalizar]').click();
    assert.equal(await nome.evaluate(el => el.validity.valueMissing), true);
    await nome.fill('   ');
    await page.locator('[data-carrinho-finalizar]').click();
    assert.equal(await nome.evaluate(el => el.checkValidity()), false);
    assert.equal(page.context().pages().length, 1);
    await nome.fill("  Ana  D'Ávila & João  ");
    assert.equal(await nome.evaluate(el => el.checkValidity()), true);
    const link = new URL(await page.locator('[data-carrinho-pedido]').getAttribute('action'));
    assert.equal(link.pathname, '/5521998928742');
    const msg = await page.locator('[data-carrinho-mensagem]').inputValue();
    assert.ok(msg.startsWith("Oi, me chamo Ana D'Ávila & João! Gostaria dos seguintes itens:"));
    for (const trecho of ['Higifral Confort', 'Tena Slip Noturna', 'Vida Nova Confort', 'M — 24 unidades', 'EG — 24 unidades', 'XG — 26 unidades', '2 pacotes', '279,60', 'Por gentileza.']) assert.ok(msg.includes(trecho), trecho);
    await fs.writeFile(path.join(saida, 'mensagem-whatsapp.txt'), msg);
    // Intercepta a navegação: testa a URL sem entrar em contato com o WhatsApp.
    await page.context().route('https://wa.me/**', route => route.fulfill({ contentType: 'text/html', body: 'Pedido de teste' }));
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('[data-carrinho-finalizar]').click()]);
    await popup.waitForLoadState('domcontentloaded');
    const destino = new URL(popup.url());
    assert.equal(destino.origin + destino.pathname, 'https://wa.me/5521998928742');
    assert.equal(destino.searchParams.get('text').replace(/\r\n/g, '\n'), msg);
    assert.deepEqual(Array.from(destino.searchParams.keys()), ['text']);
    await popup.close();
    assert.equal(await nome.inputValue(), "Ana D'Ávila & João");
    await nome.fill('Ana');
    await page.screenshot({ path: path.join(saida, 'carrinho-desktop.png') });
    // Persistência entre páginas e separação de tamanhos do mesmo produto.
    await fechar();
    await ir('/catalogo.html');
    await page.locator('[data-carrinho-abrir]').click();
    await total('R$ 279,60');
    await fechar();
    await adicionar('higifral-confort', 'G — 20 unidades');
    assert.equal(await page.locator('.carrinho-item').count(), 4);
    await total('R$ 334,50');
    await page.locator('[data-remover="3"]').click();
    await total('R$ 279,60');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#carrinho').evaluate(el => el.open), false);
    // Página individual, escolha obrigatória e botão fixo no celular.
    await page.setViewportSize({ width: 390, height: 844 });
    await ir('/produto.html?id=vida-nova-confort');
    await page.waitForSelector('.produto__nome');
    await page.locator('[data-barra-produto] [data-produto-adicionar]').click();
    assert.match(await page.locator('[data-compra-aviso]').innerText(), /Selecione/);
    await page.locator('input[data-grupo="Tamanho"][value="G — 30 unidades"]').check();
    await page.locator('[data-barra-produto] [data-produto-adicionar]').click();
    await page.waitForFunction(() => document.querySelector('#carrinho').open);
    await total('R$ 349,50');
    await page.screenshot({ path: path.join(saida, 'carrinho-celular.png') });
    await fechar();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(saida, 'produto-celular.png'), fullPage: true });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const url of ['/', '/catalogo.html', '/produto.html?id=higifral-confort']) {
        await ir(url);
        if (url !== '/') await page.waitForSelector('[data-compra-card]');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Overflow: ' + width + url);
        assert.ok(await page.locator('[data-carrinho-abrir]').isVisible());
        const marca = await page.locator('.cabecalho .marca').boundingBox();
        const acoes = await page.locator('.cabecalho__acoes').boundingBox();
        assert.ok(marca.x + marca.width <= acoes.x + 1, 'Cabeçalho sobreposto: ' + width);
      }
    }
    // Remoção total e conteúdo inválido salvo no navegador.
    await page.locator('[data-carrinho-abrir]').click();
    while (await page.locator('[data-remover]').count()) await page.locator('[data-remover]').first().click();
    await total('R$ 0,00');
    // Navegador sem armazenamento: a compra continua funcionando na página.
    const restrito = await browser.newContext();
    await restrito.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('Armazenamento bloqueado'); } });
    });
    const paginaRestrita = await restrito.newPage();
    await paginaRestrita.goto(base + '/catalogo.html');
    await paginaRestrita.waitForSelector('[data-compra-card]');
    await paginaRestrita.evaluate(() => window.Ligue.adicionarAoCarrinho('higifral-confort', 'M — 24 unidades'));
    assert.match(await paginaRestrita.locator('[data-carrinho-total]').innerText(), /54,90/);
    assert.match(await paginaRestrita.locator('[data-carrinho-aviso]').innerText(), /não permitiu/);
    await restrito.close();
    assert.equal(await page.locator('[data-carrinho-finalizar]').isVisible(), false);
    await page.evaluate(() => localStorage.setItem('ligue-fraldas-carrinho-v1', JSON.stringify([
      { id: 'higifral-confort', tamanho: 'M — 24 unidades', quantidade: 2, precoCentavos: 1 },
      { id: 'inexistente', tamanho: 'M', quantidade: 4 },
      { id: 'higifral-confort', tamanho: 'P', quantidade: 1 },
      { id: 'tena-slip-noturna', tamanho: 'M — 24 unidades', quantidade: -3 }
    ])));
    await page.reload();
    await page.locator('[data-carrinho-abrir]').click();
    await total('R$ 109,80');
    assert.equal(await page.locator('.carrinho-item').count(), 1);
    await page.evaluate(() => localStorage.setItem('ligue-fraldas-carrinho-v1', '{inválido'));
    await page.reload();
    await page.locator('[data-carrinho-abrir]').click();
    await total('R$ 0,00');
    assert.deepEqual(erros, []);
    // Prévia da imagem de compartilhamento, sem modificar os arquivos do site.
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.goto(base + '/ferramentas/og-image.html');
    await page.screenshot({ path: path.join(saida, 'compartilhamento.png') });
    console.log('PASSOU: produtos, imagens, tamanhos, quantidades, total, mensagem, persistência, remoção, dados inválidos e layouts de 320 a 1440 px.');
    console.log('Prévias: ' + saida);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
