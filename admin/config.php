<?php
/* Configuração interna da área administrativa (HostGator / PHP 8+). */
declare(strict_types=1);

date_default_timezone_set('America/Sao_Paulo');

// O catálogo fica em JSON (veja loja.php): este painel não exige banco de dados.
const ARQUIVO_PRODUTOS = __DIR__ . '/../data/produtos.json';
const ARQUIVO_AJUSTES = __DIR__ . '/../data/ajustes.json'; // formato antigo, só lido na importação
const PASTA_DADOS = __DIR__ . '/.dados';
const ARQUIVO_CREDENCIAIS = PASTA_DADOS . '/credenciais.php';
const PASTA_BACKUPS = PASTA_DADOS . '/backups';

const MAX_TENTATIVAS = 5;      // erros de login permitidos...
const JANELA_TENTATIVAS = 900; // ...dentro de 15 minutos, por IP

function garantir_pasta(string $pasta): bool
{
    return is_dir($pasta) || @mkdir($pasta, 0755, true);
}

/**
 * As credenciais podem vir das variáveis de ambiente da hospedagem ou do
 * arquivo privado admin/.dados/credenciais.php, ignorado pelo Git.
 */
function credenciais_admin(): ?array
{
    static $credenciais = false;
    if ($credenciais !== false) {
        return $credenciais;
    }

    $usuarioAmbiente = getenv('LIGUE_ADMIN_USUARIO');
    $hashAmbiente = getenv('LIGUE_ADMIN_SENHA_HASH');
    $dados = null;
    if (is_string($usuarioAmbiente) && $usuarioAmbiente !== ''
        && is_string($hashAmbiente) && $hashAmbiente !== '') {
        $dados = ['usuario' => $usuarioAmbiente, 'senhaHash' => $hashAmbiente];
    } elseif (is_file(ARQUIVO_CREDENCIAIS)) {
        $carregado = require ARQUIVO_CREDENCIAIS;
        $dados = is_array($carregado) ? $carregado : null;
    }

    if (!is_array($dados)
        || !is_string($dados['usuario'] ?? null) || trim($dados['usuario']) === ''
        || !is_string($dados['senhaHash'] ?? null) || ($dados['senhaHash'] ?? '') === '') {
        $credenciais = null;
        return null;
    }

    $credenciais = [
        'usuario' => trim($dados['usuario']),
        'senhaHash' => $dados['senhaHash'],
    ];
    return $credenciais;
}

function painel_configurado(): bool
{
    return credenciais_admin() !== null;
}

function iniciar_sessao(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('ligue_admin');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function esta_logado(): bool
{
    return !empty($_SESSION['admin']) && $_SESSION['admin'] === true
        && (time() - (int)($_SESSION['ultimo_acesso'] ?? 0)) < 7200; // expira após 2h sem uso
}

function token_csrf(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function senha_confere(string $usuario, string $senha): bool
{
    $credenciais = credenciais_admin();
    if ($credenciais === null) {
        return false;
    }
    return hash_equals($credenciais['usuario'], $usuario)
        && password_verify($senha, $credenciais['senhaHash']);
}

/* ---- limite de tentativas de login por IP ---- */

function arquivo_tentativas(): string
{
    garantir_pasta(PASTA_DADOS);
    return PASTA_DADOS . '/tentativas.json';
}

function ler_tentativas(): array
{
    $dados = @json_decode((string)@file_get_contents(arquivo_tentativas()), true);
    return is_array($dados) ? $dados : [];
}

function tentativas_recentes(string $ip): int
{
    $agora = time();
    $lista = ler_tentativas()[$ip] ?? [];
    return count(array_filter($lista, fn($t) => $agora - (int)$t < JANELA_TENTATIVAS));
}

function registrar_tentativa(string $ip, bool $sucesso): void
{
    $agora = time();
    $todas = ler_tentativas();
    foreach ($todas as $k => $lista) {
        $todas[$k] = array_values(array_filter($lista, fn($t) => $agora - (int)$t < JANELA_TENTATIVAS));
        if (!$todas[$k]) {
            unset($todas[$k]);
        }
    }
    if ($sucesso) {
        unset($todas[$ip]);
    } else {
        $todas[$ip][] = $agora;
    }
    @file_put_contents(arquivo_tentativas(), json_encode($todas), LOCK_EX);
}

function ip_cliente(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function arquivo_bloqueio_catalogo(): string
{
    garantir_pasta(PASTA_DADOS);
    return PASTA_DADOS . '/catalogo.lock';
}
