# Domain + VPS (Phase 0.1–0.3)

You already own **builditmuj.club** (GoDaddy). The public API hostname is:

**`api.builditmuj.club`** → `https://api.builditmuj.club`

## 1. Create the Hetzner server (do this now)

1. Open [https://console.hetzner.cloud](https://console.hetzner.cloud) and sign up / log in.
2. Create a project, e.g. `Attend`.
3. **SSH key first:** on your Mac run `cat ~/.ssh/id_ed25519.pub` (or `ssh-keygen -t ed25519` if you have no key). In Hetzner: **Security → SSH Keys → Add**.
4. **Add server:**
   - Location: **Helsinki** (closest common option to India) or Falkenstein
   - Image: **Ubuntu 24.04**
   - Type: **CX32** or **CPX32** (**8 GB RAM**). Do not pick 4 GB.
   - Networking: keep **public IPv4** on
   - SSH key: select the key you added
   - Name: `attend-api`
5. Create a **firewall** on that server: inbound **TCP 22, 80, 443** only. No port 8000.
6. Copy the server **IPv4**. That is `YOUR_VPS_IP` below.

Then do GoDaddy DNS (section 2).

## 2. GoDaddy DNS

1. GoDaddy → **My Products** → **builditmuj.club** → **DNS**.
2. Add an **A** record:
   - Type: **A**
   - Name: **`api`**
   - Value: your VPS public IPv4
   - TTL: 600 (or default)
3. Save. Propagation can take a few minutes to an hour.

Check:

```bash
dig +short api.builditmuj.club
```

It must print the VPS IP.

Do **not** point `api` at your laptop. Let’s Encrypt will only issue a cert for a public server.

## 3. Env files (already named for this domain)

On the VPS, after cloning the repo:

```
ATTEND_API_HOST=api.builditmuj.club
```

in `deploy/attend.env` (from `deploy/attend.env.example`).

Set `CERTBOT_EMAIL` to an inbox you can read (Let’s Encrypt expiry notices).

Backend production `APP_BASE_URL` must be `https://api.builditmuj.club` (email verification links).

## 4. SSH onto the VPS

```bash
ssh root@YOUR_VPS_IP
```

```bash
apt-get update && apt-get install -y ca-certificates curl git fail2ban
curl -fsSL https://get.docker.com | sh
```

Clone this repo to `/opt/attend` and continue with [DEPLOYMENT.md](DEPLOYMENT.md).
