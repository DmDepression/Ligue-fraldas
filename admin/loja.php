<?php
/*
 * Catálogo administrado pelo painel (sem banco de dados).
 *
 * O catálogo da loja fica em data/loja.json, que existe só na hospedagem (fora do Git),
 * para que um deploy nunca apague o que foi cadastrado pelo painel. Na primeira leitura,
 * se o arquivo ainda não existir, o catálogo é montado a partir de data/produtos.json,
 * data/categorias.json e dos ajustes antigos de preço/status (data/ajustes.json).
 *
 * As fotos enviadas pelo painel ficam em img/uploads/. O JSON guarda só o caminho.
 */
declare(strict_types=1);

const ARQUIVO_LOJA = __DIR__ . '/../data/loja.json';
const ARQUIVO_CATEGORIAS = __DIR__ . '/../data/categorias.json';
const PASTA_UPLOADS = __DIR__ . '/../img/uploads';
const CAMINHO_UPLOADS = 'img/uploads/';
const MAX_BACKUPS_LOJA = 50;
const DIAS_PARA_APAGAR_FOTO_SOLTA = 30;
const MAX_BYTES_FOTO = 8 * 1024 * 1024;
const MAX_LADO_FOTO = 1600;

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

function ler_json_arquivo(string $arquivo): mixed
{
    $texto = @file_get_contents($arquivo);
    return $texto === false ? null : json_decode($texto, true);
}

/** Catálogo inicial a partir dos arquivos versionados no Git (+ ajustes antigos do painel). */
function montar_loja_inicial(): array
{
    $produtos = ler_json_arquivo(ARQUIVO_PRODUTOS);
    $categorias = ler_json_arquivo(ARQUIVO_CATEGORIAS);
    if (!is_array($produtos) || !is_array($categorias)) {
        throw new RuntimeException('Não foi possível ler data/produtos.json e data/categorias.json.');
    }
    $ajustes = is_file(ARQUIVO_AJUSTES) ? ler_json_arquivo(ARQUIVO_AJUSTES) : null;
    $porProduto = is_array($ajustes['produtos'] ?? null) ? $ajustes['produtos'] : [];

    foreach ($produtos as &$produto) {
        $ajuste = $porProduto[$produto['id'] ?? ''] ?? null;
        if (!is_array($ajuste)) {
            continue;
        }
        if (is_bool($ajuste['ativo'] ?? null)) {
            $produto['ativo'] = $ajuste['ativo'];
        }
        if (is_int($ajuste['precoCentavos'] ?? null) && empty($produto['embalagens'])) {
            $produto['precoCentavos'] = $ajuste['precoCentavos'];
        }
        foreach ($produto['embalagens'] ?? [] as $i => $embalagem) {
            $ajusteEmb = $ajuste['embalagens'][$embalagem['id'] ?? ''] ?? null;
            if (!is_array($ajusteEmb)) {
                continue;
            }
            if (is_bool($ajusteEmb['ativo'] ?? null)) {
                $produto['embalagens'][$i]['ativo'] = $ajusteEmb['ativo'];
            }
            if (is_int($ajusteEmb['precoCentavos'] ?? null)) {
                $produto['embalagens'][$i]['precoCentavos'] = $ajusteEmb['precoCentavos'];
            }
        }
    }
    unset($produto);

    return [
        'versao' => 0,
        'atualizadoEm' => null,
        'categorias' => array_values(array_map(
            fn($c) => ['id' => (string)$c['id'], 'nome' => (string)($c['nome'] ?? $c['id'])],
            array_filter($categorias, fn($c) => is_array($c) && !empty($c['id']))
        )),
        'produtos' => array_values($produtos),
        'lixeira' => [],
    ];
}

function ler_loja(): array
{
    if (!is_file(ARQUIVO_LOJA)) {
        return montar_loja_inicial();
    }
    $loja = ler_json_arquivo(ARQUIVO_LOJA);
    if (!is_array($loja) || !is_array($loja['produtos'] ?? null) || !is_array($loja['categorias'] ?? null)) {
        throw new RuntimeException('data/loja.json está inválido. Restaure uma versão no Histórico.');
    }
    $loja['lixeira'] = is_array($loja['lixeira'] ?? null) ? $loja['lixeira'] : [];
    $loja['versao'] = (int)($loja['versao'] ?? 0);
    return $loja;
}

/* ------------------------------------------------------------------ */
/* Gravação com backup e troca atômica                                 */
/* ------------------------------------------------------------------ */

function json_loja(array $loja): string
{
    return json_encode(
        $loja,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR
    ) . "\n";
}

function gravar_atomico(string $destino, string $conteudo): void
{
    $temporario = @tempnam(dirname($destino), '.gravando-');
    if ($temporario === false) {
        throw new RuntimeException('Não foi possível preparar a gravação. Confira a permissão da pasta data.');
    }
    try {
        if (@file_put_contents($temporario, $conteudo, LOCK_EX) === false) {
            throw new RuntimeException('Não foi possível gravar o catálogo.');
        }
        @chmod($temporario, 0644);
        if (!@rename($temporario, $destino)) {
            throw new RuntimeException('Não foi possível publicar o catálogo.');
        }
    } catch (Throwable $erro) {
        @unlink($temporario);
        throw $erro;
    }
}

/** Copia o catálogo atual para o histórico antes de substituí-lo. */
function fazer_backup_loja(): void
{
    if (!is_file(ARQUIVO_LOJA)) {
        return;
    }
    if (!garantir_pasta(PASTA_BACKUPS)) {
        throw new RuntimeException('Não foi possível criar a pasta de backups do painel.');
    }
    // O número da versão no nome mantém a ordem exata, mesmo com várias alterações no mesmo segundo.
    $atual = ler_json_arquivo(ARQUIVO_LOJA);
    $versao = is_array($atual) ? (int)($atual['versao'] ?? 0) : 0;
    $nome = sprintf('loja-v%07d-%s-%s.json', $versao, date('Ymd-His'), bin2hex(random_bytes(3)));
    if (!@copy(ARQUIVO_LOJA, PASTA_BACKUPS . '/' . $nome)) {
        throw new RuntimeException('Não foi possível criar a cópia de segurança do catálogo.');
    }
    $backups = glob(PASTA_BACKUPS . '/loja-*.json') ?: [];
    rsort($backups);
    foreach (array_slice($backups, MAX_BACKUPS_LOJA) as $antigo) {
        @unlink($antigo);
    }
}

function salvar_loja(array $loja): array
{
    fazer_backup_loja();
    $loja['versao'] = (int)($loja['versao'] ?? 0) + 1;
    $loja['atualizadoEm'] = date('c');
    $loja['produtos'] = array_values($loja['produtos']);
    $loja['lixeira'] = array_values($loja['lixeira'] ?? []);
    gravar_atomico(ARQUIVO_LOJA, json_loja($loja));
    limpar_fotos_soltas($loja);
    return $loja;
}

/**
 * Executa uma alteração com o catálogo travado. `$alterar` recebe o catálogo atual e
 * devolve o catálogo alterado. Se outra aba salvou antes (versão diferente), recusa.
 */
function alterar_loja(int $versaoCliente, callable $alterar): array
{
    $trava = @fopen(arquivo_bloqueio_catalogo(), 'c+');
    if (!$trava || !flock($trava, LOCK_EX)) {
        throw new RuntimeException('Não foi possível gravar (verifique a permissão das pastas data e admin/.dados).');
    }
    try {
        $loja = ler_loja();
        if ($versaoCliente !== $loja['versao']) {
            throw new ConflitoVersao('O catálogo foi alterado em outra janela. Recarregue a página para ver a versão atual.');
        }
        return salvar_loja($alterar($loja));
    } finally {
        flock($trava, LOCK_UN);
        fclose($trava);
    }
}

final class ConflitoVersao extends RuntimeException
{
}

final class DadosInvalidos extends RuntimeException
{
    public function __construct(public array $erros)
    {
        parent::__construct(implode(' ', $erros));
    }
}

/* ------------------------------------------------------------------ */
/* Histórico                                                           */
/* ------------------------------------------------------------------ */

function listar_backups(): array
{
    $lista = [];
    $arquivos = glob(PASTA_BACKUPS . '/loja-*.json') ?: [];
    rsort($arquivos);
    foreach ($arquivos as $arquivo) {
        $dados = ler_json_arquivo($arquivo);
        $lista[] = [
            'arquivo' => basename($arquivo),
            'versao' => is_array($dados) ? (int)($dados['versao'] ?? 0) : null,
            'salvoEm' => is_array($dados) ? ($dados['atualizadoEm'] ?? null) : null,
            'copiadoEm' => date('c', (int)filemtime($arquivo)),
            'produtos' => is_array($dados['produtos'] ?? null) ? count($dados['produtos']) : null,
            'lixeira' => is_array($dados['lixeira'] ?? null) ? count($dados['lixeira']) : 0,
        ];
    }
    return $lista;
}

function ler_backup(string $nome): array
{
    if (!preg_match('/^loja-v\d{7}-\d{8}-\d{6}-[a-f0-9]{6}\.json$/', $nome) || !is_file(PASTA_BACKUPS . '/' . $nome)) {
        throw new DadosInvalidos(['Versão do histórico não encontrada.']);
    }
    $dados = ler_json_arquivo(PASTA_BACKUPS . '/' . $nome);
    if (!is_array($dados) || !is_array($dados['produtos'] ?? null) || !is_array($dados['categorias'] ?? null)) {
        throw new DadosInvalidos(['Essa versão do histórico está danificada.']);
    }
    return $dados;
}

/* ------------------------------------------------------------------ */
/* Utilidades de validação                                             */
/* ------------------------------------------------------------------ */

function slug(string $texto): string
{
    // Troca manual dos acentos: o resultado é igual em qualquer servidor (o iconv varia).
    $texto = strtr(trim($texto), [
        'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'Á' => 'a', 'À' => 'a', 'Â' => 'a', 'Ã' => 'a', 'Ä' => 'a',
        'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'É' => 'e', 'È' => 'e', 'Ê' => 'e', 'Ë' => 'e',
        'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'Í' => 'i', 'Ì' => 'i', 'Î' => 'i', 'Ï' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o', 'Ó' => 'o', 'Ò' => 'o', 'Ô' => 'o', 'Õ' => 'o', 'Ö' => 'o',
        'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'Ú' => 'u', 'Ù' => 'u', 'Û' => 'u', 'Ü' => 'u',
        'ç' => 'c', 'Ç' => 'c', 'ñ' => 'n', 'Ñ' => 'n', '×' => 'x',
    ]);
    $texto = strtolower((string)preg_replace('/[^A-Za-z0-9]+/', '-', $texto));
    return trim($texto, '-') ?: 'item';
}

function id_unico(string $base, array $usados): string
{
    $base = substr(slug($base), 0, 60);
    $id = $base;
    for ($n = 2; in_array($id, $usados, true); $n++) {
        $id = $base . '-' . $n;
    }
    return $id;
}

function texto_limpo(mixed $valor, int $max): string
{
    $texto = is_scalar($valor) ? trim((string)$valor) : '';
    $texto = (string)preg_replace('/[^\P{C}\n\t]/u', '', $texto); // remove caracteres de controle
    return mb_substr($texto, 0, $max);
}

function codigo_tamanho(string $tamanho): string
{
    return trim(preg_split('/\s*[—–]\s*/u', $tamanho)[0] ?? $tamanho);
}

function caminho_foto_valido(string $caminho): bool
{
    return (bool)preg_match('#^img/(produtos|uploads)/[A-Za-z0-9._-]+\.(jpe?g|png|webp)$#', $caminho)
        && is_file(__DIR__ . '/../' . $caminho);
}

function ids_produtos(array $loja): array
{
    return array_map(fn($p) => (string)($p['id'] ?? ''), array_merge($loja['produtos'], $loja['lixeira']));
}

/**
 * Valida e normaliza um produto vindo do formulário do painel.
 * Regra da loja: nenhum anúncio sem foto, descrição e preço.
 */
function produto_do_formulario(array $entrada, array $loja, ?string $idExistente): array
{
    $erros = [];
    $nome = texto_limpo($entrada['nome'] ?? '', 120);
    $descricao = texto_limpo($entrada['descricao'] ?? '', 3000);
    $categoria = (string)($entrada['categoria'] ?? '');
    $categoriasValidas = array_column($loja['categorias'], 'id');

    if ($nome === '') {
        $erros[] = 'Informe o nome do produto.';
    }
    if ($descricao === '') {
        $erros[] = 'Informe a descrição.';
    }
    if (!in_array($categoria, $categoriasValidas, true)) {
        $erros[] = 'Escolha uma categoria.';
    }

    // Tamanhos: rótulos como "M — 24 unidades". Pelo menos um (use "Único" quando não houver).
    $tamanhos = [];
    foreach (is_array($entrada['tamanhos'] ?? null) ? $entrada['tamanhos'] : [] as $t) {
        $t = texto_limpo($t, 60);
        if ($t !== '' && !in_array($t, $tamanhos, true)) {
            $tamanhos[] = $t;
        }
    }
    if (!$tamanhos) {
        $erros[] = 'Informe pelo menos um tamanho (use "Único" se não houver tamanhos).';
    }
    if (count($tamanhos) > 20) {
        $erros[] = 'Use no máximo 20 tamanhos.';
    }
    $codigos = array_map('codigo_tamanho', $tamanhos);
    if (count(array_unique(array_map('mb_strtolower', $codigos))) !== count($codigos)) {
        $erros[] = 'Há dois tamanhos com a mesma letra/código.';
    }

    $preco = fn($v) => is_int($v) && $v >= 1 && $v <= 99999999;

    // Embalagens: pacotes com preço próprio. Sem embalagens, um preço para o produto todo.
    $embalagens = [];
    $idsEmbalagens = [];
    foreach (is_array($entrada['embalagens'] ?? null) ? $entrada['embalagens'] : [] as $i => $e) {
        if (!is_array($e)) {
            continue;
        }
        $rotulo = texto_limpo($e['rotulo'] ?? '', 60);
        $n = $i + 1;
        if ($rotulo === '') {
            $erros[] = "Embalagem $n: informe a quantidade (ex.: 16 unidades).";
            continue;
        }
        if (!$preco($e['precoCentavos'] ?? null)) {
            $erros[] = "Embalagem \"$rotulo\": informe um preço válido.";
        }
        $tamanhosEmb = [];
        foreach (is_array($e['tamanhos'] ?? null) ? $e['tamanhos'] : [] as $t) {
            if (in_array($t, $tamanhos, true) && !in_array($t, $tamanhosEmb, true)) {
                $tamanhosEmb[] = $t;
            }
        }
        $id = is_string($e['id'] ?? null) && preg_match('/^[a-z0-9][a-z0-9-]{0,79}$/', $e['id'])
            && !in_array($e['id'], $idsEmbalagens, true)
            ? $e['id']
            : id_unico($rotulo . (count($tamanhosEmb) < count($tamanhos) ? ' ' . implode(' ', array_map('codigo_tamanho', $tamanhosEmb)) : ''), $idsEmbalagens);
        $idsEmbalagens[] = $id;
        $item = ['id' => $id, 'rotulo' => $rotulo];
        // Todos os tamanhos marcados equivale a "vale para todos".
        if ($tamanhosEmb && count($tamanhosEmb) < count($tamanhos)) {
            $item['tamanhos'] = $tamanhosEmb;
        }
        $item['precoCentavos'] = $e['precoCentavos'] ?? 0;
        if (($e['ativo'] ?? true) === false) {
            $item['ativo'] = false;
        }
        $embalagens[] = $item;
    }
    if (count($embalagens) > 20) {
        $erros[] = 'Use no máximo 20 embalagens.';
    }
    if ($embalagens) {
        foreach ($tamanhos as $t) {
            $tem = false;
            foreach ($embalagens as $e) {
                if (empty($e['tamanhos']) || in_array($t, $e['tamanhos'], true)) {
                    $tem = true;
                }
            }
            if (!$tem) {
                $erros[] = "O tamanho \"$t\" não tem nenhuma embalagem.";
            }
        }
    } elseif (!$preco($entrada['precoCentavos'] ?? null)) {
        $erros[] = 'Informe o preço (ou cadastre embalagens com preço).';
    }

    // Fotos: a primeira é a capa. Só caminhos da galeria do site ou de fotos enviadas.
    $imagens = [];
    foreach (is_array($entrada['imagens'] ?? null) ? $entrada['imagens'] : [] as $caminho) {
        if (is_string($caminho) && caminho_foto_valido($caminho) && !in_array($caminho, $imagens, true)) {
            $imagens[] = $caminho;
        }
    }
    if (!$imagens) {
        $erros[] = 'Envie pelo menos uma foto.';
    }
    if (count($imagens) > 20) {
        $erros[] = 'Use no máximo 20 fotos.';
    }

    $fotosPorOpcao = [];
    foreach (is_array($entrada['fotosPorOpcao'] ?? null) ? $entrada['fotosPorOpcao'] : [] as $f) {
        if (!is_array($f) || !in_array($f['imagem'] ?? null, $imagens, true)) {
            continue;
        }
        $item = [];
        $tamanho = (string)($f['tamanho'] ?? '');
        $embalagem = (string)($f['embalagem'] ?? '');
        if ($tamanho !== '' && in_array($tamanho, $codigos, true)) {
            $item['tamanho'] = $tamanho;
        }
        if ($embalagem !== '' && in_array($embalagem, $idsEmbalagens, true)) {
            $item['embalagem'] = $embalagem;
        }
        if ($item) {
            $item['imagem'] = $f['imagem'];
            $fotosPorOpcao[] = $item;
        }
    }

    $informacoes = [];
    foreach (is_array($entrada['informacoes'] ?? null) ? $entrada['informacoes'] : [] as $info) {
        if (!is_array($info)) {
            continue;
        }
        $valor = texto_limpo($info['valor'] ?? '', 300);
        if ($valor !== '') {
            $informacoes[] = ['rotulo' => texto_limpo($info['rotulo'] ?? '', 60), 'valor' => $valor];
        }
    }

    $palavras = [];
    foreach (is_array($entrada['palavrasChave'] ?? null) ? $entrada['palavrasChave'] : [] as $p) {
        $p = texto_limpo($p, 60);
        if ($p !== '') {
            $palavras[] = $p;
        }
    }

    if ($erros) {
        throw new DadosInvalidos($erros);
    }

    $anterior = null;
    if ($idExistente !== null) {
        foreach ($loja['produtos'] as $p) {
            if (($p['id'] ?? null) === $idExistente) {
                $anterior = $p;
            }
        }
        if ($anterior === null) {
            throw new DadosInvalidos(['Produto não encontrado. Recarregue a página.']);
        }
    }

    $produto = [
        'id' => $anterior['id'] ?? id_unico($nome, ids_produtos($loja)),
        'nome' => $nome,
        'categoria' => $categoria,
        'marca' => texto_limpo($entrada['marca'] ?? '', 60),
        'descricao' => $descricao,
        'tamanho' => $tamanhos,
    ];
    if ($embalagens) {
        $produto['embalagens'] = $embalagens;
        // Embalagem de capa: o card do site mostra o preço e a foto dela.
        $capa = (string)($entrada['embalagemCapa'] ?? '');
        if ($capa !== '' && in_array($capa, $idsEmbalagens, true)) {
            $produto['embalagemCapa'] = $capa;
        }
    } else {
        $produto['precoCentavos'] = $entrada['precoCentavos'];
    }
    $produto['imagens'] = $imagens;
    if ($fotosPorOpcao) {
        $produto['fotosPorOpcao'] = $fotosPorOpcao;
    }
    if ($informacoes) {
        $produto['informacoes'] = $informacoes;
    }
    if ($palavras) {
        $produto['palavrasChave'] = $palavras;
    }
    $produto['destaque'] = ($entrada['destaque'] ?? false) === true;
    if (is_int($entrada['ordem'] ?? null)) {
        $produto['ordem'] = $entrada['ordem'];
    } elseif (isset($anterior['ordem'])) {
        $produto['ordem'] = $anterior['ordem'];
    }
    $produto['criadoEm'] = $anterior['criadoEm'] ?? date('Y-m-d');
    if (($entrada['ativo'] ?? true) === false) {
        $produto['ativo'] = false;
    }
    return $produto;
}

/* ------------------------------------------------------------------ */
/* Fotos                                                               */
/* ------------------------------------------------------------------ */

function garantir_pasta_uploads(): void
{
    if (!garantir_pasta(PASTA_UPLOADS)) {
        throw new RuntimeException('Não foi possível criar a pasta img/uploads. Confira a permissão da pasta img.');
    }
    // Nenhum script pode ser executado na pasta de fotos.
    $htaccess = PASTA_UPLOADS . '/.htaccess';
    if (!is_file($htaccess)) {
        @file_put_contents($htaccess, "Options -Indexes\n<FilesMatch \"(?i)\\.(php[0-9]?|phtml|phar|pl|py|cgi|sh|shtml|html?|svg)$\">\n  Require all denied\n</FilesMatch>\n");
    }
}

function mensagem_erro_upload(int $codigo): string
{
    return match ($codigo) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'A foto é maior do que a hospedagem aceita. Use uma foto menor.',
        UPLOAD_ERR_PARTIAL => 'O envio da foto foi interrompido. Tente de novo.',
        UPLOAD_ERR_NO_FILE => 'Nenhuma foto foi enviada.',
        default => 'A hospedagem não conseguiu receber a foto (código ' . $codigo . ').',
    };
}

/** Recebe a foto enviada, confere que é imagem de verdade e grava em img/uploads. */
function receber_foto(array $arquivo, string $nomeBase): string
{
    $codigo = (int)($arquivo['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($codigo !== UPLOAD_ERR_OK) {
        throw new DadosInvalidos([mensagem_erro_upload($codigo)]);
    }
    $temporario = (string)($arquivo['tmp_name'] ?? '');
    if (!is_uploaded_file($temporario)) {
        throw new DadosInvalidos(['Envio de foto inválido.']);
    }
    if ((int)$arquivo['size'] > MAX_BYTES_FOTO) {
        throw new DadosInvalidos(['A foto passa de 8 MB. Use uma foto menor.']);
    }
    $info = @getimagesize($temporario);
    $tipos = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
    if (!$info || !isset($tipos[$info[2]])) {
        throw new DadosInvalidos(['Envie a foto em JPG, PNG ou WEBP.']);
    }
    [$largura, $altura] = $info;
    if ($largura < 100 || $altura < 100 || $largura > 8000 || $altura > 8000) {
        throw new DadosInvalidos(['A foto precisa ter entre 100 e 8000 pixels de lado.']);
    }

    garantir_pasta_uploads();
    $nome = substr(slug($nomeBase), 0, 50) . '-' . date('ymd') . '-' . bin2hex(random_bytes(4));

    // Com a biblioteca GD, a foto é redesenhada: reduz o tamanho e descarta qualquer
    // conteúdo que não seja a imagem (metadados, arquivos disfarçados).
    if (function_exists('imagecreatefromstring') && function_exists('imagejpeg')) {
        $imagem = @imagecreatefromstring((string)file_get_contents($temporario));
        if ($imagem === false) {
            throw new DadosInvalidos(['Não foi possível ler essa foto. Tente salvá-la de novo em JPG.']);
        }
        $escala = min(1, MAX_LADO_FOTO / max($largura, $altura));
        $novaLargura = max(1, (int)round($largura * $escala));
        $novaAltura = max(1, (int)round($altura * $escala));
        $tela = imagecreatetruecolor($novaLargura, $novaAltura);
        imagefill($tela, 0, 0, imagecolorallocate($tela, 255, 255, 255)); // fundo branco para PNG transparente
        imagecopyresampled($tela, $imagem, 0, 0, 0, 0, $novaLargura, $novaAltura, $largura, $altura);
        $destino = PASTA_UPLOADS . '/' . $nome . '.jpg';
        $ok = imagejpeg($tela, $destino, 86);
        imagedestroy($imagem);
        imagedestroy($tela);
        if (!$ok) {
            throw new RuntimeException('Não foi possível gravar a foto em img/uploads.');
        }
        @chmod($destino, 0644);
        return CAMINHO_UPLOADS . $nome . '.jpg';
    }

    $destino = PASTA_UPLOADS . '/' . $nome . '.' . $tipos[$info[2]];
    if (!@move_uploaded_file($temporario, $destino)) {
        throw new RuntimeException('Não foi possível gravar a foto em img/uploads.');
    }
    @chmod($destino, 0644);
    return CAMINHO_UPLOADS . basename($destino);
}

/**
 * Apaga fotos enviadas que não aparecem no catálogo nem em nenhuma versão do histórico
 * há mais de 30 dias. Assim, restaurar uma versão antiga nunca fica sem foto.
 */
function limpar_fotos_soltas(array $loja): void
{
    if (!is_dir(PASTA_UPLOADS)) {
        return;
    }
    $usadas = [];
    $marcar = function (array $dados) use (&$usadas): void {
        foreach (array_merge($dados['produtos'] ?? [], $dados['lixeira'] ?? []) as $p) {
            foreach ($p['imagens'] ?? [] as $img) {
                $usadas[basename((string)$img)] = true;
            }
        }
    };
    $marcar($loja);
    foreach (glob(PASTA_BACKUPS . '/loja-*.json') ?: [] as $backup) {
        $dados = ler_json_arquivo($backup);
        if (is_array($dados)) {
            $marcar($dados);
        }
    }
    $limite = time() - DIAS_PARA_APAGAR_FOTO_SOLTA * 86400;
    foreach (glob(PASTA_UPLOADS . '/*') ?: [] as $arquivo) {
        if (!preg_match('/\.(jpe?g|png|webp)$/i', $arquivo)) {
            continue;
        }
        if (!isset($usadas[basename($arquivo)]) && filemtime($arquivo) < $limite) {
            @unlink($arquivo);
        }
    }
}
