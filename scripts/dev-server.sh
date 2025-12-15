#!/bin/bash

# OmuCycle開発サーバー管理スクリプト
# 使い方: ./scripts/dev-server.sh [start|stop|restart|status]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_DIR="$PROJECT_DIR/.pids"
LOG_DIR="$PROJECT_DIR/.logs"

mkdir -p "$PID_DIR" "$LOG_DIR"

API_PID_FILE="$PID_DIR/api.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
API_LOG="$LOG_DIR/api.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

start_api() {
    if [ -f "$API_PID_FILE" ] && kill -0 "$(cat "$API_PID_FILE")" 2>/dev/null; then
        echo "API server already running (PID: $(cat "$API_PID_FILE"))"
        return
    fi

    cd "$PROJECT_DIR"
    nohup npm run dev:server > "$API_LOG" 2>&1 &
    echo $! > "$API_PID_FILE"
    echo "API server started (PID: $!, log: $API_LOG)"
}

start_frontend() {
    if [ -f "$FRONTEND_PID_FILE" ] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
        echo "Frontend server already running (PID: $(cat "$FRONTEND_PID_FILE"))"
        return
    fi

    cd "$PROJECT_DIR"
    nohup npm run dev > "$FRONTEND_LOG" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    echo "Frontend server started (PID: $!, log: $FRONTEND_LOG)"
}

stop_api() {
    if [ -f "$API_PID_FILE" ]; then
        PID=$(cat "$API_PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            echo "API server stopped (PID: $PID)"
        else
            echo "API server not running"
        fi
        rm -f "$API_PID_FILE"
    else
        echo "API server not running (no PID file)"
    fi
}

stop_frontend() {
    if [ -f "$FRONTEND_PID_FILE" ]; then
        PID=$(cat "$FRONTEND_PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            echo "Frontend server stopped (PID: $PID)"
        else
            echo "Frontend server not running"
        fi
        rm -f "$FRONTEND_PID_FILE"
    else
        echo "Frontend server not running (no PID file)"
    fi
}

status() {
    echo "=== OmuCycle Dev Servers ==="

    if [ -f "$API_PID_FILE" ] && kill -0 "$(cat "$API_PID_FILE")" 2>/dev/null; then
        echo "API:      Running (PID: $(cat "$API_PID_FILE"), port 3180)"
    else
        echo "API:      Stopped"
    fi

    if [ -f "$FRONTEND_PID_FILE" ] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
        echo "Frontend: Running (PID: $(cat "$FRONTEND_PID_FILE"), port 5180)"
    else
        echo "Frontend: Stopped"
    fi
}

logs_api() {
    if [ -f "$API_LOG" ]; then
        tail -f "$API_LOG"
    else
        echo "No API log file"
    fi
}

logs_frontend() {
    if [ -f "$FRONTEND_LOG" ]; then
        tail -f "$FRONTEND_LOG"
    else
        echo "No frontend log file"
    fi
}

case "$1" in
    start)
        start_api
        start_frontend
        sleep 2
        status
        ;;
    stop)
        stop_api
        stop_frontend
        ;;
    restart)
        stop_api
        sleep 1
        start_api
        sleep 2
        status
        ;;
    restart-api)
        stop_api
        sleep 1
        start_api
        sleep 2
        status
        ;;
    restart-frontend)
        stop_frontend
        sleep 1
        start_frontend
        sleep 2
        status
        ;;
    status)
        status
        ;;
    logs)
        logs_api
        ;;
    logs-frontend)
        logs_frontend
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|restart-api|restart-frontend|status|logs|logs-frontend}"
        exit 1
        ;;
esac
