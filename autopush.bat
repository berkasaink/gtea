@echo off
setlocal enabledelayedexpansion

:: KONFIGURASI
set REPO_DIR=C:\Users\goenk\gtea
set BRANCH=main
set GITHUB_REPO=git@github.com:berkasaink/gtea.git

:menu
cls
echo ==========================================
echo        Manajemen Git Autopush (.BAT)
echo ==========================================
echo 1. Push file tertentu
echo 2. Push folder tertentu
echo 3. Full backup (push semua perubahan)
echo 4. Lihat status git
echo 5. Keluar
echo ==========================================
set /p pilih= Pilih menu [1-5]: 

if "%pilih%"=="1" goto push_file
if "%pilih%"=="2" goto push_folder
if "%pilih%"=="3" goto full_backup
if "%pilih%"=="4" goto lihat_status
if "%pilih%"=="5" goto keluar
echo Pilihan tidak valid!
pause
goto menu

:push_file
cls
echo === Push File ===
set /p file=Masukkan path file relatif dari %REPO_DIR%: 
cd /d %REPO_DIR%
git add "%file%"
git commit -m "update %file%"
git push origin %BRANCH%
echo ✅ File %file% berhasil di-push!
pause
goto menu

:push_folder
cls
echo === Push Folder ===
set /p folder=Masukkan path folder relatif dari %REPO_DIR%: 
cd /d %REPO_DIR%
git add "%folder%"
git commit -m "update folder %folder%"
git push origin %BRANCH%
echo ✅ Folder %folder% berhasil di-push!
pause
goto menu

:full_backup
cls
echo === Push Semua Perubahan (Full Backup) ===
cd /d %REPO_DIR%
git add .
git commit -m "full backup"
git push origin %BRANCH%
echo ✅ Semua perubahan berhasil di-push!
pause
goto menu

:lihat_status
cls
cd /d %REPO_DIR%
git status
pause
goto menu

:keluar
echo Keluar...
exit /b
