#!/usr/bin/env bash
# Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati.
# Installazione su Ubuntu (Contabo o simile), come root.
#
# Sorgente: directory già estratta, oppure URL git (SSH o HTTPS).
#   sudo bash /opt/zquest-src/deploy/install-vps.sh /opt/zquest-src
#   sudo bash deploy/install-vps.sh git@github.com:ORG/zquest.git
#   sudo bash deploy/install-vps.sh 'https://UTENTE:TOKEN@github.com/ORG/zquest.git'
#   sudo GIT_HTTPS_USER=UTENTE GIT_HTTPS_TOKEN=TOKEN bash deploy/install-vps.sh https://github.com/ORG/zquest.git
#
# CERTBOT_EMAIL è facoltativa. Se è vuota, certbot usa --register-unsafely-without-email.
# Lo script non inserisce chiavi dei portafogli e non accende REWARDS_LIVE.
# Non crea il record DNS: l'A di quest.x-zdos.it verso 5.189.180.13 lo aggiunge il titolare.
# L'URL con credenziali non viene ristampato.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Esegui come root." >&2
  exit 1
fi

SOURCE="${1:-}"
if [[ -z "${SOURCE}" ]]; then
  echo "Uso:" >&2
  echo "  sudo bash /opt/zquest-src/deploy/install-vps.sh /opt/zquest-src" >&2
  echo "  sudo bash deploy/install-vps.sh git@github.com:ORG/zquest.git" >&2
  echo "  sudo bash deploy/install-vps.sh 'https://UTENTE:TOKEN@github.com/ORG/zquest.git'" >&2
  echo "CERTBOT_EMAIL è facoltativa." >&2
  exit 1
fi

APP_DIR=/opt/zquest
APP_USER=zquest

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git nginx rsync

if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/home/${APP_USER}" --shell /usr/sbin/nologin "${APP_USER}"
fi
install -d -o "${APP_USER}" -g "${APP_USER}" -m 750 "/home/${APP_USER}/.ssh"
install -d -o "${APP_USER}" -g "${APP_USER}" -m 750 "${APP_DIR}"

sync_tree() {
  local src="$1"
  if [[ ! -f "${src}/package.json" || ! -f "${src}/deploy/zquest.service" ]]; then
    echo "Sorgente non valida: servono package.json e deploy/zquest.service." >&2
    exit 1
  fi
  local src_real app_real
  src_real="$(realpath "${src}")"
  app_real="$(realpath "${APP_DIR}")"
  if [[ "${src_real}" != "${app_real}" ]]; then
    rsync -a --delete \
      --exclude '.git/' \
      --exclude 'node_modules/' \
      --exclude '.env' \
      --exclude 'data/' \
      --exclude '*.sqlite' \
      --exclude '*.sqlite-shm' \
      --exclude '*.sqlite-wal' \
      "${src_real}/" "${app_real}/"
  fi
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
}

if [[ -d "${SOURCE}" ]]; then
  echo "Sorgente locale: $(realpath "${SOURCE}")"
  sync_tree "${SOURCE}"
else
  echo "Sorgente git (le credenziali nell'URL non vengono mostrate)."
  work="$(mktemp -d)"
  chown "${APP_USER}:${APP_USER}" "${work}"
  chmod 700 "${work}"
  ZQUEST_GIT_URL="${SOURCE}" python3 - "${work}" << 'PY'
import os
import shlex
import stat
import sys
from urllib.parse import urlsplit, urlunsplit

work = sys.argv[1]
url = os.environ["ZQUEST_GIT_URL"]
user = os.environ.get("GIT_HTTPS_USER", "")
token = os.environ.get("GIT_HTTPS_TOKEN", "")
if "://" in url:
    parts = urlsplit(url)
    if parts.username:
        user = parts.username
    if parts.password:
        token = parts.password
    host = parts.hostname or ""
    if parts.port:
        host = f"{host}:{parts.port}"
    clean = urlunsplit((parts.scheme, host, parts.path, parts.query, parts.fragment))
else:
    clean = url
askpass = os.path.join(work, "askpass")
script = """#!/bin/sh
case "$1" in
  *sername*) printf '%s\\n' {user} ;;
  *) printf '%s\\n' {token} ;;
esac
""".format(user=shlex.quote(user), token=shlex.quote(token))
with open(askpass, "w", encoding="utf-8") as handle:
    handle.write(script)
os.chmod(askpass, stat.S_IRWXU)
with open(os.path.join(work, "clean-url"), "w", encoding="utf-8") as handle:
    handle.write(clean)
with open(os.path.join(work, "needs-askpass"), "w", encoding="utf-8") as handle:
    handle.write("1" if (user or token) else "0")
PY
  chown -R "${APP_USER}:${APP_USER}" "${work}"
  clean_url="$(cat "${work}/clean-url")"
  clone_env=(GIT_TERMINAL_PROMPT=0 HOME="/home/${APP_USER}")
  if [[ "$(cat "${work}/needs-askpass")" == "1" ]]; then
    clone_env+=(GIT_ASKPASS="${work}/askpass")
  fi
  if ! sudo -u "${APP_USER}" env "${clone_env[@]}" git clone --depth 1 "${clean_url}" "${work}/src"; then
    rm -rf "${work}"
    echo "Clone non riuscito. Per HTTPS passa l'URL con utente e token, oppure GIT_HTTPS_USER e GIT_HTTPS_TOKEN." >&2
    exit 1
  fi
  sync_tree "${work}/src"
  rm -rf "${work}"
fi

cd "${APP_DIR}"
sudo -u "${APP_USER}" npm ci
sudo -u "${APP_USER}" npm run build
install -d -o "${APP_USER}" -g "${APP_USER}" -m 750 "${APP_DIR}/data"

if [[ ! -f "${APP_DIR}/.env" ]]; then
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
  SESSION="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
  ADMIN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION}|" "${APP_DIR}/.env"
  sed -i "s|^ADMIN_TOKEN=.*|ADMIN_TOKEN=${ADMIN}|" "${APP_DIR}/.env"
  chown "${APP_USER}:${APP_USER}" "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"
  echo
  echo "ADMIN_TOKEN generato (copialo ora, sta anche in ${APP_DIR}/.env):"
  echo "${ADMIN}"
  echo
else
  echo ".env già presente, non lo sovrascrivo."
fi

NODE_BIN="$(command -v node)"
sed "s|^ExecStart=.*|ExecStart=${NODE_BIN} ${APP_DIR}/dist/server.js|" "${APP_DIR}/deploy/zquest.service" > /etc/systemd/system/zquest.service
systemctl daemon-reload
systemctl enable zquest
systemctl restart zquest

install -m 644 "${APP_DIR}/deploy/nginx-quest.x-zdos.it.conf" /etc/nginx/sites-available/quest.x-zdos.it
ln -sfn /etc/nginx/sites-available/quest.x-zdos.it /etc/nginx/sites-enabled/quest.x-zdos.it
nginx -t
systemctl reload nginx

sleep 1
if curl -fsS http://127.0.0.1:3200/api/health >/dev/null; then
  echo "Servizio in ascolto su 127.0.0.1:3200."
else
  echo "Il servizio non risponde. Guarda: journalctl -u zquest -n 80" >&2
  exit 1
fi

apt-get install -y certbot python3-certbot-nginx
certbot_args=(--nginx -d quest.x-zdos.it --non-interactive --agree-tos --redirect)
if [[ -n "${CERTBOT_EMAIL:-}" ]]; then
  certbot_args+=(-m "${CERTBOT_EMAIL}")
else
  certbot_args+=(--register-unsafely-without-email)
fi
if certbot "${certbot_args[@]}"; then
  echo "TLS emesso per quest.x-zdos.it."
else
  echo "Certbot non è riuscito. Di solito manca il DNS A di quest.x-zdos.it verso questo server (atteso 5.189.180.13)."
  echo "Quando il DNS risolve, rilancia:"
  printf '  sudo certbot'
  printf ' %q' "${certbot_args[@]}"
  printf '\n'
fi

echo "Compila a mano ${APP_DIR}/.env (bot, portafogli premi) e poi: sudo systemctl restart zquest"
echo "REWARDS_LIVE resta false finché non lo cambi tu."
