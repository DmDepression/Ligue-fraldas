<?php
/* API da área administrativa: login, catálogo completo, fotos, categorias, lixeira e histórico. */
declare(strict_types=1);

require __DIR__ . '/config.php';
require __DIR__ . '/loja.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

iniciar_sessao();

function responder(array $dados, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// JSON no corpo; o envio de foto chega como formulário (multipart).
$entrada = json_decode((string)file_get_contents('php://input'), true);
$entrada = is_array($entrada) ? $entrada : $_POST;
$acao = (string)($entrada['acao'] ?? ($_GET['acao'] ?? ''));
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($metodo !== 'POST' && !in_array($acao, ['sessao', 'exportar'], true)) {
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
$_SESSION['ultimo_acesso'] = time();

// Baixar uma cópia do catálogo atual (somente leitura).
if ($acao === 'exportar') {
    try {
        $loja = ler_loja();
    } catch (Throwable $erro) {
        responder(['erro' => $erro->getMessage()], 500);
    }
    header('Content-Disposition: attachment; filename="catalogo-ligue-fraldas-' . date('Y-m-d') . '.json"');
    echo json_loja($loja);
    exit;
}

if (!hash_equals(token_csrf(), (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
    responder(['erro' => 'Token inválido. Recarregue a página.'], 403);
}

if ($acao === 'logout') {
    $_SESSION = [];
    session_destroy();
    responder(['ok' => true]);
}

/** Resposta padrão depois de qualquer leitura ou alteração: o catálogo completo. */
function responder_loja(array $loja, array $extra = []): never
{
    responder(array_merge([
        'ok' => true,
        'versao' => $loja['versao'],
        'atualizadoEm' => $loja['atualizadoEm'] ?? null,
        'importado' => !is_file(ARQUIVO_LOJA),
        'categorias' => $loja['categorias'],
        'produtos' => $loja['produtos'],
        'lixeira' => $loja['lixeira'],
    ], $extra));
}

function achar_indice(array $lista, string $id): int
{
    foreach ($lista as $i => $item) {
        if (($item['id'] ?? null) === $id) {
            return $i;
        }
    }
    throw new DadosInvalidos(['Produto não encontrado. Recarregue a página.']);
}

$versao = (int)($entrada['versao'] ?? -1);
$id = (string)($entrada['id'] ?? '');

try {
    switch ($acao) {
        case 'carregar':
            responder_loja(ler_loja());

        case 'salvarProduto':
            $produtoEntrada = is_array($entrada['produto'] ?? null) ? $entrada['produto'] : [];
            $idExistente = $id !== '' ? $id : null;
            $salvo = null;
            $loja = alterar_loja($versao, function (array $loja) use ($produtoEntrada, $idExistente, &$salvo): array {
                $salvo = produto_do_formulario($produtoEntrada, $loja, $idExistente);
                if ($idExistente === null) {
                    $loja['produtos'][] = $salvo;
                } else {
                    $loja['produtos'][achar_indice($loja['produtos'], $idExistente)] = $salvo;
                }
                return $loja;
            });
            responder_loja($loja, ['produto' => $salvo]);

        case 'alterarPreco':
            $preco = $entrada['precoCentavos'] ?? null;
            if (!is_int($preco) || $preco < 1 || $preco > 99999999) {
                throw new DadosInvalidos(['Preço inválido.']);
            }
            $embalagem = isset($entrada['embalagem']) ? (string)$entrada['embalagem'] : null;
            responder_loja(alterar_loja($versao, function (array $loja) use ($id, $embalagem, $preco): array {
                $i = achar_indice($loja['produtos'], $id);
                $produto = &$loja['produtos'][$i];
                if ($embalagem === null) {
                    if (!empty($produto['embalagens'])) {
                        throw new DadosInvalidos(['Este produto tem embalagens: altere o preço de cada embalagem.']);
                    }
                    $produto['precoCentavos'] = $preco;
                } else {
                    $produto['embalagens'][achar_indice($produto['embalagens'] ?? [], $embalagem)]['precoCentavos'] = $preco;
                }
                return $loja;
            }));

        case 'alternarAtivo':
            $ativo = $entrada['ativo'] ?? null;
            if (!is_bool($ativo)) {
                throw new DadosInvalidos(['Situação inválida.']);
            }
            $embalagem = isset($entrada['embalagem']) ? (string)$entrada['embalagem'] : null;
            responder_loja(alterar_loja($versao, function (array $loja) use ($id, $embalagem, $ativo): array {
                $i = achar_indice($loja['produtos'], $id);
                if ($embalagem === null) {
                    $alvo = &$loja['produtos'][$i];
                } else {
                    $alvo = &$loja['produtos'][$i]['embalagens'][achar_indice($loja['produtos'][$i]['embalagens'] ?? [], $embalagem)];
                }
                if ($ativo) {
                    unset($alvo['ativo']);
                } else {
                    $alvo['ativo'] = false;
                }
                return $loja;
            }));

        case 'excluirProduto':
            responder_loja(alterar_loja($versao, function (array $loja) use ($id): array {
                $i = achar_indice($loja['produtos'], $id);
                $produto = $loja['produtos'][$i];
                $produto['excluidoEm'] = date('c');
                array_splice($loja['produtos'], $i, 1);
                array_unshift($loja['lixeira'], $produto);
                return $loja;
            }));

        case 'restaurarProduto':
            responder_loja(alterar_loja($versao, function (array $loja) use ($id): array {
                $i = achar_indice($loja['lixeira'], $id);
                $produto = $loja['lixeira'][$i];
                unset($produto['excluidoEm']);
                if (!in_array($produto['categoria'] ?? '', array_column($loja['categorias'], 'id'), true)) {
                    throw new DadosInvalidos(['A categoria deste produto foi apagada. Crie-a de novo antes de restaurar.']);
                }
                array_splice($loja['lixeira'], $i, 1);
                $loja['produtos'][] = $produto;
                return $loja;
            }));

        case 'excluirDefinitivo':
            responder_loja(alterar_loja($versao, function (array $loja) use ($id): array {
                array_splice($loja['lixeira'], achar_indice($loja['lixeira'], $id), 1);
                return $loja;
            }));

        case 'salvarCategorias':
            $lista = is_array($entrada['categorias'] ?? null) ? $entrada['categorias'] : [];
            responder_loja(alterar_loja($versao, function (array $loja) use ($lista): array {
                $novas = [];
                $erros = [];
                foreach ($lista as $c) {
                    $nome = texto_limpo(is_array($c) ? ($c['nome'] ?? '') : '', 60);
                    if ($nome === '') {
                        $erros[] = 'Toda categoria precisa de um nome.';
                        continue;
                    }
                    $idCategoria = is_array($c) && is_string($c['id'] ?? null) && $c['id'] !== ''
                        && in_array($c['id'], array_column($loja['categorias'], 'id'), true)
                        ? $c['id']
                        : id_unico($nome, array_column($novas, 'id'));
                    if (in_array($idCategoria, array_column($novas, 'id'), true)) {
                        $idCategoria = id_unico($nome, array_column($novas, 'id'));
                    }
                    $novas[] = ['id' => $idCategoria, 'nome' => $nome];
                }
                $mantidas = array_column($novas, 'id');
                foreach (array_merge($loja['produtos'], $loja['lixeira']) as $p) {
                    if (!in_array($p['categoria'] ?? '', $mantidas, true)) {
                        $erros[] = 'A categoria de "' . ($p['nome'] ?? $p['id']) . '" não pode ser apagada: mova ou exclua o produto antes.';
                    }
                }
                if (!$novas) {
                    $erros[] = 'Mantenha pelo menos uma categoria.';
                }
                if ($erros) {
                    throw new DadosInvalidos(array_values(array_unique($erros)));
                }
                $loja['categorias'] = $novas;
                return $loja;
            }));

        case 'enviarFoto':
            $arquivo = $_FILES['foto'] ?? null;
            if (!is_array($arquivo)) {
                throw new DadosInvalidos(['Nenhuma foto foi recebida. A foto pode ser maior do que a hospedagem aceita.']);
            }
            responder(['ok' => true, 'caminho' => receber_foto($arquivo, (string)($entrada['nome'] ?? 'produto'))]);

        case 'listarHistorico':
            responder(['ok' => true, 'versoes' => listar_backups()]);

        case 'restaurarVersao':
            $dados = ler_backup((string)($entrada['arquivo'] ?? ''));
            responder_loja(alterar_loja($versao, function (array $loja) use ($dados): array {
                return [
                    'versao' => $loja['versao'],
                    'categorias' => $dados['categorias'],
                    'produtos' => $dados['produtos'],
                    'lixeira' => is_array($dados['lixeira'] ?? null) ? $dados['lixeira'] : [],
                ];
            }));

        default:
            responder(['erro' => 'Ação desconhecida.'], 400);
    }
} catch (ConflitoVersao $erro) {
    responder(['erro' => $erro->getMessage(), 'conflito' => true], 409);
} catch (DadosInvalidos $erro) {
    responder(['erro' => $erro->getMessage(), 'erros' => $erro->erros], 422);
} catch (Throwable $erro) {
    error_log('Ligue Fraldas admin: ' . $erro->getMessage());
    responder(['erro' => $erro->getMessage()], 500);
}
