#!/bin/bash
echo "=== Manajemen Git Autopush ==="
echo "1. Push file"
echo "2. Push folder"
echo "3. Full backup"
echo "4. Lihat status"
echo "5. Keluar"
read -p "Pilih menu [1-5]: " menu

case $menu in
  1)
    echo "1. fb"
    echo "2. tes"
    read -p "Pilih menu [1-2]: " pilih
    case $pilih in
      1)
        echo "1. bot"
        echo "2. messenger"
        read -p "Pilih menu [1-2]: " pilih
        case $pilih in
          1)
            echo "1. auto_komen.py"
            echo "2. auto_replay.py"
            echo "3. auto_like.py"
            echo "4. auto_visit.py"
            read -p "Pilih menu [1-4]: " pilih
            case $pilih in
              1) path="fb/bot/auto_komen.py";;
              2) path="fb/bot/auto_replay.py";;
              3) path="fb/bot/auto_like.py";;
              4) path="fb/bot/auto_visit.py";;
              *) echo "Pilihan tidak valid"; exit 1;;
            esac
          ;;
          2)
            echo "1. main.py"
            echo "2. cookies.json"
            read -p "Pilih menu [1-2]: " pilih
            case $pilih in
              1) path="fb/messenger/main.py";;
              2) path="fb/messenger/cookies.json";;
              *) echo "Pilihan tidak valid"; exit 1;;
            esac
          ;;
          *) echo "Pilihan tidak valid"; exit 1;;
        esac
      ;;
      2)
        echo "1. index.js"
        echo "2. file.js"
        echo "3. file.py"
        read -p "Pilih menu [1-3]: " pilih
        case $pilih in
          1) path="tes/index.js";;
          2) path="tes/file.js";;
          3) path="tes/file.py";;
          *) echo "Pilihan tidak valid"; exit 1;;
        esac
      ;;
      *) echo "Pilihan tidak valid"; exit 1;;
    esac
    git add "$path"
    read -p "Masukkan pesan commit: " msg
    git commit -m "$msg"
    git push origin main
    echo "✅ Push sukses: $path"
    echo "🔗 https://github.com/berkasaink/gtea/tree/main/$(dirname $path)"
    ;;
  2)
    read -p "Masukkan nama folder relatif yang ingin dipush: " folder
    git add "$folder"
    read -p "Masukkan pesan commit: " msg
    git commit -m "$msg"
    git push origin main
    ;;
  3)
    git add .
    read -p "Pesan commit full backup: " msg
    git commit -m "$msg"
    git push origin main
    ;;
  4)
    git status
    ;;
  5)
    echo "Keluar..."
    exit 0
    ;;
  *)
    echo "Menu tidak valid"
    ;;
esac

