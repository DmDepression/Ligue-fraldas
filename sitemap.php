<?php
/*
 * Sitemap gerado a partir do catálogo atual, para os produtos cadastrados pelo painel
 * entrarem no Google sem editar arquivo nenhum. Lê o mesmo catálogo que o site mostra:
 * data/loja.json (painel) ou, antes do primeiro salvamento, data/produtos.json.
 * O endereço antigo /sitemap.xml continua valendo (regra no .htaccess).
 */
declare(strict_types=1);

require __DIR__ . '/admin/config.php';
require __DIR__ . '/admin/loja.php';

// Mesmo domínio das tags canonical das páginas.
const URL_SITE = 'https://liguefraldasgeriatricas.com.br/';

function url_xml(string $caminho): string
{
    return htmlspecialchars(URL_SITE . $caminho, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

$produtos = [];
$atualizadoEm = null;
try {
    $loja = ler_loja();
    $atualizadoEm = $loja['atualizadoEm'] ?? null;
    foreach ($loja['produtos'] as $produto) {
        // Suspensos não aparecem no site; sem id não há página.
        if (is_array($produto) && ($produto['ativo'] ?? true) !== false && is_string($produto['id'] ?? null) && $produto['id'] !== '') {
            $produtos[] = $produto['id'];
        }
    }
} catch (Throwable $erro) {
    // Catálogo ilegível: ainda entrega as páginas fixas, para o Google não receber erro.
    error_log('Ligue Fraldas sitemap: ' . $erro->getMessage());
}

if ($atualizadoEm === null) {
    $arquivo = is_file(ARQUIVO_LOJA) ? ARQUIVO_LOJA : ARQUIVO_PRODUTOS;
    $atualizadoEm = is_file($arquivo) ? date('c', (int)filemtime($arquivo)) : null;
}

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');
header('X-Content-Type-Options: nosniff');

echo '<?xml version="1.0" encoding="UTF-8"?>', "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', "\n";
echo "  <url>\n    <loc>", url_xml(''), "</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n";
echo "  <url>\n    <loc>", url_xml('catalogo.html'), "</loc>\n";
if ($atualizadoEm !== null) {
    echo '    <lastmod>', htmlspecialchars(substr((string)$atualizadoEm, 0, 10), ENT_XML1, 'UTF-8'), "</lastmod>\n";
}
echo "    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n";
foreach ($produtos as $id) {
    echo "  <url>\n    <loc>", url_xml('produto.html?id=' . rawurlencode($id)), "</loc>\n    <priority>0.8</priority>\n  </url>\n";
}
echo "</urlset>\n";
