# Ligue Fraldas Geriátricas — site vitrine

Vitrine online da **Ligue Fraldas Geriátricas** (Vila Isabel, Rio de Janeiro).
O site mostra o catálogo de produtos e leva o cliente direto para o **WhatsApp**, o **telefone** ou a **loja física**.
O cliente monta um carrinho por tamanho e quantidade de pacotes e finaliza pelo WhatsApp, com itens,
subtotais e total na mensagem. A loja confirma disponibilidade, entrega e pagamento. Não há pagamento online nem cadastro.

É um site estático (HTML, CSS e JavaScript puros, sem etapa de build) com um painel em PHP, sem banco de dados.
**Produtos, fotos, preços e categorias são administrados pelo painel** (`/admin/`). Ele grava o catálogo em
`data/loja.json` e as fotos em `img/uploads/`, ambos só na hospedagem. As páginas são montadas automaticamente a partir
desse catálogo; não é preciso mexer no HTML nem "reconstruir" o site.

## Estrutura

```
index.html              Página inicial: apresentação, acesso ao catálogo, contato, localização, sobre
catalogo.html           Catálogo: busca, filtro por categoria e marca, ordenação
produto.html            Página do produto (produto.html?id=<id-do-produto>)
404.html                Página de "não encontrada"
css/estilo.css          Todo o visual (mobile-first)
js/config.js            Contatos, Instagram e ajustes do catálogo  ← editar aqui
js/nucleo.js            Funções comuns: carrega os dados, monta os cards, links de WhatsApp
js/carrinho.js          Carrinho persistente no navegador e resumo do pedido pelo WhatsApp
js/catalogo.js          Lógica do catálogo
js/produto.js           Lógica da página do produto
data/loja.json          Catálogo administrado pelo painel (criado na hospedagem; fora do Git)
data/produtos.json      Catálogo inicial do Git, importado pelo painel na primeira alteração
data/categorias.json    Categorias iniciais, importadas junto
data/ajustes.json       Formato antigo do painel (só lido na importação, se existir)
data/produtos.exemplo.json   Modelo com todos os campos (não aparece no site)
admin/                  Painel em PHP: produtos, fotos, preços, categorias, lixeira e histórico
admin/loja.php          Leitura, validação e gravação do catálogo e das fotos
admin/instalar.php      Primeira configuração do painel, sem Terminal (desativa-se depois)
admin/.dados/           Credencial privada, bloqueios e backups (conteúdo fora do Git)
img/logo.svg            Logotipo (recortado do arquivo original)
img/marca/              Logotipo original
img/produtos/           Fotos dos produtos iniciais (versionadas no Git)
img/uploads/            Fotos enviadas pelo painel (criadas na hospedagem; fora do Git)
img/icones/, favicon.ico, img/og-image.png   Ícones e imagem de compartilhamento
ferramentas/            Validação do catálogo, testes e geradores (bloqueada ao público pelo .htaccess)
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

**No dia a dia, use o painel** (`/admin/` → Produtos → **+ Novo produto** ou **Editar**). As seções abaixo descrevem
o formato do catálogo, o mesmo que o painel grava em `data/loja.json`. Elas ajudam a entender cada campo do
formulário e a montar o catálogo inicial `data/produtos.json`.

No arquivo, o catálogo é uma lista (`[ ... ]`) de produtos separados por vírgula. Use como modelo os
produtos reais do arquivo (por exemplo `higifral-confort`, `bigfral-dermaplus` e `absorvente-adultcare-plus`) ou o
modelo genérico `data/produtos.exemplo.json`.

**Regra da loja:** nenhum anúncio entra sem foto, descrição e preço. Embalagens parecidas precisam ser distinguidas
por tamanho, quantidade de unidades, medidas e foto. Se houver dúvida sobre o que a foto mostra, pergunte ao
proprietário antes de cadastrar.

### Produto com um único preço

Quando todos os tamanhos custam o mesmo, use `precoCentavos` no produto e escreva a quantidade no próprio tamanho:

```json
{
  "id": "higifral-confort",
  "nome": "Fralda Higifral Confort",
  "categoria": "fraldas-geriatricas",
  "marca": "Higifral",
  "descricao": "A Fralda Geriátrica Higifral Confort é destinada a pessoas adultas com incontinência urinária.",
  "tamanho": ["M — 24 unidades", "G — 20 unidades", "XG — 18 unidades"],
  "precoCentavos": 5490,
  "imagens": ["img/produtos/higifral-confort.jpg", "img/produtos/higifral-confort-g.jpg", "img/produtos/higifral-confort-xg.jpg"],
  "fotosPorOpcao": [{ "tamanho": "M", "imagem": "img/produtos/higifral-confort.jpg" }]
}
```

Se o proprietário informou um único preço, ele vale para todos os tamanhos, mesmo que a quantidade por pacote mude.
Não crie preços por tamanho sem confirmação.

### Produto com embalagens de preços diferentes

Quando o mesmo produto é vendido em pacotes com quantidades e preços diferentes, use `embalagens`. Cada embalagem
tem preço próprio e, se quiser, a lista dos tamanhos em que existe:

```json
"tamanho": ["M", "G", "XG"],
"embalagens": [
  { "id": "pacote-maior",    "rotulo": "18 unidades", "tamanhos": ["M"],  "precoCentavos": 5590 },
  { "id": "pacote-maior-g",  "rotulo": "16 unidades", "tamanhos": ["G"],  "precoCentavos": 5590 },
  { "id": "pacote-maior-xg", "rotulo": "14 unidades", "tamanhos": ["XG"], "precoCentavos": 5180 },
  { "id": "pacote-menor",    "rotulo": "7 unidades",  "tamanhos": ["XG"], "precoCentavos": 2590 }
]
```

- Sem `tamanhos`, a embalagem vale para todos os tamanhos (ex.: Vida Nova Pants com 16 ou 32 unidades).
- O card mostra o menor preço, com "a partir de" quando as embalagens têm preços diferentes. Para mostrar uma
  embalagem específica (preço e foto), marque-a como **Capa** no painel (campo `embalagemCapa`).
- Na página do produto, o preço acompanha a escolha. Com só o tamanho marcado, mostra o das embalagens daquele
  tamanho. Com a embalagem marcada, mostra o preço exato.
- O `id` da embalagem é usado pelo painel e pelo carrinho. Evite trocar o `id` de uma embalagem já publicada:
  ajustes do painel feitos para o `id` antigo deixam de valer.

### Fotos por opção

`imagens` é a galeria, e a primeira foto é a capa do card. `fotosPorOpcao` liga uma foto a um tamanho, a uma
embalagem ou aos dois. Ela vale para a foto principal da página e para a miniatura do item no carrinho:

```json
"fotosPorOpcao": [
  { "tamanho": "G", "embalagem": "hiper-g", "imagem": "img/produtos/vida-nova-economica-g.jpg" },
  { "embalagem": "40-unidades", "imagem": "img/produtos/absorvente-adultcare-plus-40.png" }
]
```

Sem `fotosPorOpcao`, o site procura a foto pelo final do nome do arquivo (`-g.jpg` para G, `-p-m.jpg` para P/M).
Os nomes podem enganar: `vida-nova-economica-g.jpg` é o pacote Hiper de 50 unidades. Confira sempre o tamanho e a
quantidade impressos na embalagem.

### Campos

| Campo | Obrigatório | Para que serve |
|---|---|---|
| `id` | sim | Identificador único, sem espaços nem acentos. Vira o endereço `produto.html?id=...` |
| `nome` | sim | Nome exibido |
| `categoria` | sim | `id` de uma categoria de `data/categorias.json` |
| `descricao` | sim | Texto da página do produto. Uma linha em branco inicia um novo parágrafo |
| `imagens` | sim | Fotos do produto (a primeira é a capa) |
| `precoCentavos` | sim, sem `embalagens` | Preço inteiro em centavos por pacote: `5490` = R$ 54,90 |
| `embalagens` | não | Pacotes com preço próprio (veja acima) |
| `fotosPorOpcao` | não | Foto de cada tamanho ou embalagem (veja acima) |
| `embalagemCapa` | não | `id` da embalagem de capa: o card mostra o preço (com a quantidade) e a foto dela, e a página do produto abre com ela escolhida. No painel, é a caixa **Capa** da embalagem. Sem ela, o card mostra "a partir de" o menor preço |
| `marca` | não | Card, busca e filtro de marcas. Marca com hífen (ARO - Incofral) deve ser escrita igual em todo o catálogo |
| `tamanho` | não | `"G — 20 unidades"` ou uma lista. O seletor só aparece quando há mais de uma opção |
| `informacoes` | não | Tabela "Informações do produto" (`rotulo` e `valor`) |
| `palavrasChave` | não | Termos extras para a busca |
| `destaque`, `ordem`, `criadoEm` | não | Ordenação do catálogo |
| `ativo` | não | `false` esconde o produto sem apagá-lo |

Antes de publicar, rode a validação:

```bash
node ferramentas/validar-catalogo.cjs
```

Ela confere:
- campos obrigatórios, fotos e preços;
- fotos por opção que apontam para tamanhos e embalagens que existem;
- tamanhos sem nenhuma embalagem;
- quantidade do rótulo diferente da tabela de informações;
- marca com hífen escrita sem o hífen.

A mesma validação roda no GitHub Actions.

Para conferir a interface inteira (foto, preço, carrinho e WhatsApp de todas as combinações):
1. Suba o servidor local e abra qualquer página no navegador.
2. Cole o conteúdo de `ferramentas/matriz-opcoes.js` no console.
3. Aguarde a tabela.

Com Node, Playwright e Chrome disponíveis, `node ferramentas/testar-carrinho.cjs` roda o teste automatizado.

Dicas:
- **Carrinho:** permite 1 a 99 pacotes por opção, calcula em centavos e salva no navegador apenas produto, tamanho,
  embalagem e quantidade. Ao recarregar, preços e opções são conferidos no catálogo atual.
- **Finalização:** o cliente informa seu nome no carrinho e abre o WhatsApp com itens, tamanho, embalagem,
  quantidades, subtotais e total. A loja confirma disponibilidade, entrega e pagamento. Não há e-mail configurado.
- **Fotos:** fundo branco, em `img/produtos/`.

### Categorias

`data/categorias.json` define nome e ordem das categorias. **Só aparecem no site as categorias que têm pelo menos um
produto.** Por isso a lista de exemplo não afirma que a loja vende algo que ainda não está no catálogo. Para criar uma
categoria nova, adicione `{ "id": "nova-categoria", "nome": "Nova categoria" }` e use esse `id` nos produtos.

## Contatos e Instagram

Os dados de contato ficam em `js/config.js`. Eles também estão escritos no HTML, para o Google e para quem navega sem
JavaScript. Ao trocar um telefone, procure o número antigo nos arquivos `.html` e troque lá também.

**Instagram:** o perfil `@liguefraldas` está configurado em `js/config.js`, no cartão de contato, nos rodapés e
em `sameAs` nos dados estruturados da página inicial. Ao trocar o perfil, atualize também os links no HTML.

## Publicação

O site está em <https://liguefraldasgeriatricas.com.br/> (HostGator, cPanel com PHP). Os endereços `canonical`,
`og:url`, `robots.txt` e `sitemap.xml` já usam esse domínio.

**Mesclar uma PR no GitHub não publica o site.** A publicação acontece no cPanel:

1. **Git Version Control** → repositório `Ligue-fraldas` → **Manage** → aba **Pull or Deploy**.
2. **Update from Remote**: traz a `main` do GitHub para o clone do cPanel, que fica fora do `public_html`.
3. **Deploy HEAD Commit**: executa o `.cpanel.yml`, que copia os arquivos do site para `public_html`.
4. Abra o site e confira. Se algo antigo continuar aparecendo, recarregue com Ctrl+F5 (cache do navegador).

O `.cpanel.yml` só copia e sobrescreve. Ele **não apaga** de `public_html` o que foi removido do repositório: se uma
foto ou arquivo for excluído do Git, apague-o também pelo Gerenciador de Arquivos.

Estes arquivos ficam só no servidor. Estão fora do Git, então o deploy **não os apaga**:

- `public_html/data/loja.json`: o catálogo administrado pelo painel. Quando ele existe, **é o que o site mostra**;
  o `data/produtos.json` do GitHub deixa de valer para o site.
- `public_html/img/uploads/`: as fotos enviadas pelo painel.
- `public_html/admin/.dados/`: credenciais do painel, controle de tentativas e o histórico (backups) do catálogo.

Para conferir um preço ou foto "errado", olhe o produto no painel: ele mostra exatamente o que o site usa.

## Painel administrativo sem banco de dados

O painel fica em <https://liguefraldasgeriatricas.com.br/admin/> e administra o catálogo inteiro:

- **Produtos:** criar, editar (nome, categoria, marca, descrição, tamanhos, preço ou embalagens com preço próprio,
  informações, palavras para a busca, destaque), suspender, reativar e excluir. Na lista também dá para mudar o
  preço e suspender uma embalagem sem abrir o produto.
- **Fotos:** enviar pelo computador ou celular (JPG, PNG ou WEBP), escolher a capa, mudar a ordem e ligar uma foto a
  um tamanho e/ou embalagem. O navegador reduz a foto antes de enviar, e o servidor confere que é uma imagem de
  verdade e a regrava em JPEG (até 1600 px).
- **Categorias:** criar, renomear, reordenar e apagar. Uma categoria só é apagada quando nenhum produto a usa.
- **Lixeira:** excluir manda o produto para a lixeira, de onde ele pode ser restaurado ou excluído de vez.
- **Histórico:** antes de cada alteração, o painel guarda uma cópia do catálogo (as 50 mais recentes). Dá para voltar
  o catálogo inteiro a qualquer uma delas, e também baixar uma cópia do catálogo atual.

**Regra da loja garantida pelo painel:** nenhum produto é salvo sem nome, descrição, categoria, pelo menos um
tamanho, preço (do produto ou de cada embalagem) e pelo menos uma foto.

Como funciona por dentro (sem banco de dados):

1. Na primeira vez, o painel mostra o catálogo atual do site, montado a partir de `data/produtos.json`,
   `data/categorias.json` e de `data/ajustes.json` (se existir). Na primeira alteração salva, ele grava tudo em
   `data/loja.json`.
2. A partir daí, **o painel é o único lugar para editar produtos.** Alterar `data/produtos.json` no GitHub não muda
   mais o site. O deploy também não apaga nada do que foi cadastrado, porque `data/loja.json` e `img/uploads/` ficam
   fora do Git.
3. Cada gravação é atômica e usa trava, então duas edições ao mesmo tempo não corrompem o arquivo. Se outra janela
   salvou antes, o painel avisa e recarrega, em vez de sobrescrever.
4. Fotos enviadas que não aparecem no catálogo nem em nenhuma versão do Histórico são apagadas depois de 30 dias.

### Primeira configuração (sem Terminal)

As credenciais não ficam no Git, e o painel só funciona depois de configurado. Sem Terminal no cPanel:

1. No cPanel, abra o **Gerenciador de Arquivos** e, em **Configurações**, marque **Mostrar arquivos ocultos**.
2. Entre em `public_html/admin/.dados/` e crie o arquivo `instalar.txt`. Escreva nele um código inventado na hora,
   com pelo menos 16 caracteres, e salve. Não use a senha do painel.
3. Abra <https://liguefraldasgeriatricas.com.br/admin/instalar.php>. Digite o mesmo código, escolha o usuário e uma
   senha nova com pelo menos 12 caracteres.
4. A página grava `admin/.dados/credenciais.php` (só o hash da senha), apaga `instalar.txt` e se desativa. Depois,
   entre em <https://liguefraldasgeriatricas.com.br/admin/>.

O código prova que quem está configurando tem acesso ao cPanel. A página só funciona por HTTPS e enquanto não houver
credenciais, e limita as tentativas erradas.

Para **trocar a senha**, apague `admin/.dados/credenciais.php` pelo Gerenciador de Arquivos e repita os passos. Quem
tiver Terminal pode rodar `php ferramentas/gerar-credenciais-admin.php` no lugar dos passos 2 e 3.

O PHP precisa poder escrever em `data/` e `admin/.dados/`. Pastas com permissão `755`, criadas pelo próprio usuário
do cPanel, já bastam.

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
