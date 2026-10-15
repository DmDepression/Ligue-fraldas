# Teste de ponta a ponta do painel (instalação, login, fotos, cadastro, lixeira, categorias e histórico).
#
# Use SOMENTE numa cópia local do site, nunca na hospedagem: o teste cria credenciais e produtos.
#   1. Copie o site para uma pasta de teste (sem data/loja.json nem admin/.dados/credenciais.php).
#   2. Na pasta de teste: php -S 127.0.0.1:8090 -t .
#   3. python ferramentas/testar-painel.py <pasta-de-teste>

import json, os, sys, uuid, urllib.request, urllib.error, http.cookiejar

BASE = 'http://127.0.0.1:8090/admin/'
SITE = sys.argv[1]  # pasta da cópia de teste
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
ok(st == 200 and loja['importado'] is True and len(loja['produtos']) == 38 and len(loja['categorias']) == 9, '38 produtos e 9 categorias importados, ainda não gravado')
v = loja['versao']

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
ok(len(r['produtos']) == 39, '39 produtos')
v = r['versao']
loja_arquivo = json.load(open(os.path.join(SITE, 'data/loja.json'), encoding='utf-8'))
ok(len(loja_arquivo['produtos']) == 39 and loja_arquivo['versao'] == v, 'data/loja.json gravado')

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
st, r = api('alternarAtivo', {'versao': v, 'id': 'tena-slip-noturna', 'ativo': True})
ok(st == 200 and 'ativo' not in next(x for x in r['produtos'] if x['id'] == 'tena-slip-noturna'), 'produto reativado'); v = r['versao']

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
ok(st == 200 and len(r['produtos']) == 39, 'restaurou a primeira versão gravada (com o produto de teste)'); v = r['versao']
st, r = api('restaurarVersao', {'versao': v, 'arquivo': '../../data/produtos.json'})
ok(st == 422, 'nome de arquivo malicioso no histórico é recusado')

print('12. Exportar e sair')
st, txt = req(BASE + 'api.php?acao=exportar')
ok(st == 200 and json.loads(txt)['versao'] == v, 'exportar devolve o catálogo atual')
st, r = api('logout')
st, r = api('carregar')
ok(st == 401, 'depois de sair, a API recusa')

print()
print('FALHAS:', falhas if falhas else 'nenhuma')
