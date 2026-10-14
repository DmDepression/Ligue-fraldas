// Validação sem dependências para uso local e no GitHub Actions.
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const lerJson = (arquivo) => JSON.parse(fs.readFileSync(path.join(raiz, arquivo), 'utf8'));
const produtos = lerJson('data/produtos.json');
const categorias = lerJson('data/categorias.json');
const erros = [];
const ids = new Set();
const categoriasValidas = new Set(categorias.map((c) => c.id));

if (!Array.isArray(produtos) || produtos.length === 0) erros.push('data/produtos.json precisa conter uma lista de produtos.');

produtos.forEach((produto, indice) => {
  const ref = `produto ${indice + 1}${produto && produto.id ? ` (${produto.id})` : ''}`;
  if (!produto || typeof produto !== 'object') {
    erros.push(`${ref}: registro inválido.`);
    return;
  }
  for (const campo of ['id', 'nome', 'descricao', 'categoria']) {
    if (typeof produto[campo] !== 'string' || !produto[campo].trim()) erros.push(`${ref}: falta ${campo}.`);
  }
  if (ids.has(produto.id)) erros.push(`${ref}: id repetido.`);
  ids.add(produto.id);
  if (produto.categoria && !categoriasValidas.has(produto.categoria)) erros.push(`${ref}: categoria inexistente.`);

  const imagens = Array.isArray(produto.imagens) ? produto.imagens : (produto.imagem ? [produto.imagem] : []);
  if (!imagens.length) erros.push(`${ref}: falta foto.`);
  imagens.forEach((imagem) => {
    if (typeof imagem !== 'string' || !imagem.trim()) {
      erros.push(`${ref}: caminho de foto inválido.`);
    } else if (!fs.existsSync(path.join(raiz, imagem))) {
      erros.push(`${ref}: foto não encontrada: ${imagem}.`);
    }
  });

  const embalagens = Array.isArray(produto.embalagens) ? produto.embalagens : [];
  if (embalagens.length) {
    const embalagemIds = new Set();
    embalagens.forEach((embalagem) => {
      if (!embalagem.id || !embalagem.rotulo) erros.push(`${ref}: embalagem sem id ou rótulo.`);
      if (embalagemIds.has(embalagem.id)) erros.push(`${ref}: id de embalagem repetido: ${embalagem.id}.`);
      embalagemIds.add(embalagem.id);
      if (!Number.isInteger(embalagem.precoCentavos) || embalagem.precoCentavos < 1) {
        erros.push(`${ref}: embalagem ${embalagem.id || '?'} sem preço válido.`);
      }
    });
  } else if (!Number.isInteger(produto.precoCentavos) || produto.precoCentavos < 1) {
    erros.push(`${ref}: falta preço válido.`);
  }
});

if (erros.length) {
  console.error(erros.map((erro) => `- ${erro}`).join('\n'));
  process.exit(1);
}

console.log(`Catálogo válido: ${produtos.length} produtos, ${categorias.length} categorias e todas as fotos encontradas.`);
