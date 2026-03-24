#!/bin/sh
set -e

# Generate self-signed SSL certificate if not mounted
SSL_DIR="/etc/nginx/ssl"
if [ ! -f "$SSL_DIR/minerva.crt" ] || [ ! -f "$SSL_DIR/minerva.key" ]; then
    echo "[Minerva] Generating self-signed SSL certificate..."
    mkdir -p "$SSL_DIR"
    openssl req -x509 -nodes -days 365 \
        -newkey rsa:2048 \
        -keyout "$SSL_DIR/minerva.key" \
        -out "$SSL_DIR/minerva.crt" \
        -subj "/CN=minerva/O=Minerva/C=US" \
        2>/dev/null
    echo "[Minerva] SSL certificate generated."
fi

# Default MYTHIC_ADDRESS if not set
MYTHIC_ADDRESS="${MYTHIC_ADDRESS:-https://host.docker.internal:7443}"
export MYTHIC_ADDRESS

echo "[Minerva] Proxying API requests to: $MYTHIC_ADDRESS"

# Substitute environment variables in nginx config template
envsubst '${MYTHIC_ADDRESS}' \
    < /etc/nginx/templates/nginx.conf.template \
    > /etc/nginx/nginx.conf

echo "[Minerva] Starting nginx on port 443..."

# Execute CMD (nginx)
exec "$@"
