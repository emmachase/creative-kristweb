while inotifywait -e close_write script.ts; do tsc --build tsconfig.json; done
