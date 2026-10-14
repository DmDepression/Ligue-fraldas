<?php
/*
 * Configuração da área administrativa (HostGator / PHP).
 *
 * Usuário: admin
 * A senha NÃO fica em texto puro: guardamos só o hash PBKDF2-SHA256 abaixo.
 * Para trocar a senha, gere um novo hash com o mesmo SALT:
 *   php -r "echo hash_pbkdf2('sha256', 'NOVA_SENHA', 'f681b4c51291797dec13b563757a395e', 120000, 64);"
 */
declare(strict_types=1);

const ADMIN_USUARIO = 'admin';
const ADMIN_SALT = 'f681b4c51291797dec13b563757a395e';
const ADMIN_HASH = '9634a50da52cbe95b6404ee39aca4421655270ef69589f02ebec8159b432a604';
const ADMIN_ITERACOES = 120000;

// Arquivo do catálogo (o mesmo que o site público lê) e pasta de controle interno.
const ARQUIVO_PRODUTOS = __DIR__ . '/../data/produtos.json';
const PASTA_DADOS = __DIR__ . '/.dados';

const MAX_TENTATIVAS = 5;      // erros de login permitidos...
const JANELA_TENTATIVAS = 900; // ...dentro de 15 minutos, por IP

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
    $hash = hash_pbkdf2('sha256', $senha, ADMIN_SALT, ADMIN_ITERACOES, 64);
    $okSenha = hash_equals(ADMIN_HASH, $hash);
    $okUsuario = hash_equals(ADMIN_USUARIO, $usuario);
    return $okSenha && $okUsuario;
}

/* ---- limite de tentativas de login por IP ---- */

function arquivo_tentativas(): string
{
    if (!is_dir(PASTA_DADOS)) {
        @mkdir(PASTA_DADOS, 0755, true);
    }
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
