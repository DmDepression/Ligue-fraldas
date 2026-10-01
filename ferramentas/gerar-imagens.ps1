# Gera os ícones (favicon, apple-touch-icon, PWA) e a imagem de compartilhamento
# a partir do img/logo.svg, usando o Chrome (ou Edge) em modo headless.
# Uso, na raiz do projeto:  powershell -ExecutionPolicy Bypass -File ferramentas\gerar-imagens.ps1

$raiz = Split-Path -Parent $PSScriptRoot
$navegador = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $navegador) { throw 'Chrome ou Edge não encontrado.' }

# O Chrome não abre janelas muito pequenas: renderiza em 512px e reduz com a escala.
function Capturar($pagina, $largura, $altura, $saida) {
  $url = 'file:///' + (Join-Path $raiz "ferramentas\$pagina").Replace('\', '/')
  $destino = Join-Path $raiz $saida
  $escala = 1
  if ($largura -lt 512) { $escala = $largura / 512; $largura = 512; $altura = 512 }
  & $navegador --headless=new --disable-gpu --hide-scrollbars "--force-device-scale-factor=$escala" `
    --default-background-color=00000000 --virtual-time-budget=8000 `
    "--window-size=$largura,$altura" "--screenshot=$destino" $url 2>&1 | Out-Null
  if (-not (Test-Path $destino)) { throw "Falha ao gerar $saida" }
  Write-Host "  $saida"
}

Write-Host 'Gerando imagens...'
Capturar 'icone.html' 32 32 'img\icones\favicon-32.png'
Capturar 'icone.html' 192 192 'img\icones\icon-192.png'
Capturar 'icone.html' 512 512 'img\icones\icon-512.png'
Capturar 'icone.html?fundo=branco&margem=24' 180 180 'img\icones\apple-touch-icon.png'
Capturar 'og-image.html' 1200 630 'img\og-image.png'

# favicon.ico com o PNG de 32 px embutido (formato aceito pelos navegadores atuais)
$png = [IO.File]::ReadAllBytes((Join-Path $raiz 'img\icones\favicon-32.png'))
$memoria = New-Object IO.MemoryStream
$escritor = New-Object IO.BinaryWriter $memoria
$escritor.Write([UInt16]0); $escritor.Write([UInt16]1); $escritor.Write([UInt16]1)
$escritor.Write([Byte]32); $escritor.Write([Byte]32); $escritor.Write([Byte]0); $escritor.Write([Byte]0)
$escritor.Write([UInt16]1); $escritor.Write([UInt16]32); $escritor.Write([UInt32]$png.Length); $escritor.Write([UInt32]22)
$escritor.Write($png)
$escritor.Flush()
[IO.File]::WriteAllBytes((Join-Path $raiz 'favicon.ico'), $memoria.ToArray())
Write-Host '  favicon.ico'
Write-Host 'Pronto.'
