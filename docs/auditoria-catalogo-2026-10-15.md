# Auditoria do catálogo — 15/10/2026

Base: `main` em `fa63a73` (PRs #1 a #7 mescladas). O site publicado em <https://liguefraldasgeriatricas.com.br/>
foi comparado arquivo a arquivo com essa `main`: `data/produtos.json`, `data/categorias.json`, `js/*.js`,
`css/estilo.css` e as três páginas são idênticos. `data/ajustes.json` respondeu 404, portanto nenhum preço ou status
estava sobreposto pelo painel. A consulta `admin/api.php?acao=sessao` respondeu `configurado: false`: o painel
**ainda não tem credenciais** na hospedagem.

Método:
1. Leitura de `README.md`, `data/*.json`, `js/nucleo.js`, `js/produto.js`, `js/carrinho.js` e do painel (`admin/`).
2. Conferência visual das 79 fotos de `img/produtos/`, lendo tamanho, quantidade e medidas impressos em cada
   embalagem, e comparação por hash perceptivo para achar fotos repetidas. Nenhuma foto é cópia de outra. O par mais
   parecido, Geriatex Plus G/EG, muda a letra do tamanho e é legítimo.
3. Matriz na interface (`ferramentas/matriz-opcoes.js`). Para cada produto e cada combinação, ela marca a opção,
   lê preço e foto, adiciona ao carrinho e lê foto, opção, preço, total e a linha da mensagem de WhatsApp. Também
   testa a ida e volta entre o primeiro e o último tamanho.
4. Teste dos ajustes do painel com um `data/ajustes.json` temporário: preço alterado, embalagem suspensa, produto
   suspenso e todas as embalagens suspensas.
5. Larguras de 320, 375, 768, 1024 e 1366 px nas páginas alteradas.

## Erros confirmados e corrigidos

| # | Problema | Onde | Correção |
|---|---|---|---|
| 1 | A foto do item no carrinho era sempre a capa do produto. Bigfral XG/7 aparecia com o pacote M, Adultcare 40 com o pacote de 20, Higifral G/XG com o M, Vida Nova Hiper com o Econômica, Pants 32 com o 16. | `js/carrinho.js` | A regra de foto por opção foi para `js/nucleo.js` (`Ligue.fotoDaOpcao`) e passou a valer para a página e o carrinho. |
| 2 | Na Bigfral, escolher só o XG mostrava R$ 55,90 (preço de M/G), quando o XG custa R$ 51,80 ou R$ 25,90. O card mostrava "R$ 55,90" sem "a partir de", mas há opção de R$ 25,90. | `js/produto.js`, `data/produtos.json` | O preço segue a escolha (`Ligue.precoDaEscolha`): só tamanho → "a partir de" das embalagens daquele tamanho; embalagem marcada → preço exato. Card e página usam a mesma regra. Saíram `embalagemDestaque` e `mostrarPrecoAPartir: false` da Bigfral, vindos do commit `31095c6`, anterior à decisão final de embalagens. **Os preços não mudaram.** |
| 3 | O hífen de "ARO - Incofral" estava no nome e na marca, mas as três descrições ainda diziam "ARO Incofral". | `data/produtos.json` | As três descrições foram padronizadas. O validador agora acusa qualquer marca com hífen escrita sem ele. |
| 4 | `canonical`, `og:url`, `og:image`, dados estruturados, `robots.txt` e `sitemap.xml` apontavam para `https://www.SEU-DOMINIO.com.br` **no site publicado**. | páginas, `robots.txt`, `sitemap.xml` | Trocado para `https://liguefraldasgeriatricas.com.br`. |
| 5 | O painel não está configurado e o README exigia o Terminal do cPanel, que o proprietário não tem. | `admin/` | Novo `admin/instalar.php`: configuração única que exige um código criado pelo Gerenciador de Arquivos. Funciona só por HTTPS, limita tentativas, grava somente o hash e se desativa. O login do painel indica esse caminho. |
| 6 | Uma embalagem suspensa no painel podia deixar um tamanho sem nada para comprar (Bigfral M). Com todas as embalagens suspensas, a Pants voltaria a vender sem quantidade definida. | `js/nucleo.js` | Tamanho sem embalagem ativa deixa de ser oferecido. Produto sem nenhuma embalagem ativa fica só com "Consultar pelo WhatsApp". |
| 7 | O README descrevia um estágio anterior: preço único por produto, clonagem no `public_html` com `git pull`, Terminal, domínio a trocar. | `README.md` | Documentados embalagens, preço por embalagem, fotos por opção, painel sem Terminal, deploy pelo cPanel e o papel de `data/ajustes.json`. |

O validador (`ferramentas/validar-catalogo.cjs`) passou a acusar também:
- foto por opção apontando para tamanho ou embalagem inexistente;
- embalagem com tamanho que o produto não oferece;
- tamanho sem nenhuma embalagem;
- quantidade do rótulo diferente da tabela de informações (o caso dos protetores ARO);
- marca com hífen escrita sem o hífen.

Rodado sobre o catálogo antigo, ele aponta as três descrições do ARO.

## Dúvidas para o proprietário (nada foi alterado nestes pontos)

1. **Protetor ARO - Incofral Basic G:** a foto mostra impresso "10 unidades de 117,5 cm × 77,5 cm", a mesma medida
   do protetor M. A ficha do G diz "aproximadamente 148 × 82 cm", que é a medida do protetor G da Adultcare. Qual é o
   correto: a foto é de um pacote M (e falta a foto do G) ou o G também mede 117,5 × 77,5 cm?
2. **Fralda Tena Confort, tamanho EG:** a informação está como "110 a 165 kg · cintura acima de 90 cm". Parece
   invertida ("acima de 90 kg · cintura de 110 a 165 cm", como na Biofral EG). Confirmar.
3. **Fralda Adultcare:** o nome no site é "Fralda Adultcare", mas a descrição e as três embalagens dizem
   "Adultcare Plus". Renomear para "Fralda Adultcare Plus"?
4. **Quantidade de unidades fora do rótulo do tamanho.** As fotos mostram as quantidades abaixo, mas o tamanho
   aparece sem elas. Os preços ficam como estão (preço único por produto). Posso incluir "— N unidades" nos tamanhos?
   - Higifral Premium: M 18 · G 16 · XG 14
   - Tena Confort: M 26 · G 20 · EG 18 (P não visível na foto)
   - Adultcare: M 26 · G 24 · EG 21
   - Biofral Classic: M 32 · G 28 · EG 24
   - Mais Conforto: 8 em todos
   - Geriatex Plus e Geriatex Premium: M 9 · G 7 · EG 7
   - Tena Plus Size (fralda): XXL 8
   - Roupa Íntima Geriatex: 16 · Tena Pants Confort: 18 · Tena Pants Noturna: 16 · Plenitud: 16
5. **Roupa Íntima Plenitud:** a embalagem da foto diz "Plus Fit" e a descrição diz "Plenitud Plus". Ajustar o texto?

## Já corretos (conferidos na foto, na interface e no carrinho)

- Higifral Confort: descrição curta, M 24 · G 20 · XG 18 a R$ 54,90; M mostra a foto M; M → XG → M volta à foto M.
- Tena Slip Noturna: M, G e EG com 24 unidades a R$ 99,90; três fotos distintas, cada tamanho com a sua.
- Vida Nova Confort: G 30 / XG 26 a R$ 69,90; G 50 / XG 42 a R$ 111,90; G → XG → G volta à foto G; sem foto
  duplicada.
- Bigfral Dermaplus: M 18 e G 16 a R$ 55,90; XG 14 a R$ 51,80; XG 7 a R$ 25,90, oferecido só no XG (desabilitado em
  M e G), com a foto fornecida.
- Vida Nova Pants: P/M e G/XG, 16 a R$ 42,90 e 32 a R$ 81,90; capa do card = pacote de 16; cada combinação mostra
  a sua foto.
- ARO - Incofral: absorvente Basic 60 a R$ 33,90; protetores M e G com 10 unidades a R$ 25,90 e R$ 32,90 (rótulo,
  informações, carrinho e mensagem coerentes).
- Adultcare Plus: card com 20 e 40 unidades; 20 a R$ 19,90 e 40 a R$ 37,90; escolher 40 troca foto, preço e total.
- Luva Safe Max Powder Free: M e G, caixa com 100, R$ 25,90.
- Categorias: toalhas umedecidas em Higiene pessoal; "Outros" substituída por Tapete Pet.
- Seletores: produtos de opção única não mostram seletor de tamanho.

## O que falta fazer na hospedagem (depois de mesclar)

1. cPanel → Git Version Control → `Ligue-fraldas` → **Update from Remote** → **Deploy HEAD Commit**.
2. Configurar o painel pelo `admin/instalar.php` (passo a passo no README).
3. Conferir no site: Bigfral (card "a partir de R$ 25,90"; XG → "a partir de R$ 25,90"), carrinho com a foto da
   embalagem e o `view-source` da página inicial com `https://liguefraldasgeriatricas.com.br` no `canonical`.

## Inventário das 38 fichas

Todas as fichas estão ativas no `data/produtos.json` e não há ajuste de painel publicado.

| # | Produto | Categoria | Opções e preço | Fotos | Leitura das embalagens nas fotos |
|---|---|---|---|---|---|
| 1 | Fralda Higifral Confort | Fraldas geriátricas | M — 24 unidades · G — 20 unidades · XG — 18 unidades: R$ 54,90 | 3 | M 24 · G 20 · XG 18 — confere |
| 2 | Fralda Tena Slip Noturna | Fraldas geriátricas | M — 24 unidades · G — 24 unidades · EG — 24 unidades: R$ 99,90 | 3 | M 24 · G 24 · EG 24 — confere, 3 fotos distintas |
| 3 | Fralda Vida Nova Confort | Fraldas geriátricas | G · Econômica — 30 unidades: R$ 69,90<br>XG · Econômica — 26 unidades: R$ 69,90<br>G · Hiper — 50 unidades: R$ 111,90<br>XG · Hiper — 42 unidades: R$ 111,90 | 4 | G 30 · XG 26 · G 50 · XG 42 — confere (os arquivos "economica" são os pacotes Hiper) |
| 4 | Fralda Higifral Premium | Fraldas geriátricas | M · G · XG: R$ 59,90 | 3 | M 18 · G 16 · XG 14 — quantidade não está no rótulo |
| 5 | Fralda Tena Confort | Fraldas geriátricas | P · M · G · EG: R$ 59,90 | 4 | P (qtd. não visível) · M 26 · G 20 · EG 18 — quantidade não está no rótulo |
| 6 | Fralda Adultcare | Fraldas geriátricas | M · G · EG: R$ 73,90 | 3 | pacote "Adultcare plus": M 26 · G 24 · EG 21 — quantidade não está no rótulo |
| 7 | Fralda Bigfral Dermaplus | Fraldas geriátricas | M · 18 unidades: R$ 55,90<br>G · 16 unidades: R$ 55,90<br>XG · 14 unidades: R$ 51,80<br>XG · 7 unidades: R$ 25,90 | 4 | M 18 · G 16 · XG 14 · XG 7 — confere |
| 8 | Fralda Biofral Classic | Fraldas geriátricas | M · G · EG: R$ 64,90 | 3 | M 32 · G 28 · EG 24 — quantidade não está no rótulo |
| 9 | Fralda Mais Conforto | Fraldas geriátricas | M · G · XG: R$ 14,90 | 3 | M 8 · G 8 · XG 8 — quantidade não está no rótulo |
| 10 | Fralda Geriatex Plus | Fraldas geriátricas | M · G · EG: R$ 23,90 | 3 | M 9 · G 7 · EG 7 — quantidade não está no rótulo |
| 11 | Fralda Geriatex Premium | Fraldas geriátricas | M · G · EG: R$ 26,90 | 3 | M 9 · G 7 · EG 7 — quantidade não está no rótulo |
| 12 | Fralda Tena Plus Size | Fraldas geriátricas | XXL: R$ 67,90 | 1 | XXL 8 — quantidade não está no rótulo |
| 13 | Roupa Íntima Vida Nova | Roupas íntimas descartáveis | P/M/G/XG · 16 unidades: R$ 42,90<br>P/M/G/XG · 32 unidades: R$ 81,90 | 4 | P/M 16 · P/M 32 · G/XG 16 · G/XG 32 — confere; capa do card = 16 |
| 14 | Roupa Íntima Higifral Full Care | Roupas íntimas descartáveis | XXG — 14 unidades: R$ 49,90 | 1 | XXG 14 — confere |
| 15 | Roupa Íntima Geriatex | Roupas íntimas descartáveis | P/M · G/EG: R$ 51,90 | 2 | P/M 16 · G/EG 16 — quantidade não está no rótulo |
| 16 | Roupa Íntima Higifral Noturna | Roupas íntimas descartáveis | P/M — 16 unidades · G/XG — 16 unidades: R$ 57,90 | 2 | P/M 16 · G/XG 16 — confere |
| 17 | Roupa Íntima Tena Confort | Roupas íntimas descartáveis | P/M · G/EG: R$ 55,90 | 2 | P/M 18 · G/EG 18 — quantidade não está no rótulo |
| 18 | Roupa Íntima Tena Noturna | Roupas íntimas descartáveis | P/M · G/EG: R$ 66,90 | 2 | P/M 16 · G/EG 16 — quantidade não está no rótulo |
| 19 | Roupa Íntima Tena Plus Size | Roupas íntimas descartáveis | XXL — 8 unidades: R$ 64,90 | 1 | XXL 8 — confere |
| 20 | Roupa Íntima Plenitud | Roupas íntimas descartáveis | P/M · G/XG: R$ 55,90 | 2 | P/M 16 · G/XG 16 — quantidade não está no rótulo; pacote diz "Plus Fit" |
| 21 | Absorvente ARO - Incofral Basic | Absorventes | Único — 60 unidades: R$ 33,90 | 2 | Único 60 (2 fotos do mesmo pacote) — confere |
| 22 | Protetor ARO - Incofral Basic M | Protetores | M — 10 unidades: R$ 25,90 | 1 | 10 unidades de 117,5 × 77,5 cm — confere |
| 23 | Protetor ARO - Incofral Basic G | Protetores | G — 10 unidades: R$ 32,90 | 1 | **DÚVIDA:** a foto mostra "10 unidades de 117,5 × 77,5 cm" (medida do M); a ficha diz 148 × 82 cm |
| 24 | Absorvente Adultcare Plus | Absorventes | Único · 20 unidades: R$ 19,90<br>Único · 40 unidades: R$ 37,90 | 2 | 20 e 40, tamanho único — confere |
| 25 | Absorvente Adultcare Premium | Absorventes | Único — 20 unidades: R$ 20,90 | 1 | 20 — confere |
| 26 | Absorvente Adultcare Refil | Absorventes | Único — 18 unidades: R$ 20,90 | 1 | 18 — confere |
| 27 | Absorvente Mais Conforto | Absorventes | Único — 40 unidades: R$ 25,90 | 1 | 40 — confere |
| 28 | Absorvente Geriatex | Absorventes | Único — 20 unidades: R$ 20,90 | 1 | 20 — confere |
| 29 | Protetor de Colchão Adultcare | Protetores | M — 6 unidades · G — 5 unidades: R$ 33,90 | 2 | M 6 (117,5 × 77,5) · G 5 (148 × 82) — confere |
| 30 | Protetor de Colchão Higifral | Protetores | M — 6 unidades · G — 5 unidades: R$ 25,90 | 2 | M 6 (1,20 × 0,80 m) · G 5 (1,50 × 0,80 m) — confere |
| 31 | Toalha Umedecida Vida Nova | Higiene pessoal | Pacote — 40 unidades: R$ 9,90 | 1 | 40, 22 × 20 cm — confere |
| 32 | Toalha Umedecida Higifral | Higiene pessoal | Pacote — 40 unidades: R$ 11,90 | 1 | 40, 25 × 20 cm — confere |
| 33 | Óleo de Girassol Farmachem | Higiene pessoal | Frasco de 200 ml: R$ 10,90 | 1 | frasco; volume não legível na foto |
| 34 | Tapete Pet Super Dog | Tapete Pet | 80 × 60 cm — 30 unidades: R$ 66,90 | 1 | 30, 80 × 60 cm — confere |
| 35 | Luva de Látex Inoven | Luvas | P — 100 unidades · M — 100 unidades · G — 100 unidades: R$ 23,90 | 3 | P · M · G, 100 — confere |
| 36 | Luva de Nitrilo Inoven | Luvas | M — 100 unidades · G — 100 unidades: R$ 25,90 | 2 | M · G, 100 — confere |
| 37 | Luva Nitrílica Safe Max Powder Free | Luvas | M — 100 unidades · G — 100 unidades: R$ 25,90 | 1 | 100; uma foto para M e G — confere |
| 38 | Luva de Vinil Inoven | Luvas | M — 100 unidades · G — 100 unidades: R$ 15,90 | 2 | M · G, 100 — confere |

## Matriz de resultados por combinação (depois das correções)

79 combinações, nenhuma divergência entre foto da página e foto do carrinho, preço da página e do carrinho, total
e linha da mensagem de WhatsApp. "Só tamanho" é o preço exibido quando apenas o tamanho está marcado. Na Pants, a
embalagem marcada no tamanho anterior continua marcada ao trocar de tamanho, por isso G/XG já abre com o preço da
embalagem escolhida.

| Produto | Tamanho | Embalagem | Preço na página | Foto da página | Foto no carrinho | Carrinho: opção · preço / total |
|---|---|---|---|---|---|---|
| higifral-confort | M — 24 unidades | — | R$ 54,90 | higifral-confort.jpg | = página | M — 24 unidades · R$ 54,90 / R$ 54,90 |
| higifral-confort | G — 20 unidades | — | R$ 54,90 | higifral-confort-g.jpg | = página | G — 20 unidades · R$ 54,90 / R$ 54,90 |
| higifral-confort | XG — 18 unidades | — | R$ 54,90 | higifral-confort-xg.jpg | = página | XG — 18 unidades · R$ 54,90 / R$ 54,90 |
| tena-slip-noturna | M — 24 unidades | — | R$ 99,90 | tena-slip-noturna.jpg | = página | M — 24 unidades · R$ 99,90 / R$ 99,90 |
| tena-slip-noturna | G — 24 unidades | — | R$ 99,90 | tena-slip-noturna-g.jpg | = página | G — 24 unidades · R$ 99,90 / R$ 99,90 |
| tena-slip-noturna | EG — 24 unidades | — | R$ 99,90 | tena-slip-noturna-eg.jpg | = página | EG — 24 unidades · R$ 99,90 / R$ 99,90 |
| vida-nova-confort | G | Econômica — 30 unidades | R$ 69,90 (só tamanho: a partir de R$ 69,90) | vida-nova-confort.png | = página | G · Econômica — 30 unidades · R$ 69,90 / R$ 69,90 |
| vida-nova-confort | G | Hiper — 50 unidades | R$ 111,90 (só tamanho: a partir de R$ 69,90) | vida-nova-economica-g.jpg | = página | G · Hiper — 50 unidades · R$ 111,90 / R$ 111,90 |
| vida-nova-confort | XG | Econômica — 26 unidades | R$ 69,90 (só tamanho: a partir de R$ 69,90) | vida-nova-confort-xg.jpg | = página | XG · Econômica — 26 unidades · R$ 69,90 / R$ 69,90 |
| vida-nova-confort | XG | Hiper — 42 unidades | R$ 111,90 (só tamanho: a partir de R$ 69,90) | vida-nova-economica-xg.jpg | = página | XG · Hiper — 42 unidades · R$ 111,90 / R$ 111,90 |
| higifral-premium | M | — | R$ 59,90 | higifral-premium-m.jpg | = página | M · R$ 59,90 / R$ 59,90 |
| higifral-premium | G | — | R$ 59,90 | higifral-premium-g.jpg | = página | G · R$ 59,90 / R$ 59,90 |
| higifral-premium | XG | — | R$ 59,90 | higifral-premium-xg.jpg | = página | XG · R$ 59,90 / R$ 59,90 |
| tena-confort | P | — | R$ 59,90 | tena-confort-p.jpg | = página | P · R$ 59,90 / R$ 59,90 |
| tena-confort | M | — | R$ 59,90 | tena-confort-m.jpg | = página | M · R$ 59,90 / R$ 59,90 |
| tena-confort | G | — | R$ 59,90 | tena-confort-g.jpg | = página | G · R$ 59,90 / R$ 59,90 |
| tena-confort | EG | — | R$ 59,90 | tena-confort-eg.jpg | = página | EG · R$ 59,90 / R$ 59,90 |
| adultcare | M | — | R$ 73,90 | adultcare-m.jpg | = página | M · R$ 73,90 / R$ 73,90 |
| adultcare | G | — | R$ 73,90 | adultcare-g.jpg | = página | G · R$ 73,90 / R$ 73,90 |
| adultcare | EG | — | R$ 73,90 | adultcare-eg.jpg | = página | EG · R$ 73,90 / R$ 73,90 |
| bigfral-dermaplus | M | 18 unidades | R$ 55,90 (só tamanho: R$ 55,90) | bigfral-dermaplus-m.jpg | = página | M · 18 unidades · R$ 55,90 / R$ 55,90 |
| bigfral-dermaplus | G | 16 unidades | R$ 55,90 (só tamanho: R$ 55,90) | bigfral-dermaplus-g.jpg | = página | G · 16 unidades · R$ 55,90 / R$ 55,90 |
| bigfral-dermaplus | XG | 14 unidades | R$ 51,80 (só tamanho: a partir de R$ 25,90) | bigfral-dermaplus-xg.jpg | = página | XG · 14 unidades · R$ 51,80 / R$ 51,80 |
| bigfral-dermaplus | XG | 7 unidades | R$ 25,90 (só tamanho: a partir de R$ 25,90) | bigfral-dermaplus-xg-7.png | = página | XG · 7 unidades · R$ 25,90 / R$ 25,90 |
| biofral-classic | M | — | R$ 64,90 | biofral-classic-m.jpg | = página | M · R$ 64,90 / R$ 64,90 |
| biofral-classic | G | — | R$ 64,90 | biofral-classic-g.jpg | = página | G · R$ 64,90 / R$ 64,90 |
| biofral-classic | EG | — | R$ 64,90 | biofral-classic-eg.jpg | = página | EG · R$ 64,90 / R$ 64,90 |
| mais-conforto | M | — | R$ 14,90 | mais-conforto-m.jpg | = página | M · R$ 14,90 / R$ 14,90 |
| mais-conforto | G | — | R$ 14,90 | mais-conforto-g.jpg | = página | G · R$ 14,90 / R$ 14,90 |
| mais-conforto | XG | — | R$ 14,90 | mais-conforto-xg.jpg | = página | XG · R$ 14,90 / R$ 14,90 |
| geriatex-plus | M | — | R$ 23,90 | geriatex-plus-m.jpg | = página | M · R$ 23,90 / R$ 23,90 |
| geriatex-plus | G | — | R$ 23,90 | geriatex-plus-g.jpg | = página | G · R$ 23,90 / R$ 23,90 |
| geriatex-plus | EG | — | R$ 23,90 | geriatex-plus-eg.jpg | = página | EG · R$ 23,90 / R$ 23,90 |
| geriatex-premium | M | — | R$ 26,90 | geriatex-premium-m.jpg | = página | M · R$ 26,90 / R$ 26,90 |
| geriatex-premium | G | — | R$ 26,90 | geriatex-premium-g.jpg | = página | G · R$ 26,90 / R$ 26,90 |
| geriatex-premium | EG | — | R$ 26,90 | geriatex-premium-eg.jpg | = página | EG · R$ 26,90 / R$ 26,90 |
| tena-plus-size | XXL (único) | — | R$ 67,90 | tena-plus-size-xxl.jpg | = página | XXL · R$ 67,90 / R$ 67,90 |
| roupa-intima-vida-nova | P/M | 16 unidades | R$ 42,90 (só tamanho: a partir de R$ 42,90) | roupa-intima-vida-nova-p-m-2.jpg | = página | P/M · 16 unidades · R$ 42,90 / R$ 42,90 |
| roupa-intima-vida-nova | P/M | 32 unidades | R$ 81,90 (só tamanho: a partir de R$ 42,90) | roupa-intima-vida-nova-p-m.jpg | = página | P/M · 32 unidades · R$ 81,90 / R$ 81,90 |
| roupa-intima-vida-nova | G/XG | 16 unidades | R$ 42,90 | roupa-intima-vida-nova-g-xg-2.jpg | = página | G/XG · 16 unidades · R$ 42,90 / R$ 42,90 |
| roupa-intima-vida-nova | G/XG | 32 unidades | R$ 81,90 | roupa-intima-vida-nova-g-xg.jpg | = página | G/XG · 32 unidades · R$ 81,90 / R$ 81,90 |
| roupa-intima-higifral-full-care | XXG (único) | — | R$ 49,90 | roupa-intima-higifral-full-care-xxg.jpg | = página | XXG — 14 unidades · R$ 49,90 / R$ 49,90 |
| roupa-intima-geriatex | P/M | — | R$ 51,90 | roupa-intima-geriatex-p-m.jpg | = página | P/M · R$ 51,90 / R$ 51,90 |
| roupa-intima-geriatex | G/EG | — | R$ 51,90 | roupa-intima-geriatex-g-eg.jpg | = página | G/EG · R$ 51,90 / R$ 51,90 |
| roupa-intima-higifral-noturna | P/M — 16 unidades | — | R$ 57,90 | roupa-intima-higifral-noturna-p-m.jpg | = página | P/M — 16 unidades · R$ 57,90 / R$ 57,90 |
| roupa-intima-higifral-noturna | G/XG — 16 unidades | — | R$ 57,90 | roupa-intima-higifral-noturna-g-xg.jpg | = página | G/XG — 16 unidades · R$ 57,90 / R$ 57,90 |
| roupa-intima-tena-confort | P/M | — | R$ 55,90 | roupa-intima-tena-confort-p-m.jpg | = página | P/M · R$ 55,90 / R$ 55,90 |
| roupa-intima-tena-confort | G/EG | — | R$ 55,90 | roupa-intima-tena-confort-g-eg.jpg | = página | G/EG · R$ 55,90 / R$ 55,90 |
| roupa-intima-tena-noturna | P/M | — | R$ 66,90 | roupa-intima-tena-noturna-p-m.jpg | = página | P/M · R$ 66,90 / R$ 66,90 |
| roupa-intima-tena-noturna | G/EG | — | R$ 66,90 | roupa-intima-tena-noturna-g-eg.jpg | = página | G/EG · R$ 66,90 / R$ 66,90 |
| roupa-intima-tena-plus-size | XXL (único) | — | R$ 64,90 | roupa-intima-tena-plus-size-xxl.jpg | = página | XXL — 8 unidades · R$ 64,90 / R$ 64,90 |
| roupa-intima-plenitud | P/M | — | R$ 55,90 | roupa-intima-plenitud-p-m.jpg | = página | P/M · R$ 55,90 / R$ 55,90 |
| roupa-intima-plenitud | G/XG | — | R$ 55,90 | roupa-intima-plenitud-g-xg.jpg | = página | G/XG · R$ 55,90 / R$ 55,90 |
| absorvente-aro-incofral-basic | Único (sem seletor) | — | R$ 33,90 | absorvente-aro-incofral-basic.jpg | = página | Único — 60 unidades · R$ 33,90 / R$ 33,90 |
| protetor-aro-incofral-basic-m | M (sem seletor) | — | R$ 25,90 | protetor-aro-incofral-basic-m.jpg | = página | M — 10 unidades · R$ 25,90 / R$ 25,90 |
| protetor-aro-incofral-basic-g | G (sem seletor) | — | R$ 32,90 | protetor-aro-incofral-basic-g.jpg | = página | G — 10 unidades · R$ 32,90 / R$ 32,90 |
| absorvente-adultcare-plus | Único (sem seletor) | 20 unidades | R$ 19,90 (sem escolha: a partir de R$ 19,90) | absorvente-adultcare-plus.jpg | = página | Único · 20 unidades · R$ 19,90 / R$ 19,90 |
| absorvente-adultcare-plus | Único (sem seletor) | 40 unidades | R$ 37,90 | absorvente-adultcare-plus-40.png | = página | Único · 40 unidades · R$ 37,90 / R$ 37,90 |
| absorvente-adultcare-premium | Único (sem seletor) | — | R$ 20,90 | absorvente-adultcare-premium.jpg | = página | Único — 20 unidades · R$ 20,90 / R$ 20,90 |
| absorvente-adultcare-refil | Único (sem seletor) | — | R$ 20,90 | absorvente-adultcare-refil.jpg | = página | Único — 18 unidades · R$ 20,90 / R$ 20,90 |
| absorvente-mais-conforto | Único (sem seletor) | — | R$ 25,90 | absorvente-mais-conforto.jpg | = página | Único — 40 unidades · R$ 25,90 / R$ 25,90 |
| absorvente-geriatex | Único (sem seletor) | — | R$ 20,90 | absorvente-geriatex.jpg | = página | Único — 20 unidades · R$ 20,90 / R$ 20,90 |
| protetor-colchao-adultcare | M — 6 unidades | — | R$ 33,90 | protetor-colchao-adultcare-m.jpg | = página | M — 6 unidades · R$ 33,90 / R$ 33,90 |
| protetor-colchao-adultcare | G — 5 unidades | — | R$ 33,90 | protetor-colchao-adultcare-g.jpg | = página | G — 5 unidades · R$ 33,90 / R$ 33,90 |
| protetor-colchao-higifral | M — 6 unidades | — | R$ 25,90 | protetor-colchao-higifral-m.jpg | = página | M — 6 unidades · R$ 25,90 / R$ 25,90 |
| protetor-colchao-higifral | G — 5 unidades | — | R$ 25,90 | protetor-colchao-higifral-g.jpg | = página | G — 5 unidades · R$ 25,90 / R$ 25,90 |
| toalha-umedecida-vida-nova | Pacote (sem seletor) | — | R$ 9,90 | toalha-umedecida-vida-nova.jpg | = página | Pacote — 40 unidades · R$ 9,90 / R$ 9,90 |
| toalha-umedecida-higifral | Pacote (sem seletor) | — | R$ 11,90 | toalha-umedecida-higifral.jpg | = página | Pacote — 40 unidades · R$ 11,90 / R$ 11,90 |
| oleo-girassol-farmachem | Frasco (sem seletor) | — | R$ 10,90 | oleo-girassol-farmachem.jpg | = página | Frasco de 200 ml · R$ 10,90 / R$ 10,90 |
| tapete-pet-super-dog | Único (sem seletor) | — | R$ 66,90 | tapete-pet-super-dog.jpg | = página | 80 × 60 cm — 30 unidades · R$ 66,90 / R$ 66,90 |
| luva-latex-inoven | P — 100 unidades | — | R$ 23,90 | luva-latex-inoven-p.jpg | = página | P — 100 unidades · R$ 23,90 / R$ 23,90 |
| luva-latex-inoven | M — 100 unidades | — | R$ 23,90 | luva-latex-inoven-m.jpg | = página | M — 100 unidades · R$ 23,90 / R$ 23,90 |
| luva-latex-inoven | G — 100 unidades | — | R$ 23,90 | luva-latex-inoven-g.jpg | = página | G — 100 unidades · R$ 23,90 / R$ 23,90 |
| luva-nitrilo-inoven | M — 100 unidades | — | R$ 25,90 | luva-nitrilo-inoven-m.jpg | = página | M — 100 unidades · R$ 25,90 / R$ 25,90 |
| luva-nitrilo-inoven | G — 100 unidades | — | R$ 25,90 | luva-nitrilo-inoven-g.jpg | = página | G — 100 unidades · R$ 25,90 / R$ 25,90 |
| luva-nitrilo-safe-max-powder-free | M — 100 unidades | — | R$ 25,90 | luva-nitrilo-safe-max-powder-free.png | = página | M — 100 unidades · R$ 25,90 / R$ 25,90 |
| luva-nitrilo-safe-max-powder-free | G — 100 unidades | — | R$ 25,90 | luva-nitrilo-safe-max-powder-free.png | = página | G — 100 unidades · R$ 25,90 / R$ 25,90 |
| luva-vinil-inoven | M — 100 unidades | — | R$ 15,90 | luva-vinil-inoven-m.jpg | = página | M — 100 unidades · R$ 15,90 / R$ 15,90 |
| luva-vinil-inoven | G — 100 unidades | — | R$ 15,90 | luva-vinil-inoven-g.jpg | = página | G — 100 unidades · R$ 15,90 / R$ 15,90 |

### Ajustes do painel (arquivo temporário, removido depois do teste)

| Ajuste simulado | Resultado na interface |
|---|---|
| Higifral Confort a R$ 55,90 | página e carrinho a R$ 55,90 |
| Adultcare Plus 40 a R$ 39,90 | escolher 40 mostra R$ 39,90 |
| Bigfral: pacote M suspenso e XG/7 a R$ 27,90 | M some; card e XG "a partir de R$ 27,90"; carrinho XG · 7 unidades a R$ 27,90 |
| Tena Slip Noturna suspensa | some do catálogo; o link direto mostra "Produto não encontrado" |
| Pants: 16 e 32 suspensas | sem preço e sem carrinho; resta "Consultar pelo WhatsApp" |
