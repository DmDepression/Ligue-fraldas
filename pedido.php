<?php
/*
 * Pedido enviado por e-mail pelo carrinho do site (a outra opção é o WhatsApp).
 *
 * O navegador manda só produto, tamanho, embalagem e quantidade: preços e estoque são
 * conferidos aqui no catálogo atual, então ninguém consegue mudar o valor do pedido.
 * O número do pedido vem do carrinho e é o mesmo da mensagem de WhatsApp, para a loja
 * perceber quando o mesmo pedido chega pelos dois caminhos.
 */
declare(strict_types=1);

require __DIR__ . '/admin/config.php';
require __DIR__ . '/admin/loja.php';

// Para onde vão os pedidos e quem aparece como remetente (um endereço do domínio do site,
// autorizado pelo SPF da HostGator; as respostas vão para o e-mail do cliente, se ele informar).
const EMAIL_LOJA = 'liguefraldasgeriatricas@gmail.com';
const EMAIL_REMETENTE = 'pedidos@liguefraldasgeriatricas.com.br';
const NOME_REMETENTE = 'Site Ligue Fraldas';

const MAX_PEDIDOS_POR_IP = 5;   // pedidos enviados...
const JANELA_PEDIDOS = 600;     // ...a cada 10 minutos, por IP (freio contra spam)
const MAX_ITENS_PEDIDO = 50;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function responder(array $dados, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function moeda(int $centavos): string
{
    return 'R$ ' . number_format($centavos / 100, 2, ',', '.');
}

function arquivo_pedidos_ip(): string
{
    garantir_pasta(PASTA_DADOS);
    return PASTA_DADOS . '/pedidos-ip.json';
}

/** Pedidos enviados por IP na janela atual (mesmo formato do limite de login). */
function pedidos_recentes(): array
{
    $agora = time();
    $todos = @json_decode((string)@file_get_contents(arquivo_pedidos_ip()), true);
    $todos = is_array($todos) ? $todos : [];
    foreach ($todos as $ip => $lista) {
        $todos[$ip] = array_values(array_filter((array)$lista, fn($t) => $agora - (int)$t < JANELA_PEDIDOS));
        if (!$todos[$ip]) {
            unset($todos[$ip]);
        }
    }
    return $todos;
}

/**
 * Confere um item contra o catálogo, com a mesma regra do site (js/nucleo.js): produto ativo,
 * tamanho em estoque e, com embalagens, embalagem em estoque que exista nesse tamanho.
 * Devolve [descrição, preço em centavos, nome do produto] ou null.
 */
function resolver_item(array $porId, string $id, string $tamanho, string $embalagemId): ?array
{
    $p = $porId[$id] ?? null;
    if (!is_array($p) || ($p['ativo'] ?? true) === false) {
        return null;
    }
    $todos = array_values(array_filter(array_map('strval', (array)($p['tamanho'] ?? [])), fn($t) => trim($t) !== ''));
    $fora = array_map('strval', (array)($p['tamanhosForaDeEstoque'] ?? []));
    $emEstoque = array_values(array_diff($todos, $fora));
    if ($todos && !in_array($tamanho, $emEstoque, true)) {
        return null;
    }
    $nome = (string)($p['nome'] ?? $id);
    if (!empty($p['embalagens'])) {
        foreach ($p['embalagens'] as $e) {
            if (!is_array($e) || ($e['id'] ?? null) !== $embalagemId) {
                continue;
            }
            $tamanhosEmb = (array)($e['tamanhos'] ?? []);
            $preco = $e['precoCentavos'] ?? null;
            if (($e['ativo'] ?? true) === false || !is_int($preco) || $preco < 1
                || ($tamanhosEmb && !in_array($tamanho, $tamanhosEmb, true))) {
                return null;
            }
            return [$tamanho . ' · ' . (string)($e['rotulo'] ?? ''), $preco, $nome];
        }
        return null;
    }
    $preco = $p['precoCentavos'] ?? null;
    return is_int($preco) && $preco >= 1 ? [$tamanho, $preco, $nome] : null;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    responder(['erro' => 'Método não permitido.'], 405);
}

// Só aceita pedidos vindos das páginas do próprio site.
$origem = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origem !== '' && parse_url($origem, PHP_URL_HOST) !== parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST)) {
    responder(['erro' => 'Origem não permitida.'], 403);
}

$entrada = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($entrada)) {
    responder(['erro' => 'Pedido inválido.'], 400);
}

$numero = (string)($entrada['numero'] ?? '');
if (!preg_match('/^LF-\d{6}-[A-HJ-NP-Z2-9]{4}$/', $numero)) {
    responder(['erro' => 'Número de pedido inválido. Recarregue a página e tente de novo.'], 422);
}

// Campo-isca: pessoas não o veem; robô que preenche recebe "ok" e nada é enviado.
if (trim((string)($entrada['site'] ?? '')) !== '') {
    responder(['ok' => true, 'numero' => $numero]);
}

$umaLinha = fn(string $texto): string => trim((string)preg_replace('/\s+/u', ' ', $texto));
$nome = $umaLinha(texto_limpo($entrada['nome'] ?? '', 80));
$telefone = $umaLinha(texto_limpo($entrada['telefone'] ?? '', 20));
$email = trim(texto_limpo($entrada['email'] ?? '', 120));
$digitos = strlen((string)preg_replace('/\D/', '', $telefone));

$erros = [];
if ($nome === '') {
    $erros[] = 'Informe seu nome.';
}
if ($digitos < 10 || $digitos > 13) {
    $erros[] = 'Informe o telefone com DDD.';
}
if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    $erros[] = 'O e-mail informado não é válido.';
}
$lista = is_array($entrada['itens'] ?? null) ? $entrada['itens'] : [];
if (!$lista || count($lista) > MAX_ITENS_PEDIDO) {
    $erros[] = 'O carrinho está vazio.';
}
if ($erros) {
    responder(['erro' => implode(' ', $erros)], 422);
}

try {
    $loja = ler_loja();
} catch (Throwable $erro) {
    error_log('Ligue Fraldas pedido: ' . $erro->getMessage());
    responder(['erro' => 'Não foi possível conferir o catálogo agora.'], 500);
}
$porId = [];
foreach ($loja['produtos'] as $p) {
    if (is_array($p) && isset($p['id'])) {
        $porId[(string)$p['id']] = $p;
    }
}

$linhas = [];
$total = 0;
$mudaram = [];
foreach ($lista as $item) {
    $quantidade = is_array($item) ? ($item['quantidade'] ?? null) : null;
    $id = is_array($item) ? (string)($item['id'] ?? '') : '';
    $resolvido = is_int($quantidade) && $quantidade >= 1 && $quantidade <= 99
        ? resolver_item($porId, $id, (string)($item['tamanho'] ?? ''), (string)($item['embalagem'] ?? ''))
        : null;
    if ($resolvido === null) {
        $mudaram[] = (string)($porId[$id]['nome'] ?? 'um produto');
        continue;
    }
    [$descricao, $preco, $nomeProduto] = $resolvido;
    $subtotal = $preco * $quantidade;
    $total += $subtotal;
    $linhas[] = '• ' . $nomeProduto . ' — ' . $descricao . ' — ' . $quantidade . ' ' . ($quantidade === 1 ? 'pacote' : 'pacotes')
        . ' × ' . moeda($preco) . ' = ' . moeda($subtotal);
}
if ($mudaram) {
    responder(['erro' => 'Saiu de estoque ou mudou no catálogo: ' . implode(', ', array_unique($mudaram))
        . '. Recarregue a página e confira o carrinho.'], 409);
}

// Freio contra spam, contado só para pedidos válidos.
$ip = ip_cliente();
$recentes = pedidos_recentes();
if (count($recentes[$ip] ?? []) >= MAX_PEDIDOS_POR_IP) {
    responder(['erro' => 'Muitos pedidos seguidos. Aguarde alguns minutos ou envie pelo WhatsApp.'], 429);
}

$corpo = implode("\n", array_merge([
    'Pedido nº ' . $numero,
    'Recebido em ' . date('d/m/Y') . ' às ' . date('H:i'),
    '',
    'Cliente: ' . $nome,
    'Telefone/WhatsApp: ' . $telefone,
    'E-mail: ' . ($email !== '' ? $email : '(não informado)'),
    '',
    'Itens:',
], $linhas, [
    '',
    'Total dos produtos: ' . moeda($total),
    '',
    'Disponibilidade, entrega e pagamento: confirmar com o cliente.',
    'Se o mesmo número chegar também pelo WhatsApp, é o mesmo pedido.',
    '',
    '— Enviado pelo carrinho do site liguefraldasgeriatricas.com.br',
])) . "\n";

$assunto = mb_encode_mimeheader('Pedido ' . $numero . ' — ' . $nome, 'UTF-8', 'B', "\r\n");
$cabecalhos = [
    'From: ' . mb_encode_mimeheader(NOME_REMETENTE, 'UTF-8', 'B') . ' <' . EMAIL_REMETENTE . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: Ligue Fraldas site',
];
if ($email !== '') {
    $cabecalhos[] = 'Reply-To: ' . $email;
}

// Nos testes automáticos o e-mail vai para um arquivo, em vez de sair pela internet.
$arquivoTeste = getenv('LIGUE_PEDIDO_ARQUIVO_TESTE');
if (is_string($arquivoTeste) && $arquivoTeste !== '') {
    $enviado = @file_put_contents($arquivoTeste, json_encode([
        'para' => EMAIL_LOJA, 'assunto' => $assunto, 'cabecalhos' => $cabecalhos, 'corpo' => $corpo,
    ], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX) !== false;
} else {
    $enviado = mail(EMAIL_LOJA, $assunto, $corpo, implode("\r\n", $cabecalhos), '-f' . EMAIL_REMETENTE);
}
if (!$enviado) {
    error_log('Ligue Fraldas pedido: mail() falhou para o pedido ' . $numero);
    responder(['erro' => 'Não foi possível enviar o e-mail agora.'], 502);
}

$recentes[$ip][] = time();
@file_put_contents(arquivo_pedidos_ip(), json_encode($recentes), LOCK_EX);

responder(['ok' => true, 'numero' => $numero, 'totalCentavos' => $total]);
