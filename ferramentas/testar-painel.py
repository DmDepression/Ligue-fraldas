# Teste de ponta a ponta do painel (instalação, login, fotos, cadastro, lixeira, categorias e histórico).
#
# Use SOMENTE numa cópia local do site, nunca na hospedagem: o teste cria credenciais e produtos.
#   1. Copie o site para uma pasta de teste (sem data/loja.json nem admin/.dados/credenciais.php).
#   2. Na pasta de teste: php -S 127.0.0.1:8090 -t .
#   3. python ferramentas/testar-painel.py <pasta-de-teste>

import json, os, sys, uuid, urllib.request, urllib.error, http.cookiejar

BASE = 'http://127.0.0.1:8090/admin/'
SITEMAP = 'http://127.0.0.1:8090/sitemap.php'
PEDIDO = 'http://127.0.0.1:8090/pedido.php'
# O workflow faz o pedido.php gravar o e-mail neste arquivo em vez de enviar (variável LIGUE_PEDIDO_ARQUIVO_TESTE).
ARQUIVO_EMAILS = os.environ.get('LIGUE_PEDIDO_ARQUIVO_TESTE', '')
SITE = sys.argv[1]  # pasta da cópia de teste
# Quantidades do catálogo versionado: o teste não quebra quando produtos entram ou saem.
TOTAL_PRODUTOS = len(json.load(open(os.path.join(SITE, 'data/produtos.json'), encoding='utf-8')))
PRODUTOS_ATIVOS = sum(1 for p in json.load(open(os.path.join(SITE, 'data/produtos.json'), encoding='utf-8')) if p.get('ativo') is not False)
TOTAL_CATEGORIAS = len(json.load(open(os.path.join(SITE, 'data/categorias.json'), encoding='utf-8')))
jar = http.cookiejar.CookieJar()
abrir = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
csrf = ''
falhas = []

def ok(cond, msg):
    print(('  OK  ' if cond else '  FALHA ') + msg)
    if not cond:
        falhas.append(msg)

def req(url, dados=None, cabecalhos=None, metodo=None):
    r = urllib.request.Request(url, data=dados, headers=cabecalhos or {}, method=metodo)
    try:
        resp = abrir.open(r)
        return resp.status, resp.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')

def api(acao, dados=None, com_csrf=True):
    corpo = json.dumps(dict({'acao': acao}, **(dados or {}))).encode()
    h = {'Content-Type': 'application/json'}
    if com_csrf:
        h['X-CSRF-Token'] = csrf
    st, txt = req(BASE + 'api.php', corpo, h)
    try:
        return st, json.loads(txt)
    except Exception:
        return st, {'_bruto': txt[:300]}

def enviar(caminho, nome_arquivo='foto.jpg', tipo='image/jpeg'):
    limite = uuid.uuid4().hex
    conteudo = open(caminho, 'rb').read() if os.path.exists(caminho) else caminho.encode()
    partes = [
        f'--{limite}\r\nContent-Disposition: form-data; name="acao"\r\n\r\nenviarFoto\r\n'.encode(),
        f'--{limite}\r\nContent-Disposition: form-data; name="nome"\r\n\r\nProduto Teste\r\n'.encode(),
        f'--{limite}\r\nContent-Disposition: form-data; name="foto"; filename="{nome_arquivo}"\r\nContent-Type: {tipo}\r\n\r\n'.encode() + conteudo + b'\r\n',
        f'--{limite}--\r\n'.encode(),
    ]
    st, txt = req(BASE + 'api.php?acao=enviarFoto', b''.join(partes),
                  {'Content-Type': 'multipart/form-data; boundary=' + limite, 'X-CSRF-Token': csrf})
    return st, json.loads(txt)

print('1. Instalação sem Terminal')
st, html = req(BASE + 'instalar.php')
ok('crie um código' in html, 'sem instalar.txt pede o código')
codigo = 'codigo-de-teste-bem-longo-123'
open(os.path.join(SITE, 'admin/.dados/instalar.txt'), 'wb').write('﻿'.encode() + codigo.encode() + b'\r\n')
st, html = req(BASE + 'instalar.php')
ok('name="codigo"' in html, 'com instalar.txt (com BOM) mostra o formulário')
import re
token = re.search(r'name="csrf" value="([^"]+)"', html).group(1)
def instalar(cod, senha='senha-de-teste-forte', conf=None):
    corpo = urllib.parse.urlencode({'csrf': token, 'codigo': cod, 'usuario': 'admin', 'senha': senha, 'confirmacao': conf or senha}).encode()
    return req(BASE + 'instalar.php', corpo, {'Content-Type': 'application/x-www-form-urlencoded'})
import urllib.parse
st, html = instalar('codigo-errado-xxxxxxxx')
ok('não confere' in html, 'código errado é recusado')
st, html = instalar(codigo, senha='curta')
ok('pelo menos 12' in html, 'senha curta é recusada')
st, html = instalar(codigo)
ok('Pronto' in html, 'instalação conclui')
ok(not os.path.exists(os.path.join(SITE, 'admin/.dados/instalar.txt')), 'instalar.txt foi apagado')
cred = open(os.path.join(SITE, 'admin/.dados/credenciais.php'), encoding='utf-8').read()
ok('senha-de-teste-forte' not in cred and '$2y$' in cred, 'credenciais guardam só o hash bcrypt')
st, html = req(BASE + 'instalar.php')
ok('já está configurado' in html, 'instalador fica desativado')

print('2. Sessão e login')
st, r = api('sessao', com_csrf=False)
csrf = r['csrf']
ok(r['configurado'] is True and r['logado'] is False, 'sessao: configurado e deslogado')
st, r = api('carregar')
ok(st == 401, 'carregar sem login é recusado (401)')
st, r = api('login', {'usuario': 'admin', 'senha': 'errada-errada-1'})
ok(st == 401, 'senha errada recusada')
st, r = api('login', {'usuario': 'admin', 'senha': 'senha-de-teste-forte'})
ok(st == 200, 'login correto')
csrf = r['csrf']
st, r = api('carregar', com_csrf=False)
ok(st == 403, 'sem token CSRF é recusado (403)')

print('3. Importação do catálogo atual')
st, loja = api('carregar')
ok(st == 200 and loja['importado'] is True and len(loja['produtos']) == TOTAL_PRODUTOS and len(loja['categorias']) == TOTAL_CATEGORIAS,
   '%d produtos e %d categorias importados, ainda não gravado' % (TOTAL_PRODUTOS, TOTAL_CATEGORIAS))
v = loja['versao']
st, xml = req(SITEMAP)
ok(st == 200 and xml.count('produto.html?id=') == PRODUTOS_ATIVOS and '<loc>https://liguefraldasgeriatricas.com.br/</loc>' in xml,
   'sitemap lista os %d produtos ativos antes de o painel gravar' % PRODUTOS_ATIVOS)

print('4. Fotos')
st, r = enviar(os.path.join(SITE, 'img/produtos/higifral-confort-g.jpg'))
ok(st == 200 and r['caminho'].startswith('img/uploads/') and r['caminho'].endswith('.jpg'), 'JPEG aceito: ' + str(r.get('caminho')))
foto1 = r['caminho']
st, r = enviar(os.path.join(SITE, 'img/produtos/bigfral-dermaplus-xg-7.png'), 'pacote.png', 'image/png')
ok(st == 200, 'PNG aceito e convertido: ' + str(r.get('caminho')))
foto2 = r['caminho']
st, r = enviar('<?php echo "invasao"; ?>', 'ataque.jpg')
ok(st == 422, 'PHP disfarçado de .jpg é recusado: ' + r.get('erro', ''))
st, r = enviar('texto qualquer', 'nota.txt', 'text/plain')
ok(st == 422, 'arquivo de texto recusado')
ok(not any(n.endswith('.php') for n in os.listdir(os.path.join(SITE, 'img/uploads'))), 'nada .php na pasta de fotos')

print('5. Validação do cadastro')
st, r = api('salvarProduto', {'versao': v, 'produto': {'nome': '', 'tamanhos': [], 'imagens': []}})
ok(st == 422 and len(r['erros']) >= 4, 'produto vazio: ' + ' | '.join(r.get('erros', [])))
st, r = api('salvarProduto', {'versao': v, 'produto': {
    'nome': 'Fralda Teste', 'categoria': 'fraldas-geriatricas', 'descricao': 'x', 'tamanhos': ['M', 'G'],
    'embalagens': [{'rotulo': '10 unidades', 'precoCentavos': 1000, 'tamanhos': ['M']}], 'imagens': [foto1]}})
ok(st == 422 and any('"G" não tem nenhuma embalagem' in e for e in r['erros']), 'tamanho sem embalagem é recusado')
st, r = api('salvarProduto', {'versao': v, 'produto': {
    'nome': 'Fralda Teste', 'categoria': 'fraldas-geriatricas', 'descricao': 'x', 'tamanhos': ['Único'],
    'precoCentavos': 1000, 'imagens': ['../admin/.dados/credenciais.php', 'img/produtos/nao-existe.jpg']}})
ok(st == 422 and any('foto' in e for e in r['erros']), 'caminho de foto malicioso ou inexistente é ignorado')
st, r = api('salvarProduto', {'versao': v, 'produto': {
    'nome': 'Fralda Teste', 'categoria': 'fraldas-geriatricas', 'descricao': 'x', 'tamanhos': ['M', 'G'],
    'embalagens': [{'rotulo': '10 unidades', 'precoCentavos': 1000, 'tamanhos': ['GG']}], 'imagens': [foto1],
    'fotosPorOpcao': [{'imagem': foto1, 'tamanho': 'XG'}, {'imagem': foto1, 'embalagem': 'nao-existe'}]}})
ok(st == 422 and any('"GG" não está na lista' in e for e in r['erros']) and any('"XG"' in e for e in r['erros'])
   and any('embalagem que não existe' in e for e in r['erros']), 'vínculos com tamanho ou embalagem inexistente são recusados')
st, r = api('salvarProduto', {'versao': v, 'produto': {
    'nome': 'Fralda Teste', 'categoria': 'fraldas-geriatricas', 'descricao': 'x', 'tamanhos': ['G​', 'XG'],
    'embalagens': [{'rotulo': '8 unidades', 'precoCentavos': 1000, 'tamanhos': ['G​']},
                   {'rotulo': '7 unidades', 'precoCentavos': 900, 'tamanhos': ['XG']}], 'imagens': [foto1]}})
ok(st == 200 and r['produto']['embalagens'][0].get('tamanhos') == ['G'], 'tamanho com caractere invisível mantém a embalagem só no G')
v = r['versao']
st, r = api('excluirProduto', {'versao': v, 'id': r['produto']['id']}); v = r['versao']
st, r = api('excluirDefinitivo', {'versao': v, 'id': 'fralda-teste'}); v = r['versao']

print('6. Criar produto completo')
novo = {
    'nome': 'Fralda Teste Ação & "Aspas"', 'categoria': 'fraldas-geriatricas', 'marca': 'Marca <b>X</b>',
    'descricao': 'Primeiro parágrafo.\n\nSegundo parágrafo.', 'tamanhos': ['M — 10 unidades', 'G — 8 unidades'],
    'embalagens': [
        {'rotulo': 'Pacote 10', 'precoCentavos': 2990, 'tamanhos': ['M — 10 unidades']},
        {'rotulo': 'Pacote 8', 'precoCentavos': 2790, 'tamanhos': ['G — 8 unidades']},
        {'rotulo': 'Caixa 40', 'precoCentavos': 9990, 'tamanhos': ['M — 10 unidades', 'G — 8 unidades']},
    ],
    'imagens': [foto1, foto2],
    'fotosPorOpcao': [{'imagem': foto2, 'tamanho': 'G'}],
    'informacoes': [{'rotulo': 'Tamanho M', 'valor': '10 unidades'}],
    'palavrasChave': ['teste'], 'destaque': True, 'ativo': True,
}
st, r = api('salvarProduto', {'versao': v, 'produto': novo})
ok(st == 200 and r['versao'] == v + 1 and r['importado'] is False, 'produto criado e catálogo gravado (versão %s)' % r.get('versao'))
p = r['produto']
ok(p['id'] == 'fralda-teste-acao-aspas', 'id gerado a partir do nome: ' + p['id'])
ok('tamanhos' not in p['embalagens'][2], 'embalagem com todos os tamanhos vale para todos')
ok([e['id'] for e in p['embalagens']] == ['pacote-10-m', 'pacote-8-g', 'caixa-40'], 'ids de embalagem: %s' % [e['id'] for e in p['embalagens']])
ok(len(r['produtos']) == TOTAL_PRODUTOS + 1, '%d produtos' % (TOTAL_PRODUTOS + 1))
v = r['versao']
loja_arquivo = json.load(open(os.path.join(SITE, 'data/loja.json'), encoding='utf-8'))
ok(len(loja_arquivo['produtos']) == TOTAL_PRODUTOS + 1 and loja_arquivo['versao'] == v, 'data/loja.json gravado')
st, xml = req(SITEMAP)
ok(st == 200 and 'produto.html?id=fralda-teste-acao-aspas' in xml, 'sitemap inclui o produto criado pelo painel')

print('7. Conflito entre janelas')
st, r = api('alterarPreco', {'versao': v - 1, 'id': p['id'], 'embalagem': 'caixa-40', 'precoCentavos': 100})
ok(st == 409 and r.get('conflito'), 'versão antiga é recusada (409)')

print('8. Editar, preço e situação')
editado = dict(novo, nome='Fralda Teste Editada', embalagens=[dict(e, id=pe['id']) for e, pe in zip(novo['embalagens'], p['embalagens'])])
st, r = api('salvarProduto', {'versao': v, 'id': p['id'], 'produto': editado})
ok(st == 200 and r['produto']['id'] == p['id'] and r['produto']['nome'] == 'Fralda Teste Editada', 'edição mantém o id')
ok(r['produto']['criadoEm'] == p['criadoEm'], 'edição mantém a data de criação')
v = r['versao']
st, r = api('alterarPreco', {'versao': v, 'id': p['id'], 'embalagem': 'caixa-40', 'precoCentavos': 8990})
ok(st == 200, 'preço da embalagem alterado'); v = r['versao']
st, r = api('alterarPreco', {'versao': v, 'id': p['id'], 'precoCentavos': 100})
ok(st == 422, 'preço do produto com embalagens é recusado')
st, r = api('alterarPreco', {'versao': v, 'id': 'higifral-confort', 'precoCentavos': 5590})
ok(st == 200, 'preço simples alterado'); v = r['versao']
st, r = api('alternarAtivo', {'versao': v, 'id': p['id'], 'embalagem': 'pacote-8-g', 'ativo': False})
ok(st == 200, 'embalagem suspensa'); v = r['versao']
st, r = api('alternarAtivo', {'versao': v, 'id': 'tena-slip-noturna', 'ativo': False})
ok(st == 200 and next(x for x in r['produtos'] if x['id'] == 'tena-slip-noturna')['ativo'] is False, 'produto suspenso'); v = r['versao']
st, xml = req(SITEMAP)
ok('id=tena-slip-noturna<' not in xml, 'produto suspenso sai do sitemap')
st, r = api('alternarAtivo', {'versao': v, 'id': 'tena-slip-noturna', 'ativo': True})
ok(st == 200 and 'ativo' not in next(x for x in r['produtos'] if x['id'] == 'tena-slip-noturna'), 'produto reativado'); v = r['versao']

print('8b. Embalagem de capa')
st, r = api('definirCapa', {'versao': v, 'id': 'bigfral-dermaplus', 'embalagem': 'pacote-menor'})
ok(st == 200 and next(x for x in r['produtos'] if x['id'] == 'bigfral-dermaplus')['embalagemCapa'] == 'pacote-menor', 'capa marcada pela lista'); v = r['versao']
st, r = api('definirCapa', {'versao': v, 'id': 'bigfral-dermaplus', 'embalagem': 'nao-existe'})
ok(st == 422, 'capa com embalagem inexistente é recusada')
st, r = api('definirCapa', {'versao': v, 'id': 'bigfral-dermaplus', 'embalagem': ''})
ok(st == 200 and 'embalagemCapa' not in next(x for x in r['produtos'] if x['id'] == 'bigfral-dermaplus'), 'capa desmarcada'); v = r['versao']
st, r = api('salvarProduto', {'versao': v, 'id': p['id'], 'produto': dict(editado, embalagemCapa='caixa-40')})
ok(st == 200 and r['produto'].get('embalagemCapa') == 'caixa-40', 'capa salva pelo editor'); v = r['versao']
st, r = api('salvarProduto', {'versao': v, 'id': p['id'], 'produto': dict(editado, embalagemCapa='inventada')})
ok(st == 200 and 'embalagemCapa' not in r['produto'], 'capa inválida no editor é ignorada'); v = r['versao']

print('9. Lixeira')
st, r = api('excluirProduto', {'versao': v, 'id': 'oleo-girassol-farmachem'})
ok(st == 200 and len(r['lixeira']) == 1 and r['lixeira'][0]['excluidoEm'], 'produto foi para a lixeira'); v = r['versao']
st, r = api('restaurarProduto', {'versao': v, 'id': 'oleo-girassol-farmachem'})
ok(st == 200 and not r['lixeira'] and any(x['id'] == 'oleo-girassol-farmachem' for x in r['produtos']), 'produto restaurado'); v = r['versao']
st, r = api('excluirProduto', {'versao': v, 'id': p['id']}); v = r['versao']
st, r = api('excluirDefinitivo', {'versao': v, 'id': p['id']})
ok(st == 200 and not r['lixeira'] and not any(x['id'] == p['id'] for x in r['produtos']), 'exclusão definitiva'); v = r['versao']
ok(os.path.exists(os.path.join(SITE, foto1)), 'foto continua guardada (pode voltar pelo histórico)')

print('10. Categorias')
cats = r['categorias']
st, r2 = api('salvarCategorias', {'versao': v, 'categorias': [c for c in cats if c['id'] != 'luvas']})
ok(st == 422 and any('não pode ser apagada' in e for e in r2['erros']), 'categoria em uso não pode ser apagada')
nova = [dict(c, nome='Fraldas para adultos') if c['id'] == 'fraldas-geriatricas' else c for c in cats if c['id'] != 'fraldas-infantis'] + [{'nome': 'Acessórios'}]
st, r2 = api('salvarCategorias', {'versao': v, 'categorias': nova})
ok(st == 200 and any(c['id'] == 'acessorios' for c in r2['categorias']) and not any(c['id'] == 'fraldas-infantis' for c in r2['categorias']), 'renomear, apagar vazia e criar categoria')
ok(next(c for c in r2['categorias'] if c['id'] == 'fraldas-geriatricas')['nome'] == 'Fraldas para adultos', 'renomear mantém o id')
v = r2['versao']

print('11. Histórico')
st, r = api('listarHistorico')
ok(st == 200 and len(r['versoes']) >= 10, '%d versões guardadas' % len(r['versoes']))
mais_antiga = r['versoes'][-1]
st, r = api('restaurarVersao', {'versao': v, 'arquivo': mais_antiga['arquivo']})
ok(st == 200 and len(r['produtos']) == TOTAL_PRODUTOS + 1, 'restaurou a primeira versão gravada (com o produto de teste)'); v = r['versao']
st, r = api('restaurarVersao', {'versao': v, 'arquivo': '../../data/produtos.json'})
ok(st == 422, 'nome de arquivo malicioso no histórico é recusado')

print('12. Fora de estoque e pedido por e-mail')
def pedido(dados, origem=None):
    h = {'Content-Type': 'application/json'}
    if origem:
        h['Origin'] = origem
    st, txt = req(PEDIDO, json.dumps(dados).encode(), h)
    try:
        return st, json.loads(txt)
    except Exception:
        return st, {'_bruto': txt[:300]}
def emails():
    if not ARQUIVO_EMAILS or not os.path.exists(ARQUIVO_EMAILS):
        return []
    return [json.loads(l) for l in open(ARQUIVO_EMAILS, encoding='utf-8') if l.strip()]
st, loja = api('carregar'); v = loja['versao']
hig = next(x for x in loja['produtos'] if x['id'] == 'higifral-confort')
t1, t2 = hig['tamanho'][0], hig['tamanho'][1]
preco = hig['precoCentavos']
base = {'numero': 'LF-261029-AB2C', 'nome': 'Cliente  Teste', 'telefone': '(21) 99999-0000', 'email': 'cliente@exemplo.com', 'site': ''}
item = lambda t, q=2: [{'id': 'higifral-confort', 'tamanho': t, 'embalagem': '', 'quantidade': q, 'precoCentavos': 1}]
ok(bool(ARQUIVO_EMAILS), 'LIGUE_PEDIDO_ARQUIVO_TESTE definido (e-mails de teste vão para arquivo)')
st, r = pedido(dict(base, itens=item(t1)))
ok(st == 200 and r.get('totalCentavos') == preco * 2, 'pedido válido usa o preço do catálogo, não o do navegador: %s' % r)
ultimo = (emails() or [{}])[-1]
ok(ultimo.get('para') == 'liguefraldasgeriatricas@gmail.com' and 'Pedido nº LF-261029-AB2C' in ultimo.get('corpo', '')
   and 'Cliente: Cliente Teste' in ultimo.get('corpo', '') and 'Reply-To: cliente@exemplo.com' in ultimo.get('cabecalhos', []),
   'e-mail vai para a loja com número do pedido, cliente e resposta para o cliente')
st, r = pedido(dict(base, numero='123', itens=item(t1)))
ok(st == 422, 'número de pedido inválido é recusado')
st, r = pedido(dict(base, telefone='123', itens=item(t1)))
ok(st == 422 and 'telefone' in r.get('erro', ''), 'telefone sem DDD é recusado')
st, r = pedido(dict(base, email='nao-e-email', itens=item(t1)))
ok(st == 422, 'e-mail inválido é recusado')
antes = len(emails())
st, r = pedido(dict(base, site='http://spam.example', itens=item(t1)))
ok(st == 200 and len(emails()) == antes, 'robô que preenche o campo-isca recebe ok e nada é enviado')
st, r = pedido(dict(base, itens=item(t1)), origem='https://outro-site.example')
ok(st == 403, 'pedido vindo de outro site é recusado')
produto_hig = {'nome': hig['nome'], 'categoria': hig['categoria'], 'marca': hig.get('marca', ''), 'descricao': hig['descricao'],
               'tamanhos': hig['tamanho'], 'precoCentavos': preco, 'imagens': hig['imagens'],
               'fotosPorOpcao': hig.get('fotosPorOpcao', []), 'informacoes': hig.get('informacoes', []),
               'tamanhosForaDeEstoque': [t1, 'tamanho-que-nao-existe']}
st, r = api('salvarProduto', {'versao': v, 'id': 'higifral-confort', 'produto': produto_hig})
ok(st == 200 and r['produto'].get('tamanhosForaDeEstoque') == [t1], 'tamanho marcado fora de estoque é salvo (e o inexistente, ignorado)')
v = r['versao']
st, r = pedido(dict(base, itens=item(t1)))
ok(st == 409 and hig['nome'] in r.get('erro', ''), 'pedido com tamanho fora de estoque é recusado')
st, r = api('alternarAtivo', {'versao': v, 'id': 'bigfral-dermaplus', 'embalagem': 'pacote-menor', 'ativo': False}); v = r['versao']
st, r = pedido(dict(base, itens=[{'id': 'bigfral-dermaplus', 'tamanho': 'XG', 'embalagem': 'pacote-menor', 'quantidade': 1}]))
ok(st == 409, 'pedido com embalagem fora de estoque é recusado')
st, r = api('alternarAtivo', {'versao': v, 'id': 'bigfral-dermaplus', 'embalagem': 'pacote-menor', 'ativo': True}); v = r['versao']
# Já houve 1 pedido válido; com mais 4, chega ao limite de 5 em 10 minutos.
for i in range(4):
    st, r = pedido(dict(base, itens=item(t2, 1)))
ok(st == 200, 'pedidos válidos dentro do limite são enviados')
st, r = pedido(dict(base, itens=item(t2, 1)))
ok(st == 429, 'o sexto pedido em 10 minutos do mesmo IP é freado')
st, r = api('salvarProduto', {'versao': v, 'id': 'higifral-confort', 'produto': dict(produto_hig, tamanhosForaDeEstoque=[])})
ok(st == 200 and 'tamanhosForaDeEstoque' not in r['produto'], 'tamanho volta ao estoque'); v = r['versao']

print('13. Exportar e sair')
st, txt = req(BASE + 'api.php?acao=exportar')
ok(st == 200 and json.loads(txt)['versao'] == v, 'exportar devolve o catálogo atual')
st, r = api('logout')
st, r = api('carregar')
ok(st == 401, 'depois de sair, a API recusa')

print()
print('FALHAS:', falhas if falhas else 'nenhuma')
sys.exit(1 if falhas else 0)
