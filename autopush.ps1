# ==============================
# 🔥 Autopush Git PRO untuk Windows (PowerShell)
# ✅ Auto stash → pull → reapply → push tanpa error
# ==============================

# Konfigurasi Repo
$RepoDir = "C:\Users\goenk\berkasku"
$Branch  = (git -C $RepoDir branch --show-current)
if (-not $Branch) { $Branch = "main" }

# ===== Fungsi Menampilkan File & Folder =====
function Show-Files {
    param([string]$path)
    $items = Get-ChildItem -Path $path
    $i = 1
    foreach ($item in $items) {
        if ($item.PSIsContainer) { Write-Host "$i. [DIR] $($item.Name)" }
        else { Write-Host "$i. [FILE] $($item.Name)" }
        $i++
    }
    Write-Host "$i. [Kembali]"
    return $items
}

# ===== Fungsi Navigasi & Pilih File =====
function Select-File {
    param([string]$currentPath)
    while ($true) {
        Write-Host "`nFolder saat ini: $($currentPath.Replace($RepoDir,''))"
        $entries = Show-Files $currentPath
        $choice = Read-Host "Pilih nomor [1-$($entries.Count+1)]"
        if ($choice -eq ($entries.Count+1)) { return $null }
        $index = [int]$choice - 1
        if ($entries[$index].PSIsContainer) {
            $result = Select-File $entries[$index].FullName
            if ($result) { return $result }
        } else { return $entries[$index].FullName }
    }
}

# ===== Auto Cleanup sebelum Push =====
function Auto-Cleanup {
    Write-Host "`n🔄 Cleaning..."
    Set-Location $RepoDir
    if (Test-Path "facebook/api_chatgpt.json") { git rm --cached facebook/api_chatgpt.json 2>$null }
    git add .gitignore 2>$null
    git add autopush.ps1 2>$null
}

# ===== Auto Stash & Pull =====
function Auto-Pull {
    Write-Host "🔄 Menyimpan perubahan sementara (stash)..."
    git stash push -m "autopush-temp" 2>$null
    Write-Host "⬇️  Menarik update dari GitHub..."
    git pull origin $Branch --rebase
    Write-Host "🔄 Mengembalikan perubahan lokal..."
    git stash pop 2>$null
}

# ===== Push File =====
function Push-File {
    Write-Host "`n=== Pilih File yang Ingin di-Push ==="
    $selected = Select-File $RepoDir
    if (-not $selected) { Write-Host "❌ Batal"; return }
    $relativePath = $selected.Replace("$RepoDir\", "").Replace("\", "/")
    Set-Location $RepoDir

    Auto-Cleanup
    git add "$relativePath"
    if (-not (git diff --cached --quiet)) {
        git commit -m "update $relativePath"
    }

    Auto-Pull
    git push origin $Branch --force-with-lease

    Write-Host "`n✅ Sukses: File $relativePath berhasil di-push!"
    Write-Host "🌐 URL: https://github.com/berkasaink/gtea/blob/$Branch/$relativePath"
}

# ===== Push Folder =====
function Push-Folder {
    $folder = Read-Host "Masukkan path folder relatif dari $RepoDir"
    Set-Location $RepoDir
    Auto-Cleanup
    git add "$folder"
    if (-not (git diff --cached --quiet)) {
        git commit -m "update folder $folder"
    }

    Auto-Pull
    git push origin $Branch --force-with-lease

    Write-Host "`n✅ Sukses: Folder $folder berhasil di-push!"
    Write-Host "🌐 URL: https://github.com/berkasaink/gtea/tree/$Branch/$folder"
}

# ===== Full Backup =====
function Full-Backup {
    Set-Location $RepoDir
    Auto-Cleanup
    git add .
    if (-not (git diff --cached --quiet)) {
        git commit -m "full backup"
    }

    Auto-Pull
    git push origin $Branch --force-with-lease

    Write-Host "`n✅ Full backup sukses!"
    Write-Host "🌐 URL: https://github.com/berkasaink/gtea"
}

# ===== Lihat Status =====
function Lihat-Status { Set-Location $RepoDir; git status }

# ===== Tarik Update dari GitHub =====
function Pull-Update {
    Set-Location $RepoDir
    Auto-Pull
    Write-Host "`n✅ Update dari GitHub selesai!"
}

# ===== MENU UTAMA =====
while ($true) {
    Write-Host "`n=== Git Autopush ==="
    Write-Host "1. Push file"
    Write-Host "2. Push folder"
    Write-Host "3. Full backup"
    Write-Host "4. Lihat status"
    Write-Host "5. Keluar"
    Write-Host "6. Tarik update"
    $menu = Read-Host "Pilih [1-6]"
    switch ($menu) {
        1 { Push-File }
        2 { Push-Folder }
        3 { Full-Backup }
        4 { Lihat-Status }
        5 { break }
        6 { Pull-Update }
        default { Write-Host "❌ Pilihan tidak valid" }
    }
}
