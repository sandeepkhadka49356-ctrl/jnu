# Hosting runbook — YouStable VPS

Deploying this site to a **YouStable vStart VPS** (1 vCPU, 4 GB RAM, 50 GB NVMe,
Ubuntu 24.04 LTS, Mumbai) with **Cloudflare** in front and the domain
**jodhpurnationaluniversityjodhpur.org** registered at GoDaddy.

Follow it top to bottom the first time. Every command runs on the server unless
it says otherwise.

```
GoDaddy      registration only — nameservers point at Cloudflare
Cloudflare   DNS + CDN + free SSL
   │
YouStable    Ubuntu 24.04
   ├── Caddy        :80/:443  reverse proxy, automatic HTTPS
   ├── Next.js      :3000     the app, under systemd
   ├── PostgreSQL   :5432     local only
   └── /srv/jnu/var media and uploaded documents
```

---

## 0. Before you start

You need:

- The server's **IP address** and root password (YouStable welcome email)
- Access to the **GoDaddy** account holding the domain
- A **Cloudflare** account (free)
- An **SSH key** on your own machine. If you don't have one:
  ```bash
  ssh-keygen -t ed25519 -C "jnu-deploy"      # on YOUR machine, not the server
  cat ~/.ssh/id_ed25519.pub                  # copy this
  ```

> **Order matters.** Do the server (§1–§9) before the DNS (§10). Caddy needs to
> answer on the domain to obtain its certificate, and it can only do that once
> the server is actually serving.

---

## 1. First login and a non-root user

```bash
ssh root@YOUR_SERVER_IP
```

Create a user to run the app. Nothing should run as root.

```bash
adduser --disabled-password --gecos "" jnu
usermod -aG sudo jnu
mkdir -p /home/jnu/.ssh && chmod 700 /home/jnu/.ssh
nano /home/jnu/.ssh/authorized_keys      # paste your PUBLIC key, save
chown -R jnu:jnu /home/jnu/.ssh && chmod 600 /home/jnu/.ssh/authorized_keys
```

Open a **second terminal** and confirm the key works before you close the first:

```bash
ssh jnu@YOUR_SERVER_IP
```

If that fails, fix it now — do not proceed. Locking yourself out of a fresh VPS
means asking support to rebuild it.

Once it works, harden SSH:

```bash
sudo nano /etc/ssh/sshd_config
#   PermitRootLogin no
#   PasswordAuthentication no
sudo systemctl restart ssh
```

---

## 2. Firewall and fail2ban

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ufw fail2ban

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo systemctl enable --now fail2ban
```

PostgreSQL is deliberately **not** opened. It listens on localhost only.

---

## 3. Swap — do not skip this

4 GB is not enough to run `next build` reliably. Without swap the build gets
OOM-killed, usually with no useful error, and it looks like a code problem.

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf

free -h        # Swap should show 4.0Gi
```

---

## 4. Node.js 22, PostgreSQL, Caddy, git

```bash
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

node -v && psql --version && caddy version
```

---

## 5. The database

```bash
sudo -u postgres psql
```

```sql
CREATE USER jnu WITH PASSWORD 'PUT_A_LONG_RANDOM_PASSWORD_HERE';
CREATE DATABASE jnu OWNER jnu;
\q
```

Generate that password properly — `openssl rand -base64 32` — and keep it.

Tune Postgres for a 4 GB box (the defaults assume far more):

```bash
sudo nano /etc/postgresql/16/main/postgresql.conf
```

```
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 8MB
maintenance_work_mem = 128MB
max_connections = 50
```

```bash
sudo systemctl restart postgresql
```

---

## 6. Get the code

```bash
sudo mkdir -p /srv/jnu && sudo chown jnu:jnu /srv/jnu
cd /srv
git clone https://github.com/sandeepkhadka49356-ctrl/jnu.git jnu
cd /srv/jnu
```

Private repo, so use a deploy key or a personal access token. A **read-only
deploy key** is the better choice — it cannot push.

Create the directories uploads go into. **Outside `public/`** — anything under
`public/` is served to anyone who asks, and these hold Aadhaar scans.

```bash
mkdir -p /srv/jnu/var/media /srv/jnu/var/uploads
chmod 700 /srv/jnu/var/uploads
```

---

## 7. Environment

```bash
nano /srv/jnu/.env
```

```bash
# Local Postgres. No pooler here, so both URLs are the same — but DIRECT_URL
# must exist because prisma/schema.prisma declares directUrl.
DATABASE_URL="postgresql://jnu:YOUR_DB_PASSWORD@localhost:5432/jnu"
DIRECT_URL="postgresql://jnu:YOUR_DB_PASSWORD@localhost:5432/jnu"

# Generate on the server:  openssl rand -base64 48
AUTH_SECRET="PASTE_A_FRESH_48_BYTE_SECRET"

# EXACT public origin. Every canonical URL, the sitemap, the Open Graph tags
# and every certificate QR code is built from this. A wrong value damages
# search ranking silently rather than breaking anything visible.
NEXT_PUBLIC_SITE_URL="https://jodhpurnationaluniversityjodhpur.org"

# Persistent, outside public/.
MEDIA_DIR="/srv/jnu/var/media"
UPLOAD_DIR="/srv/jnu/var/uploads"

NODE_ENV=production
PORT=3000
```

```bash
chmod 600 /srv/jnu/.env
```

Prisma's CLI reads `.env`; Next reads `.env` too in production. One file is
enough here.

---

## 8. Build

```bash
cd /srv/jnu
npm ci
npm run build          # prisma generate + migrate deploy + seed + next build
```

Expect **8–15 minutes** on one vCPU. It will use swap; that is what swap is for.

If it is killed anyway, build on your own machine or in GitHub Actions and copy
the `.next` directory up. See §15.

Create the first administrator:

```bash
npm run admin:create -- --email admin@jodhpurnationaluniversityjodhpur.org --name "Administrator"
```

It asks for a password without echoing it. Minimum 12 characters — use more.

---

## 9. Run it under systemd

```bash
sudo nano /etc/systemd/system/jnu.service
```

```ini
[Unit]
Description=Jodhpur National University website
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=jnu
WorkingDirectory=/srv/jnu
EnvironmentFile=/srv/jnu/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

# Only the two upload directories are writable.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/srv/jnu/var /srv/jnu/.next

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jnu
sudo systemctl status jnu --no-pager
curl -I http://localhost:3000/        # expect HTTP/1.1 200 OK
```

systemd rather than PM2: one less daemon on a one-core box, and it already
handles restart-on-crash and start-on-boot.

---

## 10. DNS — GoDaddy to Cloudflare

1. **Cloudflare** → Add a site → `jodhpurnationaluniversityjodhpur.org` → Free plan
2. Cloudflare gives you **two nameservers**
3. **GoDaddy** → your domain → **Nameservers → Change → I'll use my own** → paste both → save
4. Wait for Cloudflare to show **Active** (usually minutes, up to 24 h)

Then in Cloudflare **DNS**:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | YOUR_SERVER_IP | **DNS only (grey) for now** |
| CNAME | `www` | `jodhpurnationaluniversityjodhpur.org` | **DNS only (grey) for now** |

> Grey cloud **for now**. Caddy needs a direct connection to obtain its
> certificate. You turn the proxy on in §12, after HTTPS works.

Mail records from the Zoho setup (MX, SPF, DKIM, DMARC) are **always grey
cloud, permanently**. Proxying a mail record silently stops mail arriving.

---

## 11. Caddy

```bash
sudo nano /etc/caddy/Caddyfile
```

```caddy
jodhpurnationaluniversityjodhpur.org {
	encode zstd gzip
	reverse_proxy localhost:3000

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
	}

	log {
		output file /var/log/caddy/jnu.log
		format json
	}
}

# One canonical host. Serving both splits ranking signals between two URLs
# that Google sees as different pages.
www.jodhpurnationaluniversityjodhpur.org {
	redir https://jodhpurnationaluniversityjodhpur.org{uri} permanent
}

# Each extra site you host is another block like the one above, pointing at
# its own port.
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Visit `https://jodhpurnationaluniversityjodhpur.org` — it should load with a
valid certificate. Caddy obtains and renews it automatically; there is nothing
to configure and nothing that expires in a year.

---

## 12. Turn the Cloudflare proxy on

Only once HTTPS works directly.

1. Cloudflare → **SSL/TLS** → mode **Full (strict)**
2. Cloudflare → **DNS** → switch `@` and `www` to **Proxied (orange)**
3. Reload the site

Static pages now serve from Cloudflare's Mumbai edge and your one vCPU barely
gets touched. This matters more on this box than it would on a bigger one.

Worth enabling: **Always Use HTTPS**, **Brotli**, and **Auto Minify off**
(the build already minifies; doing it twice occasionally breaks things).

---

## 13. Backups

The database holds student records and issued degree certificates. Assume the
host's backups do not exist until you have restored from one.

```bash
sudo mkdir -p /srv/backups && sudo chown jnu:jnu /srv/backups
nano /srv/jnu/backup.sh
```

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /srv/jnu
STAMP=$(date +%F-%H%M)

pg_dump "$(grep -oP '(?<=^DATABASE_URL=").*(?=")' .env)" \
  | gzip > "/srv/backups/db-$STAMP.sql.gz"

tar -czf "/srv/backups/media-$STAMP.tar.gz" -C /srv/jnu var

# Keep 14 days locally.
find /srv/backups -name '*.gz' -mtime +14 -delete

# OFF-SERVER copy. A backup on the same disk as the database is not a backup.
# rclone to Backblaze B2 / Google Drive / S3 — configure once with `rclone config`.
# rclone copy /srv/backups remote:jnu-backups --max-age 25h
```

```bash
chmod +x /srv/jnu/backup.sh
crontab -e
```

```
15 2 * * * /srv/jnu/backup.sh >> /srv/backups/backup.log 2>&1
```

**Then test a restore.** An untested backup is a guess:

```bash
createdb -U jnu jnu_restore_test
gunzip -c /srv/backups/db-YYYY-MM-DD-HHMM.sql.gz | psql -U jnu jnu_restore_test
```

---

## 14. Go-live checklist

```bash
# Canonical must be YOUR domain, not the old .co.in
curl -s https://jodhpurnationaluniversityjodhpur.org/ | grep -o 'rel="canonical" href="[^"]*"'

# Sitemap and robots
curl -s https://jodhpurnationaluniversityjodhpur.org/sitemap.xml | head -20
curl -s https://jodhpurnationaluniversityjodhpur.org/robots.txt

# Admin and student areas must be noindex
curl -s https://jodhpurnationaluniversityjodhpur.org/admin/login/ | grep -o 'name="robots" content="[^"]*"'

# www must 301, not 200
curl -sI https://www.jodhpurnationaluniversityjodhpur.org/ | head -1
```

Then, in the admin panel:

- [ ] **Site details** — contact and verification addresses on the new domain
- [ ] **Pop-up notice** — replace or switch off the test content
- [ ] **Students** — remove the demo records before real ones are added.
      Results are public by roll number, so demo students are publicly readable
- [ ] **Distance education** — switch on when ready, then add the menu entry
- [ ] **Recognition** — no claim without evidence and a verification date

And off-site:

- [ ] Google Search Console — add the property, submit the sitemap
- [ ] Bing Webmaster Tools — same
- [ ] Google Business Profile for the campus. With a `.org` rather than a
      `.co.in` this is the main India-targeting signal you have
- [ ] Send a test email to `verification@` and confirm it arrives

---

## 15. Deploying a change

```bash
cd /srv/jnu
git pull
npm ci --include=dev
npm run build
sudo systemctl restart jnu
```

**`--include=dev` is not optional.** The build runs here, and `tsx`,
`typescript`, `tailwindcss`, `postcss` and `autoprefixer` are devDependencies.
`.env` sets `NODE_ENV=production`, so the moment that variable is in your shell —
sourcing `.env` to run a `psql` query is enough, and it persists for the life of
the tmux session — a plain `npm ci` silently omits them and the build dies at
`sh: 1: tsx: not found`. The flag wins regardless of the environment.

The site is down for a few seconds on restart. On this box the build is the
slow part, and it competes with serving traffic — so **do not deploy during
results week**.

**If builds become painful**, move them off the server: build in GitHub Actions
or locally, then `rsync` the `.next` directory and `package.json` up and just
restart. That removes the single biggest load this server carries.

---

## 16. When something is wrong

```bash
sudo systemctl status jnu              # is the app running
sudo journalctl -u jnu -n 100 --no-pager
sudo journalctl -u caddy -n 50 --no-pager
curl -I http://localhost:3000/         # app alive behind the proxy?
free -h                                # swap in heavy use = need more RAM
uptime                                 # load above 1.0 sustained = need more CPU
df -h                                  # 50 GB fills faster than you expect
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"
```

| Symptom | Usual cause |
|---|---|
| 502 from Caddy | App not running — `systemctl status jnu` |
| Build killed, no error | Out of memory — check swap is on (§3) |
| Certificate fails | Cloudflare proxy on too early; grey-cloud it, retry, re-enable |
| Mail not arriving | An MX record is proxied — must be grey cloud |
| Canonicals wrong | `NEXT_PUBLIC_SITE_URL` wrong; it is baked in at build, so rebuild |
| Uploads vanish | `MEDIA_DIR`/`UPLOAD_DIR` not set, so writing somewhere temporary |

## When to upgrade

Any one of these means move to vProfessional (2 vCPU / 8 GB):

- `uptime` load average sustained above 1.0
- Swap in constant use under normal traffic
- Origin responses over ~300 ms
- You add a third Node application
- Results week is coming
