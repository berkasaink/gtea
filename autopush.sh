#!/bin/bash

REPO_DIR="/root/gtea"
GITHUB_REPO="git@github.com:berkasaink/gtea.git"
BRANCH="main"

function select_path() {
    local current_path="$1"
    while true; do
        echo -e "\n📁 Masuk ke: ${current_path#$REPO_DIR}"
        entries=($(ls "$current_path"))
        for i in "${!entries[@]}"; do
            if [ -d "$current_path/${entries[$i]}" ]; then
                echo "$((i+1)). 📁 ${entries[$i]}"
            else
                echo "$((i+1)). 📄 ${entries[$i]}"
            fi
        done
        echo "$(( ${#entries[@]} + 1 )). [🔙 Kembali]"
        read -p "Pilih [1-${#entries[@]}+1]: " choice
        index=$((choice - 1))
        if [ "$choice" == "$(( ${#entries[@]} + 1 ))" ]; then
            return 1
        elif [ -d "$current_path/${entries[$index]}" ]; then
            select_path "$current_path/${entries[$index]}"
            return $?
        else
            SELECTED_FILE="$current_path/${entries[$index]}"
            return 0
        fi
    done
}

function push_file() {
    echo -e "\n=== Pilih File yang Ingin di-Push ==="
    if select_path "$REPO_DIR"; then
        RELATIVE_PATH="${SELECTED_FILE#$REPO_DIR/}"
        echo -e "\n📤 Mem-push $RELATIVE_PATH ..."
        cd "$REPO_DIR"
        git add "$RELATIVE_PATH"
        git commit -m "update $RELATIVE_PATH"
        git push origin "$BRANCH"
        echo -e "\n✅ File berhasil di-push!"
        echo "🔗 https://github.com/berkasaink/gtea/blob/main/$RELATIVE_PATH"
    else
        echo "❌ Batal"
    fi
}

function push_folder() {
    echo -e "\n=== Push Folder ==="
    read -p "Masukkan path folder relatif dari $REPO_DIR: " folder
    cd "$REPO_DIR"
    git add "$folder"
    git commit -m "update folder $folder"
    git push origin "$BRANCH"
    echo -e "\n✅ Folder berhasil di-push!"
}

function full_backup() {
    echo -e "\n=== Push Semua Perubahan (Full Backup) ==="
    cd "$REPO_DIR"
    git add .
    git commit -m "full backup"
    git push origin "$BRANCH"
    echo -e "\n✅ Semua perubahan berhasil di-push!"
}

function lihat_status() {
    cd "$REPO_DIR"
    git status
}

while true; do
    echo -e "\n=== Manajemen Git Autopush ==="
    echo "1. Push file"
    echo "2. Push folder"
    echo "3. Full backup"
    echo "4. Lihat status"
    echo "5. Keluar"
    read -p "Pilih menu [1-5]: " MENU
    case "$MENU" in
        1) push_file ;;
        2) push_folder ;;
        3) full_backup ;;
        4) lihat_status ;;
        5) echo "Keluar..."; exit 0 ;;
        *) echo "Pilihan tidak valid." ;;
    esac
done

