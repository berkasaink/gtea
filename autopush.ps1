# ==============================
#  Autopush Git untuk Windows (PowerShell) - FIXED VERSION
# ==============================

# Konfigurasi
$RepoDir = "C:\Users\goenk\berkasku"
$Branch  = (git branch --show-current)

if (-not $Branch) {
    $Branch = "main"
}

# ===== Fungsi Menampilkan File & Folder =====
function Show-Files {
    param([string]$path)

    $items = Get-ChildItem -Path $path
    $i = 1
    foreach ($item in $items) {
        if ($item.PSIsContainer) {
            Write-Host "$i. [DIR] $($item.Name)"
        } else {
            Write-Host "$i. [FILE] $($item.Name)"
        }
        $i++
    }
    Write-Host "$i. [Kembali]"
    return $items
}

# ===== Fungsi Navigasi & Pilih File =====
function Select-File {
    param([string]$currentPath)

    while ($true) {
        Write-Host ""
        Write-Host "Folder saat ini: $($currentPath.Replace($RepoDir,''))"
        $entries = Show-Files $currentPath
        $choice = Read-Host "Pilih nomor [1-$($entries.Count+1)]"

        if ($choice -eq ($entries.Count+1)) { return $null }

        $index = [int]$choice - 1
        if ($entries[$index].PSIsContainer) {
            $result = Select-File $entries[$index].FullName
            if ($result) { return $result }
        } else {
            return $entries[$index].FullName
        }
    }
}

# ===== Fungsi Push Umum =====
function Do-GitPush($commitMessage) {
    Set-Location $RepoDir
    git pull origin $Branch --rebase

    git commit -m "$commitMessage" 2>$null
    git push origin $Branch

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Push berhasil!"
    } else {
        Write-Host "`n❌ Push gagal! Periksa error di atas."
    }
}

# ===== Push File =====
function Push-File {
    Write-Host "`n=== Pilih File yang Ingin di-Push ==="
    $selected = Select-File $RepoDir
    if (-not $selected) { Write-Host "Batal"; return }

    $relativePath = $selected.Replace("$RepoDir\", "").Replace("\", "/")
    git add "$relativePath"

    $status = git status --porcelain
    if ([string]::IsNullOrEmpty($status)) {
        Write-Host "`nTidak ada perubahan, file sudah up-to-date."
        Write-Host "URL: https://github.com/berkasaink/gtea/blob/$Branch/$relativePath"
        return
    }

    Do-GitPush "update $relativePath"
    Write-Host "URL: https://github.com/berkasaink/gtea/blob/$Branch/$relativePath"
}

# ===== Push Folder =====
function Push-Folder {
    Write-Host "`n=== Push Folder ==="
    $folder = Read-Host "Masukkan path folder relatif dari $RepoDir"
    git add "$folder"

    $status = git status --porcelain
    if ([string]::IsNullOrEmpty($status)) {
        Write-Host "`nTidak ada perubahan di folder $folder."
        Write-Host "URL: https://github.com/berkasaink/gtea/tree/$Branch/$folder"
        return
    }

    Do-GitPush "update folder $folder"
    Write-Host "URL: https://github.com/berkasaink/gtea/tree/$Branch/$folder"
}

# ===== Full Backup =====
function Full-Backup {
    Write-Host "`n=== Push Semua Perubahan (Full Backup) ==="
    git add .

    $status = git status --porcelain
    if ([string]::IsNullOrEmpty($status)) {
        Write-Host "`nTidak ada perubahan, repo sudah up-to-date."
        Write-Host "URL: https://github.com/berkasaink/gtea"
        return
    }

    Do-GitPush "full backup"
    Write-Host "URL: https://github.com/berkasaink/gtea"
}

# ===== Lihat Status =====
function Lihat-Status {
    Set-Location $RepoDir
    git status
}

# ===== Tarik Update dari GitHub =====
function Pull-Update {
    Write-Host "`n=== Menarik Update dari GitHub ==="
    Set-Location $RepoDir
    git pull origin $Branch
    Write-Host "`n✅ Update dari GitHub berhasil diambil!"
}

# ===== MENU UTAMA =====
while ($true) {
    Write-Host ""
    Write-Host "=== Manajemen Git Autopush ==="
    Write-Host "1. Push file"
    Write-Host "2. Push folder"
    Write-Host "3. Full backup"
    Write-Host "4. Lihat status"
    Write-Host "5. Keluar"
    Write-Host "6. Tarik update dari GitHub"
    $menu = Read-Host "Pilih menu [1-6]"

    switch ($menu) {
        1 { Push-File }
        2 { Push-Folder }
        3 { Full-Backup }
        4 { Lihat-Status }
        5 { Write-Host "Keluar..."; break }
        6 { Pull-Update }
        default { Write-Host "Pilihan tidak valid" }
    }
}
