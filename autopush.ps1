# ==============================
#  Autopush Git untuk Windows (PowerShell) - Clean Version
# ==============================

# Konfigurasi
$RepoDir = "C:\Users\goenk\gtea"
$Branch  = "main"

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

function Push-File {
    Write-Host "`n=== Pilih File yang Ingin di-Push ==="
    $selected = Select-File $RepoDir
    if (-not $selected) { Write-Host "Batal"; return }

    $relativePath = $selected.Replace("$RepoDir\", "")
    Set-Location $RepoDir
    git add "$relativePath"
    git commit -m "update $relativePath"
    git push origin $Branch
    Write-Host "`nSukses: File $relativePath berhasil di-push!"
}

function Push-Folder {
    Write-Host "`n=== Push Folder ==="
    $folder = Read-Host "Masukkan path folder relatif dari $RepoDir"
    Set-Location $RepoDir
    git add "$folder"
    git commit -m "update folder $folder"
    git push origin $Branch
    Write-Host "`nSukses: Folder $folder berhasil di-push!"
}

function Full-Backup {
    Write-Host "`n=== Push Semua Perubahan (Full Backup) ==="
    Set-Location $RepoDir
    git add .
    git commit -m "full backup"
    git push origin $Branch
    Write-Host "`nSukses: Semua perubahan berhasil di-push!"
}

function Lihat-Status {
    Set-Location $RepoDir
    git status
}

# ==== MENU UTAMA ====
while ($true) {
    Write-Host ""
    Write-Host "=== Manajemen Git Autopush ==="
    Write-Host "1. Push file"
    Write-Host "2. Push folder"
    Write-Host "3. Full backup"
    Write-Host "4. Lihat status"
    Write-Host "5. Keluar"
    $menu = Read-Host "Pilih menu [1-5]"

    switch ($menu) {
        1 { Push-File }
        2 { Push-Folder }
        3 { Full-Backup }
        4 { Lihat-Status }
        5 { Write-Host "Keluar..."; break }
        default { Write-Host "Pilihan tidak valid" }
    }
}
