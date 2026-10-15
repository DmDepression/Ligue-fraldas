<?php
/* Execute somente pelo Terminal do cPanel: php ferramentas/gerar-credenciais-admin.php */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$destino = dirname(__DIR__) . '/admin/.dados/credenciais.php';
$usuario = trim((string)readline('Usuário do painel [admin]: '));
$usuario = $usuario !== '' ? $usuario : 'admin';
fwrite(STDOUT, 'Nova senha (mínimo de 12 caracteres): ');
$podeOcultar = DIRECTORY_SEPARATOR === '/' && function_exists('shell_exec');
if ($podeOcultar) {
    @shell_exec('stty -echo');
}
try {
    $senha = trim((string)fgets(STDIN));
} finally {
    if ($podeOcultar) {
        @shell_exec('stty echo');
        fwrite(STDOUT, "\n");
    }
}

if (strlen($senha) < 12) {
    fwrite(STDERR, "A senha precisa ter pelo menos 12 caracteres.\n");
    exit(1);
}
if (!is_dir(dirname($destino)) && !mkdir(dirname($destino), 0755, true)) {
    fwrite(STDERR, "Não foi possível criar admin/.dados.\n");
    exit(1);
}

$conteudo = "<?php\nreturn " . var_export([
    'usuario' => $usuario,
    'senhaHash' => password_hash($senha, PASSWORD_DEFAULT),
], true) . ";\n";

if (file_put_contents($destino, $conteudo, LOCK_EX) === false) {
    fwrite(STDERR, "Não foi possível gravar as credenciais.\n");
    exit(1);
}
@chmod($destino, 0600);
fwrite(STDOUT, "Credenciais criadas em admin/.dados/credenciais.php.\n");
