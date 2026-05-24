<#
.SYNOPSIS
    Build script automatizado para WebTV APK universal assinado.
.Description
    Este script automatiza o processo completo de construção do APK WebTV:
    1. Verifica o ambiente (ANDROID_HOME, Java)
    2. Gera keystore de release se não existir
    3. Cria/atualiza keystore.properties
    4. Atualiza versionCode e versionName no projeto
    5. Compila APK release assinado
    6. Copia para o diretório de output

.PARAMETER Version
    Versão do app (ex: "1.0.1"). Se não informado, usa a versão atual.

.PARAMETER VersionCode
    Código de versão (inteiro). Se não informado, incrementa automaticamente.

.PARAMETER OutputDir
    Diretório de destino do APK. Padrão: ./output

.PARAMETER Clean
    Executa clean antes do build.

.PARAMETER SkipKeystore
    Pula a geração de keystore (se já quiser usar um existente).

.EXAMPLE
    .\build-webtv.ps1 -Version "1.2.0" -Clean

.EXAMPLE
    .\build-webtv.ps1 -VersionCode 5 -OutputDir "C:\Releases"
#>

param(
    [string]$Version,
    [int]$VersionCode = 0,
    [string]$OutputDir = "./output",
    [switch]$Clean,
    [switch]$SkipKeystore
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Test-CommandExists {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Generate-Password {
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    -join (1..32 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

function Get-CurrentVersionCode {
    $content = Get-Content -Path "app\build.gradle.kts" -Raw
    if ($content -match 'versionCode\s*=\s*(\d+)') {
        [int]$matches[1]
    } else {
        0
    }
}

function Get-CurrentVersion {
    $content = Get-Content -Path "app\build.gradle.kts" -Raw
    if ($content -match 'versionName\s*=\s*"([^"]+)"') {
        $matches[1]
    } else {
        "1.0.0"
    }
}

# ============ Verifica Ambiente ============
Write-Host "`n[1/6] Verificando ambiente..." -ForegroundColor Cyan

if (-not (Test-CommandExists "java")) {
    throw "Java não encontrado. Instale JDK 17+ ou defina JAVA_HOME."
}

if ($env:ANDROID_HOME -and (Test-Path "$env:ANDROID_HOME\build-tools")) {
    Write-Host "  ANDROID_HOME encontrado" -ForegroundColor Green
    Write-Host "  ANDROID_HOME = $env:ANDROID_HOME" -ForegroundColor Gray
} else {
    Write-Host "  ANDROID_HOME nao definido, build pode falhar" -ForegroundColor Yellow
}

if (-not (Test-Path "gradlew.bat")) {
    throw "gradlew.bat nao encontrado no diretorio atual."
}

# ============ Gera Keystore ============
Write-Host "`n[2/6] Verificando keystore..." -ForegroundColor Cyan

$keystorePath = "keystore\webtv-release.jks"
$keystorePropsFile = "keystore.properties"

if (-not $SkipKeystore -and -not (Test-Path $keystorePath)) {
    Write-Host "  Gerando keystore..." -ForegroundColor Yellow

    $storePassword = Generate-Password
    $keyPassword = $storePassword
    $keyAlias = "webtv"

    New-Item -ItemType Directory -Path "keystore" -Force | Out-Null

    & keytool -genkeypair `
        -v `
        -keystore $keystorePath `
        -alias $keyAlias `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -storepass $storePassword `
        -keypass $keyPassword `
        -dname "CN=WebTV, OU=Mobile, O=WebTV, L=Sao Paulo, ST=SP, C=BR"

    if ($LASTEXITCODE -ne 0) {
        throw "keytool falhou ao gerar keystore."
    }

    Write-Host "  Keystore criado" -ForegroundColor Green
    Write-Host "  Store Password: $storePassword" -ForegroundColor Yellow
    Write-Host "  Key Password:   $keyPassword" -ForegroundColor Yellow

    # Salva credenciais em arquivo seguro
    Set-Content -Path "keystore\credentials.txt" -Value @"
===========================================
 WEBTV - Credenciais de Assinatura
===========================================
Store File:     $keystorePath
Store Password: $storePassword
Key Alias:      $keyAlias
Key Password:   $keyPassword

IMPORTANTE: Guarde estas credenciais em local seguro!
Voce precisara delas para criar futuras atualizacoes do app.
===========================================
"@

} elseif (Test-Path $keystorePath) {
    Write-Host "  Keystore ja existe" -ForegroundColor Green

    if (Test-Path "keystore\credentials.txt") {
        $creds = Get-Content "keystore\credentials.txt" -Raw
        if ($creds -match 'Store Password:\s*(\S+)') {
            $storePassword = $matches[1]
        } else { throw "Nao foi possivel ler a senha do credentials.txt" }
        if ($creds -match 'Key Alias:\s*(\S+)') {
            $keyAlias = $matches[1]
        } else { $keyAlias = "webtv" }
    } elseif (Test-Path $keystorePropsFile) {
        $props = Get-Content $keystorePropsFile | ForEach-Object {
            $_ -split '=' | ForEach-Object { $_.Trim() }
        }
        $storePassword = $props[1]
        $keyAlias = $props[4]
    } else {
        $storePassword = Generate-Password
        $keyPassword = $storePassword
        Write-Host "  Gerando novas senhas para keystore existente..." -ForegroundColor Yellow
    }
} elseif ($SkipKeystore) {
    Write-Host "  SkipKeystore ativo - keystore ignorado" -ForegroundColor Yellow
}

# ============ Atualiza keystore.properties ============
Write-Host "`n[3/6] Configurando keystore.properties..." -ForegroundColor Cyan

if (-not $SkipKeystore) {
    $propsContent = @"
storeFile=keystore/webtv-release.jks
storePassword=$storePassword
keyAlias=$keyAlias
keyPassword=$storePassword
"@
    Set-Content -Path $keystorePropsFile -Value $propsContent
    Write-Host "  keystore.properties atualizado" -ForegroundColor Green
}

# ============ Atualiza Versao ============
Write-Host "`n[4/6] Configurando versao..." -ForegroundColor Cyan

$buildGradle = Get-Content -Path "app\build.gradle.kts" -Raw

$currentVersion = Get-CurrentVersion
$currentCode = Get-CurrentVersionCode

if ([string]::IsNullOrEmpty($Version)) {
    $Version = $currentVersion
}

if ($VersionCode -eq 0) {
    $VersionCode = $currentCode + 1
}

Write-Host "  Versao: $Version" -ForegroundColor Green
Write-Host "  Version Code: $VersionCode" -ForegroundColor Green

$buildGradle = $buildGradle -replace 'versionCode\s*=\s*\d+', "versionCode = $VersionCode"
$buildGradle = $buildGradle -replace 'versionName\s*=\s*"[^"]*"', "versionName = `"$Version`""

Set-Content -Path "app\build.gradle.kts" -Value $buildGradle

# ============ Compila APK ============
Write-Host "`n[5/6] Compilando APK release..." -ForegroundColor Cyan

$gradlewArgs = @()
if ($Clean) {
    $gradlewArgs += "clean"
}
$gradlewArgs += "assembleRelease"

Write-Host "  Executando: gradlew.bat $($gradlewArgs -join ' ')" -ForegroundColor Gray

& cmd /c "gradlew.bat $($gradlewArgs -join ' ') 2>&1"

if ($LASTEXITCODE -ne 0) {
    throw "Build falhou com codigo: $LASTEXITCODE"
}

Write-Host "  Build concluido!" -ForegroundColor Green

# ============ Copia APK ============
Write-Host "`n[6/6] Copiando APK para output..." -ForegroundColor Cyan

$sourceApkPath = "app\build\outputs\apk\release\app-release.apk"

if (-not (Test-Path $sourceApkPath)) {
    throw "APK nao encontrado em: $sourceApkPath"
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$outputApkName = "WebTV-v$Version-v$VersionCode-universal.apk"
$outputApkPath = Join-Path $OutputDir $outputApkName

Copy-Item -Path $sourceApkPath -Destination $outputApkPath -Force

$apkSize = (Get-Item $outputApkPath).Length / 1MB
Write-Host "  APK copiado" -ForegroundColor Green
Write-Host "  Tamanho: $([math]::Round($apkSize, 2)) MB" -ForegroundColor Gray

Write-Host "`n===========================================" -ForegroundColor Magenta
Write-Host " BUILD CONCLUIDO!" -ForegroundColor Magenta
Write-Host "===========================================" -ForegroundColor Magenta
Write-Host " APK: $outputApkPath" -ForegroundColor White
Write-Host " Versao: $Version (code: $VersionCode)" -ForegroundColor White
Write-Host " Tamanho: $([math]::Round($apkSize, 2)) MB" -ForegroundColor White
Write-Host " Arq: armeabi-v7a, arm64-v8a, x86" -ForegroundColor White
Write-Host "===========================================`n" -ForegroundColor Magenta
