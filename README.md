# Ligue Fraldas Geriátricas — site vitrine

Vitrine online da **Ligue Fraldas Geriátricas** (Vila Isabel, Rio de Janeiro).
O site mostra o catálogo de produtos e leva o cliente direto para o **WhatsApp**, o **telefone** ou a **loja física**.
Não há carrinho, checkout, pagamento nem cadastro: a venda continua sendo feita pela loja.

É um site estático (HTML, CSS e JavaScript puros, sem etapa de build). Os produtos ficam num arquivo de dados
(`data/produtos.json`) e as páginas são montadas automaticamente a partir dele. Para incluir produtos, basta editar
esse arquivo. Não é preciso mexer no HTML nem "reconstruir" o site.

## Estrutura

```
index.html              Página inicial: destaque, produtos, contato, localização, sobre
catalogo.html           Catálogo: busca, filtro por categoria e marca, ordenação
produto.html            Página do produto (produto.html?id=<id-do-produto>)
404.html                Página de "não encontrada"
css/estilo.css          Todo o visual (mobile-first)
js/config.js            Contatos, Instagram e ajustes do catálogo  ← editar aqui
js/nucleo.js            Funções comuns: carrega os dados, monta os cards, links de WhatsApp
js/inicio.js            Lógica da página inicial
js/catalogo.js          Lógica do catálogo
js/produto.js           Lógica da página do produto
data/produtos.json      Lista de produtos (começa vazia: [])  ← editar aqui
data/categorias.json    Lista de categorias
data/produtos.exemplo.json   Modelo com todos os campos (não aparece no site)
img/logo.svg            Logotipo (recortado do arquivo original)
img/marca/              Logotipo original
img/produtos/           Fotos dos produtos
img/icones/, favicon.ico, img/og-image.png   Ícones e imagem de compartilhamento
ferramentas/            Gerador dos ícones e da imagem de compartilhamento
robots.txt, sitemap.xml, site.webmanifest
```

## Como ver o site no computador

O catálogo é carregado de arquivos `.json`, e o navegador bloqueia isso quando a página é aberta com duplo clique
(`file://`). Use um servidor local, na pasta do projeto:

```bash
python -m http.server 5500
```

Depois abra <http://localhost:5500>. Se preferir Node, `npx serve` funciona igual.

## Como cadastrar produtos

Edite `data/produtos.json`. Ele é uma lista (`[ ... ]`) de produtos separados por vírgula. Veja o modelo completo em
`data/produtos.exemplo.json`.

```json
[
  {
    "id": "fralda-geriatrica-marca-x-g",
    "nome": "Fralda Geriátrica Marca X",
    "categoria": "fraldas-geriatricas",
    "marca": "Marca X",
    "descricao": "Descrição do produto.",
    "tamanho": ["M", "G", "XG"],
    "imagem": "img/produtos/fralda-geriatrica-marca-x-g.jpg",
    "variacoes": [{ "nome": "Embalagem", "opcoes": ["Pacote com 8", "Pacote com 16"] }],
    "informacoes": [{ "rotulo": "Quantidade", "valor": "8 unidades" }],
    "destaque": true
  }
]
```

| Campo | Obrigatório | Para que serve |
|---|---|---|
| `id` | sim | Identificador único, sem espaços nem acentos. Vira o endereço `produto.html?id=...` |
| `nome` | sim | Nome exibido |
| `categoria` | não | `id` de uma categoria de `data/categorias.json`. Sem categoria, o produto vai para "Outros" |
| `marca` | não | Aparece no card, na busca e no filtro de marcas |
| `descricao` | não | Texto da página do produto. Uma linha em branco inicia um novo parágrafo |
| `tamanho` | não | `"G"` ou uma lista `["P", "M", "G"]`. O cliente pode escolher, e a escolha vai na mensagem do WhatsApp |
| `imagem` | não | Foto principal. Sem foto, aparece o quadro "Imagem em breve" |
| `imagens` | não | Fotos extras (galeria da página do produto) |
| `variacoes` | não | Grupos de opções, como embalagem ou modelo. A escolha também vai na mensagem |
| `informacoes` | não | Tabela "Informações do produto" (`rotulo` e `valor`) |
| `palavrasChave` | não | Termos extras para a busca encontrar o produto |
| `destaque` | não | `true` coloca o produto primeiro e na página inicial |
| `ordem` | não | Número para definir a ordem manualmente (menor aparece antes) |
| `criadoEm` | não | Data `"AAAA-MM-DD"`, usada na ordenação "Mais recentes" |
| `ativo` | não | `false` esconde o produto sem apagá-lo |

Dicas:
- **Fotos:** quadradas (por exemplo 800 × 800 px), fundo branco, em `img/produtos/`.
- **Erros comuns em JSON:** vírgula sobrando depois do último item, aspas faltando. Se o catálogo parar de aparecer,
  cole o arquivo em um validador de JSON. O console do navegador também avisa sobre produtos sem `id` ou `nome`
  e sobre `id` repetido.
- O botão **Consultar pelo WhatsApp** é criado sozinho para cada produto, com uma mensagem que cita o nome, a marca,
  as opções escolhidas e o link do produto.

### Categorias

`data/categorias.json` define nome e ordem das categorias. **Só aparecem no site as categorias que têm pelo menos um
produto.** Por isso a lista de exemplo não afirma que a loja vende algo que ainda não está no catálogo. Para criar uma
categoria nova, adicione `{ "id": "nova-categoria", "nome": "Nova categoria" }` e use esse `id` nos produtos.

## Contatos e Instagram

Os dados de contato ficam em `js/config.js`. Eles também estão escritos no HTML, para o Google e para quem navega sem
JavaScript. Ao trocar um telefone, procure o número antigo nos arquivos `.html` e troque lá também.

**Instagram:** quando a conta existir, preencha `instagram.url` e `instagram.usuario` em `js/config.js`. O cartão
"Instagram em breve" e o item do rodapé viram links automaticamente. Também vale incluir a URL em `"sameAs": ["..."]`
no bloco de dados estruturados do `index.html`.

## Antes de publicar

1. **Domínio:** troque `https://www.SEU-DOMINIO.com.br` pelo endereço real em `index.html`, `catalogo.html`,
   `produto.html`, `robots.txt` e `sitemap.xml` (procurar e substituir no editor resolve).
2. **Hospedagem:** qualquer hospedagem de site estático serve (GitHub Pages, Netlify, Cloudflare Pages, Vercel ou
   hospedagem comum). Envie a pasta inteira. A pasta `ferramentas/` é opcional.
3. **404:** a maioria dessas hospedagens usa o `404.html` automaticamente.
4. **Google:** cadastre o site no Google Search Console e envie o `sitemap.xml`. Para buscas como "fraldas geriátricas
   Vila Isabel", o Perfil da Empresa no Google (Google Maps) com o mesmo endereço e telefones ajuda muito.

O catálogo (`.json`) é sempre buscado atualizado. Mudanças em CSS ou JS podem levar alguns minutos para aparecer em
quem já visitou o site, por causa do cache do navegador.

## SEO local já incluído

- `title` e `meta description` por página, com loja, bairro e cidade
- Open Graph (prévia ao compartilhar no WhatsApp e no Facebook) com `img/og-image.png`
- Dados estruturados `Store` (nome, razão social, CNPJ, endereço, telefones) e `WebSite` na página inicial,
  `BreadcrumbList` no catálogo, `Product` e `BreadcrumbList` gerados em cada página de produto
- `canonical`, `robots.txt`, `sitemap.xml`, favicon, ícones e `site.webmanifest`

Horário de funcionamento, coordenadas, CEP e faixa de preço **não** foram incluídos porque não foram informados.
Se forem confirmados, podem ser adicionados ao bloco `Store` do `index.html` (`openingHoursSpecification`,
`geo`, `postalCode`, `priceRange`).

## Regenerar ícones e imagem de compartilhamento

Se o logotipo mudar, substitua `img/logo.svg` e rode no Windows, na pasta do projeto:

```bash
powershell -ExecutionPolicy Bypass -File ferramentas/gerar-imagens.ps1
```

O script usa o Chrome ou o Edge instalado para gerar `img/icones/*.png`, `img/og-image.png` e o `favicon.ico`.
