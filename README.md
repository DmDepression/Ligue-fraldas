# Ligue Fraldas Geriátricas — site vitrine

Vitrine online da **Ligue Fraldas Geriátricas** (Vila Isabel, Rio de Janeiro).
O site mostra o catálogo de produtos e leva o cliente direto para o **WhatsApp**, o **telefone** ou a **loja física**.
O cliente monta um carrinho por tamanho e quantidade de pacotes e finaliza pelo WhatsApp, com itens,
subtotais e total na mensagem. A loja confirma disponibilidade, entrega e pagamento. Não há pagamento online nem cadastro.

É um site estático (HTML, CSS e JavaScript puros, sem etapa de build). Os produtos ficam num arquivo de dados
(`data/produtos.json`) e as páginas são montadas automaticamente a partir dele. Para incluir produtos, basta editar
esse arquivo. Não é preciso mexer no HTML nem "reconstruir" o site.

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
data/produtos.json      Produtos, tamanhos, embalagens e preços  ← editar aqui
data/ajustes.json       Preços e suspensões do painel (criado na hospedagem; fora do Git)
data/categorias.json    Lista de categorias
data/produtos.exemplo.json   Modelo com todos os campos (não aparece no site)
admin/                  Painel em PHP para alterar preço e suspender/reativar anúncios
admin/.dados/           Credencial privada, bloqueios e backups (conteúdo fora do Git)
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
| `descricao` | sim | Texto da página do produto. Uma linha em branco inicia um novo parágrafo |
| `tamanho` | não | `"G"` ou uma lista `["P", "M", "G"]`. O cliente pode escolher, e a escolha vai na mensagem do WhatsApp |
| `precoCentavos` | para o carrinho | Preço inteiro em centavos por pacote: `5490` significa R$ 54,90. Mesmo preço para todos os tamanhos do produto |
| `imagem` | sim* | Foto principal |
| `imagens` | não | Fotos extras (galeria da página do produto) |
| `variacoes` | não | Grupos de opções, como embalagem ou modelo. A escolha também vai na mensagem |
| `informacoes` | não | Tabela "Informações do produto" (`rotulo` e `valor`) |
| `palavrasChave` | não | Termos extras para a busca encontrar o produto |
| `destaque` | não | `true` prioriza o produto na ordenação por destaques do catálogo |
| `ordem` | não | Número para definir a ordem manualmente (menor aparece antes) |
| `criadoEm` | não | Data `"AAAA-MM-DD"`, usada na ordenação "Mais recentes" |
| `ativo` | não | `false` esconde o produto sem apagá-lo |

\* Pode ser substituído por uma lista `imagens`. Um anúncio só deve ser publicado quando tiver nome, descrição,
preço e ao menos uma foto. Rode `node ferramentas/validar-catalogo.cjs` antes de publicar.

Dicas:
- **Tamanhos e embalagens:** use opções como `"M — 24 unidades"` para que o cliente veja e envie a embalagem correta. Cada tamanho fica separado no carrinho.
- **Carrinho:** permite 1 a 99 pacotes por opção, calcula em centavos e salva apenas produto, tamanho e quantidade no navegador. Ao recarregar, preços e opções são conferidos no catálogo atual. Se o navegador bloquear o armazenamento, funciona durante a página atual.
- **Finalização:** o cliente informa seu nome no carrinho. Abre o WhatsApp com “Oi, me chamo [nome]! Gostaria dos seguintes itens:”, seguida dos itens, quantidades, subtotais, total e “Por gentileza.”. O nome não é salvo no navegador. O cliente envia a mensagem no WhatsApp. O carrinho é mantido, pois abrir o aplicativo não confirma o envio. E-mail ainda não está configurado.
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

**Instagram:** o perfil `@liguefraldas` está configurado em `js/config.js`, no cartão de contato, nos rodapés e
em `sameAs` nos dados estruturados da página inicial. Ao trocar o perfil, atualize também os links no HTML.

## Antes de publicar

1. **Domínio:** troque `https://www.SEU-DOMINIO.com.br` pelo endereço real em `index.html`, `catalogo.html`,
   `produto.html`, `robots.txt` e `sitemap.xml` (procurar e substituir no editor resolve).
2. **Hospedagem:** a vitrine funciona em hospedagem estática. O painel administrativo exige PHP 8 e, por isso, deve
   rodar na HostGator ou em outra hospedagem PHP. O GitHub Pages publica apenas a vitrine e exclui os arquivos do admin.
3. **404:** a maioria dessas hospedagens usa o `404.html` automaticamente.
4. **Google:** cadastre o site no Google Search Console e envie o `sitemap.xml`. Para buscas como "fraldas geriátricas
   Vila Isabel", o Perfil da Empresa no Google (Google Maps) com o mesmo endereço e telefones ajuda muito.

O catálogo (`.json`) é sempre buscado atualizado. Mudanças em CSS ou JS podem levar alguns minutos para aparecer em
quem já visitou o site, por causa do cache do navegador.

## Painel administrativo sem banco de dados

O painel fica em `/admin/` e foi limitado às duas operações solicitadas:

- alterar o preço do produto ou de uma embalagem;
- suspender e reativar o anúncio sem apagá-lo.

Não é necessário MySQL. O painel guarda somente preço e status em `data/ajustes.json`, cria uma cópia de segurança
antes de cada alteração e mantém os 30 backups mais recentes em `admin/.dados/backups/`. O catálogo principal
`data/produtos.json` continua intacto. A gravação usa bloqueio e troca atômica para evitar que duas edições simultâneas
corrompam os ajustes.

As credenciais não ficam no Git. Após a primeira instalação na HostGator, abra o **Terminal do cPanel**, entre na pasta
do site e execute:

```bash
php ferramentas/gerar-credenciais-admin.php
```

Informe o usuário e uma senha nova com pelo menos 12 caracteres. O comando cria
`admin/.dados/credenciais.php`, arquivo privado ignorado pelo Git. Não reutilize a senha antiga que já apareceu no
histórico do repositório. Depois acesse `https://SEU-DOMINIO/admin/`.

O PHP precisa ter permissão para escrever em `data/` e `admin/.dados/`. Em uma instalação normal feita pelo mesmo
usuário do cPanel, a permissão `755` nas pastas é suficiente. O arquivo `data/ajustes.json` será criado pelo painel.

## Puxar do GitHub para a HostGator

Sim. Pelo **Git Version Control** do cPanel, clone `https://github.com/DmDepression/Ligue-fraldas` para a pasta do site.
Também é possível usar o Terminal do cPanel em uma pasta vazia:

```bash
cd ~/public_html
git clone https://github.com/DmDepression/Ligue-fraldas.git .
```

Nas próximas atualizações:

```bash
cd ~/public_html
git pull --ff-only origin main
```

As credenciais, os backups e `data/ajustes.json` permanecem no servidor porque estão ignorados pelo Git. Assim, um
`git pull` atualiza o catálogo e o código sem apagar os preços ou suspensões feitos pelo painel. Depois de cada
atualização, rode `node ferramentas/validar-catalogo.cjs` se o Node estiver disponível no servidor; essa mesma
validação já roda automaticamente no GitHub Actions.

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

## Embalagens (mesmo produto, pacotes diferentes)

Quando o produto é igual e muda só a quantidade de unidades, use o campo `embalagens` em `data/produtos.json` em vez de criar outro produto:

```json
"embalagens": [
  { "id": "economica-g", "rotulo": "Econômica — 30 unidades", "tamanhos": ["G"], "precoCentavos": 6990 },
  { "id": "hiper-g", "rotulo": "Hiper — 50 unidades", "tamanhos": ["G"], "precoCentavos": 11190 }
]
```

- `tamanhos` é opcional: sem ele, a embalagem vale para todos os tamanhos.
- Com `embalagens`, o produto não usa `precoCentavos`: o card mostra "a partir de" e a página do produto deixa escolher tamanho e embalagem.
- No admin, cada embalagem tem preço e suspensão próprios.
