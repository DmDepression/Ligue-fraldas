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

function ler_produtos(): array
{
    $json = @file_get_contents(ARQUIVO_PRODUTOS);
    $lista = $json === false ? null : json_decode($json, true);
    if (!is_array($lista)) {
        responder(['erro' => 'Não foi possível ler data/produtos.json.'], 500);
    }
    return $lista;
}

$entrada = json_decode((string)file_get_contents('php://input'), true);
$entrada = is_array($entrada) ? $entrada : [];
$acao = (string)($entrada['acao'] ?? ($_GET['acao'] ?? ''));

if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $acao !== 'sessao') {
    responder(['erro' => 'Método não permitido.'], 405);
}

/* ---- ações que não exigem login ---- */

if ($acao === 'sessao') {
    responder(['logado' => esta_logado(), 'csrf' => token_csrf()]);
}

if ($acao === 'login') {
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

    // Bloqueia o arquivo durante a leitura + gravação para evitar edições simultâneas se sobreporem.
    $arquivo = fopen(ARQUIVO_PRODUTOS, 'c+');
    if (!$arquivo || !flock($arquivo, LOCK_EX)) {
        responder(['erro' => 'Não foi possível gravar (verifique a permissão de data/produtos.json).'], 500);
    }
    $lista = json_decode((string)stream_get_contents($arquivo), true);
    if (!is_array($lista)) {
        flock($arquivo, LOCK_UN);
        fclose($arquivo);
        responder(['erro' => 'data/produtos.json está inválido.'], 500);
    }

    $embalagemId = isset($entrada['embalagem']) ? (string)$entrada['embalagem'] : null;
    $achou = false;
    $erroEmbalagem = null;
    foreach ($lista as &$p) {
        if (($p['id'] ?? null) !== $id) {
            continue;
        }
        $achou = true;
        $temEmbalagens = is_array($p['embalagens'] ?? null) && count($p['embalagens']) > 0;

        if ($embalagemId !== null) {
            // Edição de UMA embalagem (preço e/ou suspensão só dela)
            $achouEmb = false;
            if ($temEmbalagens) {
                foreach ($p['embalagens'] as &$e) {
                    if (($e['id'] ?? null) === $embalagemId) {
                        if ($temPreco) {
                            $e['precoCentavos'] = $preco;
                        }
                        if ($temAtivo) {
                            if ($entrada['ativo']) {
                                unset($e['ativo']);
                            } else {
                                $e['ativo'] = false;
                            }
                        }
                        $achouEmb = true;
                        break;
                    }
                }
                unset($e);
            }
            if (!$achouEmb) {
                $erroEmbalagem = 'Embalagem não encontrada.';
            }
        } elseif ($temPreco && $temEmbalagens) {
            $erroEmbalagem = 'Este produto tem embalagens: altere o preço de cada embalagem.';
        } else {
            if ($temPreco) {
                $p['precoCentavos'] = $preco;
            }
            if ($temAtivo) {
                if ($entrada['ativo']) {
                    unset($p['ativo']);       // ativo = padrão; mantém o JSON limpo
                } else {
                    $p['ativo'] = false;      // o site já esconde produtos com ativo:false
                }
            }
        }
        break;
    }
    unset($p);

    if ($achou && $erroEmbalagem !== null) {
        flock($arquivo, LOCK_UN);
        fclose($arquivo);
        responder(['erro' => $erroEmbalagem], 400);
    }
    if (!$achou) {
        flock($arquivo, LOCK_UN);
        fclose($arquivo);
        responder(['erro' => 'Produto não encontrado.'], 404);
    }

    $novo = json_encode($lista, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n";
    rewind($arquivo);
    ftruncate($arquivo, 0);
    $gravou = fwrite($arquivo, $novo) !== false;
    fflush($arquivo);
    flock($arquivo, LOCK_UN);
    fclose($arquivo);

    if (!$gravou) {
        responder(['erro' => 'Falha ao gravar o arquivo.'], 500);
    }
    responder(['ok' => true]);
}

responder(['erro' => 'Ação desconhecida.'], 400);
