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

  const tamanhos = [].concat(produto.tamanho ?? produto.tamanhos ?? []);
  const codigo = (rotulo) => String(rotulo || '').split(/[—–]/)[0].trim();
  const embalagens = Array.isArray(produto.embalagens) ? produto.embalagens : [];
  const idsEmbalagens = new Set(embalagens.map((e) => e && e.id));

  (produto.fotosPorOpcao || []).forEach((foto) => {
    if (!foto || !imagens.includes(foto.imagem)) {
      erros.push(`${ref}: foto de opção não encontrada na galeria.`);
      return;
    }
    if (foto.tamanho && !tamanhos.some((t) => codigo(t) === foto.tamanho)) {
      erros.push(`${ref}: foto de opção aponta para o tamanho inexistente ${foto.tamanho}.`);
    }
    if (foto.embalagem && !idsEmbalagens.has(foto.embalagem)) {
      erros.push(`${ref}: foto de opção aponta para a embalagem inexistente ${foto.embalagem}.`);
    }
  });

  // Uma embalagem só pode valer para tamanhos que o produto oferece, e cada tamanho
  // precisa de ao menos uma embalagem (senão o cliente escolhe e não consegue comprar).
  embalagens.forEach((embalagem) => {
    (embalagem && embalagem.tamanhos || []).forEach((t) => {
      if (!tamanhos.includes(t)) erros.push(`${ref}: embalagem ${embalagem.id} usa o tamanho inexistente ${t}.`);
    });
  });
  // Quantidade do rótulo ("M — 10 unidades") e da tabela de informações precisam bater.
  tamanhos.forEach((t) => {
    const noRotulo = String(t).match(/(\d+)\s*unidades/);
    const info = (produto.informacoes || []).find((i) => i && i.rotulo === `Tamanho ${codigo(t)}`);
    const naInfo = info && String(info.valor).match(/(\d+)\s*unidades/);
    if (noRotulo && naInfo && noRotulo[1] !== naInfo[1]) {
      erros.push(`${ref}: tamanho ${codigo(t)} diz ${noRotulo[1]} unidades no rótulo e ${naInfo[1]} nas informações.`);
    }
  });

  if (embalagens.length) {
    tamanhos.forEach((t) => {
      const temEmbalagem = embalagens.some((e) => !e.tamanhos || !e.tamanhos.length || e.tamanhos.includes(t));
      if (!temEmbalagem) erros.push(`${ref}: o tamanho ${t} não tem nenhuma embalagem.`);
    });
  }
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

// Marcas com hífen (ex.: "ARO - Incofral") devem aparecer sempre assim, em todos os produtos.
const marcasComHifen = [...new Set(produtos.map((p) => p && p.marca).filter((m) => typeof m === 'string' && m.includes(' - ')))];
marcasComHifen.forEach((marca) => {
  const semHifen = marca.replace(/\s+-\s+/g, ' ');
  produtos.forEach((p) => {
    ['nome', 'marca', 'descricao'].forEach((campo) => {
      if (typeof p[campo] === 'string' && p[campo].includes(semHifen)) {
        erros.push(`produto ${p.id}: "${semHifen}" sem hífen em ${campo}; use "${marca}".`);
      }
    });
  });
});

if (erros.length) {
  console.error(erros.map((erro) => `- ${erro}`).join('\n'));
  process.exit(1);
}

console.log(`Catálogo válido: ${produtos.length} produtos, ${categorias.length} categorias e todas as fotos com formato válido.`);
