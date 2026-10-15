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

const fotoValida = (arquivo) => {
  const bytes = fs.readFileSync(arquivo);
  const extensao = path.extname(arquivo).toLowerCase();
  if (extensao === '.png') {
    return bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
      bytes.toString('ascii', 12, 16) === 'IHDR';
  }
  if (extensao === '.jpg' || extensao === '.jpeg') {
    return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
      bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }
  return false;
};

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
    } else if (!fotoValida(path.join(raiz, imagem))) {
      erros.push(`${ref}: arquivo de foto inválido ou corrompido: ${imagem}.`);
    }
  });

  (produto.fotosPorOpcao || []).forEach((foto) => {
    if (!foto || !imagens.includes(foto.imagem)) {
      erros.push(`${ref}: foto de opção não encontrada na galeria.`);
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

console.log(`Catálogo válido: ${produtos.length} produtos, ${categorias.length} categorias e todas as fotos com formato válido.`);
