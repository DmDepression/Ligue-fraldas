<?php
/*
 * Primeira configuração do painel sem Terminal (HostGator / cPanel).
 *
 * 1. No Gerenciador de Arquivos do cPanel, crie admin/.dados/instalar.txt com um
 *    código de pelo menos 16 caracteres inventado na hora (só você o conhece).
 * 2. Abra https://liguefraldasgeriatricas.com.br/admin/instalar.php, repita o código e escolha usuário e senha.
 *
 * O código prova que quem está instalando tem acesso ao cPanel. A página grava
 * admin/.dados/credenciais.php (somente o hash da senha), apaga instalar.txt e
 * fica desativada enquanto existirem credenciais.
 */
declare(strict_types=1);

require __DIR__ . '/config.php';

const ARQUIVO_CODIGO = PASTA_DADOS . '/instalar.txt';
const TAMANHO_MINIMO_CODIGO = 16;
const TAMANHO_MINIMO_SENHA = 12;

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

iniciar_sessao();

function html(string $texto): string
{
    return htmlspecialchars($texto, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function conexao_segura(): bool
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $local = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
    return $https || $local;
}

function ler_codigo(): string
{
    if (!is_file(ARQUIVO_CODIGO)) {
        return '';
    }
    // O editor do cPanel pode gravar o arquivo com BOM; ele não faz parte do código digitado.
    $conteudo = (string)@file_get_contents(ARQUIVO_CODIGO);
    if (strncmp($conteudo, "\u{FEFF}", 3) === 0) {
        $conteudo = substr($conteudo, 3);
    }
    return trim($conteudo);
}

function gravar_credenciais(string $usuario, string $senha): void
{
    if (!garantir_pasta(PASTA_DADOS)) {
        throw new RuntimeException('Não foi possível acessar a pasta admin/.dados.');
    }
    $conteudo = "<?php\nreturn " . var_export([
        'usuario' => $usuario,
        'senhaHash' => password_hash($senha, PASSWORD_DEFAULT),
    ], true) . ";\n";
    $temporario = @tempnam(PASTA_DADOS, '.credenciais-');
    if ($temporario === false) {
        throw new RuntimeException('Não foi possível preparar o arquivo de credenciais.');
    }
    $gravou = @file_put_contents($temporario, $conteudo, LOCK_EX) !== false;
    if ($gravou) {
        @chmod($temporario, 0600);
    }
    if (!$gravou || !@rename($temporario, ARQUIVO_CREDENCIAIS)) {
        @unlink($temporario);
        throw new RuntimeException('Não foi possível gravar as credenciais. Confira a permissão da pasta admin/.dados.');
    }
}

$erro = '';
$concluido = false;

if (painel_configurado()) {
    $estado = 'configurado';
} elseif (!conexao_segura()) {
    $estado = 'inseguro';
} elseif (strlen(ler_codigo()) < TAMANHO_MINIMO_CODIGO) {
    $estado = 'sem-codigo';
} else {
    $estado = 'formulario';
}

if ($estado === 'formulario' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $ip = ip_cliente();
    $usuario = trim((string)($_POST['usuario'] ?? ''));
    $senha = (string)($_POST['senha'] ?? '');
    $confirmacao = (string)($_POST['confirmacao'] ?? '');

    if (!hash_equals(token_csrf(), (string)($_POST['csrf'] ?? ''))) {
        $erro = 'A página expirou. Recarregue e tente de novo.';
    } elseif (tentativas_recentes($ip) >= MAX_TENTATIVAS) {
        $erro = 'Muitas tentativas. Aguarde 15 minutos e tente de novo.';
    } elseif (!hash_equals(ler_codigo(), trim((string)($_POST['codigo'] ?? '')))) {
        registrar_tentativa($ip, false);
        usleep(600000);
        $erro = 'O código não confere com o arquivo admin/.dados/instalar.txt.';
    } elseif (!preg_match('/^[A-Za-z0-9._@-]{3,40}$/', $usuario)) {
        $erro = 'Use um usuário de 3 a 40 caracteres, sem espaços (letras, números, ponto, hífen, _ ou @).';
    } elseif (strlen($senha) < TAMANHO_MINIMO_SENHA) {
        $erro = 'A senha precisa ter pelo menos ' . TAMANHO_MINIMO_SENHA . ' caracteres.';
    } elseif (!hash_equals($senha, $confirmacao)) {
        $erro = 'A confirmação não é igual à senha.';
    } else {
        // Bloqueio para que duas instalações simultâneas não se sobreponham.
        garantir_pasta(PASTA_DADOS);
        $trava = @fopen(PASTA_DADOS . '/instalar.lock', 'c');
        try {
            if (!$trava || !flock($trava, LOCK_EX)) {
                throw new RuntimeException('Não foi possível gravar na pasta admin/.dados.');
            }
            if (is_file(ARQUIVO_CREDENCIAIS)) {
                throw new RuntimeException('O painel já foi configurado.');
            }
            gravar_credenciais($usuario, $senha);
            @unlink(ARQUIVO_CODIGO);
            registrar_tentativa($ip, true);
            $concluido = true;
            $estado = 'configurado';
        } catch (Throwable $falha) {
            $erro = $falha->getMessage();
        } finally {
            if ($trava) {
                flock($trava, LOCK_UN);
                fclose($trava);
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Configurar painel · Ligue Fraldas Geriátricas</title>
  <link rel="icon" href="../favicon.ico">
  <link rel="stylesheet" href="admin.css">
</head>
<body>
  <main class="login">
    <div class="login__caixa">
      <img src="../img/logo.svg" alt="" width="64" height="64">
      <h1>Configurar o painel</h1>
<?php if ($estado === 'configurado'): ?>
      <p><?= $concluido
          ? 'Pronto. O usuário e a senha foram criados e o código de instalação foi apagado.'
          : 'O painel já está configurado. Esta página fica desativada.' ?></p>
      <p><a class="btn btn--primario" href="./">Ir para o painel</a></p>
<?php elseif ($estado === 'inseguro'): ?>
      <p class="erro">Abra esta página pelo endereço com <strong>https://</strong> para que a senha viaje protegida.</p>
<?php elseif ($estado === 'sem-codigo'): ?>
      <p>Para provar que é você quem está configurando, crie um código no cPanel:</p>
      <ol>
        <li>Abra o <strong>Gerenciador de Arquivos</strong> e ative <em>Mostrar arquivos ocultos</em> em Configurações.</li>
        <li>Entre em <code>public_html/admin/.dados/</code>.</li>
        <li>Crie o arquivo <code>instalar.txt</code> e escreva nele um código inventado agora, com pelo menos
          <?= TAMANHO_MINIMO_CODIGO ?> caracteres. Não use a senha do painel.</li>
        <li>Salve e recarregue esta página.</li>
      </ol>
<?php else: ?>
      <form method="post" autocomplete="off">
        <input type="hidden" name="csrf" value="<?= html(token_csrf()) ?>">
        <label>Código do arquivo instalar.txt
          <input name="codigo" type="text" required autocomplete="off" spellcheck="false">
        </label>
        <label>Usuário do painel
          <input name="usuario" type="text" required minlength="3" maxlength="40" autocomplete="username"
            value="<?= html((string)($_POST['usuario'] ?? '')) ?>">
        </label>
        <label>Senha nova (mínimo de <?= TAMANHO_MINIMO_SENHA ?> caracteres)
          <input name="senha" type="password" required minlength="<?= TAMANHO_MINIMO_SENHA ?>" autocomplete="new-password">
        </label>
        <label>Repita a senha
          <input name="confirmacao" type="password" required minlength="<?= TAMANHO_MINIMO_SENHA ?>" autocomplete="new-password">
        </label>
<?php if ($erro !== ''): ?>
        <p class="erro" role="alert"><?= html($erro) ?></p>
<?php endif; ?>
        <button class="btn btn--primario" type="submit">Criar acesso</button>
      </form>
<?php endif; ?>
    </div>
  </main>
</body>
</html>
