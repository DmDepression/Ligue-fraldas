<?php
/* API da área administrativa: login, listagem e edição (preço / suspensão). */
declare(strict_types=1);

require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

iniciar_sessao();

function responder(array $dados, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

function ler_produtos_base(): array
{
    $json = @file_get_contents(ARQUIVO_PRODUTOS);
    $lista = $json === false ? null : json_decode($json, true);
    if (!is_array($lista)) {
        responder(['erro' => 'Não foi possível ler data/produtos.json.'], 500);
    }
    return $lista;
}

function ler_ajustes(): array
{
    if (!is_file(ARQUIVO_AJUSTES)) {
        return ['produtos' => []];
    }
    $json = @file_get_contents(ARQUIVO_AJUSTES);
    $ajustes = $json === false ? null : json_decode($json, true);
    if (!is_array($ajustes) || !is_array($ajustes['produtos'] ?? null)) {
        responder(['erro' => 'data/ajustes.json está inválido. Restaure o último backup.'], 500);
    }
    return $ajustes;
}

function aplicar_ajustes(array $lista, array $ajustes): array
{
    $porProduto = $ajustes['produtos'] ?? [];
    foreach ($lista as &$produto) {
        $ajuste = $porProduto[$produto['id'] ?? ''] ?? null;
        if (!is_array($ajuste)) {
            continue;
        }
        if (is_bool($ajuste['ativo'] ?? null)) {
            $produto['ativo'] = $ajuste['ativo'];
        }
        if (is_int($ajuste['precoCentavos'] ?? null)) {
            $produto['precoCentavos'] = $ajuste['precoCentavos'];
        }
        if (is_array($produto['embalagens'] ?? null) && is_array($ajuste['embalagens'] ?? null)) {
            foreach ($produto['embalagens'] as &$embalagem) {
                $ajusteEmb = $ajuste['embalagens'][$embalagem['id'] ?? ''] ?? null;
                if (!is_array($ajusteEmb)) {
                    continue;
                }
                if (is_bool($ajusteEmb['ativo'] ?? null)) {
                    $embalagem['ativo'] = $ajusteEmb['ativo'];
                }
                if (is_int($ajusteEmb['precoCentavos'] ?? null)) {
                    $embalagem['precoCentavos'] = $ajusteEmb['precoCentavos'];
                }
            }
            unset($embalagem);
        }
    }
    unset($produto);
    return $lista;
}

function ler_produtos(): array
{
    return aplicar_ajustes(ler_produtos_base(), ler_ajustes());
}

$entrada = json_decode((string)file_get_contents('php://input'), true);
$entrada = is_array($entrada) ? $entrada : [];
$acao = (string)($entrada['acao'] ?? ($_GET['acao'] ?? ''));

if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $acao !== 'sessao') {
    responder(['erro' => 'Método não permitido.'], 405);
}

/* ---- ações que não exigem login ---- */

if ($acao === 'sessao') {
    responder([
        'logado' => esta_logado(),
        'configurado' => painel_configurado(),
        'csrf' => token_csrf(),
    ]);
}

if ($acao === 'login') {
    if (!painel_configurado()) {
        responder(['erro' => 'O painel ainda não tem uma senha configurada na hospedagem.'], 503);
    }
    $ip = ip_cliente();
    if (tentativas_recentes($ip) >= MAX_TENTATIVAS) {
        responder(['erro' => 'Muitas tentativas. Aguarde 15 minutos e tente de novo.'], 429);
    }
    $ok = senha_confere((string)($entrada['usuario'] ?? ''), (string)($entrada['senha'] ?? ''));
    registrar_tentativa($ip, $ok);
    if (!$ok) {
        usleep(600000);
        responder(['erro' => 'Usuário ou senha incorretos.'], 401);
    }
    session_regenerate_id(true);
    $_SESSION['admin'] = true;
    $_SESSION['ultimo_acesso'] = time();
    responder(['ok' => true, 'csrf' => token_csrf()]);
}

/* ---- ações protegidas ---- */

if (!esta_logado()) {
    responder(['erro' => 'Sessão expirada. Entre novamente.', 'login' => true], 401);
}
if (!hash_equals(token_csrf(), (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
    responder(['erro' => 'Token inválido. Recarregue a página.'], 403);
}
$_SESSION['ultimo_acesso'] = time();

if ($acao === 'logout') {
    $_SESSION = [];
    session_destroy();
    responder(['ok' => true]);
}

if ($acao === 'listar') {
    $categorias = json_decode((string)@file_get_contents(__DIR__ . '/../data/categorias.json'), true);
    $produtos = array_map(fn($p) => [
        'id' => $p['id'] ?? '',
        'nome' => $p['nome'] ?? '',
        'categoria' => $p['categoria'] ?? '',
        'marca' => $p['marca'] ?? '',
        'precoCentavos' => $p['precoCentavos'] ?? null,
        'ativo' => ($p['ativo'] ?? true) !== false,
        'imagem' => $p['imagens'][0] ?? ($p['imagem'] ?? ''),
        'embalagens' => array_map(fn($e) => [
            'id' => $e['id'] ?? '',
            'rotulo' => $e['rotulo'] ?? '',
            'precoCentavos' => $e['precoCentavos'] ?? null,
            'ativo' => ($e['ativo'] ?? true) !== false,
        ], is_array($p['embalagens'] ?? null) ? $p['embalagens'] : []),
    ], ler_produtos());
    responder(['produtos' => $produtos, 'categorias' => is_array($categorias) ? $categorias : []]);
}

if ($acao === 'atualizar') {
    $id = (string)($entrada['id'] ?? '');
    $temPreco = array_key_exists('precoCentavos', $entrada);
    $temAtivo = array_key_exists('ativo', $entrada);
    if ($id === '' || (!$temPreco && !$temAtivo)) {
        responder(['erro' => 'Dados inválidos.'], 400);
    }
    if ($temPreco) {
        $preco = $entrada['precoCentavos'];
        if (!is_int($preco) || $preco < 1 || $preco > 99999999) {
            responder(['erro' => 'Preço inválido.'], 400);
        }
    }
    if ($temAtivo && !is_bool($entrada['ativo'])) {
        responder(['erro' => 'Valor de "ativo" inválido.'], 400);
    }

    // O catálogo do Git fica intacto; apenas o arquivo local de ajustes é alterado.
    $bloqueio = @fopen(arquivo_bloqueio_catalogo(), 'c+');
    if (!$bloqueio || !flock($bloqueio, LOCK_EX)) {
        responder(['erro' => 'Não foi possível gravar (verifique a permissão das pastas data e admin/.dados).'], 500);
    }
    $listaBase = ler_produtos_base();
    $original = is_file(ARQUIVO_AJUSTES)
        ? @file_get_contents(ARQUIVO_AJUSTES)
        : "{\n    \"produtos\": {}\n}\n";
    $ajustes = $original === false ? null : json_decode($original, true);
    if (!is_array($ajustes) || !is_array($ajustes['produtos'] ?? null)) {
        flock($bloqueio, LOCK_UN);
        fclose($bloqueio);
        responder(['erro' => 'data/ajustes.json está inválido. Restaure o último backup.'], 500);
    }

    $embalagemId = isset($entrada['embalagem']) ? (string)$entrada['embalagem'] : null;
    $produtoBase = null;
    foreach ($listaBase as $produto) {
        if (($produto['id'] ?? null) === $id) {
            $produtoBase = $produto;
            break;
        }
    }
    if ($produtoBase === null) {
        flock($bloqueio, LOCK_UN);
        fclose($bloqueio);
        responder(['erro' => 'Produto não encontrado.'], 404);
    }

    $temEmbalagens = is_array($produtoBase['embalagens'] ?? null) && count($produtoBase['embalagens']) > 0;
    $ajustes['produtos'][$id] ??= [];

    if ($embalagemId !== null) {
        $embalagemBase = null;
        foreach ($produtoBase['embalagens'] ?? [] as $embalagem) {
            if (($embalagem['id'] ?? null) === $embalagemId) {
                $embalagemBase = $embalagem;
                break;
            }
        }
        if ($embalagemBase === null) {
            flock($bloqueio, LOCK_UN);
            fclose($bloqueio);
            responder(['erro' => 'Embalagem não encontrada.'], 400);
        }
        $ajustes['produtos'][$id]['embalagens'][$embalagemId] ??= [];
        if ($temPreco) {
            if ($preco === ($embalagemBase['precoCentavos'] ?? null)) {
                unset($ajustes['produtos'][$id]['embalagens'][$embalagemId]['precoCentavos']);
            } else {
                $ajustes['produtos'][$id]['embalagens'][$embalagemId]['precoCentavos'] = $preco;
            }
        }
        if ($temAtivo) {
            $ativoBase = ($embalagemBase['ativo'] ?? true) !== false;
            if ($entrada['ativo'] === $ativoBase) {
                unset($ajustes['produtos'][$id]['embalagens'][$embalagemId]['ativo']);
            } else {
                $ajustes['produtos'][$id]['embalagens'][$embalagemId]['ativo'] = $entrada['ativo'];
            }
        }
        if (!$ajustes['produtos'][$id]['embalagens'][$embalagemId]) {
            unset($ajustes['produtos'][$id]['embalagens'][$embalagemId]);
        }
        if (empty($ajustes['produtos'][$id]['embalagens'])) {
            unset($ajustes['produtos'][$id]['embalagens']);
        }
    } elseif ($temPreco && $temEmbalagens) {
        flock($bloqueio, LOCK_UN);
        fclose($bloqueio);
        responder(['erro' => 'Este produto tem embalagens: altere o preço de cada embalagem.'], 400);
    } else {
        if ($temPreco) {
            if ($preco === ($produtoBase['precoCentavos'] ?? null)) {
                unset($ajustes['produtos'][$id]['precoCentavos']);
            } else {
                $ajustes['produtos'][$id]['precoCentavos'] = $preco;
            }
        }
        if ($temAtivo) {
            $ativoBase = ($produtoBase['ativo'] ?? true) !== false;
            if ($entrada['ativo'] === $ativoBase) {
                unset($ajustes['produtos'][$id]['ativo']);
            } else {
                $ajustes['produtos'][$id]['ativo'] = $entrada['ativo'];
            }
        }
    }
    if (!$ajustes['produtos'][$id]) {
        unset($ajustes['produtos'][$id]);
    }

    try {
        salvar_ajustes($ajustes, $original);
    } catch (Throwable $erro) {
        flock($bloqueio, LOCK_UN);
        fclose($bloqueio);
        error_log('Ligue Fraldas admin: ' . $erro->getMessage());
        responder(['erro' => $erro->getMessage()], 500);
    }
    flock($bloqueio, LOCK_UN);
    fclose($bloqueio);
    responder(['ok' => true]);
}

responder(['erro' => 'Ação desconhecida.'], 400);
